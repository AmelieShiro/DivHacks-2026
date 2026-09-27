/**
 * Per-IP limiting for the three routes that spend the xAI quota.
 *
 * There are two backends. Which one runs depends on whether a shared store is
 * configured, because the right answer differs by where this is deployed:
 *
 *   - Shared (Upstash Redis over its REST API): a counter every instance sees.
 *     This is the one that matters in production. Serverless functions do not
 *     share memory, so on Vercel an in-process limiter barely limits anything —
 *     each cold start begins again from zero.
 *
 *   - In-process: a sliding window in a Map. Correct for `next start` on one
 *     machine, and for local development, where it needs no account.
 *
 * Upstash is reached with plain fetch rather than its SDK, so this costs no
 * dependency and no bundle weight.
 *
 * If the shared store is configured but unreachable, the request is allowed and
 * the failure is logged. A Redis outage is not attacker-controlled, and
 * refusing every voice request during one trades a rare cost problem for a
 * certain outage.
 */

const WINDOW_MS = 60_000;
const WINDOW_SECONDS = 60;
const DEFAULT_RPM = 12;

/** ip -> timestamps inside the current window. Used only without a shared store. */
const hits = new Map<string, number[]>();

let warnedAboutMemory = false;

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

function upstash(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSeconds: number };

/**
 * A fixed window in Redis: one INCR per request, with an expiry set only on
 * the first, so the key clears itself. One round trip via the pipeline API.
 */
async function sharedLimit(
  store: { url: string; token: string },
  ip: string,
  max: number,
): Promise<RateLimitResult> {
  const bucket = Math.floor(Date.now() / WINDOW_MS);
  const key = `nova:voice:${ip}:${bucket}`;

  const res = await fetch(`${store.url}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${store.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([
      ["INCR", key],
      ["EXPIRE", key, String(WINDOW_SECONDS), "NX"],
    ]),
    // Never let the limiter itself become the slow part of a request.
    signal: AbortSignal.timeout(2_000),
  });
  if (!res.ok) throw new Error(`upstash ${res.status}`);

  const results = (await res.json()) as { result?: number; error?: string }[];
  const count = results?.[0]?.result;
  if (typeof count !== "number") throw new Error("upstash: unexpected reply");

  if (count > max) {
    // Time left in this fixed window.
    const elapsed = Date.now() - bucket * WINDOW_MS;
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((WINDOW_MS - elapsed) / 1000)) };
  }
  return { ok: true };
}

/** Sliding window in this process. Resets on restart and is not shared. */
function memoryLimit(ip: string, max: number): RateLimitResult {
  const now = Date.now();

  // Drop addresses whose window has fully expired, so the map cannot grow
  // without bound on a long-running server.
  for (const [key, times] of hits) {
    if (!times.length || now - times[times.length - 1]! >= WINDOW_MS) hits.delete(key);
  }

  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= max) {
    hits.set(ip, recent);
    const oldest = recent[0]!;
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((WINDOW_MS - (now - oldest)) / 1000)) };
  }

  recent.push(now);
  hits.set(ip, recent);
  return { ok: true };
}

/**
 * Record a request and say whether it is allowed. Call once per request,
 * before doing any paid work.
 */
export async function rateLimit(req: Request): Promise<RateLimitResult> {
  const max = limitPerMinute();
  const ip = clientIp(req);
  const store = upstash();

  if (!store) {
    if (!warnedAboutMemory && process.env.NODE_ENV === "production") {
      warnedAboutMemory = true;
      console.warn(
        "[rateLimit] No UPSTASH_REDIS_REST_URL/TOKEN set. Falling back to an " +
          "in-process limiter, which does not hold across serverless instances. " +
          "Set both to protect the xAI quota in production.",
      );
    }
    return memoryLimit(ip, max);
  }

  try {
    return await sharedLimit(store, ip, max);
  } catch (e) {
    console.error(`[rateLimit] shared store unavailable, allowing request: ${String(e)}`);
    return { ok: true };
  }
}

/** Exported for tests: forget every in-process request. */
export function resetRateLimit(): void {
  hits.clear();
}
