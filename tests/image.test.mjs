import { test } from "node:test";
import assert from "node:assert/strict";
import { parseImageResponse } from "../scripts/lib/image.mjs";

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64");

test("parses inline image data from response", () => {
  const body = {
    candidates: [{ content: { parts: [
      { text: "here is your image" },
      { inlineData: { mimeType: "image/png", data: png } }
    ] } }]
  };
  const res = parseImageResponse(body);
  assert.equal(res.mimeType, "image/png");
  assert.equal(res.data[0], 0x89);
  assert.equal(res.text, "here is your image");
});

test("throws with block reason when prompt blocked", () => {
  assert.throws(
    () => parseImageResponse({ promptFeedback: { blockReason: "SAFETY" } }),
    /blocked: SAFETY/
  );
});

test("throws with model text when no image returned", () => {
  const body = { candidates: [{ content: { parts: [{ text: "cannot draw that" }] } }] };
  assert.throws(() => parseImageResponse(body), /cannot draw that/);
});
