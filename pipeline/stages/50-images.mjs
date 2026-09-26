/**
 * Stage 50 — pick and judge program photos (Gemini vision).
 *
 * Crawled pages yield hundreds of image URLs, most of them logos, banners and
 * stock filler. Cheap filters run first (extension, filename pattern, real
 * pixel dimensions from the header) so a vision call is only spent on images
 * that could plausibly be a photo of a program.
 *
 * Gemini then answers the question the product actually needs: is this a real
 * photo of children doing hands-on work, and what equipment is visible? It
 * classifies each image (`kind`): program photos and colourful program flyers
 * are kept; plain-text images, logos and stock are dropped.
 *
 * Copies are removed twice: resized variants and identical files for free
 * before any vision call, then near-duplicates (crops, recolours, burst
 * shots) by one Gemini call per provider that sees every keeper at once.
 * Every dropped image is written to `rejected` with its reason, so the
 * inspector can show what was lost and why.
 *
 * Without GEMINI_API_KEY the stage still runs and emits size-filtered
 * candidates with `judged: false`, so the downstream build never blocks.
 */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { paths, images as cfg } from "../config.mjs";
import { get, pool } from "../lib/http.mjs";
import { imageSize } from "../lib/imagesize.mjs";
import { askJSONWithImages, isEnabled } from "../lib/gemini.mjs";
import { TOOL_VOCAB } from "./40-extract.mjs";
import { makeLogger } from "../lib/log.mjs";

const log = makeLogger("50-images");

/**
 * What an image IS. Only program photos and flyers are kept: a colourful flyer
 * for a specific program tells a parent what happens there, while a block of
 * plain text (a notice, a schedule, a screenshot) is better read on the page.
 */
export const IMAGE_KINDS = ["program-photo", "flyer", "text-only", "logo", "stock", "other"];
export const KEPT_KINDS = new Set(["program-photo", "flyer"]);

const VISION_SCHEMA = {
  type: "object",
  properties: {
    kind: {
      type: "string",
      enum: IMAGE_KINDS,
      description: [
        "program-photo: a real photograph of an actual program space, activity or participants.",
        "flyer: a designed, colourful promotional graphic for a specific program or event, built around",
        "photos, illustrations or strong colour, with text as only part of the design.",
        "text-only: mostly text on a plain or simple background - notices, schedules, letters,",
        "screenshots of text, text banners - even if the text is about a program.",
        "logo: a logo, wordmark, icon or badge.",
        "stock: stock photography or generic illustration not specific to this organization.",
        "other: anything else (maps, charts, portraits of staff, buildings with no program visible).",
      ].join(" "),
    },
    showsChildren: { type: "boolean" },
    showsHandsOnWork: { type: "boolean" },
    visibleTools: { type: "array", items: { type: "string", enum: TOOL_VOCAB } },
    caption: { type: "string", description: "Neutral alt-text, <=120 chars. No invented detail." },
    suitability: { type: "integer", description: "0-10: how well this sells the program to a K-5 parent." },
  },
  required: ["kind", "caption", "suitability"],
};

const DUPLICATE_SCHEMA = {
  type: "object",
  properties: {
    groups: {
      type: "array",
      description: "Each group lists the 1-based numbers of images that are near-duplicates of each other.",
      items: { type: "array", items: { type: "integer" } },
    },
  },
  required: ["groups"],
};

/**
 * Key under which resized variants of one upload collide. CMSs serve the same
 * photo at several sizes, and without this they fill every slot with copies:
 *   WordPress  photo-800x500.jpg, photo-scaled.jpg, photo@2x.jpg
 *   Drupal     /styles/<style>/public/photo.jpg.webp
 *   Wix        /v1/fill/w_800,h_500/photo.jpg
 *   Squarespace and most CDNs  ?format=500w, ?w=800
 */
export function canonicalImageKey(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return url;
  }
  let p = u.pathname.toLowerCase();
  try { p = decodeURIComponent(p); } catch { /* keep encoded */ }
  p = p
    .replace(/\/styles\/[^/]+\/(public|private)\//, "/")
    .replace(/\/v1\/(fill|fit|crop)\/[^/]+\//, "/")
    .replace(/\.(jpe?g|png)\.webp$/, ".$1")
    .replace(/-\d{2,5}x\d{2,5}(?=\.[a-z0-9]+$)/, "")
    .replace(/-(scaled|rotated)(?=\.[a-z0-9]+$)/, "")
    .replace(/@\dx(?=\.[a-z0-9]+$)/, "");
  return u.host.replace(/^www\./, "") + p;
}

/**
 * Collapse identical files and resized variants, keeping the largest copy.
 * Runs before any vision call, so a copy never costs one.
 */
export function dedupeFetched(images, digest) {
  const byKey = new Map();
  const dropped = [];
  const ordered = [...images].sort((a, b) => b.width * b.height - a.width * a.height);
  const seenBytes = new Map();
  for (const img of ordered) {
    const bytes = digest(img);
    if (seenBytes.has(bytes)) {
      dropped.push({ ...img, reason: "duplicate-file", duplicateOf: seenBytes.get(bytes) });
      continue;
    }
    const key = canonicalImageKey(img.url);
    if (byKey.has(key)) {
      dropped.push({ ...img, reason: "resized-copy", duplicateOf: byKey.get(key).url });
      continue;
    }
    seenBytes.set(bytes, img.url);
    byKey.set(key, img);
  }
  return { unique: [...byKey.values()], dropped };
}

/** Hero-band order: photos before flyers, carousel-ready, suitability, size. */
export function rank(a, b) {
  return (
    Number(a.kind === "flyer") - Number(b.kind === "flyer") ||
    Number(b.carouselReady) - Number(a.carouselReady) ||
    (b.suitability ?? 0) - (a.suitability ?? 0) ||
    b.width * b.height - a.width * a.height
  );
}

/**
 * Apply Gemini's near-duplicate groups: keep the best-ranked image of each
 * group. Model output is not trusted — out-of-range, repeated and non-integer
 * indices are ignored, and an image can belong to only one group.
 */
export function collapseDuplicates(images, groups) {
  const claimed = new Set();
  const dropped = [];
  const drop = new Set();
  for (const g of Array.isArray(groups) ? groups : []) {
    const members = [...new Set(Array.isArray(g) ? g : [])]
      .filter((n) => Number.isInteger(n) && n >= 1 && n <= images.length && !claimed.has(n));
    if (members.length < 2) continue;
    members.forEach((n) => claimed.add(n));
    const [best, ...rest] = members.map((n) => images[n - 1]).sort(rank);
    for (const img of rest) {
      drop.add(img);
      dropped.push({ ...img, reason: "similar-photo", duplicateOf: best.url });
    }
  }
  return { kept: images.filter((img) => !drop.has(img)), dropped };
}

/** Why a judged image is dropped, or null to keep it. Unjudged images are kept. */
export function rejectReason(judged) {
  if (!judged.judged) return null;
  return KEPT_KINDS.has(judged.kind) ? null : judged.kind ?? "unclassified";
}

/** Cheap rejects before any byte is downloaded. */
function plausible(img) {
  if (cfg.rejectPattern.test(img.url)) return false;
  if (/\.(svg|ico|gif)(\?|$)/i.test(img.url)) return false;
  return true;
}

/**
 * Decide whether a downloaded file is a usable photo.
 * Exported so the thresholds are testable without a network round trip.
 */
export function screen(size, byteLength) {
  if (!size) return { ok: false, reason: "unparseable" };
  if (!/^image\/(jpeg|png|webp)$/.test(size.mime)) return { ok: false, reason: "mime" };

  const { width, height } = size;
  if (width < cfg.minWidth || height < cfg.minHeight) return { ok: false, reason: "too-small" };
  if (Math.max(width, height) > cfg.maxDimension) return { ok: false, reason: "too-large" };
  if (width * height > cfg.maxPixels) return { ok: false, reason: "too-many-pixels" };
  if (byteLength > cfg.maxImageBytes) return { ok: false, reason: "too-heavy" };

  // Wide thin strips are banners; very tall ones are infographics.
  const aspect = width / Math.max(height, 1);
  if (aspect > 4 || aspect < 0.25) return { ok: false, reason: "aspect" };

  const orientation = aspect >= 1.2 ? "landscape" : aspect <= 0.83 ? "portrait" : "square";
  // Good enough to render sharply in the hero band at 2x.
  const carouselReady =
    height >= cfg.carouselMinHeight && aspect >= cfg.carouselMinAspect;

  return { ok: true, aspect: Number(aspect.toFixed(3)), orientation, carouselReady };
}

/** Download and screen one image. Returns the image, or `{ rejected: reason }`. */
async function fetchImage(img) {
  const res = await get(img.url, { binary: true });
  if (!res.ok || !res.body) return { rejected: res.error === "robots" ? "robots" : "download-failed" };
  const buf = Buffer.from(res.body, "base64");
  const size = imageSize(buf);
  const verdict = screen(size, buf.length);
  if (!verdict.ok) return { rejected: verdict.reason };
  return { ...img, ...size, ...verdict, base64: res.body, bytes: buf.length };
}

const sha = (img) => createHash("sha256").update(img.base64).digest("hex");

/** What gets written for an image that did not make it, with the reason. */
const rejection = (img, reason, extra = {}) => ({
  url: img.url, page: img.page, alt: img.alt ?? "",
  width: img.width ?? null, height: img.height ?? null, reason, ...extra,
});

async function judge(img) {
  const { data } = await askJSONWithImages({
    prompt: [
      "You are screening an image from a New York City youth-program website",
      "for a directory shown to parents of K-5 children.",
      "",
      `Alt text on the page: "${img.alt || "(none)"}"`,
      "",
      "Answer strictly about what is VISIBLE. Do not infer equipment that is",
      "not clearly shown. Classify the image with `kind`: a colourful designed",
      "flyer for a program is a flyer, but an image that is mostly plain text",
      "is text-only, even when the text describes a program.",
    ].join("\n"),
    images: [{ mimeType: img.mime, base64: img.base64 }],
    schema: VISION_SCHEMA,
  });
  return data;
}

async function findDuplicateGroups(images) {
  const { data } = await askJSONWithImages({
    prompt: [
      `The ${images.length} attached images come from one organization's website, in order:`,
      `the first attached image is number 1 and the last is number ${images.length}.`,
      "",
      "Group images that are near-duplicates: the same photograph resized, cropped,",
      "recoloured or with text added, or the same moment photographed seconds apart",
      "from a similar angle. Different activities, rooms, events or groups of children",
      "are NOT duplicates, even if the style is similar. Only return groups of 2 or more;",
      "each image may appear in at most one group. Return an empty list if none.",
    ].join("\n"),
    images: images.map((i) => ({ mimeType: i.mime, base64: i.base64 })),
    schema: DUPLICATE_SCHEMA,
  });
  return data?.groups ?? [];
}

export async function run({ limit } = {}) {
  const crawl = JSON.parse(await readFile(path.join(paths.work, "crawl.json"), "utf8"));
  let targets = crawl.filter((c) => c.images?.length);
  if (limit) targets = targets.slice(0, limit);

  const gemini = isEnabled();
  log.info(`${targets.length} providers; vision = ${gemini ? "on" : "off (size filter only)"}`);

  const out = [];
  for (const site of targets) {
    const rejected = [];
    const shortlist = [];
    for (const img of site.images) {
      if (!plausible(img)) rejected.push(rejection(img, "filename"));
      else if (shortlist.length >= cfg.maxPerProvider * 3) rejected.push(rejection(img, "shortlist-full"));
      else shortlist.push(img);
    }

    const downloaded = [];
    (await pool(shortlist, fetchImage, 4)).forEach((r, i) => {
      if (r.rejected) rejected.push(rejection(shortlist[i], r.rejected));
      else downloaded.push(r);
    });

    const { unique, dropped: copies } = dedupeFetched(downloaded, sha);
    copies.forEach((c) => rejected.push(rejection(c, c.reason, { duplicateOf: c.duplicateOf })));

    // `unique` is largest first; the vision budget goes to the biggest images.
    const fetched = unique.slice(0, cfg.maxPerProvider);
    unique.slice(cfg.maxPerProvider).forEach((img) => rejected.push(rejection(img, "over-limit")));

    const judged = [];
    for (const img of fetched) {
      const base = {
        url: img.url,
        page: img.page,
        alt: img.alt,
        width: img.width,
        height: img.height,
        mime: img.mime,
        aspect: img.aspect,
        orientation: img.orientation,
        carouselReady: img.carouselReady,
      };
      if (!gemini) {
        judged.push({ ...base, judged: false });
        continue;
      }
      try {
        const data = await judge(img);
        if (data) {
          judged.push({
            ...base, judged: true, ...data,
            isProgramPhoto: data.kind === "program-photo",
            // The hero band is for photographs; a flyer's text would be cropped.
            carouselReady: base.carouselReady && data.kind === "program-photo",
          });
        } else {
          judged.push({ ...base, judged: false });
        }
      } catch (e) {
        log.warn(`vision failed ${img.url.slice(0, 60)}: ${e.message}`);
        judged.push({ ...base, judged: false });
      }
    }

    let keepers = [];
    for (const j of judged) {
      const reason = rejectReason(j);
      if (reason) rejected.push(rejection(j, reason, { caption: j.caption ?? null }));
      else keepers.push(j);
    }

    // Near-duplicates that are not byte- or URL-identical need eyes: one call
    // per provider with every keeper attached. Only judged images take part.
    const comparable = keepers.filter((k) => k.judged);
    if (gemini && comparable.length >= 2) {
      try {
        const withBytes = comparable.map((k) => ({ ...k, ...fetched.find((f) => f.url === k.url) }));
        const groups = await findDuplicateGroups(withBytes);
        const { dropped } = collapseDuplicates(comparable, groups);
        const gone = new Set(dropped.map((d) => d.url));
        keepers = keepers.filter((k) => !gone.has(k.url));
        dropped.forEach((d) => rejected.push(rejection(d, d.reason, { duplicateOf: d.duplicateOf, caption: d.caption ?? null })));
      } catch (e) {
        log.warn(`duplicate check failed for ${site.provider.slice(0, 40)}: ${e.message}`);
      }
    }

    keepers.sort(rank);
    out.push({ provider: site.provider, website: site.website, photos: keepers, rejected });
    log.ok(`${site.provider.slice(0, 38).padEnd(38)} ${keepers.length}/${fetched.length} kept`);
  }

  const file = path.join(paths.work, "photos.json");
  await writeFile(file, JSON.stringify(out, null, 2) + "\n");
  const total = out.reduce((s, o) => s + o.photos.length, 0);
  log.ok(`${total} photos across ${out.length} providers -> ${file}`);
  return { providers: out.length, photos: total };
}
