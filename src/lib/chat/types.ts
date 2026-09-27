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
};

export type ChatCatalog = {
  site: { name: string; summary: string; audience: string };
  suggestions: string[];
  faqs: { phrases: string[]; answer: string }[];
  programs: ChatProgram[];
};

export type ChatAnswer = {
  intro: string;
  programs: ChatProgram[];
};
