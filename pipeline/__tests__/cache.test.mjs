/**
 * Guards the bug where transient network failures were cached forever, so a
 * provider that blipped once could never resolve on a later run.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { cached } from "../lib/cache.mjs";
import { isDefinitive } from "../lib/http.mjs";

const NS = "__test__";

test("isDefinitive keeps permanent outcomes", () => {
  assert.ok(isDefinitive({ ok: true, status: 200 }));
  assert.ok(isDefinitive({ ok: false, status: 404 }));
  assert.ok(isDefinitive({ ok: false, status: 403 }));
  assert.ok(isDefinitive({ ok: false, status: 0, error: "robots" }));
  assert.ok(isDefinitive({ ok: false, status: 0, error: "bad url" }));
});

test("isDefinitive rejects transient outcomes", () => {
  assert.equal(isDefinitive({ ok: false, status: 0, error: "fetch failed" }), false);
  assert.equal(isDefinitive({ ok: false, status: 0, error: "aborted due to timeout" }), false);
  assert.equal(isDefinitive({ ok: false, status: 500 }), false);
  assert.equal(isDefinitive({ ok: false, status: 502 }), false);
  assert.equal(isDefinitive({ ok: false, status: 429 }), false);
  assert.equal(isDefinitive({ ok: false, status: 408 }), false);
});

test("a rejected value is not written, so the next run retries", async () => {
  const k = [randomUUID()];
  let calls = 0;
  const produce = async () => { calls += 1; return { ok: false, status: 0, error: "fetch failed" }; };
  await cached(NS, k, produce, { shouldCache: isDefinitive });
  await cached(NS, k, produce, { shouldCache: isDefinitive });
  assert.equal(calls, 2, "transient failure must not be served from cache");
});

test("an accepted value is written and served from cache", async () => {
  const k = [randomUUID()];
  let calls = 0;
  const produce = async () => { calls += 1; return { ok: true, status: 200, body: "hi" }; };
  const first = await cached(NS, k, produce, { shouldCache: isDefinitive });
  const second = await cached(NS, k, produce, { shouldCache: isDefinitive });
  assert.equal(calls, 1);
  assert.equal(first.fromCache, false);
  assert.equal(second.fromCache, true);
  assert.equal(second.body, "hi");
});

test("an entry cached under a looser policy is ignored on read", async () => {
  const k = [randomUUID()];
  // Written when everything was cacheable...
  await cached(NS, k, async () => ({ ok: false, status: 0, error: "fetch failed" }));
  // ...and must be re-fetched once the policy tightens, with no manual purge.
  let recomputed = false;
  const res = await cached(
    NS, k,
    async () => { recomputed = true; return { ok: true, status: 200, body: "recovered" }; },
    { shouldCache: isDefinitive },
  );
  assert.ok(recomputed, "poisoned entry should self-heal");
  assert.equal(res.body, "recovered");
});
