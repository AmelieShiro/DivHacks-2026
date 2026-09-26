/**
 * Shared configuration for the Nova enrichment pipeline.
 *
 * Everything tunable lives here so a stage never hardcodes a path, a model
 * name or a rate limit. Environment variables win over defaults.
 */
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, "..");

export const paths = {
  root: ROOT,
  raw: path.join(ROOT, "data", "raw"),
  work: path.join(ROOT, "data", "enrichment"),
  cache: path.join(ROOT, "data", "cache"),
  dist: path.join(ROOT, "dist"),
};

/** Age bands that put a DYCD site in front of a K-5 family. */
export const K5_AGE_RANGES = new Set([
  "Grades K - 5",
  "Grades K - 12",
  "Ages 4+",
  "Ages 5 - 20",
]);

/** Which program year to build. DYCD publishes one row per site per year. */
export const PROGRAM_YEAR = process.env.NOVA_YEAR ?? "2026";

export const http = {
  userAgent:
    process.env.NOVA_UA ??
    "Nova/0.1 (+https://github.com/; DivHacks student project)",
  timeoutMs: Number(process.env.NOVA_HTTP_TIMEOUT ?? 15_000),
  concurrency: Number(process.env.NOVA_CONCURRENCY ?? 6),
  /** Politeness delay between requests to the SAME host. */
  perHostDelayMs: Number(process.env.NOVA_HOST_DELAY ?? 1_000),
  maxBytes: Number(process.env.NOVA_MAX_BYTES ?? 2_000_000),
};

export const gemini = {
  apiKey: process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? null,
  /** Override if a newer/cheaper model is available on your key. */
  textModel: process.env.GEMINI_TEXT_MODEL ?? "gemini-3.8-flash",
  visionModel: process.env.GEMINI_VISION_MODEL ?? "gemini-3.8-flash",
  endpoint:
    process.env.GEMINI_ENDPOINT ??
    "https://generativelanguage.googleapis.com/v1beta",
  /** Requests per minute. Free tier is tight; raise on a paid key. */
  rpm: Number(process.env.GEMINI_RPM ?? 12),
  maxRetries: Number(process.env.GEMINI_MAX_RETRIES ?? 4),
  /** Hard ceiling so a bad loop cannot burn a quota. */
  maxCalls: Number(process.env.GEMINI_MAX_CALLS ?? 2_000),
};

export const images = {
  minWidth: 400,
  minHeight: 300,

  /**
   * Upper bounds. Nonprofit sites routinely ship straight-off-the-camera
   * JPEGs (24 MP is the 99th percentile here) and the occasional sprite
   * sheet. Those are not photos we can put on a page, they waste a vision
   * call, and they are usually duplicates of a smaller version on the same
   * site. 4000px drops ~5% of candidates, all of them oversized.
   */
  maxDimension: Number(process.env.NOVA_MAX_DIMENSION ?? 4000),
  // Must be below maxDimension^2 or it can never fire. 12 MP rejects the
  // heavy tail (p95 here is 8.9 MP) while keeping normal web photos.
  maxPixels: Number(process.env.NOVA_MAX_PIXELS ?? 12_000_000),
  maxImageBytes: Number(process.env.NOVA_MAX_IMAGE_BYTES ?? 8_000_000),

  /**
   * The hero carousel is a toroidal left-to-right band occupying about a
   * third of the viewport: ~360 CSS px tall on a 1080p screen, so ~720px of
   * source at 2x. Landscape reads correctly in a fixed-height band; portrait
   * letterboxes badly. Images below this bar still ship — detail pages and
   * cards can use them — they just are not flagged carousel-ready.
   */
  carouselMinHeight: Number(process.env.NOVA_CAROUSEL_MIN_HEIGHT ?? 600),
  carouselMinAspect: 1.0,
  maxPerProvider: Number(process.env.NOVA_MAX_IMAGES ?? 12),
  /** Paths and filenames that are almost never a real program photo. */
  rejectPattern:
    /(logo|icon|favicon|sprite|avatar|placeholder|banner-ad|pixel|spacer|badge|button|arrow|bullet|footer|header-bg|1x1|blank)/i,
};

export const isGeminiEnabled = () => Boolean(gemini.apiKey);
