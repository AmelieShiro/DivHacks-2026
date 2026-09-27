#!/usr/bin/env node
/**
 * Build the stock photo pool: real, freely licensed photos of children doing
 * each kind of activity, from Wikimedia Commons, so every program card that
 * has no usable photo of its own can still get a DIFFERENT relevant image.
 *
 *   node scripts/stock-pool.mjs                # search + write data/stock/candidates.json
 *   node scripts/stock-pool.mjs --sheets       # also write contact sheets for review
 *   node scripts/stock-pool.mjs --sheets=12,13 # re-render those sheets from candidates.json
 *   node scripts/stock-pool.mjs --final        # data/stock/accepted.json -> src/data/stock-pool.json
 *
 * Search results are only candidates: a person reviews the contact sheets and
 * lists the ids that clearly show children doing the activity in
 * data/stock/accepted.json. Anything not reviewed stays out. Images are
 * hotlinked from upload.wikimedia.org, so the repo only stores URLs and credits.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isMilitary } from "./lib/stock-filters.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORK = path.join(ROOT, "data", "stock");
const UA = { "User-Agent": "NovaDivHacks/0.1 (student project; https://github.com/AmelieShiro/DivHacks-2026)" };
const OK_LICENSE = /^(CC BY(-SA)? [\d.]+|CC0|Public domain)/i;
/** Historic photos, artworks and scans are not what a parent expects to see. */
const NOT_A_PHOTO = /\b(1[0-8]\d\d|19[0-6]\d)\b|painting|oil on|engraving|lithograph|drawing by|NARA|Library of Congress|\bLOC\b|postcard|poster|map of|logo|diagram|\.tif/i;

export const QUERIES = {
  robotics: ["children robotics", "kids robot class", "students lego robot", "first lego league", "elementary robotics", "kids building robots", "robotics club students", "children programming robot", "stem students robot", "school robotics team", "lego mindstorms students", "vex robotics students", "children stem camp", "robotics workshop kids"],
  coding: ["children coding", "kids computer class", "students laptops classroom", "hour of code", "children computer lab", "kids programming scratch", "students tablets classroom", "children using computers", "students chromebooks", "kids ipad classroom", "elementary computer class"],
  chess: ["children playing chess", "kids chess club", "students chess tournament", "chess school children", "boy playing chess", "girl playing chess", "youth chess", "chess lesson children"],
  engineering: ["children building lego", "kids lego", "children building blocks", "students engineering challenge", "kids stem activity", "children makerspace", "students building bridge", "stem day students", "children building", "students stem project", "kids science technology engineering"],
  science: ["children science experiment", "kids science class", "students microscope", "children science museum", "science fair students", "kids chemistry experiment", "students lab goggles", "children nature study", "students science lesson", "stem outreach children", "kids science day", "children planetarium", "students experiment classroom"],
  gardening: ["children gardening", "school garden students", "kids planting", "children planting trees", "students vegetable garden"],
  math: ["students math classroom", "children counting", "elementary classroom students", "kids math class", "students whiteboard classroom", "students doing homework", "children worksheet classroom", "tutoring children"],
  cooking: ["children cooking", "kids cooking class", "students baking", "children kitchen chef", "kids making food", "children cooking lesson", "children baking cookies", "kids healthy eating class", "school lunch children", "children preparing food"],
  art: ["children painting", "kids art class", "students art project", "children crafts", "kids drawing classroom", "children mural painting"],
  music: ["children music class", "kids playing instruments", "students choir", "children drums", "elementary band students", "kids piano lesson"],
  dance: ["children dancing", "kids dance class", "students dance performance", "children ballet class"],
  reading: ["children reading", "kids library", "students reading books", "reading to children", "children storytime library", "kids books classroom", "read across america", "children library program", "kids reading outdoors", "book fair children"],
  sports: ["children soccer", "kids basketball", "youth soccer practice", "children playing sports", "kids running race", "children swimming lesson", "kids baseball", "children martial arts", "kids gymnastics", "children playground", "youth sports camp", "kids tennis", "children karate", "kids football practice", "children relay race", "field day students", "kids volleyball", "children jump rope", "youth basketball clinic"],
  default: ["children classroom", "after school program children", "kids summer camp", "children playing outdoors", "elementary school students", "kids group activity", "children learning", "students raising hands", "children field trip", "kids camp activities", "children school activities", "students group project", "children museum visit", "kids outdoor education", "youth center children", "boys and girls club", "children volunteers visit school", "kids workshop", "children teamwork", "school children activity", "kindergarten children", "children games", "kids craft activity", "children community event", "youth program kids", "children smiling group"],
};

/**
 * How many candidates to keep per subject, most relevant first. Sized to the
 * number of cards that need each subject (robotics and sports are common) with
 * room for rejects; "default" backs up every subject, so it is the largest.
 */
export const TARGET = {
  robotics: 150, coding: 70, chess: 50, engineering: 90, science: 105, gardening: 20, math: 70,
  cooking: 100, art: 30, music: 15, dance: 15, reading: 105, sports: 180, default: 480,
};

async function search(query, offset = 0) {
  const u = new URL("https://commons.wikimedia.org/w/api.php");
  Object.entries({
    action: "query", format: "json", generator: "search", gsrsearch: `${query} filetype:bitmap`,
    gsrnamespace: "6", gsrlimit: "50", gsroffset: String(offset), prop: "imageinfo", iiprop: "url|size|extmetadata", iiurlwidth: "960",
  }).forEach(([k, v]) => u.searchParams.set(k, v));
  const j = await (await fetch(u, { headers: UA })).json();
  return Object.values(j.query?.pages ?? {}).sort((a, b) => a.index - b.index);
}

/** Two pages of results per query, most relevant first. */
const search100 = async (q) => [...await search(q, 0), ...await search(q, 50)];

/**
 * `existing` keeps ids stable across runs, so a review of earlier sheets
 * still applies; new candidates are appended after it and never repeat a file.
 */
async function candidates(existing = []) {
  const seen = new Set(existing.map((c) => c.title));
  const out = [...existing];
  for (const [subject, queries] of Object.entries(QUERIES)) {
    let n = existing.filter((c) => c.subject === subject).length;
    if (n >= TARGET[subject]) continue;
    // Round-robin across queries so each subject gets the top results of every
    // query rather than many near-duplicates from the first one.
    const results = await Promise.all(queries.map(search100));
    const interleaved = [];
    for (let i = 0; i < 100; i++) for (const r of results) if (r[i]) interleaved.push(r[i]);
    for (const p of interleaved) {
      if (n >= TARGET[subject]) break;
      const ii = p.imageinfo?.[0];
      const m = ii?.extmetadata ?? {};
      const license = m.LicenseShortName?.value ?? "";
      const title = p.title.replace(/^File:/, "");
      if (!ii || seen.has(title)) continue;
      if (ii.width < 1000 || ii.width / ii.height < 1.2 || ii.width / ii.height > 2.2) continue;
      if (!OK_LICENSE.test(license) || NOT_A_PHOTO.test(title)) continue;
      seen.add(title);
      const artist = (m.Artist?.value ?? "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().slice(0, 80);
      out.push({
        id: out.length,
        subject,
        title,
        src: ii.thumburl,
        source: ii.descriptionurl,
        credit: `${artist || "Wikimedia Commons"} · ${license}`,
      });
      n++;
    }
    console.log(subject.padEnd(12), n);
  }
  return out;
}

/** Commons answers bursts with 429s; back off and retry instead of leaving gaps. */
async function fetchThumb(url) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(20_000) });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    if (res.status !== 429 && res.status < 500) throw new Error(`${res.status}`);
    await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
  }
  throw new Error("rate limited");
}

async function sheets(list, only) {
  const { createRequire } = await import("node:module");
  const sharp = createRequire(path.join(ROOT, "package.json"))("sharp");
  const W = 200, H = 134, COLS = 8, PER = 48;
  for (let s = 0; s * PER < list.length; s++) {
    if (only && !only.includes(s)) continue;
    const tiles = [];
    for (let batch = 0; batch < PER; batch += 8) {
      tiles.push(...await Promise.all(list.slice(s * PER + batch, s * PER + batch + 8).map(async (c, j) => {
      const i = batch + j;
      try {
        const buf = await fetchThumb(c.src.replace(/\/960px-/, "/330px-"));
        const img = await sharp(buf).resize(W, H, { fit: "cover" }).jpeg().toBuffer();
        const label = Buffer.from(`<svg width="${W}" height="${H}"><rect width="44" height="22" fill="black"/><text x="4" y="17" font-size="16" fill="yellow" font-family="Arial">${c.id}</text></svg>`);
        return { input: await sharp(img).composite([{ input: label }]).toBuffer(), left: (i % COLS) * (W + 4), top: Math.floor(i / COLS) * (H + 4) };
      } catch {
        return null; // unreadable thumbnail: the reviewer sees a gap
      }
      })));
    }
    tiles.splice(0, tiles.length, ...tiles.filter(Boolean));
    await sharp({ create: { width: COLS * (W + 4), height: 6 * (H + 4), channels: 3, background: "#222" } })
      .composite(tiles).jpeg({ quality: 72 }).toFile(path.join(WORK, `sheet-${String(s).padStart(2, "0")}.jpg`));
    console.log(`sheet ${s}: ids ${list[s * PER].id}-${list[Math.min(list.length, (s + 1) * PER) - 1].id}`);
  }
}

await mkdir(WORK, { recursive: true });
const candFile = path.join(WORK, "candidates.json");
if (process.argv.includes("--final")) {
  const list = JSON.parse(await readFile(candFile, "utf8"));
  const accepted = new Set(JSON.parse(await readFile(path.join(WORK, "accepted.json"), "utf8")).ids);
  const reviewed = list.filter((c) => accepted.has(c.id));
  // Military settings are excluded even when a reviewer accepted the photo.
  const pool = reviewed.filter((c) => !isMilitary(c)).map(({ subject, title, src, source, credit }) => ({ subject, title, src, source, credit }));
  console.log(`${reviewed.length - pool.length} reviewed photos dropped for a military setting`);
  await mkdir(path.join(ROOT, "src", "data"), { recursive: true });
  await writeFile(path.join(ROOT, "src", "data", "stock-pool.json"), JSON.stringify(pool, null, 1) + "\n");
  const by = {};
  for (const c of pool) by[c.subject] = (by[c.subject] ?? 0) + 1;
  console.log(`${pool.length} photos in pool`, by);
} else if (process.argv.includes("--more")) {
  const existing = JSON.parse(await readFile(candFile, "utf8"));
  const list = await candidates(existing);
  await writeFile(candFile, JSON.stringify(list, null, 1) + "\n");
  console.log(`${list.length - existing.length} new candidates (ids ${existing.length}-${list.length - 1})`);
  const PER = 48;
  const first = Math.floor(existing.length / PER);
  const only = Array.from({ length: Math.ceil(list.length / PER) - first }, (_, i) => first + i);
  await sheets(list, only);
} else if (process.argv.some((a) => a.startsWith("--sheets="))) {
  const only = process.argv.find((a) => a.startsWith("--sheets=")).slice(9).split(",").map(Number);
  await sheets(JSON.parse(await readFile(candFile, "utf8")), only);
} else {
  const list = await candidates();
  await writeFile(candFile, JSON.stringify(list, null, 1) + "\n");
  console.log(`${list.length} candidates -> ${path.relative(ROOT, candFile)}`);
  if (process.argv.includes("--sheets")) await sheets(list);
}
