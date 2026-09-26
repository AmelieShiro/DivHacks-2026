/**
 * Polite HTTP for crawling third-party nonprofit sites.
 *
 * These are small organizations on shared hosting, so: identify ourselves,
 * honour robots.txt, rate-limit per host, cap response size, and never retry
 * aggressively. Everything is cached, so a re-run does not re-hit anyone.
 */
import { cached } from "./cache.mjs";
import { http as cfg } from "../config.mjs";

const lastHit = new Map();
const robotsCache = new Map();

const hostOf = (url) => {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
};

async function throttle(host) {
  const prev = lastHit.get(host) ?? 0;
  const wait = prev + cfg.perHostDelayMs - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastHit.set(host, Date.now());
}

/** Minimal robots.txt: honour Disallow lines under `*` or our agent. */
async function disallowedPaths(origin) {
  if (robotsCache.has(origin)) return robotsCache.get(origin);
  let rules = [];
  try {
    const res = await fetch(`${origin}/robots.txt`, {
      headers: { "User-Agent": cfg.userAgent },
      signal: AbortSignal.timeout(8_000),
    });
    if (res.ok) {
      const text = (await res.text()).slice(0, 50_000);
      let applies = false;
      for (const line of text.split(/\r?\n/)) {
        const m = line.match(/^\s*(user-agent|disallow)\s*:\s*(.*?)\s*(#.*)?$/i);
        if (!m) continue;
        const [, field, value] = m;
        if (/user-agent/i.test(field)) {
          applies = value === "*" || /nova/i.test(value);
        } else if (applies && value) {
          rules.push(value);
        }
      }
    }
  } catch {
    /* no robots.txt is permission enough */
  }
  robotsCache.set(origin, rules);
  return rules;
}

export async function allowedByRobots(url) {
  try {
    const u = new URL(url);
    const rules = await disallowedPaths(u.origin);
    return !rules.some((r) => r !== "/" && u.pathname.startsWith(r)) &&
           !rules.includes("/");
  } catch {
    return false;
  }
}

/**
 * Outcomes worth remembering.
 *
 * A 404 or a robots exclusion will be the same tomorrow, so cache it. A
 * timeout, a DNS blip or a 5xx says nothing about the URL, and caching those
 * permanently means a provider that was briefly unreachable can never resolve
 * on a later run.
 */
export function isDefinitive(res) {
  if (res.ok) return true;
  if (res.error === "robots" || res.error === "bad url") return true;
  // status 0 means the request never completed: network error or timeout.
  if (!res.status) return false;
  if (res.status === 408 || res.status === 425 || res.status === 429) return false;
  if (res.status >= 500) return false;
  return true;
}

/**
 * Fetch with caching. Returns { ok, status, url, body, contentType } and never
 * throws on a network error — crawl stages treat failure as "no data".
 * Transient failures are deliberately not cached (see isDefinitive).
 */
export async function get(url, { binary = false, respectRobots = true } = {}) {
  const host = hostOf(url);
  if (!host) return { ok: false, status: 0, url, body: null, error: "bad url" };

  return cached("http", [url, binary], async () => {
    if (respectRobots && !(await allowedByRobots(url))) {
      return { ok: false, status: 0, url, body: null, error: "robots" };
    }
    await throttle(host);
    try {
      const res = await fetch(url, {
        redirect: "follow",
        headers: {
          "User-Agent": cfg.userAgent,
          Accept: binary ? "image/*" : "text/html,application/xhtml+xml,*/*",
        },
        signal: AbortSignal.timeout(cfg.timeoutMs),
      });
      const contentType = res.headers.get("content-type") ?? "";
      const buf = Buffer.from(await res.arrayBuffer());
      const clipped = buf.subarray(0, cfg.maxBytes);
      return {
        ok: res.ok,
        status: res.status,
        url: res.url,
        contentType,
        bytes: buf.length,
        body: binary ? clipped.toString("base64") : clipped.toString("utf8"),
      };
    } catch (e) {
      return { ok: false, status: 0, url, body: null, error: String(e.message ?? e) };
    }
  }, { shouldCache: isDefinitive });
}

/** Bounded-concurrency map that preserves input order. */
export async function pool(items, worker, size = cfg.concurrency) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      for (;;) {
        const i = next++;
        if (i >= items.length) return;
        out[i] = await worker(items[i], i);
      }
    }),
  );
  return out;
}
