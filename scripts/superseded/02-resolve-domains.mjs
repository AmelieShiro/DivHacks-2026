/**
 * Stage 2 — resolve each provider to its real website.
 *
 * Probes the ranked candidates from stage 1 and accepts one only if the page
 * it serves actually names the organization. Without that guard a probe for
 * "New York Edge" would happily accept edge.org, which is an unrelated site.
 *
 * Results are cached in data/enrichment/providers.json. A row marked
 * `locked: true` is never re-probed, so hand corrections survive re-runs.
 */
import { readFile, writeFile } from "node:fs/promises";

const FILE = new URL("../data/enrichment/providers.json", import.meta.url);
const KNOWN = new URL("../data/enrichment/known-domains.json", import.meta.url);
const UA = "K-Maker/0.1 (+DivHacks student project; contact via repo)";
const CONCURRENCY = 6;
const TIMEOUT_MS = 12_000;

async function fetchText(url) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: ctl.signal,
      headers: { "User-Agent": UA, Accept: "text/html,*/*" },
    });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    if (!type.includes("html")) return null;
    return { url: res.url, html: (await res.text()).slice(0, 200_000) };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Visible text worth matching an org name against: title, meta, headings. */
function pageIdentity(html) {
  const grab = (re) => [...html.matchAll(re)].map((m) => m[1]).join(" ");
  return [
    grab(/<title[^>]*>([\s\S]{0,300}?)<\/title>/gi),
    grab(/<meta[^>]+(?:property|name)=["'](?:og:site_name|og:title|description)["'][^>]+content=["']([^"']{0,300})["']/gi),
    grab(/<h1[^>]*>([\s\S]{0,200}?)<\/h1>/gi),
  ]
    .join(" ")
    .replace(/<[^>]+>/g, " ")
    .toLowerCase();
}

/** Domain parking / for-sale services answer 200 with plausible-looking text. */
const PARKED_HOSTS = /(hugedomains|sedo|afternic|dan\.com|bodis|parkingcrew|domainmarket|buydomains|namecheap\.com\/domains|godaddy\.com\/domainsearch)/i;
const PARKED_TEXT = /(this domain (name )?is for sale|buy this domain|domain for sale|the domain .{0,40} is for sale|inquire about this domain)/i;

/**
 * Words common enough in NYC nonprofit names that matching one proves nothing.
 * "brooklyn" appearing on brooklyn.org does not make it Brooklyn Defender Services.
 */
const WEAK_SIGNALS = new Set([
  "brooklyn", "queens", "bronx", "manhattan", "staten", "island", "york",
  "city", "women", "young", "north", "south", "east", "west", "homes",
  "housing", "team", "door", "children", "child", "youth", "family",
  "development", "neighborhood", "council", "club", "boys", "girls",
  "health", "human", "social", "school", "academy", "jewish", "christian",
  "association", "institute", "house", "dance", "theatre", "arts", "center",
  "community", "services", "outreach", "initiatives", "corporation", "public",
]);

/**
 * Accept only on evidence that is hard to hit by accident:
 * at least one distinctive name word must appear on the page, and either most
 * of the name matches or the domain is a genuine acronym of it.
 */
/**
 * Every DYCD provider operates in New York City, so a page that never mentions
 * the city or a borough is a different organization with a similar name.
 * This is what separates goddard.org (Vermont college) from goddard.nyc.
 */
const NYC_MARKERS = /\b(new york|nyc|brooklyn|bronx|queens|manhattan|staten island|harlem|n\.y\.|ny 1[0-1]\d{3})\b/i;

function looksNewYork(html) {
  const text = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 120_000);
  // Client-rendered sites ship almost no body text, so there is nothing to
  // judge; fall back to the name evidence rather than rejecting them.
  if (text.length < 400) return true;
  return NYC_MARKERS.test(text);
}

function verify(identity, host, signals, html, finalUrl) {
  if (!signals.length) return null;
  if (!looksNewYork(html)) return null;
  // Check the host we LANDED on: parked names redirect to the broker.
  if (
    PARKED_HOSTS.test(host) ||
    PARKED_HOSTS.test(finalUrl) ||
    PARKED_TEXT.test(identity) ||
    PARKED_TEXT.test(html.slice(0, 5000))
  ) {
    return null;
  }

  const hit = signals.filter((s) => identity.includes(s));
  const distinctive = hit.filter((s) => !WEAK_SIGNALS.has(s));
  const ratio = hit.length / signals.length;

  const hostBase = host.replace(/^www\./, "").split(".")[0];
  const initials = signals.map((w) => w[0]).join("");
  const isAcronymHost =
    hostBase.length <= 6 &&
    (hostBase === initials || initials.includes(hostBase) || hostBase.includes(initials));

  // A bare generic word as the whole domain is never enough on its own.
  const hostIsGeneric = WEAK_SIGNALS.has(hostBase);

  if (distinctive.length === 0) return null;
  if (hostIsGeneric && distinctive.length < 2) return null;

  if (ratio >= 0.6 && distinctive.length >= 1) return { strength: "strong", hit };
  if (distinctive.length >= 2) return { strength: "strong", hit };
  if (isAcronymHost && distinctive.length >= 1) return { strength: "acronym", hit };
  return null;
}

async function resolveOne(p) {
  for (const host of p.candidates) {
    for (const scheme of ["https", "http"]) {
      const got = await fetchText(`${scheme}://${host}`);
      if (!got) continue;
      const identity = pageIdentity(got.html);
      const ok = verify(identity, host, p.signals, got.html, got.url);
      if (ok) {
        return {
          website: got.url,
          resolvedVia: host,
          confidence: ok.strength,
          matchedSignals: ok.hit,
        };
      }
      break; // host answered but is not them; no point trying http too
    }
  }
  return { website: null, resolvedVia: null, confidence: "unresolved", matchedSignals: [] };
}

async function pool(items, worker, size) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (true) {
        const i = next++;
        if (i >= items.length) return;
        results[i] = await worker(items[i], i);
      }
    }),
  );
  return results;
}

async function main() {
  const providers = JSON.parse(await readFile(FILE, "utf8"));
  const known = JSON.parse(await readFile(KNOWN, "utf8"));
  for (const p of providers) {
    const extra = known[p.provider];
    if (extra) p.candidates = [...new Set([...extra, ...p.candidates])];
  }
  const todo = providers.filter((p) => !p.locked && !p.website);
  console.log(`probing ${todo.length} of ${providers.length} providers\n`);

  let done = 0;
  await pool(
    todo,
    async (p) => {
      const r = await resolveOne(p);
      Object.assign(p, r);
      done += 1;
      const mark = r.website ? "OK  " : "--  ";
      console.log(`${mark}[${done}/${todo.length}] ${p.provider.slice(0, 48).padEnd(48)} ${r.website ?? ""}`);
    },
    CONCURRENCY,
  );

  await writeFile(FILE, JSON.stringify(providers, null, 2) + "\n");

  const ok = providers.filter((p) => p.website);
  const sites = (list) => list.reduce((s, p) => s + p.siteCount, 0);
  console.log(`\nresolved ${ok.length}/${providers.length} providers`);
  console.log(`covering ${sites(ok)}/${sites(providers)} K-5 sites ` +
              `(${Math.round((100 * sites(ok)) / sites(providers))}%)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
