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

// Windows .cmd shims cannot be spawned with shell:false directly (EINVAL since
// the DEP0190-era hardening), so route through an explicit `cmd.exe /c`. This
// keeps shell:false everywhere: Node escapes argv, no word splitting, and no
// deprecation warning.
export function spawnSpec(args) {
  if (process.platform === "win32") {
    return { cmd: "cmd.exe", args: ["/c", geminiBinary(), ...args] };
  }
  return { cmd: geminiBinary(), args };
}

export function geminiAvailable() {
  const probe = process.platform === "win32" ? "where" : "which";
  return spawnSync(probe, ["gemini"], { stdio: "ignore" }).status === 0;
}

let resumeSupport = null;
export function supportsResume() {
  if (resumeSupport === null) {
    const spec = spawnSpec(["--help"]);
    const help = spawnSync(spec.cmd, spec.args, { encoding: "utf8" });
    resumeSupport = (help.stdout || "").includes("--resume");
  }
  return resumeSupport;
}

// child.kill() only reaches the direct child (cmd.exe on Windows); the real
// gemini process underneath would survive a timeout as an orphan. Kill the tree.
export function killTree(pid) {
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    try { process.kill(pid, "SIGTERM"); } catch { /* already gone */ }
  }
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
    // Prompt goes over stdin (argv is visible in the process list).
    // GEMINI_CLI_TRUST_WORKSPACE: headless runs refuse untrusted dirs; the user
    // explicitly pointed the plugin at this repo, which is the trust decision.
    const spec = spawnSpec(args);
    const child = spawn(spec.cmd, spec.args, {
      cwd: cwd || process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, GEMINI_CLI_TRUST_WORKSPACE: "true" }
    });
    if (onSpawn) onSpawn(child.pid);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    const timer = setTimeout(() => {
      killTree(child.pid);
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
