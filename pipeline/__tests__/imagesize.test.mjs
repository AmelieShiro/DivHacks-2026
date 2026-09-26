import { test } from "node:test";
import assert from "node:assert/strict";
import { imageSize } from "../lib/imagesize.mjs";
import { pngHeader, gifHeader, jpegHeader, webpVp8xHeader } from "./helpers.mjs";

test("reads PNG dimensions", () => {
  assert.deepEqual(imageSize(pngHeader(800, 600)), {
    width: 800, height: 600, mime: "image/png",
  });
});

test("reads GIF dimensions", () => {
  const s = imageSize(gifHeader(120, 90));
  assert.equal(s.width, 120);
  assert.equal(s.height, 90);
});

test("reads JPEG dimensions past an APP0 segment", () => {
  const s = imageSize(jpegHeader(1024, 768));
  assert.equal(s.mime, "image/jpeg");
  assert.equal(s.width, 1024);
  assert.equal(s.height, 768);
});

test("reads JPEG with no preceding segments", () => {
  const s = imageSize(jpegHeader(640, 480, { withApp0: false }));
  assert.equal(s.width, 640);
  assert.equal(s.height, 480);
});

test("reads WEBP VP8X dimensions (stored minus one)", () => {
  const s = imageSize(webpVp8xHeader(1600, 1200));
  assert.equal(s.mime, "image/webp");
  assert.equal(s.width, 1600);
  assert.equal(s.height, 1200);
});

test("returns null for a truncated buffer rather than throwing", () => {
  assert.equal(imageSize(Buffer.alloc(8)), null);
});

test("returns null for non-image bytes", () => {
  assert.equal(imageSize(Buffer.from("<!DOCTYPE html><html></html>".padEnd(64))), null);
});

test("does not throw on a JPEG that is truncated mid-scan", () => {
  const truncated = jpegHeader(800, 600).subarray(0, 12);
  assert.doesNotThrow(() => imageSize(truncated));
});
