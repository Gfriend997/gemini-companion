import { test } from "node:test";
import assert from "node:assert/strict";
import { scrub, scrubDeep } from "../scripts/lib/scrub.mjs";

test("masks Google API key pattern", () => {
  const fake = "AIza" + "A".repeat(35);
  assert.equal(scrub(`the key is ${fake} ok`), "the key is [REDACTED] ok");
});

test("masks labeled long tokens", () => {
  const s = scrub('token="abcdefghijklmnopqrstuvwxyz123456"');
  assert.ok(!s.includes("abcdefghijklmnopqrstuvwxyz123456"));
  assert.ok(s.includes("[REDACTED]"));
});

test("masks live env key value if present in text", () => {
  process.env.GEMINI_API_KEY = "test-secret-value-123";
  assert.equal(scrub("oops test-secret-value-123 leaked"), "oops [REDACTED] leaked");
  delete process.env.GEMINI_API_KEY;
});

test("leaves normal text alone", () => {
  assert.equal(scrub("hello world, review src/main.ts"), "hello world, review src/main.ts");
});

test("scrubDeep walks objects and arrays", () => {
  const fake = "AIza" + "B".repeat(35);
  const out = scrubDeep({ a: [fake], b: { c: fake }, n: 5 });
  assert.deepEqual(out, { a: ["[REDACTED]"], b: { c: "[REDACTED]" }, n: 5 });
});
