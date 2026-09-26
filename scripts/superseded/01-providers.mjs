/**
 * Stage 1 — provider roster + candidate domains.
 *
 * NYC OpenData does not publish a website for DYCD providers (verified across
 * ebkm-iyma, 75e9-fg2t, graj-69em and 9f5n-qdib). So before anything can be
 * crawled, each provider name has to be resolved to a domain.
 *
 * This stage does the deterministic part: derive plausible domains from the
 * legal name and leave the rest for stage 2 to verify over the network.
 * Output is a reviewable JSON file you can hand-correct — corrections survive
 * re-runs because stage 2 never overwrites a `locked` entry.
 */
import { readFile, writeFile } from "node:fs/promises";

const RAW = new URL("../data/raw/", import.meta.url);
const OUT = new URL("../data/enrichment/providers.json", import.meta.url);

// The age bands that put a site in front of a K-5 family.
export const K5_AGE_RANGES = new Set([
  "Grades K - 5",
  "Grades K - 12",
  "Ages 4+",
  "Ages 5 - 20",
]);

/** Only true legal-entity noise. Geography and mission words stay: they are
 *  usually IN the domain ("newyorkedge.org", "universitysettlement.org"). */
const LEGAL = /\b(inc|incorporated|llc|ltd|l\.l\.c|corp|corporation)\b/gi;

const STOPWORDS = new Set(["the", "of", "and", "for", "a", "an", "at"]);

/** Generic tails that are often dropped in the real domain. */
const TRIMMABLE = new Set([
  "center", "centre", "ctr", "community", "comm", "society", "services",
  "service", "association", "corporate", "foundation", "council", "program",
  "programs", "group", "nyc", "ny",
]);

/** Words too generic to ever be a provider's whole domain on their own. */
const TOO_GENERIC = new Set([
  "child", "children", "edge", "good", "new", "york", "city", "youth",
  "family", "center", "community", "police", "united", "greater", "grand",
  "university", "school", "public", "the", "harbor", "horizon",
]);

function tokens(name) {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(LEGAL, " ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/[\s-]+/)
    .filter((t) => t && !STOPWORDS.has(t));
}

/**
 * Candidate domains, most-specific first. Full-name joins lead, because a
 * short generic base like "edge.org" or "child.org" is far more likely to be
 * an unrelated site than the provider's. Stage 2 still verifies every hit
 * against the organization's name before accepting it.
 */
function candidates(name) {
  const t = tokens(name);
  if (!t.length) return [];

  const trimmed = t.filter((w) => !TRIMMABLE.has(w));
  const ordered = [];

  const push = (arr) => {
    if (!arr.length) return;
    const base = arr.join("");
    if (base.length >= 4 && base.length <= 30) ordered.push(base);
  };

  push(t);                       // newyorkjuniortennisleague
  push(trimmed);                 // newyorkjuniortennisleague (sans "inc")
  push(t.slice(0, 4));
  push(trimmed.slice(0, 3));
  push(t.slice(0, 2));

  // Acronyms are how several of these orgs are actually known (NYJTL, CAMBA, PAL).
  const acroSource = trimmed.length >= 2 ? trimmed : t;
  if (acroSource.length >= 2 && acroSource.length <= 6) {
    const acro = acroSource.map((w) => w[0]).join("");
    if (acro.length >= 3) ordered.push(acro);
  }

  // A single bare word only survives if it is distinctive.
  const single = trimmed[0] ?? t[0];
  if (single && single.length >= 5 && !TOO_GENERIC.has(single)) {
    ordered.push(single);
  }

  const out = [];
  for (const b of [...new Set(ordered)]) {
    out.push(`${b}.org`, `${b}.com`, `${b}.nyc`);
  }
  return [...new Set(out)];
}

/** Tokens stage 2 looks for in a fetched page to confirm it is the right org. */
function nameSignals(name) {
  return [...new Set(tokens(name).filter((w) => w.length >= 4 && !TRIMMABLE.has(w)))];
}

async function main() {
  const rows = JSON.parse(
    await readFile(new URL("dycd-program-sites.json", RAW), "utf8"),
  );
  const k5 = rows.filter(
    (r) => r.date === "2026" && K5_AGE_RANGES.has(r.age_range),
  );

  const byProvider = new Map();
  for (const r of k5) {
    const name = r.provider?.trim();
    if (!name) continue;
    const entry = byProvider.get(name) ?? {
      provider: name,
      siteCount: 0,
      boroughs: new Set(),
      website: null,
      locked: false,
      candidates: candidates(name),
      signals: nameSignals(name),
    };
    entry.siteCount += 1;
    if (r.borough) entry.boroughs.add(r.borough);
    byProvider.set(name, entry);
  }

  const providers = [...byProvider.values()]
    .map((p) => ({ ...p, boroughs: [...p.boroughs].sort() }))
    .sort((a, b) => b.siteCount - a.siteCount || a.provider.localeCompare(b.provider));

  await writeFile(OUT, JSON.stringify(providers, null, 2) + "\n");

  const covered = (n) =>
    providers.slice(0, n).reduce((s, p) => s + p.siteCount, 0);
  console.log(`${k5.length} K-5 sites across ${providers.length} providers`);
  console.log(`top 25 -> ${covered(25)} sites, top 50 -> ${covered(50)} sites`);
  console.log(`wrote ${OUT.pathname}`);
  console.log("\nsample candidates:");
  for (const p of providers.slice(0, 6)) {
    console.log(`  ${p.provider}\n    ${p.candidates.slice(0, 4).join(", ")}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
