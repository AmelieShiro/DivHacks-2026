/**
 * Hand-blocked websites. Every entry in blocked-domains.json is a real wrong
 * match that passed verification: the name matched, the org did not.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { hostOf, isBlocked, applyBlocklist, loadBlocklist } from "../lib/blocklist.mjs";

const BL = {
  "Bergen Basin Community Development Corporation": { domains: ["bergenbasin.com"], why: "realty" },
};
const BERGEN = "Bergen Basin Community Development Corporation";

test("hostOf normalises URLs and bare hosts alike", () => {
  assert.equal(hostOf("https://www.BergenBasin.com/listings?x=1"), "bergenbasin.com");
  assert.equal(hostOf("bergenbasin.com"), "bergenbasin.com");
  assert.equal(hostOf(""), null);
  assert.equal(hostOf(null), null);
});

test("blocks the domain, its www form and subdomains, for that provider only", () => {
  assert.equal(isBlocked(BL, BERGEN, "https://www.bergenbasin.com/"), true);
  assert.equal(isBlocked(BL, BERGEN, "http://listings.bergenbasin.com/a"), true);
  assert.equal(isBlocked(BL, BERGEN, "bergenbasin.org"), false);
  assert.equal(isBlocked(BL, BERGEN, "notbergenbasin.com"), false, "suffix without a dot is a different domain");
  assert.equal(isBlocked(BL, "Someone Else", "bergenbasin.com"), false);
  assert.equal(isBlocked({}, BERGEN, "bergenbasin.com"), false);
});

test("applyBlocklist clears only blocked websites, so they are re-resolved", () => {
  const providers = [
    { provider: BERGEN, website: "https://www.bergenbasin.com/", resolvedVia: "bergenbasin.com", confidence: "strong", matchedSignals: ["bergen", "basin"] },
    { provider: "CAMBA, Inc.", website: "https://camba.org/", confidence: "strong" },
    { provider: "Unresolved", website: null, confidence: "unresolved" },
  ];
  const cleared = applyBlocklist(providers, BL);
  assert.deepEqual(cleared, [{ provider: BERGEN, website: "https://www.bergenbasin.com/", why: "realty" }]);
  assert.deepEqual(
    { website: providers[0].website, confidence: providers[0].confidence, matchedSignals: providers[0].matchedSignals },
    { website: null, confidence: "unresolved", matchedSignals: [] },
  );
  assert.equal(providers[1].website, "https://camba.org/");
});

test("the shipped blocklist parses and blocks the four confirmed wrong matches", async () => {
  const bl = await loadBlocklist();
  assert.ok(!("_comment" in bl));
  for (const [provider, url] of [
    [BERGEN, "https://www.bergenbasin.com/"],
    ["Italian American Civil Rights League Canarsie Inc", "https://italianamerican.com/"],
    ["Sunset Park Health Council Inc", "https://www.sunsetpark.org/"],
    ["82nd Street Academics", "https://82ndstreet.org/"],
  ]) {
    assert.equal(isBlocked(bl, provider, url), true, provider);
  }
  for (const [provider, entry] of Object.entries(bl)) {
    assert.ok(entry.domains?.length && entry.why, `${provider} needs domains and a reason`);
  }
});

test("a missing blocklist file means nothing is blocked", async () => {
  assert.deepEqual(await loadBlocklist("/nonexistent/blocked-domains.json"), {});
});
