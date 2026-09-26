/**
 * Integrity checks on the published dataset in dist/.
 *
 * These are the invariants the website team is told they can rely on, so a
 * pipeline change that breaks one should fail here rather than in their UI.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { paths } from "../config.mjs";

const load = (f) => JSON.parse(readFileSync(path.join(paths.dist, f), "utf8"));
const built = existsSync(path.join(paths.dist, "programs.json"));

describe("dist/ contract", { skip: built ? false : "run `npm run pipeline` first" }, () => {
  const programs = built ? load("programs.json") : [];
  const schools = built ? load("schools.json") : [];
  const zips = built ? load("zips.json") : [];
  const meta = built ? load("meta.json") : {};

  test("program ids are unique and non-empty", () => {
    const ids = programs.map((p) => p.id);
    assert.ok(ids.every((i) => typeof i === "string" && i.length > 0));
    assert.equal(new Set(ids).size, ids.length);
  });

  test("meta counts match the files", () => {
    assert.equal(meta.counts.programs, programs.length);
    assert.equal(meta.counts.schools, schools.length);
    assert.equal(meta.counts.zips, zips.length);
  });

  test("every cost tier is in the documented enum", () => {
    const allowed = new Set(["free", "sliding-scale", "paid", "unknown"]);
    for (const p of programs) assert.ok(allowed.has(p.cost.tier), `${p.id}: ${p.cost.tier}`);
  });

  test("no price is ever attributed to OpenData", () => {
    // OpenData publishes no cost field; claiming otherwise is the bug this guards.
    const allowed = new Set(["provider-website", "not-published"]);
    for (const p of programs) assert.ok(allowed.has(p.cost.source), `${p.id}: ${p.cost.source}`);
  });

  test("a stated price always has a source that could state it", () => {
    for (const p of programs) {
      if (p.cost.tier !== "unknown") assert.equal(p.cost.source, "provider-website", p.id);
    }
  });

  test("model-extracted tools are always backed by evidence", () => {
    for (const p of programs) {
      if (p.enrichment.method === "gemini" && p.enrichment.stemTools.length > 0) {
        assert.ok(p.enrichment.evidence.length > 0, `${p.id} claims tools with no evidence`);
      }
    }
  });

  test("enrichment is additive: arrays exist even when empty", () => {
    for (const p of programs) {
      assert.ok(Array.isArray(p.enrichment.stemTools), p.id);
      assert.ok(Array.isArray(p.enrichment.evidence), p.id);
      assert.ok(Array.isArray(p.photos), p.id);
    }
  });

  test("coordinates, when present, fall inside the NYC bounding box", () => {
    for (const p of programs) {
      if (p.lat === null || p.lng === null) continue;
      assert.ok(p.lat > 40.4 && p.lat < 41.0, `${p.id} lat ${p.lat}`);
      assert.ok(p.lng > -74.3 && p.lng < -73.6, `${p.id} lng ${p.lng}`);
    }
  });

  test("school matches are close enough to mean 'in this building'", () => {
    for (const p of programs) {
      if (p.inSchoolBuilding) assert.ok(p.inSchoolBuilding.distanceM <= 120, p.id);
    }
  });

  test("the host school serves K-5 whenever one is in range", () => {
    for (const p of programs) {
      if (!p.inSchoolBuilding) continue;
      const k5InRange = p.coLocatedSchools.some((s) => s.servesK5);
      if (k5InRange) {
        assert.ok(p.inSchoolBuilding.servesK5,
          `${p.id} picked a non-K-5 school while a K-5 one was in range`);
      }
    }
  });

  test("the host school is one of the co-located schools", () => {
    for (const p of programs) {
      if (!p.inSchoolBuilding) continue;
      assert.ok(p.coLocatedSchools.some((s) => s.dbn === p.inSchoolBuilding.dbn), p.id);
    }
  });

  test("every photo carries a url and the page it came from", () => {
    for (const p of programs) {
      for (const ph of p.photos) {
        assert.match(ph.url, /^https?:\/\//, p.id);
        assert.ok(ph.sourcePage, `${p.id} photo missing attribution`);
      }
    }
  });

  test("zip density is consistent with the program list", () => {
    for (const z of zips) {
      const actual = programs.filter((p) => p.address.zip === z.zip).length;
      assert.equal(z.k5ProgramsNow, actual, `zip ${z.zip}`);
    }
  });

  test("schema version is declared", () => {
    assert.match(meta.schemaVersion, /^\d+\.\d+\.\d+$/);
  });
});
