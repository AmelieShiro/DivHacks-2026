/**
 * Response parsing for the Interactions API.
 *
 * The shape below is a real reply captured from a live call. The quickstart
 * docs describe `interaction.output_text`, which does not exist — parsing
 * against the docs returned null for every call, and those nulls would have
 * been cached across ~800 calls of a full run.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { outputText, toResult } from "../lib/gemini.mjs";

const live = (text) => ({
  id: "v1_x", status: "completed", object: "interaction",
  model: "gemini-3.8-flash",
  steps: [
    { type: "thought", signature: "abc" },
    { type: "model_output", content: [{ type: "text", text }] },
  ],
});

test("reads text from the live steps shape", () => {
  assert.equal(outputText(live('{"ok": true}')), '{"ok": true}');
});

test("skips thought steps", () => {
  const r = { steps: [{ type: "thought", signature: "s" }] };
  assert.equal(outputText(r), null);
});

test("joins multiple text parts in one model_output", () => {
  const r = { steps: [{ type: "model_output", content: [
    { type: "text", text: '{"a":' }, { type: "text", text: "1}" }] }] };
  assert.equal(outputText(r), '{"a":1}');
});

test("ignores non-text content parts", () => {
  const r = { steps: [{ type: "model_output", content: [
    { type: "image", data: "..." }, { type: "text", text: "hi" }] }] };
  assert.equal(outputText(r), "hi");
});

test("takes the last model_output when several are present", () => {
  const r = { steps: [
    { type: "model_output", content: [{ type: "text", text: "first" }] },
    { type: "thought" },
    { type: "model_output", content: [{ type: "text", text: "last" }] },
  ] };
  assert.equal(outputText(r), "last");
});

test("still accepts the documented and legacy shapes", () => {
  assert.equal(outputText({ interaction: { output_text: "a" } }), "a");
  assert.equal(outputText({ output_text: "b" }), "b");
  assert.equal(
    outputText({ candidates: [{ content: { parts: [{ text: "c" }] } }] }), "c");
});

test("returns null for an unrecognised shape", () => {
  assert.equal(outputText({ unexpected: true }), null);
  assert.equal(outputText(null), null);
});

test("toResult parses JSON out of the live shape", () => {
  assert.deepEqual(toResult(live('{"ok": true}')).data, { ok: true });
});

test("toResult recovers JSON wrapped in prose or a fence", () => {
  assert.deepEqual(toResult(live('```json\n{"ok": true}\n```')).data, { ok: true });
});

test("toResult THROWS when no text is present, so nothing is cached", () => {
  // This is the guard: a shape change must fail loudly on call one, not
  // silently cache null for every call in the run.
  assert.throws(() => toResult({ unexpected: true }), /no output text/);
  assert.throws(() => toResult({ steps: [{ type: "thought" }] }), /no output text/);
});

test("toResult caches a genuine parse failure rather than throwing", () => {
  // Real text we could not use is a real answer; re-asking would not help.
  const r = toResult(live("I'm afraid I can't help with that."));
  assert.equal(r.data, null);
  assert.match(r.raw, /can't help/);
});
