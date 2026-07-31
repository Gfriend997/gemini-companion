import fs from "node:fs";
import path from "node:path";

// Image generation goes straight to the Gemini API. The key is read from the
// environment at call time and sent only as a request header — never as a
// query parameter (query strings end up in server and proxy logs), never on disk.

export const DEFAULT_IMAGE_MODEL = "gemini-2.5-flash-image";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const MODEL_RE = /^[A-Za-z0-9._-]+$/;

export function parseImageResponse(body) {
  const parts = body?.candidates?.[0]?.content?.parts ?? [];
  const image = parts.find((p) => p.inlineData?.data);
  const text = parts.filter((p) => p.text).map((p) => p.text).join("\n");
  if (!image) {
    const block = body?.promptFeedback?.blockReason;
    throw new Error(block ? `request blocked: ${block}` : `no image in response${text ? `; model said: ${text.slice(0, 500)}` : ""}`);
  }
  return { data: Buffer.from(image.inlineData.data, "base64"), mimeType: image.inlineData.mimeType || "image/png", text };
}

export async function generateImage({ prompt, model = DEFAULT_IMAGE_MODEL, out }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error(
      "GEMINI_API_KEY not set in the environment. Export it as an OS-level environment variable and restart Claude Code — never a .env file."
    );
  }
  if (!MODEL_RE.test(model)) throw new Error(`invalid model name: ${model}`);

  const res = await fetch(`${API_BASE}/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
  });
  if (!res.ok) {
    const errText = (await res.text()).slice(0, 1000);
    throw new Error(`Gemini API ${res.status}: ${errText}`);
  }
  const { data, mimeType, text } = parseImageResponse(await res.json());

  const ext = mimeType.includes("jpeg") ? "jpg" : "png";
  const file = out
    ? path.resolve(out)
    : path.resolve(`gemini-image-${new Date().toISOString().replace(/[:.]/g, "-")}.${ext}`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
  return { file, mimeType, text };
}
