const DAY_NAMES = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];

const RESULT_LIMIT = 8;

const TOPIC_PATTERNS = [
  ["coding", /\b(cod(e|ing)|programming|scratch|python|computer science)\b/],
  ["robotics", /\brobots?\b|\brobotics\b/],
  ["math", /\bmath\b|\bmathematics\b|\balgebra\b|\bgeometry\b/],
  ["science", /\bscience\b|\bbiology\b|\bchemistry\b|\bphysics\b/],
  ["engineering", /\bengineering\b|\bmakers?\b|\bbuilding\b/],
  ["chess", /\bchess\b/],
  ["cooking", /\bcooking\b|\bculinary\b/],
  ["sports", /\bsports?\b|\bfitness\b/],
  ["art", /\bart\b|\barts\b|\bcrafts?\b/],
  ["music", /\bmusic\b/],
  ["dance", /\bdance\b|\btheater\b|\btheatre\b/],
  ["animation", /\banimation\b|\banimated\b/],
  ["gardening", /\bgarden(ing)?\b/],
  ["literacy", /\bliteracy\b|\bwriting\b|\breading\b/],
];

const BOROUGHS = [
  ["staten island", ["staten island", "si"]],
  ["brooklyn", ["brooklyn", "bk"]],
  ["manhattan", ["manhattan"]],
  ["queens", ["queens"]],
  ["bronx", ["bronx"]],
];

const PLACE_SKIP = new Set([
  "the",
  "a",
  "at",
  "of",
  "and",
  "center",
  "community",
  "school",
  "middle",
  "youth",
  "space",
  "maker",
  "new",
  "york",
  "city",
  "north",
  "south",
  "east",
  "west",
]);

const STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "of",
  "in",
  "on",
  "at",
  "to",
  "for",
  "and",
  "or",
  "with",
  "me",
  "my",
  "our",
  "you",
  "your",
  "is",
  "are",
  "do",
  "does",
  "can",
  "what",
  "which",
  "where",
  "when",
  "who",
  "how",
  "any",
  "some",
  "there",
  "have",
  "has",
  "program",
  "programs",
  "project",
  "projects",
  "class",
  "classes",
  "stem",
  "open",
  "available",
  "one",
  "ones",
  "that",
  "this",
  "show",
  "find",
  "list",
  "looking",
  "want",
  "need",
  "about",
  "please",
  "good",
  "best",
  "website",
  "site",
  "kid",
  "kids",
  "child",
  "children",
  "parent",
  "parents",
  "tell",
  "more",
  "nova",
  "dycd",
  "afterschool",
  "workshop",
  "workshops",
  "nyc",
  "near",
]);

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function formatMinutes(total) {
  const hour24 = Math.floor(total / 60);
  const minute = total % 60;
  const suffix = hour24 >= 12 ? "pm" : "am";
  const hour = hour24 % 12 || 12;
  if (minute === 0) return `${hour}${suffix}`;
  return `${hour}:${String(minute).padStart(2, "0")}${suffix}`;
}

function formatClock(hhmm) {
  return formatMinutes(toMinutes(hhmm));
}

function formatDays(days) {
  if (!days?.length) return "";
  if (days.length <= 1) return days[0] ?? "";
  if (days.length === 2) return `${days[0]} & ${days[1]}`;
  return `${days.slice(0, -1).join(", ")} & ${days[days.length - 1]}`;
}

function titleCase(value) {
  return value.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function spokenTimeToMinutes(hourStr, minuteStr, ampm) {
  let hour = Number(hourStr);
  const minute = minuteStr ? Number(minuteStr) : 0;
  const marker = ampm ? ampm.toLowerCase() : "";
  if (marker === "pm" && hour < 12) hour += 12;
  else if (marker === "am" && hour === 12) hour = 0;
  else if (!marker && hour >= 1 && hour <= 7) hour += 12;
  return hour * 60 + minute;
}

function normalize(text) {
  return text.toLowerCase().replace(/['’]/g, "");
}

function isFree(program) {
  return program.cost === 0 || program.cost === "free";
}

function costLabel(program) {
  return program.costLabel || (isFree(program) ? "Free" : "Ask provider");
}

function hoursLabel(program) {
  if (program.hoursLabel) return program.hoursLabel;
  if (program.start && program.end) {
    const days = formatDays(program.days);
    const clocks = `${formatClock(program.start)}–${formatClock(program.end)}`;
    return days ? `${days}, ${clocks}` : clocks;
  }
  return "Hours not published";
}

function placeLabel(program) {
  const neighborhood = program.neighborhood || "";
  const area = program.area || "";
  if (neighborhood && area && !neighborhood.toLowerCase().includes(area.toLowerCase())) {
    return `${neighborhood}, ${area}`;
  }
  return neighborhood || area || program.location || "NYC";
}

function placeBlob(program) {
  return [
    program.location,
    program.area,
    program.neighborhood,
    program.zip,
    program.org,
    program.schoolName,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function formatProgramLine(program) {
  return `${program.name} — ${hoursLabel(program)} · ${placeLabel(program)} · ${costLabel(program)} · ${program.ages}`;
}

function hasFilters(filters) {
  return (
    filters.cost != null ||
    filters.afterMin != null ||
    filters.beforeMin != null ||
    filters.days != null ||
    filters.age != null ||
    filters.ageGroup != null ||
    filters.topics.length > 0 ||
    filters.places.length > 0 ||
    filters.hoursKind != null
  );
}

function extractFilters(programs, q) {
  const filters = {
    cost: null,
    afterMin: null,
    beforeMin: null,
    days: null,
    age: null,
    ageGroup: null,
    topics: [],
    places: [],
    hoursKind: null,
  };

  if (/\bfree\b|\bno cost\b|\bzero cost\b|\bdoesnt cost\b|\bdoes not cost\b/.test(q)) {
    filters.cost = "free";
  } else if (/\bpaid\b|\bcosts money\b|\bnot free\b|\bwith a fee\b/.test(q)) {
    filters.cost = "paid";
  } else if (/\bask provider\b|\bunknown cost\b|\bfee not published\b/.test(q)) {
    filters.cost = "unknown";
  }

  const after = q.match(
    /\b(?:after|past|later than|starting after)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/,
  );
  const before = q.match(
    /\b(?:before|earlier than)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/,
  );
  if (after) filters.afterMin = spokenTimeToMinutes(after[1], after[2], after[3]);
  if (before) filters.beforeMin = spokenTimeToMinutes(before[1], before[2], before[3]);

  if (filters.afterMin == null && /\bevenings?\b|\bat night\b|\btonight\b/.test(q)) {
    filters.hoursKind = "evenings";
  }
  if (/\bmorning\b/.test(q) && filters.beforeMin == null && filters.afterMin == null) {
    filters.beforeMin = 12 * 60;
  }
  if (/\bafternoon\b/.test(q) && filters.afterMin == null && filters.beforeMin == null) {
    filters.hoursKind = "after-school";
  }

  if (/\bweekends?\b/.test(q)) filters.days = ["saturday", "sunday"];
  else if (/\bweekdays?\b|\bafter school\b/.test(q)) {
    filters.days = WEEKDAYS;
    if (!filters.hoursKind && filters.afterMin == null) filters.hoursKind = "after-school";
  } else {
    const found = DAY_NAMES.filter((day) => new RegExp(`\\b${day}\\b`).test(q));
    if (found.length) filters.days = found;
  }

  const ageMatch =
    q.match(/\b(\d{1,2})\s*(?:years?\s*old|year olds?|yo|yrs?)\b/) ||
    q.match(/\bage[sd]?\s*(\d{1,2})\b/) ||
    q.match(/\bfor\s+(?:an?\s+)?(\d{1,2})\s+year\b/);
  if (ageMatch) filters.age = Number(ageMatch[1]);
  else if (/\bteens?\b|\bteenagers?\b/.test(q)) filters.ageGroup = "teen";
  else if (/\bkids?\b|\bchildren\b|\bchild\b/.test(q)) filters.ageGroup = "kid";

  for (const [topic, pattern] of TOPIC_PATTERNS) {
    if (pattern.test(q)) filters.topics.push(topic);
  }

  const places = [];
  for (const [borough, aliases] of BOROUGHS) {
    if (aliases.some((alias) => new RegExp(`\\b${alias}\\b`).test(q))) {
      places.push(borough);
    }
  }

  const zip = q.match(/\b(\d{5})\b/);
  if (zip) places.push(zip[1]);

  const phraseHits = [];
  for (const program of programs) {
    for (const field of [program.neighborhood, program.location]) {
      if (!field) continue;
      const value = field.toLowerCase().replace(/,.*$/, "").trim();
      if (value.length >= 5 && q.includes(value)) phraseHits.push(value);
    }
  }
  if (phraseHits.length) {
    places.push(...phraseHits);
  } else if (!places.length) {
    const words = new Set();
    for (const program of programs) {
      for (const field of [program.neighborhood, program.location, program.area]) {
        if (!field) continue;
        for (const word of field.toLowerCase().split(/[^a-z0-9]+/)) {
          if (word.length < 5 || PLACE_SKIP.has(word)) continue;
          if (new RegExp(`\\b${word}\\b`).test(q)) words.add(word);
        }
      }
    }
    places.push(...words);
  }

  filters.places = [...new Set(places)];
  return filters;
}

function topicBlob(program) {
  return (program.topics ?? []).map((topic) => String(topic).toLowerCase()).join(" ");
}

function topicMatches(program, topic) {
  const blob = topicBlob(program);
  if (blob.includes(topic)) return true;
  if (topic === "art") return /\bart|craft/.test(blob);
  if (topic === "sports") return /\bsport|fitness/.test(blob);
  if (topic === "science") return /\bscience|biology|chemistry|physics/.test(blob);
  if (topic === "math") return /\bmath/.test(blob);
  if (topic === "coding") return /\bcod|computer science|programming/.test(blob);
  return false;
}

function matchesHours(program, filters) {
  const start = program.start ? toMinutes(program.start) : null;
  const end = program.end ? toMinutes(program.end) : null;

  if (filters.afterMin != null) {
    if (end != null) {
      if (end <= filters.afterMin) return false;
    } else if (filters.afterMin >= 17 * 60) {
      if (program.hoursKind !== "evenings") return false;
    } else if (program.hoursKind === "unknown") {
      return false;
    }
  }

  if (filters.beforeMin != null) {
    if (start != null) {
      if (start >= filters.beforeMin) return false;
    } else {
      return false;
    }
  }

  if (filters.hoursKind === "evenings" && program.hoursKind !== "evenings") return false;
  if (filters.hoursKind === "after-school") {
    if (program.hoursKind !== "after-school" && program.hoursKind !== "evenings") return false;
  }

  return true;
}

function matchesProgram(program, filters) {
  if (filters.cost === "free" && !isFree(program)) return false;
  if (filters.cost === "paid" && isFree(program)) return false;
  if (filters.cost === "unknown" && isFree(program)) return false;

  if (!matchesHours(program, filters)) return false;

  if (filters.days) {
    const days = (program.days ?? []).map((day) => day.toLowerCase());
    if (!days.length || !filters.days.some((day) => days.includes(day))) return false;
  }

  if (filters.age != null && (filters.age < program.ageMin || filters.age > program.ageMax)) {
    return false;
  }
  if (filters.ageGroup === "teen" && (program.ageMax < 13 || program.ageMin > 18)) return false;
  if (filters.ageGroup === "kid" && (program.ageMax < 5 || program.ageMin > 12)) return false;

  if (filters.topics.length) {
    if (!filters.topics.some((topic) => topicMatches(program, topic))) return false;
  }

  if (filters.places.length) {
    const blob = placeBlob(program);
    if (!filters.places.some((place) => blob.includes(place))) return false;
  }

  return true;
}

function filterLabel(filters) {
  const bits = [];
  if (filters.cost === "free") bits.push("free");
  if (filters.cost === "paid") bits.push("paid");
  if (filters.cost === "unknown") bits.push("ask-provider");
  if (filters.hoursKind === "evenings" || (filters.afterMin != null && filters.afterMin >= 17 * 60)) {
    bits.push(filters.afterMin != null ? `open after ${formatMinutes(filters.afterMin)}` : "evening");
  } else if (filters.afterMin != null) {
    bits.push(`open after ${formatMinutes(filters.afterMin)}`);
  }
  if (filters.beforeMin != null) bits.push(`starting before ${formatMinutes(filters.beforeMin)}`);
  if (filters.hoursKind === "after-school") bits.push("after school");
  if (filters.days && filters.hoursKind !== "after-school") bits.push(filters.days.join(" or "));
  if (filters.age != null) bits.push(`age ${filters.age}`);
  if (filters.ageGroup) bits.push(filters.ageGroup === "teen" ? "teens" : "kids");
  if (filters.topics.length) bits.push(filters.topics.join(" or "));
  return bits.join(" ");
}

function placePhrase(filters) {
  if (!filters.places.length) return "";
  return `in ${filters.places.map(titleCase).join(" or ")}`;
}

function capPrograms(programs) {
  if (programs.length <= RESULT_LIMIT) return programs;
  return programs.slice(0, RESULT_LIMIT);
}

function countNote(total) {
  if (total <= RESULT_LIMIT) return "";
  return ` Showing ${RESULT_LIMIT} of ${total}. Add a borough, ZIP, or topic to narrow it.`;
}

function detailResult(programs) {
  const lines = programs.map((program) => {
    const org = program.org ? ` Run by ${program.org}.` : "";
    const summary = program.summary ? ` ${program.summary}` : "";
    return `${program.name} is in ${placeLabel(program)}, ${hoursLabel(program)}. ${costLabel(program)}, ${program.ages}.${org}${summary}`;
  });
  return {
    intro: lines.join("\n\n"),
    programs,
  };
}

function listResult(intro, programs) {
  const shown = capPrograms(programs);
  return { intro: `${intro}${countNote(programs.length)}`, programs: shown };
}

function asksWhere(q) {
  return /\bwhere\b|\blocations?\b|\baddress\b|\bnear me\b/.test(q);
}

function asksForList(q) {
  return (
    /\b(what|which|list|show|all)\b.*\b(programs|projects|classes)\b/.test(q) ||
    /\b(programs|projects|classes)\b.*\b(do you have|are there|available)\b/.test(q)
  );
}

function keywordMatches(programs, q) {
  const tokens = q
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));
  if (!tokens.length) return [];
  return programs.filter((program) => {
    const blob = `${program.name} ${program.summary ?? ""} ${topicBlob(program)} ${placeBlob(program)}`.toLowerCase();
    return tokens.every((token) => blob.includes(token));
  });
}

function greeting(catalog) {
  return {
    intro: `Hi! I can help you find programs on ${catalog.site.name}. Ask about a borough, ZIP, cost, age, or topic — for example, “free robotics in Brooklyn.”`,
    programs: [],
  };
}

/**
 * Answer a parent or kid question using only the catalog.
 * Returns { intro, programs } where programs are catalog entries, never invented ones.
 */
export function answerQuestion(catalog, rawQuery) {
  const query = String(rawQuery ?? "").trim();
  const q = normalize(query);
  const total = catalog.programs.length;

  if (!q) {
    return {
      intro: "Ask me about programs — what time they meet, whether they're free, who they're for, or where they are.",
      programs: [],
    };
  }

  if (/^(hi|hello|hey|good morning|good afternoon|good evening)[!. ]*$/.test(q)) {
    return greeting(catalog);
  }

  if (/^(help|what can you do|what can i ask|examples?)[?.! ]*$/.test(q)) {
    return {
      intro:
        "I can look up Nova's NYC programs by borough, ZIP, neighborhood, cost, age, and topic. Try “Which programs are free?”, “robotics in Brooklyn”, or “What's good for a 7 year old in 11213?” Clock times are only used when the city published them — I will not invent hours or prices.",
      programs: [],
    };
  }

  const faq = catalog.faqs.find((item) => item.phrases.some((phrase) => q.includes(normalize(phrase))));
  if (faq && !/\b(programs|projects|classes)\b/.test(q)) {
    return { intro: faq.answer, programs: [] };
  }

  const named = catalog.programs.filter((program) => q.includes(program.name.toLowerCase()));
  if (named.length && named.length <= 12) return detailResult(named.slice(0, RESULT_LIMIT));

  const filters = extractFilters(catalog.programs, q);
  const filtered = hasFilters(filters)
    ? catalog.programs.filter((program) => matchesProgram(program, filters))
    : null;

  if (filtered) {
    const label = filterLabel(filters);
    const place = placePhrase(filters);
    const lookedFor = [label, place].filter(Boolean).join(" ");
    if (!filtered.length) {
      return {
        intro: `I couldn't find a program that matches ${lookedFor}. I only know the ${total} NYC programs listed for ${catalog.site.name}. Try a borough, ZIP, or a topic like robotics.`,
        programs: [],
      };
    }
    const noun = filtered.length === 1 ? "program" : "programs";
    const described = [label, noun].filter(Boolean).join(" ");
    const where = asksWhere(q);
    const intro = where
      ? `Here's where to find ${described}${place ? ` ${place}` : ""}:`
      : `I found ${filtered.length} ${described}${place ? ` ${place}` : ""}:`;
    return listResult(intro, filtered);
  }

  if (asksWhere(q) || asksForList(q)) {
    return {
      intro: `${catalog.site.name} lists ${total} K–5 programs across Brooklyn, the Bronx, Queens, Manhattan, and Staten Island. Ask for a borough, neighborhood, or ZIP — for example, “programs in Brooklyn” or “11213”.`,
      programs: [],
    };
  }

  const keywordHits = keywordMatches(catalog.programs, q);
  if (keywordHits.length) {
    return listResult("These are the closest matches I have:", keywordHits);
  }

  return {
    intro: `I can only answer from the ${catalog.site.name} program list, and I didn't find a match for that. Ask about free COMPASS programs, a borough or ZIP, ages, or topics like robotics or coding.`,
    programs: [],
  };
}
