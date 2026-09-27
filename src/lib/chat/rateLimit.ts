/**
 * A small per-IP limiter for the two voice routes.
 *
 * Those routes proxy a paid xAI API with a server-side key, so without a limit
 * anyone who can reach the site can spend the quota. A sliding window in
 * memory is enough for that: it needs no dependency and no store.
 *
 * It is per server instance and resets on restart, so it slows abuse rather
 * than preventing it. Behind several instances, or for anything beyond a demo,
 * this wants a shared store.
 */

const WINDOW_MS = 60_000;
const DEFAULT_RPM = 12;

/** ip -> timestamps of requests inside the current window. */
const hits = new Map<string, number[]>();

/** Trusted last, because a client can send whatever it likes in these. */
function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

function limitPerMinute(): number {
  const configured = Number(process.env.NOVA_VOICE_RPM);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_RPM;
}

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSeconds: number };

/**
 * Record a request and say whether it is allowed. Call once per request,
 * before doing any paid work.
 */
export function rateLimit(req: Request): RateLimitResult {
  const now = Date.now();
  const max = limitPerMinute();
  const ip = clientIp(req);

  // Drop addresses whose window has fully expired, so the map cannot grow
  // without bound on a long-running server.
  for (const [key, times] of hits) {
    if (!times.length || now - times[times.length - 1]! >= WINDOW_MS) hits.delete(key);
  }

  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= max) {
    const oldest = recent[0]!;
    hits.set(ip, recent);
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((WINDOW_MS - (now - oldest)) / 1000)) };
  }

  recent.push(now);
  hits.set(ip, recent);
  return { ok: true };
}

/** Exported for tests: forget every recorded request. */
export function resetRateLimit(): void {
  hits.clear();
}
