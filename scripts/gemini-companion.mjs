#!/usr/bin/env node
// Single entry point for the gemini-companion plugin.
// Subcommands: setup | task | task-worker | review | status | result | cancel | image
// Security invariant: GEMINI_API_KEY is only ever read from process.env by the
// image module and by the gemini CLI itself. This script never prints, stores,
// or forwards the key value anywhere.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { parseArgs } from "node:util";

import { geminiAvailable, runGemini } from "./lib/gemini.mjs";
import { companionHome, createJob, readJob, updateJob, listJobs, cancelJob } from "./lib/jobs.mjs";
import { generateImage, DEFAULT_IMAGE_MODEL } from "./lib/image.mjs";
import { scrub } from "./lib/scrub.mjs";

const SELF = fileURLToPath(import.meta.url);
const ROOT = path.dirname(path.dirname(SELF));
const MAX_DIFF_BYTES = 200 * 1024;

function fail(msg) {
  process.stderr.write(`${scrub(msg)}\n`);
  process.exit(1);
}

function out(msg) {
  process.stdout.write(`${scrub(msg)}\n`);
}

function configFile() {
  return path.join(companionHome(), "config.json");
}

function readConfig() {
  try { return JSON.parse(fs.readFileSync(configFile(), "utf8")); } catch { return {}; }
}

function writeConfig(patch) {
  fs.mkdirSync(companionHome(), { recursive: true });
  const next = { ...readConfig(), ...patch };
  fs.writeFileSync(configFile(), JSON.stringify(next, null, 2));
  return next;
}

// ---- setup ----------------------------------------------------------------

function cmdSetup(args) {
  const { values } = parseArgs({ args, options: { gate: { type: "string" } }, allowPositionals: false });
  const cliOk = geminiAvailable();
  const keyOk = Boolean(process.env.GEMINI_API_KEY);
  out(`gemini CLI: ${cliOk ? "found" : "NOT FOUND — run: npm install -g @google/gemini-cli"}`);
  out(
    `GEMINI_API_KEY: ${keyOk
      ? "present in environment (value not shown)"
      : "NOT VISIBLE — set it as an OS-level environment variable and restart Claude Code, never a .env file"}`
  );
  if (values.gate) {
    if (!["on", "off"].includes(values.gate)) fail("--gate must be on or off");
    const cfg = writeConfig({ stopReviewGate: values.gate === "on" });
    out(`stop review gate: ${cfg.stopReviewGate ? "on" : "off"}`);
  } else {
    out(`stop review gate: ${readConfig().stopReviewGate ? "on" : "off"}`);
  }
  if (!cliOk || !keyOk) process.exit(1);
  out("setup OK");
}

// ---- task -----------------------------------------------------------------

const TASK_OPTIONS = {
  background: { type: "boolean", default: false },
  write: { type: "boolean", default: false },
  model: { type: "string" },
  "resume-last": { type: "boolean", default: false },
  "timeout-mins": { type: "string" }
};

async function cmdTask(args) {
  const { values, positionals } = parseArgs({ args, options: TASK_OPTIONS, allowPositionals: true });
  const prompt = positionals.join(" ").trim();
  if (!prompt) fail("usage: task \"<prompt>\" [--background] [--write] [--model m] [--resume-last]");
  const timeoutMs = values["timeout-mins"] ? Number(values["timeout-mins"]) * 60000 : undefined;
  const job = createJob({
    kind: "task",
    prompt,
    cwd: process.cwd(),
    write: values.write,
    model: values.model ?? null,
    resume: values["resume-last"]
  });

  if (values.background) {
    const logFile = path.join(companionHome(), "jobs", `${job.id}.log`);
    const log = fs.openSync(logFile, "a");
    const child = spawn(process.execPath, [SELF, "task-worker", job.id], {
      detached: true,
      stdio: ["ignore", log, log],
      cwd: process.cwd(),
      env: process.env
    });
    child.unref();
    out(`Started background Gemini job ${job.id} (worker pid ${child.pid}).`);
    out(`Check with: status --id ${job.id} · fetch with: result --id ${job.id}`);
    return;
  }

  updateJob(job.id, { status: "running" });
  const res = await runGemini({
    prompt,
    cwd: job.cwd,
    model: job.model,
    write: job.write,
    resume: job.resume,
    timeoutMs,
    onSpawn: (pid) => updateJob(job.id, { pid })
  });
  updateJob(job.id, { status: res.ok ? "done" : "failed", resultText: res.text, error: res.error });
  if (!res.ok) fail(`Gemini job ${job.id} failed: ${res.error}\n${res.text}`);
  out(`[gemini job ${job.id} done]\n\n${res.text}`);
}

async function cmdTaskWorker(args) {
  const id = args[0];
  const job = readJob(id);
  if (!job) fail(`job not found: ${id}`);
  updateJob(id, { status: "running", pid: process.pid });
  const res = await runGemini({
    prompt: job.prompt,
    cwd: job.cwd,
    model: job.model,
    write: job.write,
    resume: job.resume,
    onSpawn: (pid) => updateJob(id, { geminiPid: pid })
  });
  updateJob(id, { status: res.ok ? "done" : "failed", resultText: res.text, error: res.error });
}

// ---- review ---------------------------------------------------------------

function gitDiff(base) {
  const range = base ? [base] : ["HEAD"];
  const r = spawnSync("git", ["diff", ...range], { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  if (r.status !== 0) fail(`git diff failed: ${(r.stderr || "").trim()}`);
  let diff = r.stdout;
  if (!diff.trim()) {
    // fall back to the last commit so "review" works right after committing
    const last = spawnSync("git", ["diff", "HEAD~1..HEAD"], { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
    diff = last.status === 0 ? last.stdout : "";
  }
  if (!diff.trim()) fail("no diff to review (working tree clean and no previous commit range)");
  if (Buffer.byteLength(diff) > MAX_DIFF_BYTES) diff = diff.slice(0, MAX_DIFF_BYTES) + "\n[diff truncated at 200KB]";
  return diff;
}

async function cmdReview(args) {
  const { values } = parseArgs({
    args,
    options: { adversarial: { type: "boolean", default: false }, base: { type: "string" }, model: { type: "string" } },
    allowPositionals: false
  });
  const template = fs.readFileSync(
    path.join(ROOT, "prompts", values.adversarial ? "adversarial-review.md" : "review.md"),
    "utf8"
  );
  const prompt = `${template}\n\n## Diff under review\n\n\`\`\`diff\n${gitDiff(values.base)}\n\`\`\`\n`;
  const res = await runGemini({ prompt, cwd: process.cwd(), model: values.model, write: false });
  if (!res.ok) fail(`review failed: ${res.error}`);
  out(res.text);
}

// ---- status / result / cancel ----------------------------------------------

function jobLine(j) {
  return `${j.id}  ${j.status.padEnd(9)}  ${j.kind}  ${new Date(j.createdAt).toLocaleString()}  ${(j.prompt || "").slice(0, 60)}`;
}

function cmdStatus(args) {
  const { values } = parseArgs({ args, options: { id: { type: "string" } }, allowPositionals: false });
  if (values.id) {
    const j = readJob(values.id);
    if (!j) fail(`job not found: ${values.id}`);
    out(JSON.stringify(j, null, 2));
    return;
  }
  const jobs = listJobs();
  if (!jobs.length) { out("no Gemini jobs recorded"); return; }
  jobs.slice(0, 20).forEach((j) => out(jobLine(j)));
}

function cmdResult(args) {
  const { values } = parseArgs({ args, options: { id: { type: "string" } }, allowPositionals: false });
  if (!values.id) fail("usage: result --id <job-id>");
  const j = readJob(values.id);
  if (!j) fail(`job not found: ${values.id}`);
  if (j.status === "running" || j.status === "queued") { out(`job ${j.id} still ${j.status}`); return; }
  if (j.error) out(`job ${j.id} ${j.status} — error: ${j.error}`);
  out(j.resultText || "(no output captured)");
}

function cmdCancel(args) {
  const { values } = parseArgs({ args, options: { id: { type: "string" } }, allowPositionals: false });
  if (!values.id) fail("usage: cancel --id <job-id>");
  const j = cancelJob(values.id);
  out(`job ${j.id}: ${j.status}`);
}

// ---- image ------------------------------------------------------------------

async function cmdImage(args) {
  const { values, positionals } = parseArgs({
    args,
    options: { model: { type: "string", default: DEFAULT_IMAGE_MODEL }, out: { type: "string" } },
    allowPositionals: true
  });
  const prompt = positionals.join(" ").trim();
  if (!prompt) fail("usage: image \"<prompt>\" [--model m] [--out file.png]");
  const res = await generateImage({ prompt, model: values.model, out: values.out });
  out(`image written: ${res.file}`);
  if (res.text) out(`model notes: ${res.text.slice(0, 500)}`);
}

// ---- dispatch ----------------------------------------------------------------

const [subcommand, ...rest] = process.argv.slice(2);
const commands = {
  setup: cmdSetup,
  task: cmdTask,
  "task-worker": cmdTaskWorker,
  review: cmdReview,
  status: cmdStatus,
  result: cmdResult,
  cancel: cmdCancel,
  image: cmdImage
};

const handler = commands[subcommand];
if (!handler) fail(`unknown subcommand: ${subcommand ?? "(none)"} — expected one of ${Object.keys(commands).join(", ")}`);
Promise.resolve(handler(rest)).catch((err) => fail(err.message || String(err)));
