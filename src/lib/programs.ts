/**
 * Server-side bridge from the pipeline's dataset (dist/) to the design's
 * program cards. dist/programs.json is 2.4 MB, so it is only read here; client
 * components receive the trimmed CardProgram[].
 *
 * Every card field has a source. Where the dataset has no value, the fallback
 * is a documented DYCD fact about the program type or an honest "Ask
 * provider" — never an invented schedule, price or availability.
 */
import type { Meta, Program, ZipStat } from "../../pipeline/schema/program";
import programsJson from "../../dist/programs.json";
import zipsJson from "../../dist/zips.json";
import metaJson from "../../dist/meta.json";
import type { CardProgram, Cost, SubjectGroup, ZipCentroids } from "./types";
import stockPoolJson from "../data/stock-pool.json";
import photoDenylistJson from "../data/photo-denylist.json";
import { providerPhotoRank, STOCK_PHOTOS, stockFor, subjectKey } from "./stockPhotos";

type PoolPhoto = { subject: string; title: string; src: string; source: string; credit: string };
const stockPool = stockPoolJson as PoolPhoto[];

const programs = programsJson as unknown as Program[];
const zips = zipsJson as unknown as ZipStat[];
const meta = metaJson as unknown as Meta;

/** DYCD's enrollment portal, for programs whose provider has no known website. */
export const DISCOVER_DYCD = "https://discoverdycd.dycdconnect.nyc/";

/**
 * DYCD, COMPASS page: "Programs are offered at no cost to youth" and
 * "offered 3 hours each day, 5 days per week".
 * https://www.nyc.gov/site/dycd/services/after-school/comprehensive-after-school-system-of-new-york-city-compass.page
 * DYCD's Beacon and Cornerstone pages state no cost, so those are not called free.
 */
const isCompass = (p: Program) => p.programArea === "Compass";

function cost(p: Program): { cost: Cost; costDetail: string } {
  if (isCompass(p)) return { cost: "Free", costDetail: "Free · DYCD COMPASS" };
  // A price read by Gemini off the provider's own site. Keyword matches are
  // ignored: the word "free" anywhere on a provider's site is not a price.
  if (p.cost.source === "provider-website" && p.enrichment.method === "gemini") {
    if (p.cost.tier === "free") return { cost: "Free", costDetail: "Free · per provider" };
    if (p.cost.tier === "sliding-scale") return { cost: "Sliding scale", costDetail: "Sliding scale · per provider" };
    if (p.cost.tier === "paid") return { cost: "Paid", costDetail: "Paid · ask provider for fees" };
  }
  return { cost: "Ask provider", costDetail: "DYCD-funded · fees not published" };
}

/** Beacon: "afternoons and evenings, on weekends, and during school holidays" (DYCD). */
function days(p: Program): string {
  if (p.enrichment.hoursText) return p.enrichment.hoursText;
  if (p.programType === "COMPASS Elementary" || p.programType === "COMPASS SONYC Pilot") return "Mon–Fri · 3 hrs a day";
  if (p.programArea === "Beacon") return "Afternoons, evenings & weekends";
  if (p.programArea === "Cornerstone") return "Year-round · NYCHA center";
  return "Ask provider";
}

/** "Grades K - 5" -> "Grades K–5", matching the design's typography. */
const ages = (range: string | null) => (range ?? "Ask provider").replace(/\s*-\s*/g, "–");

/** "SCAN-HARBOR INC" -> "SCAN-Harbor"; "YMCA of Greater New York/Corporate" -> "YMCA of Greater New York". */
export function tidyOrg(name: string | null): string {
  if (!name) return "";
  let s = name
    .replace(/\/Corporate$/i, "")
    // Only pure legal suffixes: "Corporation" is often part of the name
    // ("Bergen Basin Community Development Corporation").
    .replace(/,?\s+(inc|incorporated|llc|ltd)\.?$/i, "")
    .trim();
  if (s === s.toUpperCase() && /\s/.test(s)) {
    // Multi-word all caps ("ST. NICKS ALLIANCE CORP."): title-case it.
    // A single word ("CAMBA", "HANAC") is an acronym and stays as is.
    s = s.replace(/[A-Z][A-Z.']*/g, (w) => w[0] + w.slice(1).toLowerCase());
  }
  return s;
}

const TOOL_LABELS: Record<string, string> = {
  "3d printing": "3D printing", "micro:bit": "micro:bit", lego: "LEGO", "raspberry pi": "Raspberry Pi",
  arduino: "Arduino",
};
const label = (s: string) => TOOL_LABELS[s] ?? s[0].toUpperCase() + s.slice(1);

/**
 * Subjects the provider teaches (Gemini, each backed by a verbatim quote),
 * plus STEM tools that are themselves subjects (coding, robotics, ...), so the
 * design's subject filter works before and after the Gemini run.
 */
const TOOLS_THAT_ARE_SUBJECTS = new Set([
  "coding", "robotics", "engineering", "electronics", "chess", "gardening", "cooking", "game design", "animation",
]);
function subjects(p: Program): string[] {
  const fromTools = p.enrichment.stemTools.filter((t) => TOOLS_THAT_ARE_SUBJECTS.has(t));
  return [...new Set([...p.enrichment.subjects, ...fromTools])].map(label);
}

type ImageFields = Pick<CardProgram, "image" | "imageAlt" | "imageStock" | "images">;

/** Thumbnails per row in the map list. Must match TILES in MapView.tsx, which
 *  keeps its own copy so the client bundle never imports this module. */
const MAP_TILES = 3;

const httpPhotos = (p: Program) =>
  p.photos.filter((ph) => ph.kind !== "flyer" && /^https?:/i.test(ph.url));

const urlKey = (url: string) => url.split(/[?#]/)[0];

/** Provider photos a person reviewed and rejected (logos, invitations, adults-only events...). */
const deniedPhotos = new Set((photoDenylistJson as { photos: { url: string }[] }).photos.map((p) => urlKey(p.url)));

function fromProvider(p: Program, photo: Program["photos"][number]): ImageFields {
  const caption = photo.caption && photo.caption !== "og:image" ? photo.caption : null;
  // The map list shows a thumbnail row. Lead with the card's own photo, then
  // fill from the same provider's remaining approved photos. Only `image` is
  // deduplicated across cards, so a trailing thumbnail may recur elsewhere.
  const extras = providerCandidates(p).filter((ph) => urlKey(ph.url) !== urlKey(photo.url));
  return {
    image: photo.url,
    imageAlt: caption ?? `Photo from ${tidyOrg(p.provider)}'s website`,
    imageStock: null,
    images: [photo.url, ...extras.slice(0, MAP_TILES - 1).map((ph) => ph.url)].map((url) => ({
      url,
      stock: null,
    })),
  };
}

function fromStock(photo: { src: string; alt: string; credit: string; source: string }): ImageFields {
  const stock = { credit: photo.credit, source: photo.source };
  // padTiles tops the row up to MAP_TILES afterwards.
  return { image: photo.src, imageAlt: photo.alt, imageStock: stock, images: [{ url: photo.src, stock }] };
}

const poolAlt = (photo: PoolPhoto) => photo.title.replace(/\.[a-z]+$/i, "").replace(/_/g, " ");

/**
 * Usable photos from the provider's own site, best first: Gemini-approved,
 * then pointing to children, then plain photographs (see providerPhotoRank).
 * Within a rank, stage 50's order (hero-ready, suitability, size) is kept.
 */
function providerCandidates(p: Program): Program["photos"] {
  return httpPhotos(p)
    .filter((ph) => !deniedPhotos.has(urlKey(ph.url)))
    .map((ph, i) => ({ ph, i, rank: providerPhotoRank(ph) }))
    .filter((c): c is typeof c & { rank: 0 | 1 | 2 } => c.rank !== null)
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .map((c) => c.ph);
}

/**
 * A different photo for every program; no image appears on two cards:
 *   1. an unused photo from the provider's own site
 *   2. an unused Commons photo of the subject, then of any subject
 *   3. an unused local subject photo
 *   4. otherwise no photo (the NOVA placeholder)
 * Stock photos (2-3) are labelled on the card as not taken at the program.
 * Commons photos are tracked by their Commons page, not their URL, because a
 * local subject photo can be a copy of a pool photo at another address.
 */
function assignImages(list: Program[]): Map<string, ImageFields> {
  const used = new Set<string>();
  const claim = (key: string) => (used.has(key) ? false : (used.add(key), true));

  // Local subject photos are the last resort; reserve their Commons pages so
  // the pool never hands out the same picture at a different address.
  const localSources = new Set(Object.values(STOCK_PHOTOS).map((s) => s.source));

  const buckets = new Map<string, PoolPhoto[]>();
  for (const photo of stockPool) {
    if (localSources.has(photo.source)) continue;
    const listFor = buckets.get(photo.subject) ?? [];
    listFor.push(photo);
    buckets.set(photo.subject, listFor);
  }
  const takePool = (key: string): PoolPhoto | undefined => {
    for (const bucket of [buckets.get(key) ?? [], ...buckets.values()]) {
      while (bucket.length) {
        const photo = bucket.shift()!;
        if (claim(photo.source)) return photo;
      }
    }
    return undefined;
  };

  const out = new Map<string, ImageFields>();
  for (const p of list) {
    const own = providerCandidates(p).find((ph) => claim(urlKey(ph.url)));
    if (own) out.set(p.id, fromProvider(p, own));
  }
  for (const p of list) {
    if (out.has(p.id)) continue;
    const pool = takePool(subjectKey(subjects(p)));
    if (pool) {
      out.set(p.id, fromStock({ src: pool.src, alt: poolAlt(pool), credit: pool.credit, source: pool.source }));
      continue;
    }
    const local = stockFor(subjects(p));
    out.set(
      p.id,
      claim(local.source) ? fromStock(local) : { image: null, imageAlt: "", imageStock: null, images: [] },
    );
  }

  // Top every thumbnail row up to MAP_TILES so the map list is never ragged.
  // There are ~269 gaps and fewer unclaimed pool photos than that, so fillers
  // may repeat between programs -- but never within one row, and an unclaimed
  // photo is always preferred over one already standing as a card's main
  // image. Each filler carries its own credit: the row mixes provider and
  // stock photos, and CC BY needs the attribution on the stock ones.
  const buckets2 = new Map<string, PoolPhoto[]>();
  for (const photo of stockPool) {
    const listFor = buckets2.get(photo.subject) ?? [];
    listFor.push(photo);
    buckets2.set(photo.subject, listFor);
  }
  const cursors = new Map<string, number>();

  for (const p of list) {
    const fields = out.get(p.id)!;
    if (fields.images.length >= MAP_TILES) continue;
    const key = subjectKey(subjects(p));
    const bucket = buckets2.get(key)?.length ? buckets2.get(key)! : stockPool;
    const inRow = new Set(fields.images.map((i) => i.url));
    // Rotate the starting point per subject so neighbouring cards in the list
    // do not all show the same filler.
    let i = cursors.get(key) ?? 0;

    for (const allowClaimed of [false, true]) {
      for (let n = 0; n < bucket.length && fields.images.length < MAP_TILES; n++, i++) {
        const photo = bucket[i % bucket.length];
        if (inRow.has(photo.src)) continue;
        if (!allowClaimed && used.has(photo.source)) continue;
        inRow.add(photo.src);
        fields.images.push({ url: photo.src, stock: { credit: photo.credit, source: photo.source } });
      }
      if (fields.images.length >= MAP_TILES) break;
    }
    cursors.set(key, bucket.length ? i % bucket.length : 0);
  }

  return out;
}

function toCard(p: Program, img: ImageFields): CardProgram {
  return {
    id: p.id,
    name: p.name ?? "After-school program",
    org: tidyOrg(p.provider),
    neighborhood: [p.address.neighborhood, p.address.borough].filter(Boolean).join(", "),
    borough: p.address.borough ?? "",
    zip: p.address.zip ?? "",
    ages: ages(p.ageRange),
    ...cost(p),
    subjects: subjects(p),
    tools: p.enrichment.stemTools.map(label),
    days: days(p),
    seats: p.seats ? `${p.seats} funded seats` : "Ask provider",
    distance: null,
    ...img,
    tag: p.inSchoolBuilding?.servesK5 ? "In school" : undefined,
    signupUrl: p.enrichment.website ?? DISCOVER_DYCD,
    lat: p.lat,
    lng: p.lng,
  };
}

export function getCards(): CardProgram[] {
  const images = assignImages(programs);
  return programs.map((p) => toCard(p, images.get(p.id)!)).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * "Programs of the week": the most evidenced STEM content, one per provider
 * so the carousel is not one organization. Programs with their own relevant
 * photo come first; stock-photo programs only fill the remaining slots.
 */
export function getFeatured(n = 8): CardProgram[] {
  const byId = new Map(programs.map((p) => [p.id, p]));
  const seen = new Set<string>();
  return getCards()
    .map((card) => ({ p: byId.get(card.id)!, card }))
    .sort((a, b) =>
      Number(a.card.imageStock !== null) - Number(b.card.imageStock !== null) ||
      b.p.enrichment.subjects.length + b.p.enrichment.stemTools.length -
        (a.p.enrichment.subjects.length + a.p.enrichment.stemTools.length) ||
      (b.p.seats ?? 0) - (a.p.seats ?? 0))
    .filter(({ p }) => (seen.has(p.provider ?? "") ? false : (seen.add(p.provider ?? ""), true)))
    .slice(0, n)
    .map(({ card }) => card);
}

/**
 * Subject filter options, under the dataset's own headings. A subject no
 * program has is left out, so every option a parent can pick returns results.
 */
export function getSubjectGroups(cards: CardProgram[]): SubjectGroup[] {
  const counts = new Map<string, number>();
  for (const c of cards) for (const s of c.subjects) counts.set(s, (counts.get(s) ?? 0) + 1);
  return Object.entries(meta.subjectGroups)
    .map(([heading, subjects]) => ({
      heading,
      options: subjects
        .map((s) => ({ label: label(s), count: counts.get(label(s)) ?? 0 }))
        .filter((o) => o.count > 0),
    }))
    .filter((g) => g.options.length > 0);
}

export function getZipCentroids(): ZipCentroids {
  return Object.fromEntries(zips.map((z) => [z.zip, { lat: z.lat, lng: z.lng }]));
}
