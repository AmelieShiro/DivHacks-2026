/**
 * NOVA dataset contract — schemaVersion 2.6.0
 *
 * These types describe the files in `dist/`. The website imports them; the
 * pipeline guarantees them. If a pipeline change breaks one of these shapes,
 * bump `SCHEMA_VERSION` in pipeline/stages/60-build.mjs and say so in the PR.
 *
 *   import type { Program } from "@/../pipeline/schema/program";
 *   import programs from "@/../dist/programs.json";
 */

/** Controlled vocabulary. Enrichment never emits a tool outside this list. */
/**
 * What a program teaches or does. Specific activities (coding, robotics,
 * chess) sit beside broad subjects. `meta.subjectGroups` maps each to a
 * filter heading such as "Technology" or "Math & strategy".
 */
export type Subject =
  | "biology" | "chemistry" | "physics" | "earth & environmental science"
  | "general science" | "gardening"
  | "computer science" | "coding" | "robotics" | "game design" | "electronics"
  | "3d design & printing" | "technology & digital media"
  | "engineering" | "maker & building"
  | "mathematics" | "chess" | "financial literacy"
  | "visual arts" | "music" | "dance & theater" | "animation" | "filmmaking & video" | "crafts & sewing"
  | "literacy & writing" | "languages" | "social studies"
  | "sports & fitness" | "health & nutrition" | "cooking"
  | "leadership & social-emotional";

export type StemTool =
  | "3d printing" | "robotics" | "lego" | "micro:bit" | "arduino"
  | "raspberry pi" | "coding" | "web development" | "game design"
  | "laser cutter" | "woodworking" | "sewing/textiles" | "electronics"
  | "circuitry" | "drones" | "chess" | "science lab" | "gardening"
  | "cooking" | "digital art" | "video production" | "music production"
  | "animation" | "math enrichment" | "engineering";

/** How much to trust a resolved provider website. */
export type WebsiteConfidence = "strong" | "acronym" | "unresolved";

/** Which mechanism produced the enrichment for this record. */
export type EnrichmentMethod = "gemini" | "keyword" | null;

export interface Address {
  street: string | null;
  city: string | null;
  borough: "Brooklyn" | "Queens" | "Manhattan" | "Bronx" | "Staten Island" | string | null;
  zip: string | null;
  /** 2010 Neighborhood Tabulation Area code from DYCD, e.g. "BK61". */
  nta: string | null;
  /** Its name from NYC OpenData (swpk-hqdp), e.g. "Crown Heights North". */
  neighborhood: string | null;
}

/**
 * Set when the program's coordinates fall within 120m of a DOE school,
 * i.e. the program runs inside that school building. Drives the
 * "what's already in my kid's school" lookup.
 */
export interface SchoolMatch {
  dbn: string | null;
  name: string | null;
  distanceM: number;
  /** Whether this school actually serves K-5. If false, do not label the
   *  program as being "at" this school — no K-5 school was in range. */
  servesK5: boolean;
}

export interface Enrichment {
  /** Verified by fetching the page, never taken on a model's word. */
  website: string | null;
  websiteConfidence: WebsiteConfidence;
  /** "known" | "generated" | "gemini" — how the domain was first proposed. */
  websiteSource: string | null;
  summary: string | null;
  /** Only tools actually evidenced on the provider's own site. */
  stemTools: StemTool[];
  /**
   * Subjects taught, for filter chips. Each one has a quote in
   * subjectEvidence that was checked to appear verbatim on the provider's
   * site: chosen by Gemini (`method: "gemini"`) or the sentence around a
   * keyword match (`method: "keyword"`, lower confidence). Like all
   * enrichment, describes the PROVIDER, not necessarily this site.
   */
  subjects: Subject[];
  subjectEvidence: { subject: Subject; quote: string }[];
  activities: string[];
  hoursText: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  /** Verbatim quotes backing `stemTools` (Gemini's picks, or the sentence
   *  around each keyword match). Show these on hover to earn trust. */
  evidence: string[];
  method: EnrichmentMethod;
  confidence: "high" | "medium" | "low" | null;
}

export interface Photo {
  url: string;
  /** The page the image was found on — use for attribution. */
  sourcePage: string;
  caption: string | null;
  width: number;
  height: number;
  /** width / height. */
  aspect: number | null;
  orientation: "landscape" | "portrait" | "square" | null;
  /**
   * Safe to place in the hero carousel: tall enough to render sharply at 2x
   * in a band occupying ~1/3 of the viewport, and not portrait (which
   * letterboxes badly in a fixed-height left-to-right track).
   * `photos` is pre-sorted so carousel-ready images come first.
   */
  carouselReady: boolean;
  /**
   * What Gemini judged the image to be; null when unjudged. Flyers are
   * colourful designed graphics for a program — show them on detail pages,
   * not in the hero band (they are never carouselReady). Plain-text images,
   * logos, stock and near-duplicates are dropped before they reach dist/.
   */
  kind: "program-photo" | "flyer" | null;
  visibleTools: StemTool[];
  /** False means it passed size filters but no vision model reviewed it. */
  judged: boolean;
  /** 0-10, how well it sells the program. Sort carousels by this. */
  suitability: number | null;
}

/**
 * Price. `tier` is "unknown" unless a source actually stated it — OpenData
 * publishes no cost field, so the UI should say so rather than implying free.
 * `publiclyFunded` is the hard fact: the site runs under a DYCD contract.
 *
 * - "dycd-program-rules": COMPASS programs, which DYCD states are "offered at
 *   no cost to youth". `note` carries the quote and URL.
 * - "provider-website": read by Gemini off the provider's own site. Keyword
 *   matches never set a price.
 */
export interface Cost {
  tier: "free" | "sliding-scale" | "paid" | "unknown";
  source: "dycd-program-rules" | "provider-website" | "not-published";
  publiclyFunded: boolean;
  note: string;
}

export interface Provenance {
  core: string;
  schoolMatch: string | null;
  enrichment: EnrichmentMethod | "none";
  photos: "gemini-vision" | "crawl-unjudged" | "none";
}

export interface Program {
  /** Stable across rebuilds — safe for deep links. */
  id: string;
  name: string | null;
  provider: string | null;
  programArea: string | null;
  programType: string | null;
  ageRange: string | null;
  address: Address;
  lat: number | null;
  lng: number | null;
  /** Funded seats, from OpenData. Populated on every 2026 K-5 record. */
  seats: number | null;
  participants: number | null;
  cost: Cost;
  /** The host school. A K-5-serving school wins over a closer non-K-5 one,
   *  because NYC campuses stack several schools in one building. */
  inSchoolBuilding: SchoolMatch | null;
  /** Every DOE school within 120m, nearest first. Length > 1 means a shared
   *  campus; show them all rather than implying a single host. */
  coLocatedSchools: SchoolMatch[];
  enrichment: Enrichment;
  photos: Photo[];
  provenance: Provenance;
}

export interface School {
  dbn: string | null;
  name: string | null;
  grades: string | null;
  category: string | null;
  address: string | null;
  district: string | null;
  principal: string | null;
  phone: string | null;
  lat: number;
  lng: number;
  servesK5: boolean;
}

/** Per-ZIP centroid + density. `k5ProgramsNow === 0` is a STEM access desert. */
export interface ZipStat {
  zip: string;
  lat: number;
  lng: number;
  dycdSitesAllYears: number;
  k5ProgramsNow: number;
}

export interface Meta {
  schemaVersion: string;
  generatedAt: string;
  programYear: string;
  counts: {
    programs: number; schools: number; zips: number;
    withWebsite: number; withTools: number; withSubjects: number; withPhotos: number;
    inSchoolBuilding: number; publiclyFunded: number; costConfirmed: number;
    inK5SchoolBuilding: number; onSharedCampus: number; withCarouselPhoto: number;
  };
  sources: Record<string, string>;
  /** Filter heading -> subjects under it. Every Subject appears exactly once. */
  subjectGroups: Record<string, Subject[]>;
}
