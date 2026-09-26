/**
 * Image screening thresholds.
 *
 * The upper bounds exist because nonprofit sites ship raw camera JPEGs (24 MP
 * at the 99th percentile) and the occasional sprite sheet; the carousel flags
 * exist because the hero band is a fixed-height left-to-right track.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  screen, canonicalImageKey, dedupeFetched, collapseDuplicates, rejectReason, rank,
} from "../stages/50-images.mjs";

const img = (width, height, mime = "image/jpeg") => ({ width, height, mime });
const OK_BYTES = 500_000;

test("accepts an ordinary landscape photo", () => {
  const v = screen(img(1920, 1080), OK_BYTES);
  assert.equal(v.ok, true);
  assert.equal(v.orientation, "landscape");
  assert.equal(v.carouselReady, true);
});

test("rejects a sprite sheet on the dimension cap", () => {
  assert.deepEqual(screen(img(10800, 10800), OK_BYTES), { ok: false, reason: "too-large" });
});

test("rejects a raw camera dump above the cap", () => {
  assert.equal(screen(img(6016, 4016), OK_BYTES).ok, false);
});

test("accepts an image exactly at the dimension cap", () => {
  assert.equal(screen(img(4000, 2000), OK_BYTES).ok, true); // 8 MP, under both caps
});

test("rejects on pixel count even when each side is under the cap", () => {
  // 4000x3200 = 12.8 MP: both sides legal, total is not.
  assert.deepEqual(screen(img(4000, 3200), OK_BYTES), { ok: false, reason: "too-many-pixels" });
});

test("the pixel cap is reachable given the dimension cap", () => {
  // A maxPixels at or above maxDimension^2 would be dead code.
  assert.equal(screen(img(4000, 3000), OK_BYTES).ok, true, "12.0 MP should pass");
  assert.equal(screen(img(4000, 3001), OK_BYTES).ok, false, "12.004 MP should not");
});

test("rejects an oversized file regardless of dimensions", () => {
  assert.deepEqual(screen(img(1600, 1200), 20_000_000), { ok: false, reason: "too-heavy" });
});

test("rejects icons and thumbnails", () => {
  assert.deepEqual(screen(img(100, 100), 4_000), { ok: false, reason: "too-small" });
});

test("rejects banner strips and tall infographics", () => {
  assert.equal(screen(img(3000, 400), OK_BYTES).reason, "aspect");
  assert.equal(screen(img(400, 3000), OK_BYTES).reason, "aspect");
});

test("rejects formats the vision API does not take", () => {
  assert.deepEqual(screen(img(1200, 800, "image/gif"), OK_BYTES), { ok: false, reason: "mime" });
});

test("rejects an unparseable header rather than throwing", () => {
  assert.deepEqual(screen(null, OK_BYTES), { ok: false, reason: "unparseable" });
});

test("a short landscape image ships but is not carousel-ready", () => {
  // Still useful on a card or detail page; too short for the hero band at 2x.
  const v = screen(img(800, 450), OK_BYTES);
  assert.equal(v.ok, true);
  assert.equal(v.carouselReady, false);
});

test("portrait is never carousel-ready", () => {
  const v = screen(img(800, 1200), OK_BYTES);
  assert.equal(v.ok, true);
  assert.equal(v.orientation, "portrait");
  assert.equal(v.carouselReady, false, "portrait letterboxes in a fixed-height band");
});

// --- duplicates and image kinds ---------------------------------------------


test("resized CMS variants of one upload share a key", () => {
  const same = [
    "https://www.org.org/wp-content/uploads/2024/05/robots.jpg",
    "https://org.org/wp-content/uploads/2024/05/robots-800x500.jpg",
    "https://org.org/wp-content/uploads/2024/05/robots-scaled.jpg",
    "https://org.org/wp-content/uploads/2024/05/robots@2x.jpg?ver=3",
  ].map(canonicalImageKey);
  assert.equal(new Set(same).size, 1);

  const drupal = [
    "https://y.org/sites/default/files/2026-05/kids.jpeg",
    "https://y.org/sites/default/files/styles/hero_banner_retina_2x/public/2026-05/kids.jpeg.webp?itok=uh1",
  ].map(canonicalImageKey);
  assert.equal(new Set(drupal).size, 1);
});

test("different photos keep different keys", () => {
  assert.notEqual(
    canonicalImageKey("https://org.org/uploads/robots-1.jpg"),
    canonicalImageKey("https://org.org/uploads/robots-2.jpg"),
  );
  assert.notEqual(canonicalImageKey("https://a.org/x.jpg"), canonicalImageKey("https://b.org/x.jpg"));
});

test("dedupeFetched keeps the largest copy and drops identical files and variants", () => {
  const imgs = [
    { url: "https://o.org/a-400x300.jpg", width: 400, height: 300, bytes: "a-small" },
    { url: "https://o.org/a.jpg", width: 1600, height: 1200, bytes: "a-big" },
    { url: "https://o.org/mirror/b.jpg", width: 800, height: 600, bytes: "b" },
    { url: "https://cdn.o.org/b-copy.jpg", width: 800, height: 600, bytes: "b" },
    { url: "https://o.org/c.jpg", width: 900, height: 600, bytes: "c" },
  ];
  const { unique, dropped } = dedupeFetched(imgs, (i) => i.bytes);
  assert.deepEqual(unique.map((i) => i.url), ["https://o.org/a.jpg", "https://o.org/c.jpg", "https://o.org/mirror/b.jpg"]);
  assert.deepEqual(
    dropped.map((d) => [d.url, d.reason, d.duplicateOf]),
    [
      ["https://cdn.o.org/b-copy.jpg", "duplicate-file", "https://o.org/mirror/b.jpg"],
      ["https://o.org/a-400x300.jpg", "resized-copy", "https://o.org/a.jpg"],
    ],
  );
});

test("collapseDuplicates keeps the best of each Gemini group", () => {
  const imgs = [
    { url: "1", kind: "program-photo", carouselReady: true, suitability: 6, width: 1000, height: 700 },
    { url: "2", kind: "program-photo", carouselReady: true, suitability: 9, width: 1000, height: 700 },
    { url: "3", kind: "program-photo", carouselReady: false, suitability: 8, width: 800, height: 600 },
    { url: "4", kind: "flyer", carouselReady: false, suitability: 7, width: 800, height: 1000 },
  ];
  const { kept, dropped } = collapseDuplicates(imgs, [[1, 2], [3, 4]]);
  assert.deepEqual(kept.map((i) => i.url), ["2", "3"]);
  assert.deepEqual(dropped.map((d) => [d.url, d.duplicateOf]), [["1", "2"], ["4", "3"]]);
});

test("collapseDuplicates ignores malformed model output", () => {
  const imgs = [1, 2, 3].map((n) => ({ url: String(n), width: 10, height: 10 }));
  const { kept, dropped } = collapseDuplicates(imgs, [[1], [0, 9, 1.5, "2"], [2, 2], [3, 1], [1, 3], null, "x"]);
  // Only [3, 1] is a real group; [1, 3] reuses claimed images.
  assert.equal(dropped.length, 1);
  assert.equal(kept.length, 2);
  assert.deepEqual(collapseDuplicates(imgs, undefined).kept, imgs);
});

test("colourful flyers are kept, plain text and logos are not", () => {
  assert.equal(rejectReason({ judged: true, kind: "program-photo" }), null);
  assert.equal(rejectReason({ judged: true, kind: "flyer" }), null);
  assert.equal(rejectReason({ judged: true, kind: "text-only" }), "text-only");
  assert.equal(rejectReason({ judged: true, kind: "logo" }), "logo");
  assert.equal(rejectReason({ judged: true }), "unclassified");
  assert.equal(rejectReason({ judged: false }), null, "unjudged images ship, labelled judged:false");
});

test("photos rank ahead of flyers, then carousel-ready, suitability, size", () => {
  const flyer = { kind: "flyer", carouselReady: false, suitability: 10, width: 2000, height: 2000 };
  const photo = { kind: "program-photo", carouselReady: false, suitability: 3, width: 500, height: 400 };
  const hero = { kind: "program-photo", carouselReady: true, suitability: 3, width: 500, height: 400 };
  assert.deepEqual([flyer, photo, hero].sort(rank), [hero, photo, flyer]);
});
