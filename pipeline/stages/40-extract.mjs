/**
 * Stage 40 — extract program facts from crawled page text (Gemini).
 *
 * This is the stage that fills the gap NYC OpenData leaves: the city publishes
 * no tools, hours, cost or description for any site. We hand Gemini the
 * provider's own words and ask for structured facts, with every field allowed
 * to come back null so the model is never pushed into inventing one.
 *
 * Without GEMINI_API_KEY this stage falls back to a keyword classifier and
 * marks the result `method: "keyword"` so the UI can badge it honestly.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { paths } from "../config.mjs";
import { askJSON, isEnabled } from "../lib/gemini.mjs";
import { makeLogger } from "../lib/log.mjs";

const log = makeLogger("40-extract");

export const TOOL_VOCAB = [
  "3d printing", "robotics", "lego", "micro:bit", "arduino", "raspberry pi",
  "coding", "web development", "game design", "laser cutter", "woodworking",
  "sewing/textiles", "electronics", "circuitry", "drones", "chess",
  "science lab", "gardening", "cooking", "digital art", "video production",
  "music production", "animation", "math enrichment", "engineering",
];

/**
 * What a program TEACHES or does, grouped for filters. Specific activities
 * (coding, robotics, chess) sit beside broad subjects so a chess club is not
 * flattened into "mathematics" and lost. "general science" exists so a site
 * that only says "science" is not forced into biology or physics.
 */
export const SUBJECT_GROUPS = {
  "Science": [
    "biology", "chemistry", "physics", "earth & environmental science", "general science", "gardening",
  ],
  "Technology": [
    "computer science", "coding", "robotics", "game design", "electronics",
    "3d design & printing", "technology & digital media",
  ],
  "Engineering": ["engineering", "maker & building"],
  "Math & strategy": ["mathematics", "chess", "financial literacy"],
  "Arts": ["visual arts", "music", "dance & theater", "animation", "filmmaking & video", "crafts & sewing"],
  "Literacy & languages": ["literacy & writing", "languages", "social studies"],
  "Health & movement": ["sports & fitness", "health & nutrition", "cooking"],
  "Social-emotional": ["leadership & social-emotional"],
};
export const SUBJECT_VOCAB = Object.values(SUBJECT_GROUPS).flat();

const SCHEMA = {
  type: "object",
  properties: {
    hasK5Programming: { type: "boolean" },
    subjects: {
      type: "array",
      description: "Subjects the program actually teaches, each backed by its own verbatim quote from the text.",
      items: {
        type: "object",
        properties: {
          subject: { type: "string", enum: SUBJECT_VOCAB },
          quote: { type: "string", description: "Exact words copied from the website text." },
        },
        required: ["subject", "quote"],
      },
    },
    summary: { type: "string", description: "One neutral sentence, <=200 chars. Empty if unclear." },
    stemTools: {
      type: "array",
      items: { type: "string", enum: TOOL_VOCAB },
      description: "Only tools explicitly evidenced in the text.",
    },
    activities: { type: "array", items: { type: "string" } },
    costTier: { type: "string", enum: ["free", "sliding-scale", "paid", "unknown"] },
    hoursText: { type: "string", description: "Verbatim hours if stated, else empty." },
    contactEmail: { type: "string" },
    contactPhone: { type: "string" },
    evidence: {
      type: "array",
      items: { type: "string" },
      description: "Short verbatim quotes supporting stemTools. Required if stemTools is non-empty.",
    },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
  },
  required: ["hasK5Programming", "stemTools", "costTier", "confidence"],
};

/**
 * Keyword fallback patterns. Bare "code" and "programming" are deliberately
 * absent: on nonprofit sites they almost always mean "zip code" or
 * "after-school programming". Likewise a bare "STEM" names no tool.
 */
export const KEYWORDS = {
  robotics: /\brobot(ic)?s?\b|\bvex\b|\bfirst lego league\b/i,
  lego: /\blego\b/i,
  coding: /\bcoding\b|\blearn(ing)? to code\b|\bscratch (jr|junior|programming)\b|\bpython\b|\bcomputer programming\b/i,
  "3d printing": /\b3-?d print/i,
  electronics: /\belectronics\b|\bcircuits?\b|\bcircuitry\b|\bsoldering\b/i,
  "micro:bit": /micro:?bit/i,
  arduino: /\barduino\b/i,
  "raspberry pi": /raspberry pi/i,
  "science lab": /\bscience (lab|club|experiments?)\b|\bhands-on science\b/i,
  engineering: /\bengineering\b/i,
  "digital art": /\bdigital (art|media)\b|\bgraphic design\b/i,
  "video production": /\bvideo production\b|\bfilmmaking\b/i,
  "game design": /\b(video )?game design\b/i,
  chess: /\bchess\b/i,
  gardening: /\bgardening\b|\b(community|school|urban|rooftop|teaching) garden\b/i,
  "math enrichment": /\bmath (enrichment|tutoring|club|games)\b/i,
  cooking: /\bcooking (class|club|program|lesson)s?\b|\bculinary\b/i,
  animation: /\banimation\b/i,
};

/**
 * Subject patterns for the keyword fallback. Each match is shipped with the
 * sentence it came from, so the quote rule that governs Gemini's subjects
 * holds here too. Patterns favour phrases over single words so an adult ESL
 * class or a gala "dance" is less likely to become a child's subject.
 */
export const SUBJECT_KEYWORDS = {
  "biology": /\bbiology\b|\blife sciences?\b|\bmarine science\b|\bzoology\b/i,
  "chemistry": /\bchemistry\b/i,
  "physics": /\bphysics\b/i,
  "earth & environmental science": /\benvironmental (science|education|stewardship)\b|\bearth science\b|\bclimate science\b|\becology\b/i,
  "general science": /\bscience (club|lab|experiments?|enrichment|class(es)?|activities)\b|\bhands-on science\b/i,
  "gardening": KEYWORDS.gardening,
  "computer science": /\bcomputer science\b|\bcomputer (skills|literacy|lab|class(es)?)\b/i,
  "coding": KEYWORDS.coding,
  "robotics": KEYWORDS.robotics,
  "game design": KEYWORDS["game design"],
  "electronics": KEYWORDS.electronics,
  "3d design & printing": /\b3-?d (print|design|model)/i,
  "technology & digital media": /\bdigital (media|literacy)\b|\bmedia (arts|literacy)\b|\btechnology (class|workshop|program|lab)s?\b/i,
  "engineering": KEYWORDS.engineering,
  "maker & building": /\bmaker ?space\b|\bmaker (lab|club|projects?)\b|\blego\b|\bwoodworking\b/i,
  "mathematics": /\bmathematics\b|\bmath (enrichment|tutoring|club|games|skills|help|support)\b/i,
  "chess": KEYWORDS.chess,
  "financial literacy": /\bfinancial literacy\b|\bmoney management\b/i,
  "visual arts": /\bvisual arts?\b|\bpainting\b|\bdrawing\b|\bmurals?\b/i,
  "music": /\bmusic (class|lesson|program|production|education)s?\b|\bchoir\b|\bchorus\b|\bdrumming\b|\bpiano\b|\bguitar\b|\bviolin\b/i,
  "dance & theater": /\bdance (class|lesson|program|team)s?\b|\btheat(er|re) (arts|class|program)s?\b|\bdrama\b|\bstep team\b/i,
  "animation": KEYWORDS.animation,
  "filmmaking & video": /\bfilmmaking\b|\bvideo production\b|\bfilm (club|making|program)\b/i,
  "crafts & sewing": /\barts (and|&|&amp;) crafts\b|\bsewing\b|\bknitting\b/i,
  "literacy & writing": /(?<!(financial|digital|media|computer) )\bliteracy\b|\bcreative writing\b|\bbook clubs?\b|\breading (club|program|skills)\b/i,
  "languages": /\bforeign languages?\b|\b(spanish|mandarin|chinese|french|arabic) (class|lesson)s?\b/i,
  "social studies": /\bsocial studies\b|\bcivics\b/i,
  "sports & fitness": /\bsports\b|\bfitness\b|\bbasketball\b|\bsoccer\b|\bswimming\b|\bmartial arts\b|\byoga\b/i,
  "health & nutrition": /\bnutrition\b|\bhealthy (eating|habits)\b/i,
  "cooking": KEYWORDS.cooking,
  "leadership & social-emotional": /\bsocial[- ]emotional\b|\bleadership (development|skills|training)\b|\bcharacter (development|building|education)\b/i,
};

/**
 * The words around a match, cut at sentence ends (or ~90 chars either side)
 * and only ever at whitespace, so an HTML entity is never split and the quote
 * stays an exact substring of the page.
 */
export function quoteAround(text, index, length) {
  const REACH = 90;
  let start = Math.max(0, index - REACH);
  let end = Math.min(text.length, index + length + REACH);
  const before = text.slice(start, index);
  const stop = Math.max(before.lastIndexOf(". "), before.lastIndexOf("! "), before.lastIndexOf("? "));
  if (stop >= 0) {
    start += stop + 2;
  } else if (start > 0) {
    const sp = text.indexOf(" ", start);
    start = sp >= 0 && sp < index ? sp + 1 : index;
  }
  const after = text.slice(index + length, end);
  const next = after.search(/[.!?](\s|$)/);
  if (next >= 0) {
    end = index + length + next + 1;
  } else if (end < text.length) {
    const sp = text.lastIndexOf(" ", end);
    if (sp > index + length) end = sp;
  }
  return text.slice(start, end).trim();
}

/**
 * Providers are multi-service agencies: the same site that runs a K-5
 * program offers adult literacy, SNAP enrolment and job training. A sentence
 * about those is not evidence of what children do.
 */
const NOT_ABOUT_KIDS =
  /\b(adults?|seniors?|older adults|elderly|residents?|staff|group fitness|esl|english for speakers|english language learners|citizenship|high school equivalency|hse|ged|snap|benefits|job|jobs|workforce|employment|career|careers|apprenticeships?|therapy|therapists?|patients?|tenants|legal|lifeguards?|certification|caregivers|health insurance|medicaid)\b/i;

/** Menus and footers: long runs of Title Case words with no sentence in them. */
function looksLikeNavigation(quote) {
  if (/[.!?]$/.test(quote)) return false;
  const words = quote.split(/\s+/).filter((w) => /^[a-z]/i.test(w));
  if (words.length < 10) return false;
  const titled = words.filter((w) => /^[A-Z]/.test(w)).length;
  return titled / words.length > 0.6;
}

export function usableQuote(quote) {
  return quote.length >= 8 && !NOT_ABOUT_KIDS.test(quote) && !looksLikeNavigation(quote);
}

/** First usable occurrence of each pattern across the pages, with its sentence. */
export function keywordEvidence(pages, patterns) {
  const out = [];
  for (const [name, re] of Object.entries(patterns)) {
    const all = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    search: for (const page of pages) {
      const text = page.text ?? "";
      for (const m of text.matchAll(all)) {
        const quote = quoteAround(text, m.index, m[0].length);
        if (!usableQuote(quote)) continue;
        out.push({ name, quote });
        break search;
      }
    }
  }
  return out;
}

const NAMED_ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "'", lsquo: "'",
  rdquo: '"', ldquo: '"', ndash: "-", mdash: "-", hellip: "...", bull: " ", raquo: " ", laquo: " ",
};

/**
 * Normalise text so a quote the model copied matches the crawled page.
 * Crawled text keeps HTML entities (265 of 310 pages: &#8217; &#038; ...),
 * while the model writes the characters, so both sides are decoded; curly
 * quotes, dashes and whitespace are folded too.
 */
export function squash(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => NAMED_ENTITIES[n.toLowerCase()] ?? m)
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Keep a subject only if it is in the vocabulary AND its quote really occurs
 * in the page text (case- and whitespace-insensitive). A quote the model
 * paraphrased or invented is exactly what this check is for. One entry per
 * subject; the first valid quote wins.
 */
export function validateSubjects(raw, text) {
  const haystack = squash(text);
  const seen = new Map();
  let dropped = 0;
  for (const item of Array.isArray(raw) ? raw : []) {
    const subject = item?.subject;
    const quote = typeof item?.quote === "string" ? item.quote.trim() : "";
    const ok = SUBJECT_VOCAB.includes(subject) && quote.length >= 8 && haystack.includes(squash(quote));
    if (!ok) { dropped += 1; continue; }
    if (!seen.has(subject)) seen.set(subject, quote);
  }
  return {
    subjects: [...seen.keys()],
    subjectEvidence: [...seen].map(([subject, quote]) => ({ subject, quote })),
    droppedSubjects: dropped,
  };
}

export function keywordExtract(pages) {
  const text = corpusFor({ pages });
  const tools = keywordEvidence(pages, KEYWORDS);
  const { subjects, subjectEvidence } = validateSubjects(
    keywordEvidence(pages, SUBJECT_KEYWORDS).map(({ name, quote }) => ({ subject: name, quote })),
    text,
  );
  return {
    hasK5Programming: /\b(elementary|grades? k|kindergarten|after[-\s]?school)\b/i.test(text),
    summary: "",
    stemTools: tools.map((t) => t.name),
    subjects,
    subjectEvidence,
    activities: [],
    // The word "free" somewhere on a provider's site is not a price.
    costTier: "unknown",
    hoursText: "",
    contactEmail: text.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0] ?? "",
    contactPhone: text.match(/\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/)?.[0] ?? "",
    evidence: [...new Set(tools.map((t) => t.quote))],
    confidence: "low",
    method: "keyword",
  };
}

function corpusFor(site) {
  return site.pages
    .map((p) => `## ${p.label ?? p.kind} (${p.url})\n${p.text}`)
    .join("\n\n")
    .slice(0, 60_000);
}

export async function run({ limit } = {}) {
  const crawl = JSON.parse(await readFile(path.join(paths.work, "crawl.json"), "utf8"));
  let targets = crawl.filter((c) => c.pages?.length);
  if (limit) targets = targets.slice(0, limit);

  const gemini = isEnabled();
  log.info(`${targets.length} providers; mode = ${gemini ? "gemini" : "keyword fallback"}`);

  const out = [];
  for (const site of targets) {
    const text = corpusFor(site);
    if (!gemini) {
      out.push({ provider: site.provider, website: site.website, ...keywordExtract(site.pages) });
      continue;
    }
    const prompt = [
      "You are extracting facts about a New York City after-school provider for a",
      "directory used by parents of K-5 children. Use ONLY the text supplied.",
      "",
      "Rules:",
      "- Never infer a tool or piece of equipment that is not named in the text.",
      "- If the text does not say, use null/empty and set confidence low.",
      "- stemTools must be chosen from the provided enum only.",
      "- For every tool you list, include a short verbatim quote in `evidence`.",
      "- `subjects` are what children LEARN (e.g. biology, mathematics), chosen from",
      "  the enum. Each needs its own quote copied EXACTLY from the text; quotes are",
      "  checked against the text and dropped if they do not appear. Use",
      "  \"general science\" when the text only says science. Prefer the most",
      "  specific entry the quote supports (robotics, chess, coding) and add the",
      "  broad one only if the text also supports it. Do not list a subject for",
      "  adult, family or job programs.",
      "",
      `Organization: ${site.provider}`,
      `Website: ${site.website}`,
      "",
      "--- WEBSITE TEXT ---",
      text,
    ].join("\n");

    try {
      const { data, fromCache } = await askJSON({
        prompt,
        schema: SCHEMA,
        // The prompt and schema are part of the key: without them, adding a
        // field (as `subjects` was) silently reuses answers that lack it.
        cacheKey: { task: "extract", provider: site.provider, len: text.length, prompt, schema: SCHEMA },
      });
      if (!data) {
        out.push({ provider: site.provider, website: site.website, ...keywordExtract(site.pages) });
        log.warn(`${site.provider.slice(0, 40)}: no parse, fell back to keywords`);
        continue;
      }
      // A tool with no supporting quote is exactly the invention this pipeline
      // exists to prevent, so drop the whole claim rather than ship it.
      // Quotes are required collectively, not matched per tool: a quote like
      // "students design and print their own models" evidences "3d printing"
      // without containing the phrase.
      const evidence = (data.evidence ?? []).filter(
        (e) => typeof e === "string" && e.trim().length > 0,
      );
      const claimed = (data.stemTools ?? []).filter((t) => TOOL_VOCAB.includes(t));
      const evidenced = evidence.length > 0 ? claimed : [];
      const dropped = claimed.length - evidenced.length;
      const { subjects, subjectEvidence, droppedSubjects } = validateSubjects(data.subjects, text);

      out.push({
        provider: site.provider,
        website: site.website,
        ...data,
        stemTools: evidenced,
        evidence,
        subjects,
        subjectEvidence,
        droppedSubjects,
        // An unevidenced answer is not a confident one, whatever the model said.
        confidence: dropped > 0 ? "low" : (data.confidence ?? "low"),
        droppedUnevidenced: dropped,
        method: "gemini",
      });
      log.ok(
        `${site.provider.slice(0, 38).padEnd(38)} tools=${evidenced.length} subjects=${subjects.length}` +
          (droppedSubjects ? ` (dropped ${droppedSubjects} unquoted subjects)` : "") +
          (dropped ? ` (dropped ${dropped} unevidenced)` : "") +
          (fromCache ? " (cached)" : ""),
      );
    } catch (e) {
      log.warn(`${site.provider.slice(0, 40)}: ${e.message}`);
      out.push({ provider: site.provider, website: site.website, ...keywordExtract(site.pages) });
    }
  }

  const file = path.join(paths.work, "facts.json");
  await writeFile(file, JSON.stringify(out, null, 2) + "\n");
  const withTools = out.filter((o) => o.stemTools?.length).length;
  const withSubjects = out.filter((o) => o.subjects?.length).length;
  log.ok(`${out.length} providers, ${withTools} with STEM tools, ${withSubjects} with subjects -> ${file}`);
  return { providers: out.length, withTools, withSubjects };
}
