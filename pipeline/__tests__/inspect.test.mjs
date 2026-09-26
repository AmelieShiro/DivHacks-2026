/**
 * The per-stage inspector (scripts/inspect.mjs) is how a human decides a stage
 * worked, so its checks must not pass vacuously or by coincidence. Each module
 * is fed small fixtures here — no files on disk are read.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { MODULES, page } from "../../scripts/inspect.mjs";

const mod = (id) => MODULES.find((m) => m.id === id);
const file = (data, mtime = new Date("2026-09-26T12:00:00Z")) => ({ data, mtime });
const levels = (r) => r.checks.map((c) => c.level);
const find = (r, re) => r.checks.find((c) => re.test(c.label));
const pass = (label) => ({ level: "pass", label });

const crawl = file([
  { provider: "A", website: "https://a.org/", crawledAt: "2026-09-26T12:00:00Z",
    pages: [{ url: "https://a.org/", text: "x".repeat(500) }],
    images: [{ url: "https://a.org/kept.jpg" }, { url: "https://a.org/dropped.jpg" }] },
  { provider: "B", website: "https://b.org/", crawledAt: "2026-09-26T12:00:00Z",
    pages: [{ url: "https://b.org/", text: "" }], images: [] },
]);

describe("20 resolve", () => {
  test("passes on verified websites and reports site coverage", () => {
    const r = mod("20").inspect({ providers: file([
      { provider: "A", siteCount: 3, website: "https://a.org/", confidence: "strong", resolvedVia: "a.org" },
      { provider: "B", siteCount: 1, website: null, confidence: "unresolved" },
    ]) });
    assert.deepEqual(levels(r), ["pass", "pass", "pass"]);
    assert.match(r.summary, /1\/2 providers resolved · 75% of sites/);
  });

  test("fails a resolved website with an unknown confidence", () => {
    const r = mod("20").inspect({ providers: file([
      { provider: "A", siteCount: 1, website: "https://a.org/", confidence: null, resolvedVia: null },
    ]) });
    assert.equal(find(r, /confidence/).level, "fail");
    assert.equal(find(r, /records the domain/).level, "warn");
  });
});

describe("30 crawl", () => {
  test("warns about sites that returned no usable text", () => {
    const r = mod("30").inspect({ crawl, providers: file([{ website: "x" }, { website: "y" }]) });
    assert.equal(find(r, /usable page text/).level, "warn");
    assert.equal(r.view[0].pages[0].head.length, 280, "page text is truncated for the page payload");
  });
});

describe("40 extract", () => {
  test("coverage is by provider name, so a duplicate cannot hide a gap", () => {
    const r = mod("40").inspect({ crawl, facts: file([
      { provider: "A", method: "keyword" }, { provider: "A", method: "keyword" },
    ]) });
    const c = find(r, /facts cover/);
    assert.equal(c.level, "fail");
    assert.match(c.label, /1 of 2 .*missing e\.g\. B/);
  });

  test("does not pass the evidence check when there are no Gemini records", () => {
    const r = mod("40").inspect({ crawl, facts: file([{ provider: "A", method: "keyword", stemTools: ["coding"] }]) });
    assert.equal(find(r, /evidence/).level, "warn");
  });

  test("fails Gemini tools that carry no evidence quote", () => {
    const r = mod("40").inspect({ crawl, facts: file([
      { provider: "A", method: "gemini", stemTools: ["robotics"], evidence: [] },
      { provider: "B", method: "gemini", stemTools: [], evidence: [] },
    ]) });
    assert.equal(find(r, /evidence/).level, "fail");
    assert.equal(find(r, /facts cover/).level, "pass");
  });
});

describe("50 images", () => {
  test("lists stage-30 images that stage 50 did not keep", () => {
    const r = mod("50").inspect({ crawl, photos: file([
      { provider: "A", website: "https://a.org/", photos: [{ url: "https://a.org/kept.jpg", judged: false }] },
    ]) });
    assert.deepEqual(r.view[0].dropped.map((i) => i.url), ["https://a.org/dropped.jpg"]);
  });

  test("uses stage 50's recorded reasons when present", () => {
    const r = mod("50").inspect({ crawl, photos: file([
      { provider: "A", photos: [], rejected: [{ url: "https://a.org/t.png", reason: "text-only" }] },
      { provider: "B", photos: [], rejected: [] },
    ]) });
    assert.deepEqual(r.view[0].dropped.map((d) => d.reason), ["text-only"]);
    assert.equal(find(r, /why images were dropped/).level, "pass");
  });

  test("falls back to a stage-30 diff, and says so, for older output", () => {
    const r = mod("50").inspect({ crawl, photos: file([{ provider: "A", photos: [] }]) });
    assert.ok(r.view[0].dropped.every((d) => d.reason === "unrecorded"));
    assert.equal(find(r, /why images were dropped/).level, "warn");
  });

  test("does not pass the suitability check when nothing was judged", () => {
    const r = mod("50").inspect({ crawl, photos: file([
      { provider: "A", photos: [{ url: "u", judged: false }] },
    ]) });
    assert.equal(find(r, /suitability/).level, "warn");
  });

  test("fails a judged photo without an integer suitability", () => {
    const r = mod("50").inspect({ crawl, photos: file([
      { provider: "A", photos: [{ url: "u", judged: true, suitability: "7" }] },
      { provider: "B", photos: [] },
    ]) });
    assert.equal(find(r, /suitability/).level, "fail");
  });
});

describe("60 build", () => {
  const program = (id, extra = {}) => ({
    id, provider: "A", enrichment: { stemTools: [], method: "gemini" }, cost: { tier: "unknown" }, photos: [], ...extra,
  });
  const old = new Date("2026-09-26T10:00:00Z");
  const fresh = new Date("2026-09-26T12:00:00Z");

  test("flags dist/ built before its enrichment inputs", () => {
    const r = mod("60").inspect({
      programs: file([program("1")], old), meta: file({ schemaVersion: "2.2.0" }),
      facts: file([], fresh), photos: file([], old),
    });
    const c = find(r, /predates|newer/);
    assert.equal(c.level, "warn");
    assert.match(c.label, /facts\.json/);
    assert.doesNotMatch(c.label, /photos\.json/);
  });

  test("fails duplicate ids and a missing stemTools array", () => {
    const r = mod("60").inspect({
      programs: file([program("1"), program("1", { enrichment: { method: null } })]),
      meta: file({}), facts: null, photos: null,
    });
    assert.equal(find(r, /ids are unique/).level, "fail");
    assert.equal(find(r, /stemTools/).level, "fail");
  });

  test("warns on a 'free' cost backed only by keyword matching", () => {
    const r = mod("60").inspect({
      programs: file([program("1", { cost: { tier: "free" }, enrichment: { stemTools: [], method: "keyword" } })]),
      meta: file({}), facts: null, photos: null,
    });
    assert.equal(find(r, /'free' cost/).level, "warn");
  });
});

describe("page", () => {
  // The client script lives inside a template literal, where backslashes are
  // silently consumed; so test the script as emitted, not the source text.
  function client(results) {
    const html = page(JSON.stringify(results));
    const js = html.split("<script>")[1].split("</script>")[0];
    const el = () => ({ innerHTML: "", value: "", addEventListener() {}, focus() {}, setSelectionRange() {},
      querySelector: () => el(), style: {}, classList: { add() {} } });
    const els = {};
    const document = { getElementById: (id) => (els[id] ??= el()) };
    const { RENDER } = new Function("document", `${js};return { RENDER };`)(document);
    return { RENDER, els };
  }

  test("renders every stage tab from real module output", () => {
    const results = [
      { id: "50", name: "images", file: "f", mtime: new Date(), summary: "s", checks: [pass("ok")],
        view: mod("50").inspect({ crawl, photos: file([{ provider: "A", photos: [] }]) }).view },
    ];
    const { els } = client(results);
    assert.match(els.main.innerHTML, /2 dropped: reason not recorded/);
  });

  test("never links or embeds a non-http URL scraped from a provider site", () => {
    const { RENDER } = client([]);
    const html = RENDER["50"]([{ provider: "x", website: "javascript:alert(1)",
      photos: [{ url: "javascript:alert(1)", page: "javascript:alert(2)" }], dropped: [] }]);
    assert.doesNotMatch(html, /href="javascript/i);
    assert.doesNotMatch(html, /<img/);
  });

  test("a scraped value cannot close the script tag", () => {
    const html = page(JSON.stringify([{ id: "40", view: [{ provider: "</script><b>x" }] }]).replace(/</g, "\\u003c"));
    assert.equal(html.split("</script>").length, 2);
  });
});

test("every stage module declares its primary file first and has a renderer id", () => {
  assert.deepEqual(MODULES.map((m) => m.id), ["20", "30", "40", "50", "60"]);
  for (const m of MODULES) assert.ok(Object.keys(m.files).length >= 1 && typeof m.inspect === "function");
});
