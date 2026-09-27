/**
 * Guards the bug where every program was emitted as free and attributed to
 * NYC OpenData, which publishes no cost field at all.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveCost } from "../stages/60-build.mjs";

test("cost is unknown when no source stated one", () => {
  const c = deriveCost({ contract: "91000A", programArea: "Cornerstone", extracted: null });
  assert.equal(c.tier, "unknown");
  assert.equal(c.source, "not-published");
});

test("never attributes a price to OpenData", () => {
  for (const area of ["Cornerstone", "Beacon"]) {
    const c = deriveCost({ contract: "X1", programArea: area, extracted: null });
    assert.notEqual(c.source, "opendata");
    assert.equal(c.tier, "unknown");
  }
});

test("COMPASS is free on DYCD's own statement, and says where that comes from", () => {
  const c = deriveCost({ contract: "X1", programArea: "Compass", extracted: null });
  assert.equal(c.tier, "free");
  assert.equal(c.source, "dycd-program-rules");
  assert.match(c.note, /no cost to youth/);
  assert.match(c.note, /nyc\.gov\/site\/dycd/);
});

test("DYCD's COMPASS rule wins over an organization-wide provider statement", () => {
  const c = deriveCost({
    contract: "X1", programArea: "Compass",
    extracted: { costTier: "paid", method: "gemini" },
  });
  assert.equal(c.tier, "free");
  assert.equal(c.source, "dycd-program-rules");
});

test("uses a tier the provider's own site stated", () => {
  const c = deriveCost({
    contract: "X1",
    programArea: "Beacon",
    extracted: { costTier: "free", method: "gemini" },
  });
  assert.equal(c.tier, "free");
  assert.equal(c.source, "provider-website");
});

test("a keyword match is never a price", () => {
  // The word "free" anywhere on a provider's site produced 270 false "free"s.
  const c = deriveCost({
    contract: "X1", programArea: "Cornerstone",
    extracted: { costTier: "free", method: "keyword" },
  });
  assert.equal(c.tier, "unknown");
  assert.equal(c.source, "not-published");
});

test("treats an extracted 'unknown' as no answer", () => {
  const c = deriveCost({
    contract: "X1", programArea: "Beacon",
    extracted: { costTier: "unknown", method: "gemini" },
  });
  assert.equal(c.tier, "unknown");
  assert.equal(c.source, "not-published");
});

test("publiclyFunded reflects the DYCD contract, independent of price", () => {
  assert.equal(deriveCost({ contract: "91000A", extracted: null }).publiclyFunded, true);
  assert.equal(deriveCost({ contract: "NULL", extracted: null }).publiclyFunded, false);
  assert.equal(deriveCost({ contract: null, extracted: null }).publiclyFunded, false);
});

test("a paid provider is still reported as publicly funded", () => {
  const c = deriveCost({
    contract: "X1", programArea: "Beacon",
    extracted: { costTier: "paid", method: "gemini" },
  });
  assert.equal(c.tier, "paid");
  assert.equal(c.publiclyFunded, true);
});
