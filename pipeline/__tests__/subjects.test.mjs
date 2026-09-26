/**
 * Subjects (biology, mathematics, ...) are shown to parents as filters, so
 * each must rest on a quote that really appears on the provider's site.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  validateSubjects, SUBJECT_VOCAB, SUBJECT_GROUPS, SUBJECT_KEYWORDS, keywordExtract, quoteAround,
} from "../stages/40-extract.mjs";
import { paths } from "../config.mjs";

const PAGE = `
## Home (https://example.org/)
Our after-school program runs Monday to Friday.
Students explore  life science by raising butterflies in our garden lab,
and practice math through games. We also offer “Coding Club” on Fridays.
`;

test("keeps a subject whose quote appears verbatim, ignoring case and whitespace", () => {
  const r = validateSubjects([
    { subject: "biology", quote: "explore life science by raising butterflies" },
    { subject: "computer science", quote: "we also offer \"coding club\" on fridays" },
  ], PAGE);
  assert.deepEqual(r.subjects, ["biology", "computer science"]);
  assert.equal(r.droppedSubjects, 0);
});

test("drops a paraphrased or invented quote", () => {
  const r = validateSubjects([
    { subject: "mathematics", quote: "practice mathematics through board games" },
    { subject: "chemistry", quote: "hands-on chemistry experiments every week" },
  ], PAGE);
  assert.deepEqual(r.subjects, []);
  assert.equal(r.droppedSubjects, 2);
});

test("drops subjects outside the vocabulary and quotes too short to prove anything", () => {
  const r = validateSubjects([
    { subject: "astrology", quote: "raising butterflies in our garden lab" },
    { subject: "mathematics", quote: "math" },
    { subject: "mathematics", quote: "practice math through games" },
  ], PAGE);
  assert.deepEqual(r.subjectEvidence, [{ subject: "mathematics", quote: "practice math through games" }]);
  assert.equal(r.droppedSubjects, 2);
});

test("one entry per subject, first valid quote wins", () => {
  const r = validateSubjects([
    { subject: "biology", quote: "raising butterflies in our garden lab" },
    { subject: "biology", quote: "explore life science" },
  ], PAGE);
  assert.deepEqual(r.subjectEvidence, [{ subject: "biology", quote: "raising butterflies in our garden lab" }]);
});

test("matches quotes against crawled text that still contains HTML entities", () => {
  // Real crawled text keeps entities; the model writes the characters.
  const crawled = "Kids&#8217; STEM Lab &#8211; robotics &#038; engineering for grades K&ndash;5";
  const r = validateSubjects([
    { subject: "engineering", quote: "Kids’ STEM Lab – robotics & engineering for grades K-5" },
  ], crawled);
  assert.deepEqual(r.subjects, ["engineering"]);
});

test("tolerates malformed model output", () => {
  for (const raw of [undefined, null, "biology", [null, 3, {}, { subject: "biology" }]]) {
    assert.deepEqual(validateSubjects(raw, PAGE).subjects, []);
  }
});

test("the vocabulary has a catch-all for sites that only say 'science'", () => {
  assert.ok(SUBJECT_VOCAB.includes("general science"));
  assert.equal(new Set(SUBJECT_VOCAB).size, SUBJECT_VOCAB.length);
});

const built = existsSync(path.join(paths.dist, "programs.json"));
test("dist/: subjects is always an array with one quote per subject", { skip: built ? false : "dist/ not built" }, () => {
  const programs = JSON.parse(readFileSync(path.join(paths.dist, "programs.json"), "utf8"));
  for (const p of programs) {
    assert.ok(Array.isArray(p.enrichment.subjects), p.id);
    assert.equal(p.enrichment.subjects.length, p.enrichment.subjectEvidence.length, p.id);
    for (const s of p.enrichment.subjects) assert.ok(SUBJECT_VOCAB.includes(s), `${p.id}: ${s}`);
  }
});

test("specific activities are subjects too, each under exactly one filter heading", () => {
  for (const s of ["coding", "robotics", "chess", "gardening", "cooking", "game design"]) {
    assert.ok(SUBJECT_VOCAB.includes(s), s);
  }
  const all = Object.values(SUBJECT_GROUPS).flat();
  assert.equal(new Set(all).size, all.length, "no subject is listed under two headings");
  assert.deepEqual(all, SUBJECT_VOCAB);
});

const CRAWLED = [
  { url: "https://example.org/", kind: "home", text:
    "Welcome to our Brooklyn center. Enter your zip code to find a site. Our after-school programming runs daily. " +
    "Kids&#8217; Robotics Club meets Tuesdays with LEGO kits. Students also practice chess and creative writing. " +
    "Free tax preparation for adults every spring." },
];

test("keyword fallback ships subjects, each with a verbatim sentence as its quote", () => {
  const r = keywordExtract(CRAWLED);
  assert.ok(r.subjects.includes("robotics"));
  assert.ok(r.subjects.includes("chess"));
  assert.ok(r.subjects.includes("literacy & writing"));
  for (const { quote } of r.subjectEvidence) assert.ok(CRAWLED[0].text.includes(quote), quote);
  assert.equal(r.method, "keyword");
});

test("keyword fallback does not read 'zip code' or 'programming' as coding", () => {
  const r = keywordExtract(CRAWLED);
  assert.ok(!r.stemTools.includes("coding"));
  assert.ok(!r.subjects.includes("coding"));
});

test("keyword fallback backs every tool with a quote and never sets a price", () => {
  const r = keywordExtract(CRAWLED);
  assert.ok(r.stemTools.includes("robotics"));
  assert.ok(r.evidence.length > 0);
  assert.equal(r.costTier, "unknown", "the word 'free' is on the page but is not a price");
});

test("quotes never split an HTML entity", () => {
  // The 90-char reach lands inside "&#8217;", so a naive cut would start
  // the quote at "8217;" and it would no longer match the decoded page.
  const lead = "Kids&#8217;";
  const text = `intro ${lead} ${"w ".repeat(42)}robotics lab is open`;
  const i = text.indexOf("robotics");
  assert.ok(i - 90 > text.indexOf(lead) && i - 90 < text.indexOf(lead) + lead.length, "fixture must cut the entity");
  const q = quoteAround(text, i, "robotics".length);
  const at = text.indexOf(q);
  assert.ok(at >= 0);
  assert.ok(at === 0 || text[at - 1] === " ", q);
  assert.ok(!q.startsWith("8217;") && !q.startsWith("#"), q);
});

test("keyword fallback skips adult services and menus, and uses a later clean match", () => {
  const pages = [{ url: "https://example.org/", kind: "home", text:
    "Home About Programs Adult Literacy Youth Services Senior Centers Food Pantry Careers Donate Contact. " +
    "We offer English literacy classes and citizenship preparation for adults. " +
    "Our Supplemental Nutrition Assistance Program (SNAP) team can help. " +
    "In our after-school program, children build literacy skills through read-alouds." }];
  const r = keywordExtract(pages);
  assert.deepEqual(r.subjectEvidence.find((e) => e.subject === "literacy & writing")?.quote,
    "In our after-school program, children build literacy skills through read-alouds.");
  assert.ok(!r.subjects.includes("health & nutrition"));
});

test("every subject has a keyword pattern", () => {
  assert.deepEqual(Object.keys(SUBJECT_KEYWORDS).sort(), [...SUBJECT_VOCAB].sort());
});

test("dist/meta.json ships the filter headings", { skip: built ? false : "dist/ not built" }, () => {
  const meta = JSON.parse(readFileSync(path.join(paths.dist, "meta.json"), "utf8"));
  assert.ok(meta.subjectGroups?.Technology?.includes("robotics"));
});
