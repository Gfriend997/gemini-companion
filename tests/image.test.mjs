import { test } from "node:test";
import assert from "node:assert/strict";
import { parseImageResponse, resolveImageModel } from "../scripts/lib/image.mjs";

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

test("maps --hq to the Pro image model and rejects model conflicts", () => {
  assert.equal(resolveImageModel({ hq: true }), "gemini-3-pro-image");
  assert.equal(resolveImageModel({}), "gemini-2.5-flash-image");
  assert.throws(() => resolveImageModel({ hq: true, model: "gemini-2.5-flash-image" }), /cannot be combined/);
});
