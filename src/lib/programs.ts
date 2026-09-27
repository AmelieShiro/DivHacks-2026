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

function image(p: Program): { image: string | null; imageAlt: string; images: string[] } {
  // Stage 50 sorts photos for the hero band; flyers are never first.
  const usable = p.photos.filter((ph) => ph.kind !== "flyer" && /^https?:/i.test(ph.url));
  const images = usable.slice(0, 3).map((ph) => ph.url);
  const photo = usable[0];
  if (!photo) return { image: null, imageAlt: "", images };
  return { image: photo.url, imageAlt: photo.caption || `Photo from ${tidyOrg(p.provider)}'s website`, images };
}

export function toCard(p: Program): CardProgram {
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
    ...image(p),
    tag: p.inSchoolBuilding?.servesK5 ? "In school" : undefined,
    signupUrl: p.enrichment.website ?? DISCOVER_DYCD,
    lat: p.lat,
    lng: p.lng,
  };
}

export function getCards(): CardProgram[] {
  return programs.map(toCard).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * "Programs of the week": programs with a photo and the most evidenced
 * STEM content, one per provider so the carousel is not one organization.
 */
export function getFeatured(n = 8): CardProgram[] {
  const seen = new Set<string>();
  return programs
    .filter((p) => p.photos.some((ph) => ph.carouselReady && ph.kind !== "flyer"))
    .sort((a, b) =>
      b.enrichment.subjects.length + b.enrichment.stemTools.length -
        (a.enrichment.subjects.length + a.enrichment.stemTools.length) ||
      (b.seats ?? 0) - (a.seats ?? 0))
    .filter((p) => (seen.has(p.provider ?? "") ? false : (seen.add(p.provider ?? ""), true)))
    .slice(0, n)
    .map(toCard);
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
