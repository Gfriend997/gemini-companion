import { spawn, spawnSync } from "node:child_process";

// Headless Gemini CLI runner. The prompt travels over stdin, never argv:
// argv is visible in the process list and, because .cmd shims force
// shell:true on Windows, argv would also need shell quoting. stdin needs neither.
// Only validated flag values reach the command line.

const MODEL_RE = /^[A-Za-z0-9._-]+$/;
const DEFAULT_TIMEOUT_MS = 20 * 60 * 1000;
// prices per 1M tokens, standard tier, 2026-09-22
export const TOKEN_PRICES = {
  "gemini-3.5-flash": { input: 1.5, output: 9 },
  "gemini-3.7-flash": { input: 0.75, output: 3.75 },
  "gemini-3.8-flash": { input: 0.75, output: 3.75 },
  "gemini-3.1-flash-lite": { input: 0.25, output: 1.5 }
};

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
  const args = ["-o", "json"];
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
  const jsonStart = stdout.indexOf("{");
  if (jsonStart < 0) return { text: stdout, servedModels: [], stats: null };
  try {
    // Warning lines can precede the JSON and trailing notices can follow it;
    // parse the outermost brace span, falling back to first-brace-to-end.
    const jsonEnd = stdout.lastIndexOf("}");
    let parsed;
    try {
      parsed = JSON.parse(stdout.slice(jsonStart, jsonEnd + 1));
    } catch {
      parsed = JSON.parse(stdout.slice(jsonStart));
    }
    if (typeof parsed.response !== "string") return { text: stdout, servedModels: [], stats: null };
    const stats = parsed.stats && typeof parsed.stats === "object" ? parsed.stats : null;
    return { text: parsed.response, servedModels: Object.keys(stats?.models || {}), stats };
  } catch {
    return { text: stdout, servedModels: [], stats: null };
  }
}

function tokenCount(tokens, name) {
  return Number.isFinite(tokens?.[name]) ? tokens[name] : 0;
}

export function summarizeGeminiRun({ requestedModel, stats } = {}) {
  const models = stats?.models && typeof stats.models === "object" ? stats.models : null;
  if (!models) return "Gemini CLI stats unavailable; estimated cost n/a";
  const names = Object.keys(models);
  if (!names.length) return "Gemini CLI stats unavailable; estimated cost n/a";
  let input = 0;
  let output = 0;
  let thoughts = 0;
  let cost = 0;
  let knownCost = true;
  let mainModel = null;
  for (const [name, details] of Object.entries(models)) {
    const tokens = details?.tokens || {};
    const modelInput = tokenCount(tokens, "input");
    const modelOutput = tokenCount(tokens, "candidates");
    input += modelInput;
    output += modelOutput;
    thoughts += tokenCount(tokens, "thoughts");
    const price = TOKEN_PRICES[name];
    if (!price) knownCost = false;
    else cost += (modelInput / 1_000_000) * price.input + (modelOutput / 1_000_000) * price.output;
    if (details?.roles?.main) mainModel = name;
  }
  const summary = `Gemini served ${names.join(", ")} | input ${input.toLocaleString("en-US")} | output ${output.toLocaleString("en-US")} | thought ${thoughts.toLocaleString("en-US")} | estimated cost ${knownCost ? `$${cost.toFixed(3)}` : "n/a"}`;
  if (requestedModel && mainModel && requestedModel !== mainModel) {
    return `${summary}\nWARNING: requested ${requestedModel} but CLI served ${mainModel} (CLI does not support ${requestedModel} yet)`;
  }
  return summary;
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
      resolve({ ok: false, text: "", servedModels: [], stats: null, summary: "Gemini CLI stats unavailable; estimated cost n/a", error: `gemini timed out after ${timeoutMs / 60000} min` });
    }, timeoutMs);
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ ok: false, text: "", servedModels: [], stats: null, summary: "Gemini CLI stats unavailable; estimated cost n/a", error: `failed to launch gemini: ${err.message}` });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const { text, servedModels, stats } = parseGeminiOutput(stdout);
      const summary = summarizeGeminiRun({ requestedModel: model, stats });
      if (code === 0) resolve({ ok: true, text, servedModels, stats, summary, error: null });
      else resolve({ ok: false, text, servedModels, stats, summary, error: `gemini exited ${code}: ${stderr.trim().slice(0, 2000)}` });
    });
    child.stdin.end(prompt);
  });
}
