export type HoursKind = "after-school" | "evenings" | "unknown";

export type ChatProgram = {
  id: string;
  name: string;
  org: string;
  summary: string;
  location: string;
  area: string;
  neighborhood: string;
  zip: string;
  schoolName: string;
  hoursLabel: string;
  hoursKind: HoursKind;
  days: string[];
  start: string | null;
  end: string | null;
  cost: 0 | null;
  costLabel: string;
  ages: string;
  ageMin: number;
  ageMax: number;
  topics: string[];
  signupUrl: string;
  /** Used to answer "near <ZIP>" with real distance rather than an exact match. */
  lat: number | null;
  lng: number | null;
};

export type ChatCatalog = {
  site: { name: string; summary: string; audience: string };
  suggestions: string[];
  faqs: { phrases: string[]; answer: string }[];
  programs: ChatProgram[];
  /** ZIP -> centroid, so "near 11213" can be measured instead of guessed. */
  zipCentroids: Record<string, { lat: number; lng: number }>;
};

export type ChatAnswer = {
  intro: string;
  programs: ChatProgram[];
};
