/**
 * Hand-maintained corrections for websites that passed verification but
 * belong to a different organization (a realty firm sharing a place name, a
 * same-named club upstate). Automatic checks confirm a NAME matches; only a
 * human, or a later stage, notices it is the wrong org.
 *
 * data/enrichment/blocked-domains.json:
 *   { "<provider>": { "domains": ["example.org"], "why": "..." } }
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { paths } from "../config.mjs";

export const hostOf = (urlOrHost) => {
  if (!urlOrHost) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(urlOrHost) ? urlOrHost : `https://${urlOrHost}`);
    return u.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
};

export async function loadBlocklist(file = path.join(paths.work, "blocked-domains.json")) {
  try {
    const raw = JSON.parse(await readFile(file, "utf8"));
    delete raw._comment;
    return raw;
  } catch {
    return {};
  }
}

/** True if `urlOrHost` (or a subdomain of a blocked domain) is blocked for this provider. */
export function isBlocked(blocklist, provider, urlOrHost) {
  const host = hostOf(urlOrHost);
  if (!host) return false;
  return (blocklist[provider]?.domains ?? [])
    .map(hostOf)
    .some((d) => d && (host === d || host.endsWith(`.${d}`)));
}

/**
 * Clear every blocked website in place so the provider is re-resolved.
 * Returns the providers that were cleared.
 */
export function applyBlocklist(providers, blocklist) {
  const cleared = [];
  for (const p of providers) {
    if (p.website && isBlocked(blocklist, p.provider, p.website)) {
      cleared.push({ provider: p.provider, website: p.website, why: blocklist[p.provider].why ?? null });
      Object.assign(p, { website: null, resolvedVia: null, confidence: "unresolved", matchedSignals: [] });
    }
  }
  return cleared;
}
