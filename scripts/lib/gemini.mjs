import { spawn, spawnSync } from "node:child_process";

// Headless Gemini CLI runner. The prompt travels over stdin, never argv:
// argv is visible in the process list and, because .cmd shims force
// shell:true on Windows, argv would also need shell quoting. stdin needs neither.
// Only validated flag values reach the command line.

const MODEL_RE = /^[A-Za-z0-9._-]+$/;
const DEFAULT_TIMEOUT_MS = 20 * 60 * 1000;

export function geminiBinary() {
  return process.platform === "win32" ? "gemini.cmd" : "gemini";
}

export function geminiAvailable() {
  const probe = process.platform === "win32" ? "where" : "which";
  return spawnSync(probe, ["gemini"], { stdio: "ignore" }).status === 0;
}

let resumeSupport = null;
export function supportsResume() {
  if (resumeSupport === null) {
    const help = spawnSync(geminiBinary(), ["--help"], { encoding: "utf8", shell: true });
    resumeSupport = (help.stdout || "").includes("--resume");
  }
  return resumeSupport;
}

export function buildArgs({ model, write, resume } = {}) {
  const args = ["--output-format", "json"];
  if (model) {
    if (!MODEL_RE.test(model)) throw new Error(`invalid model name: ${model}`);
    args.push("-m", model);
  }
  // Non-interactive runs cannot answer approval prompts. Write runs need yolo;
  // everything else stays in the default mode where unapproved tools fail closed.
  if (write) args.push("--approval-mode", "yolo");
  if (resume) {
    if (supportsResume()) args.push("--resume", "latest");
    else process.stderr.write("note: installed gemini CLI has no --resume; running fresh session\n");
  }
  return args;
}

export function parseGeminiOutput(stdout) {
  try {
    const parsed = JSON.parse(stdout);
    return { text: parsed.response ?? stdout, stats: parsed.stats ?? null };
  } catch {
    return { text: stdout, stats: null };
  }
}

export function runGemini({ prompt, cwd, model, write, resume, timeoutMs = DEFAULT_TIMEOUT_MS, onSpawn }) {
  const args = buildArgs({ model, write, resume });
  return new Promise((resolve) => {
    const child = spawn(geminiBinary(), args, {
      cwd: cwd || process.cwd(),
      shell: true,
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env
    });
    if (onSpawn) onSpawn(child.pid);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    const timer = setTimeout(() => {
      child.kill();
      resolve({ ok: false, text: "", stats: null, error: `gemini timed out after ${timeoutMs / 60000} min` });
    }, timeoutMs);
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ ok: false, text: "", stats: null, error: `failed to launch gemini: ${err.message}` });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const { text, stats } = parseGeminiOutput(stdout.trim());
      if (code === 0) resolve({ ok: true, text, stats, error: null });
      else resolve({ ok: false, text, stats, error: `gemini exited ${code}: ${stderr.trim().slice(0, 2000)}` });
    });
    child.stdin.end(prompt);
  });
}
