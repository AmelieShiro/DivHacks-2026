/**
 * Photos shown on program cards that are not the provider's own: the Commons
 * stock pool, the 14 local subject photos, and the reviewed denylist of
 * provider images. A military setting must never reach an NYC after-school
 * card, and a rejected provider image must stay rejected.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { MILITARY, isMilitary } from "../../scripts/lib/stock-filters.mjs";
import { paths } from "../config.mjs";

const read = (rel) => readFileSync(path.join(paths.root, rel), "utf8");

test("MILITARY catches the settings found in the reviewed pool", () => {
  for (const title of [
    "'Can Do' Soldiers, students build Lego robot car for science 111615-A-XX999-020.jpg",
    "DeLalio hosts Hour of Code 141212-M-FL273-032.jpg",
    "US soldier with children at Hoc Mon Orphanage.jpg",
    "Building bridges- KLI students tour Kadena Air Base (9197098).jpg",
    "Sailors help set kids' sights on science with SeaPerch subs",
  ]) assert.ok(MILITARY.test(title), title);
  assert.ok(isMilitary({ title: "Music class.jpg", credit: "Spc. Paul Durrance, U.S. Army · Public domain" }));
});

test("MILITARY leaves ordinary activity photos alone", () => {
  for (const title of [
    "Kids playing baseball.jpg",
    "Children at the Warsaw science museum.jpg",
    "Students in the basement art room.jpg",
    "Robotics Club (CCA).JPG",
  ]) assert.equal(MILITARY.test(title), false, title);
});

test("the stock pool has no military photos", () => {
  const pool = JSON.parse(read("src/data/stock-pool.json"));
  assert.ok(pool.length > 100);
  const hits = pool.filter(isMilitary).map((p) => p.title);
  assert.deepEqual(hits, []);
});

test("the local subject photos have no military credits or sources", () => {
  const src = read("src/lib/stockPhotos.ts");
  const credits = [...src.matchAll(/credit: "([^"]+)"/g)].map((m) => m[1]);
  const sources = [...src.matchAll(/source: `\$\{COMMONS\}([^`]+)`/g)].map((m) => m[1]);
  assert.equal(credits.length, 14);
  assert.equal(sources.length, 14);
  for (let i = 0; i < 14; i++) {
    assert.equal(isMilitary({ title: sources[i], credit: credits[i], source: "" }), false, `${credits[i]} ${sources[i]}`);
  }
});

test("the reviewed provider-photo denylist is well formed", () => {
  const { photos } = JSON.parse(read("src/data/photo-denylist.json"));
  assert.ok(photos.length > 0);
  const urls = photos.map((p) => p.url);
  assert.equal(new Set(urls).size, urls.length, "no duplicates");
  for (const p of photos) {
    assert.match(p.url, /^https?:\/\/[^?#]+$/, "matched without its query string");
    assert.ok(p.why, `${p.url} needs a reason`);
  }
});
