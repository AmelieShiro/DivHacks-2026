/**
 * Stage 20 — resolve each provider to its real website.
 *
 * Three sources, cheapest first:
 *   1. a hand-maintained known-domains file
 *   2. generated candidate domains (stage 10)
 *   3. Gemini, asked for the official site of an unresolved org
 *
 * Every source is treated as a GUESS. Nothing is accepted until the page is
 * fetched and shown to actually belong to that organization, which is what
 * keeps a hallucinated domain or a parked squatter out of the dataset.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { paths } from "../config.mjs";
import { get, pool } from "../lib/http.mjs";
import { askJSON, isEnabled } from "../lib/gemini.mjs";
import { makeLogger } from "../lib/log.mjs";
import { loadBlocklist, applyBlocklist, isBlocked } from "../lib/blocklist.mjs";

const log = makeLogger("20-resolve");

const PARKED_HOSTS =
  /(hugedomains|sedo|afternic|dan\.com|bodis|parkingcrew|domainmarket|buydomains|undeveloped|namebright)/i;
const PARKED_TEXT =
  /(this domain (name )?is for sale|buy this domain|domain for sale|inquire about this domain|the domain .{0,40} is for sale)/i;

/** Words too common in NYC nonprofit names to prove identity on their own. */
const WEAK_SIGNALS = new Set([
  "brooklyn", "queens", "bronx", "manhattan", "staten", "island", "york",
  "city", "women", "young", "north", "south", "east", "west", "homes",
  "housing", "team", "door", "children", "child", "youth", "family",
  "development", "neighborhood", "council", "club", "boys", "girls",
  "health", "human", "social", "school", "academy", "jewish", "christian",
  "association", "institute", "house", "dance", "theatre", "arts", "center",
  "community", "services", "outreach", "initiatives", "corporation", "public",
]);

const NYC_MARKERS =
  /\b(new york|nyc|brooklyn|bronx|queens|manhattan|staten island|harlem|n\.y\.|ny 1[0-1]\d{3})\b/i;

function visibleText(html) {
  return html
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pageIdentity(html) {
  const grab = (re) => [...html.matchAll(re)].map((m) => m[1]).join(" ");
  return [
    grab(/<title[^>]*>([\s\S]{0,300}?)<\/title>/gi),
    grab(/<meta[^>]+(?:property|name)=["'](?:og:site_name|og:title|description)["'][^>]+content=["']([^"']{0,300})["']/gi),
    grab(/<h1[^>]*>([\s\S]{0,200}?)<\/h1>/gi),
  ].join(" ").replace(/<[^>]+>/g, " ").toLowerCase();
}

/**
 * A page that never mentions the city is a different org with a similar name
 * (goddard.org is a Vermont college). Client-rendered sites ship almost no
 * text, so the rule only applies when there is text to judge.
 */
function looksNewYork(text) {
  if (text.length < 400) return true;
  return NYC_MARKERS.test(text.slice(0, 120_000));
}

export function verify({ identity, text, host, finalUrl, signals, html }) {
  if (!signals.length) return null;
  if (PARKED_HOSTS.test(host) || PARKED_HOSTS.test(finalUrl)) return null;
  if (PARKED_TEXT.test(identity) || PARKED_TEXT.test(html.slice(0, 5000))) return null;
  if (!looksNewYork(text)) return null;

  const hit = signals.filter((s) => identity.includes(s));
  const distinctive = hit.filter((s) => !WEAK_SIGNALS.has(s));
  const ratio = hit.length / signals.length;

  const hostBase = host.replace(/^www\./, "").split(".")[0];
  const initials = signals.map((w) => w[0]).join("");
  const isAcronymHost =
    hostBase.length <= 6 &&
    (hostBase === initials || initials.includes(hostBase) || hostBase.includes(initials));
  const hostIsGeneric = WEAK_SIGNALS.has(hostBase);

  if (distinctive.length === 0) return null;
  if (hostIsGeneric && distinctive.length < 2) return null;
  if (ratio >= 0.6) return { confidence: "strong", matched: hit };
  if (distinctive.length >= 2) return { confidence: "strong", matched: hit };
  if (isAcronymHost) return { confidence: "acronym", matched: hit };
  return null;
}

async function probe(host, signals) {
  for (const scheme of ["https", "http"]) {
    const res = await get(`${scheme}://${host}`);
    if (!res.ok || !res.body) continue;
    if (!/html/i.test(res.contentType ?? "")) return null;
    const html = res.body;
    const ok = verify({
      identity: pageIdentity(html),
      text: visibleText(html),
      host,
      finalUrl: res.url ?? "",
      signals,
      html,
    });
    return ok ? { website: res.url, resolvedVia: host, ...ok } : null;
  }
  return null;
}

const ASK_SCHEMA = {
  type: "object",
  properties: {
    domain: {
      type: "string",
      description: "Bare domain only, e.g. example.org. Empty string if unsure.",
    },
    alternates: { type: "array", items: { type: "string" } },
  },
  required: ["domain"],
};

/** Ask Gemini for a domain. Output is a candidate, never an answer. */
async function askGemini(provider, boroughs) {
  const prompt = [
    "You are helping match a New York City nonprofit to its official website.",
    `Organization name exactly as the City of New York lists it: "${provider}"`,
    boroughs?.length ? `It runs youth programs in: ${boroughs.join(", ")}.` : "",
    "",
    "Return the bare domain of its official website (no scheme, no path).",
    "If you are not confident this specific NYC organization has a site you know,",
    'return an empty string for "domain" rather than guessing.',
    "Include up to 3 plausible alternates.",
  ].filter(Boolean).join("\n");

  const { data } = await askJSON({
    prompt,
    schema: ASK_SCHEMA,
    cacheKey: { task: "resolve-domain", provider },
  });
  const clean = (d) =>
    typeof d === "string"
      ? d.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "")
      : null;
  return [clean(data?.domain), ...(data?.alternates ?? []).map(clean)]
    .filter((d) => d && d.includes(".") && d.length < 60);
}

export async function run({ limit, useGemini = true } = {}) {
  const file = path.join(paths.work, "providers.json");
  const providers = JSON.parse(await readFile(file, "utf8"));

  let known = {};
  try {
    known = JSON.parse(await readFile(path.join(paths.work, "known-domains.json"), "utf8"));
  } catch { /* optional */ }

  // Hand corrections first: a blocked website is cleared and re-resolved,
  // and the probes below never accept a blocked domain again.
  const blocklist = await loadBlocklist();
  for (const c of applyBlocklist(providers, blocklist)) {
    log.warn(`blocked ${c.website} for ${c.provider.slice(0, 40)} (${c.why ?? "hand correction"})`);
  }
  const allowed = (p, host) => !isBlocked(blocklist, p.provider, host);

  let todo = providers.filter((p) => !p.locked && !p.website);
  if (limit) todo = todo.slice(0, limit);
  log.info(`${todo.length} unresolved of ${providers.length}`);

  // Pass 1 + 2: known domains, then generated candidates.
  await pool(todo, async (p) => {
    const list = [...(known[p.provider] ?? []), ...p.candidates].filter((h) => allowed(p, h));
    for (const host of list) {
      const hit = await probe(host, p.signals);
      // Check where the redirect LANDED too, not just the host we asked for.
      if (hit && allowed(p, hit.website)) {
        Object.assign(p, hit, { source: known[p.provider]?.includes(host) ? "known" : "generated" });
        log.ok(`${p.provider.slice(0, 44).padEnd(44)} ${hit.website}`);
        return;
      }
    }
  });

  // Pass 3: Gemini for whatever is left, still verified by fetching.
  const stillMissing = todo.filter((p) => !p.website);
  if (useGemini && isEnabled() && stillMissing.length) {
    log.step(`asking Gemini about ${stillMissing.length} providers`);
    for (const p of stillMissing) {
      let guesses = [];
      try {
        guesses = await askGemini(p.provider, p.boroughs);
      } catch (e) {
        log.warn(`gemini failed for ${p.provider}: ${e.message}`);
        continue;
      }
      for (const host of guesses.filter((h) => allowed(p, h))) {
        const hit = await probe(host, p.signals);
        if (hit && allowed(p, hit.website)) {
          Object.assign(p, hit, { source: "gemini" });
          log.ok(`gemini  ${p.provider.slice(0, 40).padEnd(40)} ${hit.website}`);
          break;
        }
      }
      if (!p.website) log.fail(`unresolved ${p.provider.slice(0, 50)}`);
    }
  } else if (stillMissing.length) {
    log.warn(`${stillMissing.length} unresolved; set GEMINI_API_KEY to try the model fallback`);
  }

  for (const p of providers) if (!p.website) p.confidence = "unresolved";
  await writeFile(file, JSON.stringify(providers, null, 2) + "\n");

  const ok = providers.filter((p) => p.website);
  const sum = (l) => l.reduce((s, p) => s + p.siteCount, 0);
  log.ok(`resolved ${ok.length}/${providers.length} providers = ` +
         `${sum(ok)}/${sum(providers)} sites (${Math.round(100 * sum(ok) / sum(providers))}%)`);
  return { resolved: ok.length, total: providers.length, siteCoverage: sum(ok) / sum(providers) };
}
