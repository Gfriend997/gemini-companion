import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGeminiOutput, summarizeGeminiRun } from "../scripts/lib/gemini.mjs";

test("parses JSON output after CLI warning lines", () => {
  const output = 'Warning: True color is unavailable\n{"response":"pong","stats":{"models":{"gemini-3.5-flash":{"tokens":{"input":1000000,"candidates":500000,"thoughts":100000}}}}}';
  assert.deepEqual(parseGeminiOutput(output), {
    text: "pong",
    servedModels: ["gemini-3.5-flash"],
    stats: { models: { "gemini-3.5-flash": { tokens: { input: 1000000, candidates: 500000, thoughts: 100000 } } } }
  });
});

test("falls back to raw output when CLI JSON is malformed or has no response", () => {
  assert.deepEqual(parseGeminiOutput("not JSON"), { text: "not JSON", servedModels: [], stats: null });
  assert.deepEqual(parseGeminiOutput('{"stats":{}}'), { text: '{"stats":{}}', servedModels: [], stats: null });
});

test("summarizes token cost and warns on a substituted main model", () => {
  const summary = summarizeGeminiRun({
    requestedModel: "gemini-3.7-flash",
    stats: { models: {
      "gemini-3.5-flash": { tokens: { input: 1000000, candidates: 500000, thoughts: 100000 }, roles: { main: {} } },
      "gemini-3.1-flash-lite": { tokens: { input: 100, candidates: 20, thoughts: 5 }, roles: { utility_router: {} } }
    } }
  });
  assert.match(summary, /gemini-3\.5-flash, gemini-3\.1-flash-lite/);
  assert.match(summary, /input 1,000,100/);
  assert.match(summary, /output 500,020/);
  assert.match(summary, /thought 100,005/);
  assert.match(summary, /\$6\.000/);
  assert.match(summary, /WARNING: requested gemini-3\.7-flash but CLI served gemini-3\.5-flash/);
});

test("marks unknown-model cost unavailable", () => {
  const summary = summarizeGeminiRun({
    stats: { models: { "future-model": { tokens: { input: 1, candidates: 2, thoughts: 3 }, roles: { main: {} } } } }
  });
  assert.match(summary, /estimated cost n\/a/);
});

test("parses JSON output despite trailing non-JSON text", () => {
  const output = 'Warning: something\n{"response":"pong","stats":null}\nSession saved.';
  assert.equal(parseGeminiOutput(output).text, "pong");
});
