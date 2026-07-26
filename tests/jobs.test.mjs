import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "gemini-companion-test-"));
process.env.GEMINI_COMPANION_HOME = tmpHome;

const { createJob, readJob, updateJob, listJobs, cancelJob } = await import("../scripts/lib/jobs.mjs");

after(() => fs.rmSync(tmpHome, { recursive: true, force: true }));

test("job lifecycle: create, read, update, list", () => {
  const job = createJob({ kind: "task", prompt: "hello", cwd: "C:\\repo" });
  assert.equal(job.status, "queued");
  assert.match(job.id, /^[a-z0-9-]+$/);

  const read = readJob(job.id);
  assert.equal(read.prompt, "hello");

  const updated = updateJob(job.id, { status: "done", resultText: "answer" });
  assert.equal(updated.status, "done");
  assert.equal(readJob(job.id).resultText, "answer");

  assert.ok(listJobs().some((j) => j.id === job.id));
});

test("job state is scrubbed before hitting disk", () => {
  const fake = "AIza" + "C".repeat(35);
  const job = createJob({ kind: "task", prompt: `use key ${fake}`, cwd: "." });
  const onDisk = fs.readFileSync(path.join(tmpHome, "jobs", `${job.id}.json`), "utf8");
  assert.ok(!onDisk.includes(fake));
  assert.ok(onDisk.includes("[REDACTED]"));
});

test("cancel marks queued job cancelled", () => {
  const job = createJob({ kind: "task", prompt: "x", cwd: "." });
  assert.equal(cancelJob(job.id).status, "cancelled");
});

test("readJob returns null for missing job, rejects bad ids", () => {
  assert.equal(readJob("does-not-exist"), null);
  assert.throws(() => readJob("../evil"), /invalid job id/);
});
