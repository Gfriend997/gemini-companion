import fs from "node:fs";
import path from "node:path";

import { scrub } from "./scrub.mjs";
import { TOKEN_PRICES } from "./gemini.mjs";

export const DEFAULT_ASK_MODEL = "gemini-3.8-flash";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const MODEL_RE = /^[A-Za-z0-9._-]+$/;
const MAX_FILES = 5;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const TEXT_EXTENSIONS = new Set([
  ".txt", ".md", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".py", ".java", ".go", ".rs", ".cs",
  ".c", ".cc", ".cpp", ".h", ".hpp", ".json", ".yaml", ".yml", ".xml", ".html", ".css", ".sh", ".ps1", ".sql"
]);

function secretShaped(value) {
  return scrub(value) !== value;
}

export function validateAttachmentPath(file) {
  const name = path.basename(file).toLowerCase();
  if (name.startsWith(".env") || name.endsWith(".pem") || name.startsWith("id_rsa") || /key.*store/.test(name)) {
    throw new Error(`refusing credential-shaped attachment path: ${file}`);
  }
}

function imageMime(buffer) {
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  return null;
}

export function loadAttachments(filePaths = []) {
  if (filePaths.length > MAX_FILES) throw new Error(`at most ${MAX_FILES} files may be attached`);
  let total = 0;
  return filePaths.map((file) => {
    validateAttachmentPath(file);
    const stat = fs.statSync(file);
    if (!stat.isFile()) throw new Error(`attachment is not a file: ${file}`);
    total += stat.size;
    if (total > MAX_ATTACHMENT_BYTES) throw new Error("attachments exceed 10MB total");
    const buffer = fs.readFileSync(file);
    const ext = path.extname(file).toLowerCase();
    if (ext === ".png" || ext === ".jpg" || ext === ".jpeg") {
      const mimeType = imageMime(buffer);
      const expected = ext === ".png" ? "image/png" : "image/jpeg";
      if (mimeType !== expected) throw new Error(`attachment extension does not match image magic bytes: ${file}`);
      return { inlineData: { mimeType, data: buffer.toString("base64") } };
    }
    if (!TEXT_EXTENSIONS.has(ext)) throw new Error(`unsupported attachment type: ${file}`);
    const text = buffer.toString("utf8");
    if (secretShaped(text)) throw new Error(`refusing secret-shaped text attachment: ${file}`);
    return { text, fileName: path.basename(file) };
  });
}

export function buildAskRequest({ prompt, attachments = [], live = false } = {}) {
  if (secretShaped(prompt)) throw new Error("refusing secret-shaped prompt");
  const parts = [{ text: prompt }];
  for (const attachment of attachments) {
    if (attachment.text !== undefined) parts.push({ text: `File: ${attachment.fileName}\n\n${attachment.text}` });
    else if (attachment.inlineData) parts.push({ inlineData: attachment.inlineData });
  }
  const body = { contents: [{ parts }] };
  if (live) body.tools = [{ google_search: {} }];
  return body;
}

export function extractGroundingUrls(metadata) {
  const fromString = (value, urls) => {
    for (const match of value.matchAll(/https?:\/\/[^\s"'<>]+/g)) urls.add(match[0].replace(/[),.;]+$/, ""));
  };
  // Prefer values under uri/url keys — a full-text walk also catches namespace
  // and query-plumbing URLs that are not sources.
  const keyed = new Set();
  const all = new Set();
  const visit = (value, key) => {
    if (typeof value === "string") {
      fromString(value, all);
      if (/^(uri|url)$/i.test(key || "")) fromString(value, keyed);
    } else if (Array.isArray(value)) value.forEach((v) => visit(v, key));
    else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) visit(v, k);
  };
  visit(metadata);
  return [...(keyed.size ? keyed : all)];
}

function neutralizeSentinels(text) {
  return text.replace(/--- (BEGIN|END) UNTRUSTED EXTERNAL CONTENT ---/gi, (_match, edge) => `--- ${edge} UNTRUSTED EXTERNAL\u200b CONTENT ---`);
}

export function formatAskResponse({ text, live, groundingMetadata } = {}) {
  if (!live) return text;
  const urls = extractGroundingUrls(groundingMetadata);
  const sources = urls.length ? `\n\nSources:\n${urls.map((url) => `- ${url}`).join("\n")}` : "";
  return `--- BEGIN UNTRUSTED EXTERNAL CONTENT ---\n${neutralizeSentinels(text)}${sources}\n--- END UNTRUSTED EXTERNAL CONTENT ---`;
}

export function summarizeAskCost({ model, usageMetadata } = {}) {
  const input = usageMetadata?.promptTokenCount;
  const output = usageMetadata?.candidatesTokenCount;
  const thoughts = usageMetadata?.thoughtsTokenCount;
  const fmt = (n) => (Number.isFinite(n) ? n.toLocaleString("en-US") : "n/a");
  // modelVersion may carry a point-release suffix (e.g. gemini-3.7-flash-001);
  // token counts always print, only cost degrades to n/a on an unknown price.
  const price = TOKEN_PRICES[model] || TOKEN_PRICES[String(model).replace(/-(\d{3}|preview.*|latest)$/, "")];
  const cost = price && Number.isFinite(input) && Number.isFinite(output)
    ? `$${((input / 1_000_000) * price.input + (output / 1_000_000) * price.output).toFixed(3)}`
    : "n/a";
  return `Gemini served ${model} | input ${fmt(input)} | output ${fmt(output)} | thought ${fmt(thoughts)} | estimated cost ${cost}`;
}

export async function askGemini({ prompt, files = [], live = false, model = DEFAULT_ASK_MODEL } = {}) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY not set in the environment. Export it as an OS-level environment variable and restart Claude Code — never a .env file.");
  if (!MODEL_RE.test(model)) throw new Error(`invalid model name: ${model}`);
  const body = buildAskRequest({ prompt, attachments: loadAttachments(files), live });
  const res = await fetch(`${API_BASE}/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Gemini API ${res.status}: ${scrub((await res.text()).slice(0, 1000))}`);
  const response = await res.json();
  const text = response?.candidates?.[0]?.content?.parts?.filter((part) => typeof part.text === "string").map((part) => part.text).join("\n") || "";
  return {
    text: formatAskResponse({ text, live, groundingMetadata: response?.candidates?.[0]?.groundingMetadata }),
    cost: summarizeAskCost({ model: response?.modelVersion || model, usageMetadata: response?.usageMetadata })
  };
}
