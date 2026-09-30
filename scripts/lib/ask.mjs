import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";

import { scrub } from "./scrub.mjs";
import { TOKEN_PRICES } from "./gemini.mjs";

export const DEFAULT_ASK_MODEL = "gemini-3.8-flash";
const API_HOST = "generativelanguage.googleapis.com";
const API_BASE = `https://${API_HOST}/v1beta`;
const UPLOAD_BASE = `https://${API_HOST}/upload/v1beta`;
const MODEL_RE = /^[A-Za-z0-9._-]+$/;
const FILE_NAME_RE = /^files\/[A-Za-z0-9_-]+$/;
const MAX_FILES = 5;
const MB = 1_000_000;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_PDF_BYTES = 50 * MB;
const MAX_AV_BYTES = 2000 * MB;
export const INLINE_LIMIT_BYTES = 15 * MB;
const SHORT_TIMEOUT_MS = 60_000;
const UPLOAD_TIMEOUT_MS = 30 * 60_000;
const GENERATE_TIMEOUT_MS = 10 * 60_000;
const PROCESSING_DEADLINE_MS = 10 * 60_000;
const POLL_INTERVAL_MS = 2_000;
export const MEDIA_PRIVACY_NOTE = "note: media sent to Google Gemini; on the free tier Google may use it to improve its products. Do not send private or client media.";
const TEXT_EXTENSIONS = new Set([
  ".txt", ".md", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".py", ".java", ".go", ".rs", ".cs",
  ".c", ".cc", ".cpp", ".h", ".hpp", ".json", ".yaml", ".yml", ".xml", ".html", ".css", ".sh", ".ps1", ".sql"
]);
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg"]);

const ascii = (buf, offset, str) => buf.subarray(offset, offset + str.length).toString("latin1") === str;
const ftyp = (b) => ascii(b, 4, "ftyp");
const riff = (form) => (b) => ascii(b, 0, "RIFF") && ascii(b, 8, form);
const ogg = (b) => ascii(b, 0, "OggS");
const mpegPs = (b) => b[0] === 0 && b[1] === 0 && b[2] === 1 && (b[3] === 0xba || b[3] === 0xb3);
const MEDIA_TYPES = {
  ".pdf": { mimeType: "application/pdf", max: MAX_PDF_BYTES, magic: (b) => ascii(b, 0, "%PDF-") },
  ".mp4": { mimeType: "video/mp4", max: MAX_AV_BYTES, magic: ftyp },
  ".mov": { mimeType: "video/quicktime", max: MAX_AV_BYTES, magic: ftyp },
  ".3gp": { mimeType: "video/3gpp", max: MAX_AV_BYTES, magic: ftyp },
  ".webm": { mimeType: "video/webm", max: MAX_AV_BYTES, magic: (b) => b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3 },
  ".avi": { mimeType: "video/avi", max: MAX_AV_BYTES, magic: riff("AVI ") },
  ".mpeg": { mimeType: "video/mpeg", max: MAX_AV_BYTES, magic: mpegPs },
  ".mpg": { mimeType: "video/mpeg", max: MAX_AV_BYTES, magic: mpegPs },
  ".mp3": { mimeType: "audio/mp3", max: MAX_AV_BYTES, magic: (b) => ascii(b, 0, "ID3") || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) },
  ".wav": { mimeType: "audio/wav", max: MAX_AV_BYTES, magic: riff("WAVE") },
  ".m4a": { mimeType: "audio/m4a", max: MAX_AV_BYTES, magic: ftyp },
  ".aac": { mimeType: "audio/aac", max: MAX_AV_BYTES, magic: (b) => b[0] === 0xff && (b[1] === 0xf1 || b[1] === 0xf9) },
  ".ogg": { mimeType: "audio/ogg", max: MAX_AV_BYTES, magic: ogg },
  ".opus": { mimeType: "audio/opus", max: MAX_AV_BYTES, magic: ogg },
  ".flac": { mimeType: "audio/flac", max: MAX_AV_BYTES, magic: (b) => ascii(b, 0, "fLaC") }
};

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

function readFd(fd, length) {
  const buffer = Buffer.alloc(length);
  let offset = 0;
  while (offset < length) {
    const n = fs.readSync(fd, buffer, offset, length - offset, offset);
    if (n === 0) break;
    offset += n;
  }
  return buffer.subarray(0, offset);
}

export function closeAttachments(attachments = []) {
  for (const attachment of attachments) {
    if (attachment.media?.fd === undefined) continue;
    try { fs.closeSync(attachment.media.fd); } catch { /* already closed */ }
    attachment.media.fd = undefined;
  }
}

// Media attachments keep their fd open so the magic check, inline read, and upload
// stream all use the one file that was checked. Callers must closeAttachments().
export function loadAttachments(filePaths = []) {
  if (filePaths.length > MAX_FILES) throw new Error(`at most ${MAX_FILES} files may be attached`);
  let inlineTotal = 0;
  const loaded = [];
  try {
    for (const file of filePaths) {
      validateAttachmentPath(file);
      const ext = path.extname(file).toLowerCase();
      const media = MEDIA_TYPES[ext];
      if (!media && !IMAGE_EXTENSIONS.has(ext) && !TEXT_EXTENSIONS.has(ext)) throw new Error(`unsupported attachment type: ${file}`);
      const link = fs.lstatSync(file);
      if (link.isSymbolicLink()) throw new Error(`refusing symlinked attachment: ${file}`);
      if (!link.isFile()) throw new Error(`attachment is not a regular file: ${file}`);
      const fd = fs.openSync(file, "r");
      let keep = false;
      try {
        const stat = fs.fstatSync(fd);
        if (!stat.isFile() || stat.ino !== link.ino || stat.dev !== link.dev) throw new Error(`attachment changed while opening: ${file}`);
        if (media) {
          if (stat.size > media.max) throw new Error(`attachment exceeds ${media.max / MB}MB limit for ${ext}: ${file}`);
          if (!media.magic(readFd(fd, 16))) throw new Error(`attachment extension does not match ${ext} magic bytes: ${file}`);
          loaded.push({ media: { mimeType: media.mimeType, fd, size: stat.size, fileName: path.basename(file) } });
          keep = true;
          continue;
        }
        inlineTotal += stat.size;
        if (inlineTotal > MAX_ATTACHMENT_BYTES) throw new Error("text and image attachments exceed 10MB total");
        const buffer = readFd(fd, stat.size);
        if (IMAGE_EXTENSIONS.has(ext)) {
          const mimeType = imageMime(buffer);
          const expected = ext === ".png" ? "image/png" : "image/jpeg";
          if (mimeType !== expected) throw new Error(`attachment extension does not match image magic bytes: ${file}`);
          loaded.push({ inlineData: { mimeType, data: buffer.toString("base64") } });
          continue;
        }
        const text = buffer.toString("utf8");
        if (secretShaped(text)) throw new Error(`refusing secret-shaped text attachment: ${file}`);
        loaded.push({ text, fileName: path.basename(file) });
      } finally {
        if (!keep) fs.closeSync(fd);
      }
    }
  } catch (err) {
    closeAttachments(loaded);
    throw err;
  }
  return loaded;
}

export function buildAskRequest({ prompt, attachments = [], live = false } = {}) {
  if (secretShaped(prompt)) throw new Error("refusing secret-shaped prompt");
  const parts = [{ text: prompt }];
  for (const attachment of attachments) {
    if (attachment.text !== undefined) parts.push({ text: `File: ${attachment.fileName}\n\n${attachment.text}` });
    else if (attachment.inlineData) parts.push({ inlineData: attachment.inlineData });
    else if (attachment.fileData) parts.push({ fileData: attachment.fileData });
  }
  const body = { contents: [{ parts }] };
  if (live) body.tools = [{ google_search: {} }];
  return body;
}

// Exact serialized request size if every media file were sent inline as base64.
export function estimateRequestBytes({ prompt, attachments = [], live = false } = {}) {
  let base64 = 0;
  const placeholders = attachments.map((attachment) => {
    if (!attachment.media) return attachment;
    base64 += Math.ceil(attachment.media.size / 3) * 4;
    return { inlineData: { mimeType: attachment.media.mimeType, data: "" } };
  });
  return Buffer.byteLength(JSON.stringify(buildAskRequest({ prompt, attachments: placeholders, live }))) + base64;
}

export function checkUploadUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error("Gemini upload start returned no valid upload URL"); }
  if (url.protocol !== "https:" || url.hostname !== API_HOST || url.username || url.password || url.port) {
    throw new Error("Gemini upload start returned an unexpected upload destination; aborting before sending bytes");
  }
  return url.href;
}

async function apiError(step, res) {
  return new Error(`Gemini ${step} ${res.status}: ${scrub((await res.text().catch(() => "")).slice(0, 1000))}`);
}

async function send(deps, step, url, init) {
  try {
    return await deps.fetch(url, { redirect: "error", ...init });
  } catch (err) {
    // err.message is omitted on purpose: network errors can echo the request URL.
    throw new Error(`Gemini ${step} request failed (${err?.name || "Error"}${err?.cause?.code ? ` ${err.cause.code}` : ""})`);
  }
}

async function uploadMedia(media, key, deps, uploaded) {
  const displayName = media.fileName.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 100);
  const start = await send(deps, "upload start", `${UPLOAD_BASE}/files`, {
    method: "POST",
    signal: AbortSignal.timeout(SHORT_TIMEOUT_MS),
    headers: {
      "x-goog-api-key": key,
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(media.size),
      "X-Goog-Upload-Header-Content-Type": media.mimeType,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ file: { display_name: displayName } })
  });
  if (!start.ok) throw await apiError("upload start", start);
  const uploadUrl = checkUploadUrl(start.headers.get("x-goog-upload-url"));
  // The upload URL carries its own session token, so the key is not sent to it.
  const res = await send(deps, "upload", uploadUrl, {
    method: "POST",
    duplex: "half",
    signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
    headers: { "Content-Length": String(media.size), "X-Goog-Upload-Offset": "0", "X-Goog-Upload-Command": "upload, finalize" },
    body: Readable.toWeb(fs.createReadStream(null, { fd: media.fd, start: 0, autoClose: false }))
  });
  if (!res.ok) throw await apiError("upload", res);
  const file = (await res.json())?.file;
  if (typeof file?.name !== "string" || !FILE_NAME_RE.test(file.name)) throw new Error("Gemini upload returned an invalid file name");
  uploaded.push(file.name);
  if (typeof file.uri !== "string" || !file.uri.startsWith(`https://${API_HOST}/`)) throw new Error("Gemini upload returned an unexpected file URI");
  return file;
}

async function waitForActive(file, key, deps) {
  const deadline = deps.now() + PROCESSING_DEADLINE_MS;
  let state = file.state;
  while (state !== "ACTIVE") {
    if (state === "FAILED") throw new Error(`Gemini failed to process uploaded ${file.name}`);
    if (deps.now() >= deadline) throw new Error(`Gemini did not finish processing ${file.name} within 10 minutes`);
    await deps.sleep(POLL_INTERVAL_MS);
    const res = await send(deps, "file status", `${API_BASE}/${file.name}`, {
      headers: { "x-goog-api-key": key },
      signal: AbortSignal.timeout(SHORT_TIMEOUT_MS)
    });
    if (!res.ok) throw await apiError("file status", res);
    state = (await res.json())?.state;
  }
}

// Best-effort: each file gets its own attempt; failures warn and never throw.
export async function deleteUploads(names, key, deps) {
  for (const name of names.splice(0)) {
    try {
      const res = await send(deps, "file delete", `${API_BASE}/${name}`, {
        method: "DELETE",
        headers: { "x-goog-api-key": key },
        signal: AbortSignal.timeout(SHORT_TIMEOUT_MS)
      });
      if (!res.ok) throw await apiError("file delete", res);
    } catch (err) {
      deps.warn(`warning: could not delete uploaded ${name} (Google auto-expires it within 48h): ${err.message}`);
    }
  }
}

const DEFAULT_DEPS = {
  fetch: (...args) => globalThis.fetch(...args),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => Date.now(),
  warn: (line) => process.stderr.write(`${scrub(line)}\n`),
  inlineLimit: INLINE_LIMIT_BYTES
};

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
  return text.replace(/--- (BEGIN|END) UNTRUSTED EXTERNAL CONTENT ---/gi, (_match, edge) => `--- ${edge} UNTRUSTED EXTERNAL​ CONTENT ---`);
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

// overrides (fetch, sleep, now, warn, inlineLimit) exist for tests.
export async function askGemini({ prompt, files = [], live = false, model = DEFAULT_ASK_MODEL } = {}, overrides = {}) {
  const deps = { ...DEFAULT_DEPS, ...overrides };
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY not set in the environment. Export it as an OS-level environment variable and restart Claude Code — never a .env file.");
  if (!MODEL_RE.test(model)) throw new Error(`invalid model name: ${model}`);
  if (secretShaped(prompt)) throw new Error("refusing secret-shaped prompt");
  const attachments = loadAttachments(files);
  const uploaded = [];
  const onSignal = () => { deleteUploads(uploaded, key, deps).finally(() => process.exit(130)); };
  let signalsInstalled = false;
  try {
    const hasMedia = attachments.some((attachment) => attachment.media);
    if (hasMedia) deps.warn(MEDIA_PRIVACY_NOTE);
    const inline = estimateRequestBytes({ prompt, attachments, live }) <= deps.inlineLimit;
    if (hasMedia && !inline) {
      process.once("SIGINT", onSignal);
      process.once("SIGTERM", onSignal);
      signalsInstalled = true;
    }
    const parts = [];
    for (const attachment of attachments) {
      const media = attachment.media;
      if (!media) parts.push(attachment);
      else if (inline) parts.push({ inlineData: { mimeType: media.mimeType, data: readFd(media.fd, media.size).toString("base64") } });
      else {
        const file = await uploadMedia(media, key, deps, uploaded);
        await waitForActive(file, key, deps);
        parts.push({ fileData: { mimeType: media.mimeType, fileUri: file.uri } });
      }
    }
    const res = await send(deps, "generateContent", `${API_BASE}/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      signal: AbortSignal.timeout(GENERATE_TIMEOUT_MS),
      body: JSON.stringify(buildAskRequest({ prompt, attachments: parts, live }))
    });
    if (!res.ok) throw new Error(`Gemini API ${res.status}: ${scrub((await res.text()).slice(0, 1000))}`);
    const response = await res.json();
    const text = response?.candidates?.[0]?.content?.parts?.filter((part) => typeof part.text === "string").map((part) => part.text).join("\n") || "";
    return {
      text: formatAskResponse({ text, live, groundingMetadata: response?.candidates?.[0]?.groundingMetadata }),
      cost: summarizeAskCost({ model: response?.modelVersion || model, usageMetadata: response?.usageMetadata })
    };
  } finally {
    if (signalsInstalled) {
      process.off("SIGINT", onSignal);
      process.off("SIGTERM", onSignal);
    }
    await deleteUploads(uploaded, key, deps);
    closeAttachments(attachments);
  }
}
