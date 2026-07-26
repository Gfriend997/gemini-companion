#!/usr/bin/env node
// Stop hook: when enabled, runs a Gemini review of the working diff before
// Claude stops. Disabled by default; exits 0 immediately when off so the
// hook costs nothing. Enable with: setup --gate on

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { companionHome } from "./lib/jobs.mjs";

function gateEnabled() {
  try {
    return JSON.parse(fs.readFileSync(path.join(companionHome(), "config.json"), "utf8")).stopReviewGate === true;
  } catch {
    return false;
  }
}

if (!gateEnabled()) process.exit(0);

// Nothing to review → let the stop proceed.
const dirty = spawnSync("git", ["status", "--porcelain"], { encoding: "utf8" });
if (dirty.status !== 0 || !dirty.stdout.trim()) process.exit(0);

const entry = path.join(path.dirname(fileURLToPath(import.meta.url)), "gemini-companion.mjs");
const review = spawnSync(process.execPath, [entry, "review"], { encoding: "utf8", timeout: 9 * 60 * 1000 });

if (review.status !== 0) {
  // Gate must never brick the session: report and allow the stop.
  process.stderr.write(`gemini stop-review gate skipped: ${(review.stderr || "review failed").slice(0, 500)}\n`);
  process.exit(0);
}

// Exit 2 feeds stderr back to Claude as a blocking message with the findings.
process.stderr.write(`Gemini reviewed the pending changes before stop:\n\n${review.stdout.slice(0, 8000)}\n\nAddress critical findings or tell the user why they are acceptable, then stop again.\n`);
process.exit(2);
