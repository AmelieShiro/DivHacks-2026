#!/usr/bin/env node
/**
 * Stage-by-stage inspector for the enrichment pipeline.
 *
 * Each pipeline stage writes one file. This script has one module per stage
 * that reads ONLY that stage's output, runs sanity checks on it, and renders
 * a tab in an HTML page — so a stage can be run and inspected on its own:
 *
 *   node pipeline/run.mjs 50 --limit 3 && node scripts/inspect.mjs 50
 *
 *   node scripts/inspect.mjs            # every stage that has output
 *   node scripts/inspect.mjs 40 50      # just these
 *
 * Checks print to the terminal; the exit code is 1 if any check fails.
 * The page is written to data/cache/inspect.html. Photos are hotlinked from
 * provider sites, so viewing them needs a network connection.
 */
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "data", "cache", "inspect.html");
const work = (f) => path.join("data", "enrichment", f);

async function load(rel) {
  try {
    const abs = path.join(ROOT, rel);
    const [text, st] = await Promise.all([readFile(abs, "utf8"), stat(abs)]);
    return { data: JSON.parse(text), mtime: st.mtime };
  } catch {
    return null;
  }
}

/** A crawled site with less text than this is treated as empty (JS-only shells). */
const MIN_PAGE_TEXT = 200;

const pct = (n, d) => (d ? `${Math.round((100 * n) / d)}%` : "–");
const pass = (label) => ({ level: "pass", label });
const warn = (label) => ({ level: "warn", label });
const fail = (label) => ({ level: "fail", label });
const check = (ok, label, level = "fail") => (ok ? pass(label) : { level, label });

/** Coverage by provider identity, not by count: duplicates must not hide a gap. */
function coverage(rows, expected, what, level = "fail") {
  const have = new Set(rows.map((r) => r.provider));
  const missing = expected.filter((p) => !have.has(p));
  return check(missing.length === 0,
    `${what} cover ${expected.length - missing.length} of ${expected.length} crawled providers` +
      (missing.length ? ` (missing e.g. ${missing.slice(0, 2).join("; ")})` : ""), level);
}

/**
 * One module per stage. Exported so tests can feed each one fixtures. `inspect(files)` receives the loaded inputs and
 * returns { checks, view } — `view` is the compact payload the page renders.
 */
export const MODULES = [
  {
    id: "20", name: "resolve", files: { providers: work("providers.json") },
    inspect({ providers }) {
      const all = providers.data;
      const ok = all.filter((p) => p.website);
      const sites = (l) => l.reduce((s, p) => s + p.siteCount, 0);
      return {
        summary: `${ok.length}/${all.length} providers resolved · ${pct(sites(ok), sites(all))} of sites covered`,
        checks: [
          check(ok.length > 0, `${ok.length} providers have a verified website`),
          check(ok.every((p) => ["strong", "acronym"].includes(p.confidence)),
            "every resolved website has a strong/acronym confidence"),
          check(ok.every((p) => p.resolvedVia), "every resolved website records the domain it came from", "warn"),
        ],
        view: all.map((p) => ({
          provider: p.provider, sites: p.siteCount, website: p.website,
          confidence: p.confidence, via: p.resolvedVia, signals: p.signals, locked: p.locked,
        })),
      };
    },
  },
  {
    id: "30", name: "crawl", files: { crawl: work("crawl.json"), providers: work("providers.json") },
    inspect({ crawl, providers }) {
      const rows = crawl.data;
      const resolved = (providers?.data ?? []).filter((p) => p.website).length;
      const empty = rows.filter((r) => !r.pages?.some((pg) => pg.text?.length > MIN_PAGE_TEXT));
      return {
        summary: `${rows.length} sites crawled · ${rows.reduce((s, r) => s + r.pages.length, 0)} pages · ${rows.reduce((s, r) => s + r.images.length, 0)} candidate images`,
        checks: [
          check(rows.length >= resolved, `crawled ${rows.length} of ${resolved} resolved providers`, "warn"),
          check(empty.length === 0, `${empty.length} sites returned no usable page text`, "warn"),
        ],
        view: rows.map((r) => ({
          provider: r.provider, website: r.website, crawledAt: r.crawledAt,
          pages: r.pages.map((pg) => ({ url: pg.url, chars: pg.text?.length ?? 0, head: (pg.text ?? "").slice(0, 280) })),
          images: r.images.length,
        })),
      };
    },
  },
  {
    id: "40", name: "extract", files: { facts: work("facts.json"), crawl: work("crawl.json") },
    inspect({ facts, crawl }) {
      const rows = facts.data;
      const crawled = (crawl?.data ?? []).map((r) => r.provider);
      const gem = rows.filter((r) => r.method === "gemini");
      const unbacked = gem.filter((r) => r.stemTools?.length && !r.evidence?.length);
      return {
        summary: `${rows.length} providers · ${gem.length} via Gemini · ${rows.length - gem.length} keyword fallback`,
        checks: [
          coverage(rows, crawled, "facts"),
          check(gem.length === rows.length, `${pct(gem.length, rows.length)} extracted by Gemini`, "warn"),
          gem.length
            ? check(unbacked.length === 0, `${unbacked.length} Gemini records list tools without evidence quotes`)
            : warn("no Gemini records yet, so evidence quotes are unchecked"),
          check(rows.every((r) => (r.subjects ?? []).length === (r.subjectEvidence ?? []).length),
            "every subject has its own quote"),
        ],
        view: rows,
      };
    },
  },
  {
    id: "50", name: "images", files: { photos: work("photos.json"), crawl: work("crawl.json") },
    inspect({ photos, crawl }) {
      const rows = photos.data;
      const candidates = new Map((crawl?.data ?? []).map((r) => [r.provider, r.images]));
      const all = rows.flatMap((r) => r.photos);
      const judged = all.filter((p) => p.judged);
      return {
        summary: `${all.length} photos kept across ${rows.length} providers · ${judged.length} judged by Gemini`,
        checks: [
          coverage(rows, (crawl?.data ?? []).map((r) => r.provider), "photos", "warn"),
          check(judged.length === all.length, `${pct(judged.length, all.length)} of kept photos judged by Gemini`, "warn"),
          judged.length
            ? check(judged.every((p) => Number.isInteger(p.suitability)), "every judged photo has a suitability score")
            : warn("no judged photos yet, so suitability scores are unchecked"),
          check(rows.every((r) => Array.isArray(r.rejected)),
            "every provider records why images were dropped", "warn"),
        ],
        view: rows.map((r) => {
          const kept = new Set(r.photos.map((p) => p.url));
          return {
            provider: r.provider, website: r.website, photos: r.photos,
            // Current stage 50 writes `rejected` with reasons; output from
            // before that only has keepers, so diff against stage 30.
            dropped: Array.isArray(r.rejected)
              ? r.rejected
              : (candidates.get(r.provider) ?? [])
                  .filter((i) => !kept.has(i.url))
                  .map((i) => ({ ...i, reason: "unrecorded" })),
          };
        }),
      };
    },
  },
  {
    id: "60", name: "build",
    files: { programs: "dist/programs.json", meta: "dist/meta.json", facts: work("facts.json"), photos: work("photos.json") },
    inspect({ programs, meta, facts, photos }) {
      const staleAgainst = [["facts.json", facts], ["photos.json", photos]]
        .filter(([, f]) => f && f.mtime > programs.mtime).map(([n]) => n);
      const byProvider = new Map();
      for (const p of programs.data) {
        const e = byProvider.get(p.provider) ?? { provider: p.provider, sites: 0, enrichment: p.enrichment, cost: p.cost, photos: p.photos };
        e.sites += 1;
        byProvider.set(p.provider, e);
      }
      const ids = new Set(programs.data.map((p) => p.id));
      return {
        summary: `schema ${meta?.data.schemaVersion} · ${programs.data.length} programs · built ${programs.mtime.toLocaleString()}`,
        checks: [
          check(staleAgainst.length === 0, staleAgainst.length
            ? `dist/ predates ${staleAgainst.join(", ")} — rebuild with stage 60 once those tabs look right`
            : "dist/ is newer than its enrichment inputs", "warn"),
          check(ids.size === programs.data.length, "program ids are unique"),
          check(programs.data.every((p) => Array.isArray(p.enrichment?.stemTools)), "stemTools is always an array"),
          check(!programs.data.some((p) => p.cost?.tier === "free" && p.enrichment?.method === "keyword"),
            "no 'free' cost claims rest on keyword matching alone", "warn"),
        ],
        view: [...byProvider.values()].sort((a, b) => b.sites - a.sites),
      };
    },
  },
];

// ---------------------------------------------------------------- run

/** Runs the selected modules against the files on disk. */
export async function inspectStages(ids = []) {
  const results = [];
  for (const m of MODULES.filter((x) => !ids.length || ids.includes(x.id))) {
    const loaded = {};
    for (const [k, rel] of Object.entries(m.files)) loaded[k] = await load(rel);
    const primary = Object.keys(m.files)[0];
    if (!loaded[primary]) {
      results.push({ id: m.id, name: m.name, missing: m.files[primary] });
      continue;
    }
    results.push({ id: m.id, name: m.name, file: m.files[primary], mtime: loaded[primary].mtime, ...m.inspect(loaded) });
  }
  return results;
}

async function main() {
  const wanted = process.argv.slice(2).filter((a) => /^\d{2}$/.test(a));
  const results = await inspectStages(wanted);

  const icon = { pass: "✓", warn: "!", fail: "✗" };
  let failed = 0;
  for (const r of results) {
    if (r.missing) {
      console.log(`\n${r.id} ${r.name}: not run (${r.missing} missing)`);
      continue;
    }
    console.log(`\n${r.id} ${r.name}  ${r.summary}\n   ${r.file}, written ${r.mtime.toLocaleString()}`);
    for (const c of r.checks) {
      console.log(`   ${icon[c.level]} ${c.label}`);
      if (c.level === "fail") failed += 1;
    }
  }

  const payload = JSON.stringify(results).replace(/</g, "\\u003c");
  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, page(payload));
  console.log(`\n${failed ? `${failed} check(s) failed` : "no failed checks"} · open ${path.relative(ROOT, OUT)}`);
  process.exitCode = failed ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();

// ---------------------------------------------------------------- page

export function page(payload) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pipeline Inspector</title>
<style>
:root{--bg:#f6f6f4;--card:#fff;--ink:#1b1b1b;--mute:#6b6b6b;--line:#e2e2de;--ok:#1d7a46;--warn:#a45b00;--bad:#b3261e;--chip:#eeeeea}
@media (prefers-color-scheme:dark){:root{--bg:#141414;--card:#1e1e1e;--ink:#eee;--mute:#9a9a9a;--line:#333;--ok:#5cc98b;--warn:#e0a24a;--bad:#f28b82;--chip:#2a2a2a}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.45 system-ui,sans-serif}
header{position:sticky;top:0;z-index:2;background:var(--bg);border-bottom:1px solid var(--line);padding:12px 16px 0}
h1{font-size:17px;margin:0 0 8px}nav{display:flex;flex-wrap:wrap;gap:4px}
nav button{border:1px solid var(--line);border-bottom:none;background:var(--chip);color:var(--ink);padding:6px 12px;border-radius:8px 8px 0 0;cursor:pointer;font:inherit}
nav button.on{background:var(--card);font-weight:600}nav button .dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px}
.controls{display:flex;gap:10px;align-items:center;padding:10px 0}
input[type=search]{padding:6px 8px;border:1px solid var(--line);border-radius:6px;background:var(--card);color:var(--ink);min-width:240px;max-width:100%}
main{padding:16px;max-width:1400px;margin:0 auto;display:grid;gap:12px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px;overflow-wrap:anywhere}
.mute{color:var(--mute);font-size:12.5px}a{color:inherit}.name{font-weight:600}
.chip{display:inline-block;background:var(--chip);border-radius:999px;padding:1px 8px;font-size:12px;margin:2px 4px 2px 0}
.pass{color:var(--ok)}.warn{color:var(--warn)}.fail{color:var(--bad)}
.checks div{margin:2px 0}
table{border-collapse:collapse;width:100%;font-size:13px}td,th{text-align:left;padding:5px 8px;border-bottom:1px solid var(--line);vertical-align:top}
.tablewrap{overflow-x:auto}
.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:4px 16px;margin:8px 0}
.facts b{font-weight:500;color:var(--mute);font-size:12px;display:block}
details{margin-top:6px}summary{cursor:pointer;color:var(--mute);font-size:12.5px}
blockquote{margin:4px 0;padding-left:8px;border-left:3px solid var(--line);font-size:13px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px;margin-top:8px}
figure{margin:0;border:1px solid var(--line);border-radius:8px;overflow:hidden;background:var(--chip)}
figure img{display:block;width:100%;aspect-ratio:4/3;object-fit:cover;cursor:zoom-in}
figure.broken img{display:none}figure.broken::before{content:"image failed to load";display:block;padding:40px 8px;text-align:center;color:var(--bad);font-size:12px}
figcaption{padding:6px 8px;font-size:11.5px;line-height:1.35}
.grid.small{grid-template-columns:repeat(auto-fill,minmax(130px,1fr))}.grid.small figcaption{font-size:10.5px}
#zoom{position:fixed;inset:0;background:rgba(0,0,0,.85);display:none;align-items:center;justify-content:center;z-index:5;cursor:zoom-out}
#zoom img{max-width:94vw;max-height:94vh}
</style></head><body>
<header><h1>Pipeline Inspector</h1><nav id="tabs"></nav></header>
<main id="main"></main><div id="zoom"><img alt=""></div>
<script>
const RESULTS = ${payload};
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const safe = (u) => /^https?:/i.test(u ?? "");
const link = (u, t) => safe(u) ? '<a href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(t ?? u) + "</a>" : esc(u) || "–";
const worst = (r) => r.missing ? "mute" : r.checks.some((c) => c.level === "fail") ? "fail" : r.checks.some((c) => c.level === "warn") ? "warn" : "pass";
const color = { pass: "var(--ok)", warn: "var(--warn)", fail: "var(--bad)", mute: "var(--mute)" };

function photo(ph) {
  if (!safe(ph.url)) return "";
  const verdict = ph.judged
    ? '<span class="' + (ph.kind === "program-photo" ? "pass" : "warn") + '">' + esc(ph.kind ?? "unclassified") + "</span>" +
      " · suitability <b>" + (ph.suitability ?? "–") + "</b>"
    : '<span class="warn">unjudged</span>';
  return '<figure><img loading="lazy" referrerpolicy="no-referrer" src="' + esc(ph.url) + '" alt="' + esc(ph.caption ?? ph.alt) +
    '" onerror="this.parentNode.classList.add(\\'broken\\')"><figcaption>' + verdict +
    (ph.carouselReady ? ' · <span class="pass">carousel</span>' : "") + "<br>" +
    (ph.width ? ph.width + "×" + ph.height : "") +
    ((ph.visibleTools ?? []).length ? " · " + ph.visibleTools.map(esc).join(", ") : "") + "<br>" +
    (ph.caption ? esc(ph.caption) + "<br>" : ph.alt ? '<span class="mute">alt: ' + esc(ph.alt) + "</span><br>" : "") +
    link(ph.page ?? ph.sourcePage, "source page") + "</figcaption></figure>";
}

/** Plain-language labels for stage 50's rejection reasons, in funnel order. */
const REASONS = {
  "similar-photo": "near-duplicate (Gemini)", "resized-copy": "resized copy of another image",
  "duplicate-file": "identical file", "text-only": "plain text (Gemini)", "logo": "logo (Gemini)",
  "stock": "stock image (Gemini)", "other": "not a program image (Gemini)", "unclassified": "unclassified (Gemini)",
  "over-limit": "past the per-provider limit", "too-small": "too small", "too-large": "too large",
  "too-many-pixels": "too many pixels", "too-heavy": "file too heavy", "aspect": "banner or strip shape",
  "mime": "unsupported format", "unparseable": "unreadable file", "download-failed": "download failed",
  "robots": "blocked by robots.txt", "filename": "filename looks like a logo/icon", "shortlist-full": "not shortlisted",
  "unrecorded": "reason not recorded (older stage 50 output)",
};

function droppedTile(ph) {
  if (!safe(ph.url)) return "";
  return '<figure><img loading="lazy" referrerpolicy="no-referrer" src="' + esc(ph.url) + '" alt="' + esc(ph.alt) +
    '" onerror="this.parentNode.classList.add(\\'broken\\')"><figcaption>' +
    (ph.width ? ph.width + "×" + ph.height : "") +
    (ph.duplicateOf && safe(ph.duplicateOf) ? ' · <a href="' + esc(ph.duplicateOf) + '" target="_blank" rel="noopener">kept copy</a>' : "") +
    (ph.caption ? "<br>" + esc(ph.caption) : "") + "</figcaption></figure>";
}

function droppedByReason(dropped) {
  if (!dropped.length) return "";
  const groups = new Map();
  for (const d of dropped) groups.set(d.reason, [...(groups.get(d.reason) ?? []), d]);
  const order = Object.keys(REASONS);
  return [...groups].sort(([a], [b]) => order.indexOf(a) - order.indexOf(b)).map(([reason, list]) =>
    "<details><summary>" + list.length + " dropped: " + esc(REASONS[reason] ?? reason) + '</summary><div class="grid small">' +
    list.map(droppedTile).join("") + "</div></details>").join("");
}

function factsBlock(e, cost) {
  const tools = (e.stemTools ?? []).map((t) => '<span class="chip">' + esc(t) + "</span>").join("") || '<span class="mute">none</span>';
  const quoteOf = new Map((e.subjectEvidence ?? []).map((q) => [q.subject, q.quote]));
  const subjects = (e.subjects ?? []).map((t) => '<span class="chip" title="' + esc(quoteOf.get(t)) + '">' + esc(t) + "</span>").join("") ||
    '<span class="mute">' + (e.method === "gemini" ? "none found" : "needs Gemini") + "</span>";
  const subjectQuotes = (e.subjectEvidence ?? []).map((q) => "<blockquote><b>" + esc(q.subject) + ":</b> " + esc(q.quote) + "</blockquote>").join("");
  const ev = (e.evidence ?? []).map((q) => "<blockquote>" + esc(q) + "</blockquote>").join("");
  const method = e.method ?? "none";
  const cls = method === "gemini" ? "pass" : method === "keyword" ? "warn" : "fail";
  return '<span class="chip ' + cls + '">' + esc(method) + (e.confidence ? " · " + esc(e.confidence) : "") + "</span>" +
    (e.summary ? "<p>" + esc(e.summary) + "</p>" : "") +
    '<div class="facts"><div><b>Subjects</b>' + subjects + "</div><div><b>STEM tools</b>" + tools + "</div>" +
    "<div><b>Cost</b>" + esc(cost ? cost.tier + " (" + cost.source + ")" : e.costTier ?? "–") + "</div>" +
    "<div><b>Hours</b>" + (esc(e.hoursText) || "–") + "</div>" +
    "<div><b>Contact</b>" + (esc(e.contactEmail) || "–") + " " + esc(e.contactPhone) + "</div>" +
    "<div><b>Activities</b>" + ((e.activities ?? []).map(esc).join(", ") || "–") + "</div></div>" +
    (subjectQuotes ? "<details><summary>" + e.subjectEvidence.length + " subject quotes</summary>" + subjectQuotes + "</details>" : "") +
    (ev ? "<details><summary>" + e.evidence.length + " evidence quotes</summary>" + ev + "</details>" :
      (e.stemTools ?? []).length ? '<div class="warn mute">no evidence quotes for these tools</div>' : "");
}

const RENDER = {
  "20": (rows) => '<div class="card tablewrap"><table><tr><th>Provider</th><th>Sites</th><th>Website</th><th>Confidence</th><th>Via</th><th>Name signals</th></tr>' +
    rows.map((r) => "<tr><td>" + esc(r.provider) + (r.locked ? ' <span class="chip">locked</span>' : "") + "</td><td>" + r.sites +
      "</td><td>" + (r.website ? link(r.website) : '<span class="fail">unresolved</span>') + "</td><td>" + esc(r.confidence ?? "–") +
      "</td><td>" + esc(r.via ?? "–") + '</td><td class="mute">' + esc((r.signals ?? []).join(", ")) + "</td></tr>").join("") + "</table></div>",
  "30": (rows) => rows.map((r) => '<div class="card"><span class="name">' + esc(r.provider) + "</span> " + link(r.website) +
    '<div class="mute">' + r.pages.length + " pages · " + r.images + " candidate images · crawled " + esc(new Date(r.crawledAt).toLocaleString()) + "</div>" +
    "<details><summary>pages</summary>" + r.pages.map((p) => "<p>" + link(p.url) + ' <span class="mute">' + p.chars + " chars</span><br>" +
      '<span class="mute">' + esc(p.head) + "…</span></p>").join("") + "</details></div>").join(""),
  "40": (rows) => rows.map((r) => '<div class="card"><span class="name">' + esc(r.provider) + "</span> " + link(r.website) +
    factsBlock(r) + "</div>").join(""),
  "50": (rows) => rows.map((r) => '<div class="card"><span class="name">' + esc(r.provider) + "</span> " + link(r.website) +
    '<div class="mute">' + r.photos.length + " kept · " + r.dropped.length + " dropped</div>" +
    (r.photos.length ? '<div class="grid">' + r.photos.map(photo).join("") + "</div>" : "") +
    droppedByReason(r.dropped) + "</div>").join(""),
  "60": (rows) => rows.map((r) => '<div class="card"><span class="name">' + esc(r.provider) + '</span> <span class="mute">' + r.sites + " sites</span> " +
    (r.enrichment?.website ? link(r.enrichment.website) : '<span class="fail mute">no website</span>') +
    factsBlock(r.enrichment ?? {}, r.cost) +
    (r.photos.length ? '<div class="grid">' + r.photos.map(photo).join("") + "</div>" : '<div class="mute">no photos</div>') + "</div>").join(""),
};

let current = RESULTS.find((r) => !r.missing)?.id ?? RESULTS[0]?.id;
const $ = (id) => document.getElementById(id);

function draw() {
  $("tabs").innerHTML = RESULTS.map((r) => '<button data-id="' + r.id + '" class="' + (r.id === current ? "on" : "") +
    '"><span class="dot" style="background:' + color[worst(r)] + '"></span>' + r.id + " " + esc(r.name) + "</button>").join("");
  const r = RESULTS.find((x) => x.id === current);
  if (!r) { $("main").innerHTML = ""; return; }
  if (r.missing) { $("main").innerHTML = '<div class="card">Stage not run yet — <code>' + esc(r.missing) + "</code> is missing.</div>"; return; }
  const q = ($("q")?.value ?? "").toLowerCase();
  const rows = r.view.filter((x) => !q || (x.provider ?? "").toLowerCase().includes(q));
  $("main").innerHTML =
    '<div class="card"><div class="name">' + r.id + " " + esc(r.name) + ' — <span class="mute">' + esc(r.summary) + "</span></div>" +
    '<div class="mute">' + esc(r.file) + ", written " + esc(new Date(r.mtime).toLocaleString()) + "</div>" +
    '<div class="checks">' + r.checks.map((c) => '<div class="' + c.level + '">' + ({pass:"✓",warn:"!",fail:"✗"})[c.level] + " " + esc(c.label) + "</div>").join("") + "</div>" +
    '<div class="controls"><input type="search" id="q" placeholder="Filter providers…" value="' + esc(q) + '"><span class="mute">showing ' + rows.length + " of " + r.view.length + "</span></div></div>" +
    RENDER[r.id](rows);
  const input = $("q");
  input.addEventListener("input", () => { draw(); const i = $("q"); i.focus(); i.setSelectionRange(i.value.length, i.value.length); });
}

$("tabs").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { current = b.dataset.id; draw(); } });
$("main").addEventListener("click", (e) => {
  if (e.target.tagName === "IMG") { $("zoom").querySelector("img").src = e.target.src; $("zoom").style.display = "flex"; }
});
$("zoom").addEventListener("click", () => ($("zoom").style.display = "none"));
draw();
</script></body></html>`;
}
