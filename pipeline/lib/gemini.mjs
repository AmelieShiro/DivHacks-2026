/**
 * Gemini adapter — the pipeline's only contact point with the model API.
 *
 * Shape follows the current REST API (ai.google.dev):
 *   POST {endpoint}/interactions
 *   header  x-goog-api-key: <key>
 *   body    { model, input, response_format? }
 *   reply   { interaction: { output_text } }
 *
 * Everything here is cached, rate-limited and budgeted, so re-running the
 * pipeline is free and a runaway loop cannot drain a hackathon quota.
 */
import { cached } from "./cache.mjs";
import { gemini as cfg } from "../config.mjs";

export class GeminiUnavailable extends Error {
  constructor(msg = "GEMINI_API_KEY is not set") {
    super(msg);
    this.name = "GeminiUnavailable";
  }
}

export const isEnabled = () => Boolean(cfg.apiKey);

let callsMade = 0;
let windowStart = Date.now();
let windowCount = 0;

export const usage = () => ({ callsMade, budget: cfg.maxCalls });

/** Client-side RPM limiter: free tiers 429 aggressively otherwise. */
async function rateLimit() {
  const now = Date.now();
  if (now - windowStart >= 60_000) {
    windowStart = now;
    windowCount = 0;
  }
  if (windowCount >= cfg.rpm) {
    const wait = 60_000 - (now - windowStart) + 250;
    await new Promise((r) => setTimeout(r, wait));
    windowStart = Date.now();
    windowCount = 0;
  }
  windowCount += 1;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function post(body) {
  if (!cfg.apiKey) throw new GeminiUnavailable();
  if (callsMade >= cfg.maxCalls) {
    throw new Error(`Gemini call budget exhausted (${cfg.maxCalls}); raise GEMINI_MAX_CALLS`);
  }

  let lastErr;
  for (let attempt = 0; attempt <= cfg.maxRetries; attempt++) {
    await rateLimit();
    callsMade += 1;
    try {
      const res = await fetch(`${cfg.endpoint}/interactions`, {
        method: "POST",
        headers: {
          "x-goog-api-key": cfg.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(90_000),
      });

      if (res.status === 429 || res.status >= 500) {
        const retryAfter = Number(res.headers.get("retry-after"));
        const backoff = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : Math.min(2 ** attempt * 1500 + Math.random() * 500, 30_000);
        lastErr = new Error(`${res.status} ${res.statusText}`);
        await sleep(backoff);
        continue;
      }

      const text = await res.text();
      if (!res.ok) {
        // 4xx other than 429 will not fix themselves; fail fast and loud.
        throw new Error(`Gemini ${res.status}: ${text.slice(0, 400)}`);
      }
      return JSON.parse(text);
    } catch (e) {
      if (e instanceof GeminiUnavailable) throw e;
      lastErr = e;
      if (attempt === cfg.maxRetries) break;
      await sleep(Math.min(2 ** attempt * 1500, 20_000));
    }
  }
  throw lastErr ?? new Error("Gemini request failed");
}

/**
 * Pull the text out of a response.
 *
 * The live Interactions API returns the answer inside a `steps` array — the
 * last `model_output` step holds `content: [{ type: "text", text }]`. There is
 * no `output_text` wrapper, whatever the quickstart page shows. A reply may
 * also carry `thought` steps, which must be skipped. The older shapes are kept
 * as fallbacks in case the API is versioned differently on another key.
 */
export function outputText(reply) {
  const step = reply?.steps?.findLast?.((s) => s?.type === "model_output");
  const fromSteps = step?.content
    ?.filter((c) => c?.type === "text" && typeof c.text === "string")
    .map((c) => c.text)
    .join("");
  if (fromSteps) return fromSteps;

  return (
    reply?.interaction?.output_text ??
    reply?.output_text ??
    reply?.candidates?.[0]?.content?.parts?.[0]?.text ??
    null
  );
}

/**
 * Turn a reply into { data, raw }.
 *
 * Throws when no text could be located at all: that is a transport or
 * response-shape problem, and caching it would bake a null into every one of
 * the ~800 calls in a full run. A parse failure on text we DID receive is a
 * real answer we simply could not use, so that is cached normally.
 */
export function toResult(reply) {
  const text = outputText(reply);
  if (text === null || text === undefined) {
    throw new Error(
      `Gemini reply contained no output text (keys: ${Object.keys(reply ?? {}).join(", ") || "none"})`,
    );
  }
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    // Models occasionally wrap JSON in prose or a fence.
    const m = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (m) { try { data = JSON.parse(m[0]); } catch { /* give up */ } }
  }
  return { data, raw: text };
}

/**
 * Ask Gemini for JSON matching `schema`.
 * Returns { data, fromCache } — `data` is null when the model could not answer.
 */
export async function askJSON({ prompt, schema, model = cfg.textModel, cacheKey }) {
  const body = {
    model,
    input: prompt,
    response_format: {
      type: "text",
      mime_type: "application/json",
      schema,
    },
  };
  const res = await cached("gemini", [cacheKey ?? body], async () =>
    toResult(await post(body)),
  );
  return res;
}

/**
 * Same, with images attached. `parts` is an array of
 * { mimeType, base64 } to analyse alongside the prompt.
 */
export async function askJSONWithImages({ prompt, images: imgs, schema, model = cfg.visionModel, cacheKey }) {
  const input = [
    { type: "text", text: prompt },
    ...imgs.map((i) => ({
      type: "image",
      data: i.base64,
      mime_type: i.mimeType,
    })),
  ];
  const body = {
    model,
    input,
    response_format: { type: "text", mime_type: "application/json", schema },
  };
  // Cache on the prompt plus a digest of the image bytes, not the bytes
  // themselves, so cache keys stay small.
  const { createHash } = await import("node:crypto");
  const digest = imgs
    .map((i) => createHash("sha256").update(i.base64).digest("hex").slice(0, 16))
    .join(",");

  const res = await cached("gemini", [cacheKey ?? { prompt, model, digest, schema }], async () =>
    toResult(await post(body)),
  );
  return res;
}

/** One cheap call to confirm the key and model actually work. */
export async function preflight() {
  const { data } = await askJSON({
    prompt: 'Reply with {"ok": true} and nothing else.',
    schema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] },
    cacheKey: { preflight: cfg.textModel },
  });
  return Boolean(data?.ok);
}
