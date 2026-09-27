/**
 * The program shape the Figma design's components render. Every field the
 * design shows is kept; `lib/programs.ts` fills each one from dist/ and says
 * where it came from. Safe to import from client components.
 */
export type Cost = "Free" | "Low-cost" | "Sliding scale" | "Paid" | "Ask provider";

/** A subject filter heading ("Science") and the subjects under it that at
 *  least one program actually has, with how many programs have each. */
export type SubjectGroup = {
  heading: string;
  options: { label: string; count: number }[];
};

export type CardProgram = {
  id: string;
  name: string;
  org: string;
  neighborhood: string;
  borough: string;
  zip: string;
  ages: string;
  cost: Cost;
  costDetail: string;
  subjects: string[];
  tools: string[];
  days: string;
  seats: string;
  /** Filled in on the client from the visitor's ZIP; null until then. */
  distance: string | null;
  /** Unique across all cards; null when no unused photo was left. */
  image: string | null;
  imageAlt: string;
  /** Set when `image` is a credited stock photo rather than the provider's own. */
  imageStock: { credit: string; source: string } | null;
  tag?: string;
  /** Where "View & sign up" goes: the provider's site, else discoverDYCD. */
  signupUrl: string;
  lat: number | null;
  lng: number | null;
};

/** ZIP -> centre point, for distances. */
export type ZipCentroids = Record<string, { lat: number; lng: number }>;
