import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { scrubDeep } from "./scrub.mjs";

// Job state lives outside any repo so prompts/outputs never end up committed.
export function companionHome() {
  if (process.env.GEMINI_COMPANION_HOME) return process.env.GEMINI_COMPANION_HOME;
  const base = process.env.LOCALAPPDATA || path.join(os.homedir(), ".local", "share");
  return path.join(base, "gemini-companion");
}

function jobsDir() {
  const dir = path.join(companionHome(), "jobs");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function jobFile(id) {
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error(`invalid job id: ${id}`);
  return path.join(jobsDir(), `${id}.json`);
}

export function createJob(meta) {
  const id = `${new Date().toISOString().slice(0, 10)}-${crypto.randomBytes(4).toString("hex")}`;
  const job = {
    id,
    status: "queued",
    pid: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    resultText: null,
    error: null,
    ...meta
  };
  fs.writeFileSync(jobFile(id), JSON.stringify(scrubDeep(job), null, 2));
  return job;
}

export function readJob(id) {
  const file = jobFile(id);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function updateJob(id, patch) {
  const job = readJob(id);
  if (!job) throw new Error(`job not found: ${id}`);
  const next = { ...job, ...patch, updatedAt: new Date().toISOString() };
  fs.writeFileSync(jobFile(id), JSON.stringify(scrubDeep(next), null, 2));
  return next;
}

export function listJobs() {
  return fs
    .readdirSync(jobsDir())
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(fs.readFileSync(path.join(jobsDir(), f), "utf8")))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function cancelJob(id) {
  const job = readJob(id);
  if (!job) throw new Error(`job not found: ${id}`);
  if (job.status !== "running" && job.status !== "queued") return job;
  if (job.pid) {
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/PID", String(job.pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      try { process.kill(job.pid, "SIGTERM"); } catch { /* already gone */ }
    }
  }
  return updateJob(id, { status: "cancelled" });
}
