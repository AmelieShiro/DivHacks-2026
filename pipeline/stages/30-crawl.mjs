/**
 * Stage 30 — crawl each resolved provider site.
 *
 * Collects the two raw materials the later stages need:
 *   - page text, for Gemini to extract program facts from (stage 40)
 *   - candidate image URLs, for Gemini vision to judge (stage 50)
 *
 * Deliberately shallow. These are small nonprofits, so we fetch the homepage,
 * follow a handful of links that look like program or gallery pages, and stop.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { paths, images as imgCfg } from "../config.mjs";
import { get, pool } from "../lib/http.mjs";
import { makeLogger } from "../lib/log.mjs";
import { loadBlocklist, isBlocked } from "../lib/blocklist.mjs";

const log = makeLogger("30-crawl");

/** Link text / hrefs worth following from the homepage. */
const INTERESTING =
  /(after[-\s]?school|program|youth|kids|children|stem|steam|robotic|maker|technology|coding|science|summer|camp|gallery|photos|our-work|what-we-do|services|activities)/i;

const SKIP_LINK =
  /(donate|privacy|terms|login|careers|jobs|press|news\/|blog\/|event|calendar|contact|volunteer|board|annual-report|\.pdf|\.docx?|mailto:|tel:)/i;

const MAX_PAGES = Number(process.env.NOVA_MAX_PAGES ?? 6);

function absolute(href, base) {
  try {
    const u = new URL(href, base);
    if (!/^https?:$/.test(u.protocol)) return null;
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}

function sameSite(a, b) {
  try {
    const ha = new URL(a).host.replace(/^www\./, "");
    const hb = new URL(b).host.replace(/^www\./, "");
    return ha === hb;
  } catch {
    return false;
  }
}

function extractLinks(html, base) {
  const out = [];
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]{0,120}?)<\/a>/gi)) {
    const [, href, label] = m;
    if (SKIP_LINK.test(href)) continue;
    const url = absolute(href, base);
    if (!url || !sameSite(url, base)) continue;
    const text = label.replace(/<[^>]+>/g, " ").trim();
    if (INTERESTING.test(href) || INTERESTING.test(text)) out.push({ url, text });
  }
  // Prefer distinct URLs, keep discovery order.
  const seen = new Set();
  return out.filter((l) => !seen.has(l.url) && seen.add(l.url));
}

/** Image URLs plus the alt text and nearby context Gemini can use. */
function extractImages(html, base) {
  const out = [];
  const push = (src, alt) => {
    const url = absolute(src, base);
    if (!url) return;
    if (imgCfg.rejectPattern.test(url)) return;
    if (/\.svg(\?|$)/i.test(url)) return;
    if (/^data:/i.test(url)) return;
    out.push({ url, alt: (alt ?? "").replace(/\s+/g, " ").trim().slice(0, 240) });
  };

  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const src =
      tag.match(/\bsrc=["']([^"']+)["']/i)?.[1] ??
      tag.match(/\bdata-src=["']([^"']+)["']/i)?.[1] ??
      tag.match(/\bsrcset=["']([^"'\s,]+)/i)?.[1];
    if (src) push(src, tag.match(/\balt=["']([^"']*)["']/i)?.[1]);
  }
  // og:image is usually the site's best single photo.
  for (const m of html.matchAll(
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/gi,
  )) {
    push(m[1], "og:image");
  }

  const seen = new Set();
  return out.filter((i) => !seen.has(i.url) && seen.add(i.url));
}

function visibleText(html) {
  return html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(nbsp|amp|quot|#39|rsquo|ldquo|rdquo);/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function crawlProvider(p) {
  const pages = [];
  const home = await get(p.website);
  if (!home.ok || !home.body) return { provider: p.provider, website: p.website, pages, images: [], error: home.error ?? `status ${home.status}` };

  const base = home.url ?? p.website;
  pages.push({ url: base, text: visibleText(home.body).slice(0, 40_000), kind: "home" });

  const links = extractLinks(home.body, base).slice(0, MAX_PAGES);
  for (const l of links) {
    const res = await get(l.url);
    if (!res.ok || !res.body || !/html/i.test(res.contentType ?? "")) continue;
    pages.push({
      url: res.url ?? l.url,
      label: l.text,
      text: visibleText(res.body).slice(0, 40_000),
      kind: "inner",
      html: res.body,
    });
  }

  const imgs = [];
  imgs.push(...extractImages(home.body, base).map((i) => ({ ...i, page: base })));
  for (const pg of pages.filter((x) => x.html)) {
    imgs.push(...extractImages(pg.html, pg.url).map((i) => ({ ...i, page: pg.url })));
  }
  for (const pg of pages) delete pg.html; // keep the artifact small

  const seen = new Set();
  const uniqueImgs = imgs.filter((i) => !seen.has(i.url) && seen.add(i.url));

  return {
    provider: p.provider,
    website: p.website,
    crawledAt: new Date().toISOString(),
    pages,
    images: uniqueImgs.slice(0, imgCfg.maxPerProvider * 4), // stage 50 narrows further
  };
}

export async function run({ limit } = {}) {
  const providers = JSON.parse(
    await readFile(path.join(paths.work, "providers.json"), "utf8"),
  );
  // Second line of defence: never crawl a blocked website, even if stage 20
  // has not been re-run since it was blocked.
  const blocklist = await loadBlocklist();
  let targets = providers.filter((p) => p.website && !isBlocked(blocklist, p.provider, p.website));
  if (limit) targets = targets.slice(0, limit);
  log.info(`crawling ${targets.length} provider sites`);

  const results = await pool(targets, async (p) => {
    const r = await crawlProvider(p);
    const n = r.images?.length ?? 0;
    if (r.error) log.warn(`${p.provider.slice(0, 40)}: ${r.error}`);
    else log.ok(`${p.provider.slice(0, 40).padEnd(40)} ${r.pages.length}p ${n}img`);
    return r;
  });

  const out = path.join(paths.work, "crawl.json");
  await writeFile(out, JSON.stringify(results, null, 2) + "\n");
  const totalImgs = results.reduce((s, r) => s + (r.images?.length ?? 0), 0);
  log.ok(`${results.length} sites, ${totalImgs} candidate images -> ${out}`);
  return { sites: results.length, images: totalImgs };
}
