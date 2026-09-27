import { test } from "node:test";
import assert from "node:assert/strict";
import { candidates, nameSignals } from "../stages/10-providers.mjs";

test("ranks the full name ahead of a short generic base", () => {
  const c = candidates("New York Edge, Inc.");
  assert.equal(c[0], "newyorkedge.org");
  // edge.org is a real, unrelated site; it must never be tried first.
  assert.ok(c.indexOf("newyorkedge.org") < c.indexOf("edge.org") || !c.includes("edge.org"));
});

test("never proposes a bare generic word as the whole domain", () => {
  for (const name of ["The Child Center of NY Inc", "Good Shepherd Services"]) {
    const c = candidates(name);
    assert.ok(!c.includes("child.org"), `${name} -> ${c.slice(0, 3)}`);
    assert.ok(!c.includes("good.org"));
  }
});

test("generates an acronym candidate for multi-word names", () => {
  assert.ok(candidates("New York Junior Tennis League Inc").includes("nyjtl.org"));
});

test("strips legal suffixes but keeps geography", () => {
  assert.ok(candidates("CAMBA, Inc.").includes("camba.org"));
  assert.ok(!candidates("CAMBA, Inc.").includes("cambainc.org"));
});

test("prefers .org first for every base", () => {
  assert.ok(candidates("Hudson Guild")[0].endsWith(".org"));
});

test("returns nothing for an empty or symbol-only name", () => {
  assert.deepEqual(candidates(""), []);
  assert.deepEqual(candidates("---"), []);
});

test("signals drop short and generic words", () => {
  const s = nameSignals("The Child Center of NY Inc");
  assert.ok(s.includes("child"));
  assert.ok(!s.includes("the"), "stopword");
  assert.ok(!s.includes("center"), "trimmable");
  assert.ok(!s.includes("inc"), "legal suffix");
});

// --- school matching (NOVA is K-5 only, so the host school must serve K-5) ---
import { pickHostSchool, schoolsWithin } from "../stages/60-build.mjs";

const S = (dbn, distanceM, servesK5) => ({ dbn, name: dbn, distanceM, servesK5 });

test("prefers a K-5 school over a closer high school on a shared campus", () => {
  const picked = pickHostSchool([S("04M495", 12, false), S("04M108", 61, true)]);
  assert.equal(picked.dbn, "04M108");
});

test("falls back to the nearest school when none serves K-5", () => {
  const picked = pickHostSchool([S("04M495", 12, false), S("02M600", 80, false)]);
  assert.equal(picked.dbn, "04M495");
  assert.equal(picked.servesK5, false, "caller must be able to suppress the label");
});

test("no schools in range yields no host", () => {
  assert.equal(pickHostSchool([]), null);
});

test("schoolsWithin returns everything in radius, nearest first", () => {
  const schools = [
    { dbn: "A", name: "A", lat: 40.7000, lng: -73.9000, servesK5: true },
    { dbn: "B", name: "B", lat: 40.70005, lng: -73.9000, servesK5: false },
    { dbn: "C", name: "C", lat: 40.8000, lng: -73.9000, servesK5: true },
  ];
  const hits = schoolsWithin(schools, 40.7000, -73.9000, 120);
  assert.deepEqual(hits.map((h) => h.dbn), ["A", "B"], "C is ~11km away");
  assert.ok(hits[0].distanceM <= hits[1].distanceM);
});
