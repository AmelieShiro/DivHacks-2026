/**
 * Stage 10 — provider roster.
 *
 * Collapses the K-5 site list to the distinct organizations behind it. This is
 * the leverage point of the whole pipeline: 569 sites are run by ~111
 * providers, so everything downstream crawls and enriches per PROVIDER and
 * fans the result back out to their sites.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { paths, K5_AGE_RANGES, PROGRAM_YEAR } from "../config.mjs";
import { makeLogger } from "../lib/log.mjs";

const log = makeLogger("10-providers");

const LEGAL = /\b(inc|incorporated|llc|ltd|l\.l\.c|corp|corporation)\b/gi;
const STOPWORDS = new Set(["the", "of", "and", "for", "a", "an", "at"]);
const TRIMMABLE = new Set([
  "center", "centre", "ctr", "community", "comm", "society", "services",
  "service", "association", "corporate", "foundation", "council", "program",
  "programs", "group", "nyc", "ny",
]);
const TOO_GENERIC = new Set([
  "child", "children", "edge", "good", "new", "york", "city", "youth",
  "family", "center", "community", "police", "united", "greater", "grand",
  "university", "school", "public", "the", "harbor", "horizon",
]);

export function tokens(name) {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(LEGAL, " ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/[\s-]+/)
    .filter((t) => t && !STOPWORDS.has(t));
}

/** Ranked candidate domains, most specific first. */
export function candidates(name) {
  const t = tokens(name);
  if (!t.length) return [];
  const trimmed = t.filter((w) => !TRIMMABLE.has(w));
  const ordered = [];
  const push = (arr) => {
    if (!arr.length) return;
    // Trimming can reduce a name to one common word ("The Child Center of NY"
    // -> "child"). A bare generic word is far more likely to be an unrelated
    // site than the provider's, so it never becomes a candidate on its own.
    if (arr.length === 1 && TOO_GENERIC.has(arr[0])) return;
    const base = arr.join("");
    if (base.length >= 4 && base.length <= 30) ordered.push(base);
  };
  push(t);
  push(trimmed);
  push(t.slice(0, 4));
  push(trimmed.slice(0, 3));
  push(t.slice(0, 2));

  const acroSource = trimmed.length >= 2 ? trimmed : t;
  if (acroSource.length >= 2 && acroSource.length <= 6) {
    const acro = acroSource.map((w) => w[0]).join("");
    if (acro.length >= 3) ordered.push(acro);
  }
  const single = trimmed[0] ?? t[0];
  if (single && single.length >= 5 && !TOO_GENERIC.has(single)) ordered.push(single);

  const out = [];
  for (const b of [...new Set(ordered)]) out.push(`${b}.org`, `${b}.com`, `${b}.nyc`);
  return [...new Set(out)];
}

/** Distinctive words a candidate page must contain to be believed. */
export function nameSignals(name) {
  return [...new Set(tokens(name).filter((w) => w.length >= 4 && !TRIMMABLE.has(w)))];
}

export async function run() {
  const rows = JSON.parse(
    await readFile(path.join(paths.raw, "dycd-program-sites.json"), "utf8"),
  );
  const k5 = rows.filter(
    (r) => r.date === PROGRAM_YEAR && K5_AGE_RANGES.has(r.age_range),
  );

  const outFile = path.join(paths.work, "providers.json");
  let existing = [];
  try {
    existing = JSON.parse(await readFile(outFile, "utf8"));
  } catch { /* first run */ }
  const prior = new Map(existing.map((p) => [p.provider, p]));

  const byProvider = new Map();
  for (const r of k5) {
    const name = r.provider?.trim();
    if (!name) continue;
    const e = byProvider.get(name) ?? {
      provider: name,
      siteCount: 0,
      boroughs: new Set(),
      // Preserve anything a previous run (or a human) established.
      website: prior.get(name)?.website ?? null,
      resolvedVia: prior.get(name)?.resolvedVia ?? null,
      confidence: prior.get(name)?.confidence ?? null,
      locked: prior.get(name)?.locked ?? false,
      candidates: candidates(name),
      signals: nameSignals(name),
    };
    e.siteCount += 1;
    if (r.borough) e.boroughs.add(r.borough);
    byProvider.set(name, e);
  }

  const providers = [...byProvider.values()]
    .map((p) => ({ ...p, boroughs: [...p.boroughs].sort() }))
    .sort((a, b) => b.siteCount - a.siteCount || a.provider.localeCompare(b.provider));

  await mkdir(paths.work, { recursive: true });
  await writeFile(outFile, JSON.stringify(providers, null, 2) + "\n");

  log.ok(`${k5.length} K-5 sites (${PROGRAM_YEAR}) across ${providers.length} providers`);
  return { sites: k5.length, providers: providers.length };
}
