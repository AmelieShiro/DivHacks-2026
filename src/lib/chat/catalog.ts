import { getCards } from "@/lib/programs";
import type { CardProgram } from "@/lib/types";
import type { ChatCatalog, ChatProgram, HoursKind } from "./types";

function ageBounds(ages: string): { ageMin: number; ageMax: number } {
  const s = ages.toLowerCase();
  if (s.includes("k–12") || s.includes("k-12")) return { ageMin: 5, ageMax: 18 };
  if (s.includes("k–5") || s.includes("k-5")) return { ageMin: 5, ageMax: 11 };
  if (s.includes("4+")) return { ageMin: 4, ageMax: 18 };
  if (s.includes("5–20") || s.includes("5-20")) return { ageMin: 5, ageMax: 20 };
  return { ageMin: 5, ageMax: 11 };
}

function hoursFromCard(daysLabel: string): {
  hoursLabel: string;
  hoursKind: HoursKind;
  days: string[];
} {
  if (/mon–fri|mon-fri/i.test(daysLabel)) {
    return {
      hoursLabel: daysLabel,
      hoursKind: "after-school",
      days: ["monday", "tuesday", "wednesday", "thursday", "friday"],
    };
  }
  if (/evening/i.test(daysLabel)) {
    return {
      hoursLabel: daysLabel,
      hoursKind: "evenings",
      days: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
    };
  }
  return { hoursLabel: daysLabel, hoursKind: "unknown", days: [] };
}

function neighborhoodName(card: CardProgram): string {
  return card.neighborhood.replace(/,.*$/, "").trim();
}

export function cardToChatProgram(card: CardProgram): ChatProgram {
  const neighborhood = neighborhoodName(card);
  const hours = hoursFromCard(card.days);
  return {
    id: card.id,
    name: card.name,
    org: card.org,
    summary: [card.org, card.tag].filter(Boolean).join(" · "),
    location: card.neighborhood || card.borough || "NYC",
    area: card.borough,
    neighborhood,
    zip: card.zip,
    schoolName: "",
    ...hours,
    start: null,
    end: null,
    cost: card.cost === "Free" ? 0 : null,
    costLabel: card.costDetail || card.cost,
    ages: card.ages,
    ...ageBounds(card.ages),
    topics: [...card.subjects, ...card.tools].map((topic) => topic.toLowerCase()),
    signupUrl: card.signupUrl,
  };
}

export function getChatCatalog(): ChatCatalog {
  return {
    site: {
      name: "Nova",
      summary:
        "Zero-friction discovery of K–5 STEM after-school programs in New York City, built from NYC OpenData (DYCD and DOE).",
      audience: "NYC parents looking for K–5 after-school STEM programs.",
    },
    suggestions: [
      "Which programs are free?",
      "Robotics in Brooklyn",
      "What's in ZIP 11213?",
      "What's good for a 7 year old?",
    ],
    faqs: [
      {
        phrases: [
          "what is this website",
          "what is this site",
          "what's this site",
          "whats this site",
          "about the website",
          "about this site",
          "what is this about",
          "what is nova",
        ],
        answer:
          "Nova is a directory of K–5 STEM after-school programs in New York City. Names, addresses, ages, and seats come from NYC OpenData. Cost is marked Free only for DYCD COMPASS programs; Beacon and Cornerstone fees are not published, so those say Ask provider.",
      },
      {
        phrases: [
          "how do i sign up",
          "how to sign up",
          "how do we sign up",
          "how to register",
          "how do i register",
          "how to enroll",
          "how do i enroll",
        ],
        answer:
          "Nova does not take sign-ups. Each program card links to the provider's website when we have it, otherwise to DiscoverDYCD (https://discoverdycd.dycdconnect.nyc/). Ask for a program by name if you want that link.",
      },
      {
        phrases: [
          "how do i contact",
          "contact you",
          "email you",
          "phone number",
          "who do i talk to",
        ],
        answer:
          "Contact the program provider, not Nova. Ask for a program by name and I can point you to its sign-up page. City enrollment also runs through DiscoverDYCD.",
      },
    ],
    programs: getCards().map(cardToChatProgram),
  };
}
