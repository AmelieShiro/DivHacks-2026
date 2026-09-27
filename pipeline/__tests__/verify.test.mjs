/**
 * Regression tests for stage 20's domain verifier.
 *
 * Every case here is a false positive that actually reached the dataset
 * during development. If one starts passing again, the guard has regressed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { verify, knownFor, providerKey } from "../stages/20-resolve.mjs";

const call = ({ text, host, finalUrl, signals }) =>
  verify({
    identity: text.toLowerCase(),
    text,
    host,
    finalUrl: finalUrl ?? `https://${host}/`,
    signals,
    html: text,
  });

test("accepts a page that names the organization and mentions NYC", () => {
  const got = call({
    text: "CAMBA is a Brooklyn, New York nonprofit serving families across the city with after-school programs and housing support for local residents.",
    host: "camba.org",
    signals: ["camba"],
  });
  assert.ok(got, "expected a match");
  assert.equal(got.confidence, "strong");
});

test("rejects a parked domain even when it answers 200", () => {
  assert.equal(
    call({
      text: "youngdancers.com is for sale. Buy this domain today. New York.",
      host: "youngdancers.com",
      signals: ["young", "dancers", "repertory"],
    }),
    null,
  );
});

test("rejects a redirect to a domain broker", () => {
  assert.equal(
    call({
      text: "Young Dancers In Repertory New York dance company profile page listing",
      host: "youngdancers.com",
      finalUrl: "https://www.hugedomains.com/domain_profile.cfm?d=youngdancers.com",
      signals: ["young", "dancers", "repertory"],
    }),
    null,
  );
});

test("rejects an out-of-state org with a similar name", () => {
  // goddard.org is a Vermont college, not Goddard Riverside in Manhattan.
  assert.equal(
    call({
      text: "Goddard College is a progressive liberal arts college in Plainfield, Vermont offering low-residency degree programs to students nationwide.",
      host: "goddard.org",
      signals: ["goddard", "riverside"],
    }),
    null,
  );
});

test("rejects a match on a generic word alone", () => {
  // brooklyn.org is a different charity; "brooklyn" proves nothing.
  assert.equal(
    call({
      text: "The Brooklyn Community Foundation invests in Brooklyn, New York neighborhoods through grants to local organizations across the borough.",
      host: "brooklyn.org",
      signals: ["brooklyn", "defender"],
    }),
    null,
  );
});

test("rejects a substantive page that never mentions New York", () => {
  // Must exceed the short-page threshold, or the SPA fallback applies.
  const wa = [
    "Sunnyside Community Services is a department of the City of Sunnyside,",
    "Washington, providing recreation, aquatics and senior programs to residents",
    "of Yakima County. Our staff operate the municipal pool, the senior center and",
    "a range of seasonal youth activities throughout the year. Registration for",
    "summer programming opens in April at city hall or online. Fees are waived for",
    "qualifying households. Contact the parks department for schedules, facility",
    "rentals, and volunteer opportunities across all of our community locations.",
  ].join(" ");
  assert.ok(wa.length > 400, "fixture must be long enough to be judged");
  assert.equal(
    call({ text: wa, host: "sunnyside-wa.gov", signals: ["sunnyside", "community", "services"] }),
    null,
  );
});

test("KNOWN LIMITATION: a short out-of-state page bypasses the NYC check", () => {
  // looksNewYork() skips pages under 400 chars so client-rendered sites are
  // not lost. The cost is that a brief page for a same-named org elsewhere
  // can pass on name evidence alone. Pinned so the tradeoff stays visible;
  // tighten by lowering the threshold or requiring a stronger name match.
  const short = "Sunnyside Community Services, Yakima County, Washington.";
  assert.ok(short.length < 400);
  assert.ok(
    call({ text: short, host: "sunnyside-wa.gov", signals: ["sunnyside", "community", "services"] }),
    "documents current behaviour, not desired behaviour",
  );
});

test("does not require NYC markers on a client-rendered page with no text", () => {
  // SPA shells ship almost no body text; rejecting them loses real orgs.
  const got = call({
    text: "Phipps Neighborhoods",
    host: "phippsny.org",
    signals: ["phipps", "neighborhoods"],
  });
  assert.ok(got, "short SPA page with a strong name match should pass");
});

test("accepts an acronym domain corroborated by a distinctive word", () => {
  const got = call({
    text: "NYJTL, the New York Junior Tennis and Learning league, runs free youth tennis programs across the Bronx and Queens.",
    host: "nyjtl.org",
    signals: ["junior", "tennis", "league"],
  });
  assert.ok(got);
});

const CHILD_CENTER = "Child Center of NY | Family Services Queens | 118-35 Queens Boulevard, Forest Hills, NY 11375";

test("a generated domain cannot pass on weak name words alone", () => {
  assert.equal(call({ text: CHILD_CENTER, host: "childcenter.org", signals: ["child"] }), null);
});

test("a hand-curated domain passes on a majority name match of weak words", () => {
  // childcenterny.org was in known-domains.json but could never verify,
  // because "child" is the only signal and it is a weak word.
  const got = verify({
    identity: CHILD_CENTER.toLowerCase(), text: CHILD_CENTER, host: "childcenterny.org",
    finalUrl: "https://www.childcenterny.org/", signals: ["child"], html: CHILD_CENTER, curated: true,
  });
  assert.ok(got);
});

test("a hand-curated domain can match the name in the page body", () => {
  const body = "Simpson St. Development Association, 997 E. 163rd St., Bronx, NY 10459";
  const got = verify({
    identity: "sisda's home page", text: body, host: "sisda.org", finalUrl: "https://sisda.org/",
    signals: ["simpson", "street", "development"], html: body, curated: true,
  });
  assert.ok(got);
});

test("a hand-curated domain is still rejected when parked", () => {
  const text = "fiao.org is for sale. Buy this domain. Brooklyn, New York.";
  assert.equal(verify({
    identity: text.toLowerCase(), text, host: "fiao.org", finalUrl: "https://fiao.org/",
    signals: ["federation", "italian", "american"], html: text, curated: true,
  }), null);
});

test("known-domains keys match DYCD's spelling variants", () => {
  const known = {
    "Catholic Charities Community Services, Archdiocese of New York": ["catholiccharitiesny.org"],
    "Women's Housing and Economic Development Corporation": ["whedco.org"],
    "Shorefront YM-YWHA of Brighton-Manhattan Beach, Inc.": ["shorefronty.org"],
  };
  assert.deepEqual(knownFor(known, "Catholic Charities Community Services, Archdiocese of NY"), ["catholiccharitiesny.org"]);
  assert.deepEqual(knownFor(known, "Women's Housing and Economic Development Corporation (WHEDCO"), ["whedco.org"]);
  assert.deepEqual(knownFor(known, "Shorefront YM-YWHA of Brighton-Manhattan Beach, Inc"), ["shorefronty.org"]);
  assert.notEqual(providerKey("Queens Community House Inc"), providerKey("Queens Community Services Inc"));
});

test("rejects when the provider name yields no signals", () => {
  assert.equal(
    call({ text: "Anything at all in New York", host: "example.org", signals: [] }),
    null,
  );
});
