# Gemini Companion Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Claude Code plugin delegating tasks, reviews, and image generation to Gemini, Codex plugin parity, key from Windows env only.

**Architecture:** Thin command/agent/skill layer forwarding to one Node entry script (`gemini-companion.mjs`). Text/agentic jobs spawn headless `gemini` CLI per job; images via REST. Job state in `%LOCALAPPDATA%\gemini-companion\jobs`. No broker.

**Tech Stack:** Node 18+ (stdlib only — no npm deps in plugin), `@google/gemini-cli` global install, Gemini REST API for images.

## Global Constraints

- `GEMINI_API_KEY` read from `process.env` only. Never written to any file, log, argv, or URL. REST uses `x-goog-api-key` header.
- No npm dependencies inside plugin — Node stdlib only.
- Scrub key patterns (`AIza[0-9A-Za-z_-]{35}`) at every log/state write boundary.
- Gemini output rendered as text, never auto-executed.
- Job state dir: `%LOCALAPPDATA%\gemini-companion\` — outside repos.
- Windows-first (spawn semantics, paths via `node:path`).

---

### Task 1: Scaffolding + setup command path

**Files:** `.claude-plugin/plugin.json`, `.gitignore`, `README.md`, `NOTICE`, `LICENSE` (Apache-2.0), `scripts/gemini-companion.mjs` (entry, `setup` subcommand only), `scripts/lib/scrub.mjs`, `tests/scrub.test.mjs`

**Interfaces produced:** CLI contract `node scripts/gemini-companion.mjs <subcommand> [flags]`; `scrub(text) -> string` masks key patterns.

- [ ] plugin.json: name `gemini-companion`, version `0.1.0`
- [ ] scrub.mjs + node --test unit test (key pattern, generic 30+ char token near "key"/"token" words → mask)
- [ ] `setup` subcommand: checks `gemini` binary on PATH, `GEMINI_API_KEY` existence (never echo), prints install guidance
- [ ] Run tests, commit

### Task 2: Headless runner + task subcommand

**Files:** `scripts/lib/gemini.mjs`, `scripts/lib/jobs.mjs`, entry `task` subcommand, `tests/jobs.test.mjs`

**Interfaces produced:**
- `runGemini({prompt, cwd, model, write, resume}) -> {ok, text, raw, stats}` — spawns `gemini -p <prompt> --output-format json [--approval-mode auto_edit|default] [-m model]`, parses `{response, stats}` JSON, falls back to raw stdout.
- `jobs.mjs`: `createJob(meta) -> id`, `readJob(id)`, `listJobs()`, `updateJob(id, patch)`, `cancelJob(id)` (taskkill pid tree). State JSON per job, scrubbed before write.
- `task` flags: `--background`, `--write`, `--model`, `--resume-last`, prompt as positional/`--prompt`.
- Background: re-spawn self detached (`spawn(process.execPath, [self, 'task-worker', id], {detached: true, stdio: ['ignore', out, err]}).unref()`).

- [ ] jobs.mjs + unit test (create/read/update/list lifecycle in temp dir via env override `GEMINI_COMPANION_HOME`)
- [ ] gemini.mjs runner; feature-detect resume support via `gemini --help` (spike from spec — degrade gracefully)
- [ ] Foreground + background task paths; commit

### Task 3: Review + adversarial review

**Files:** entry `review` subcommand, `prompts/review.md`, `prompts/adversarial-review.md`, `schemas/review-output.schema.json`

**Interfaces:** `review --adversarial --base <ref>` builds diff via `git diff`, feeds prompt template + diff to `runGemini` read-only, renders findings.

- [ ] Prompt templates (structured findings: file, line, severity, summary)
- [ ] `review` subcommand; commit

### Task 4: status / result / cancel subcommands

**Files:** entry additions only.

- [ ] `status` (list or `--id`), `result --id` (prints stored output), `cancel --id`; commit

### Task 5: Image generation

**Files:** `scripts/lib/image.mjs`, entry `image` subcommand, `tests/image.test.mjs`

**Interfaces:** `generateImage({prompt, model='gemini-2.5-flash-image', out}) -> {file}`. POST `v1beta/models/<model>:generateContent`, header `x-goog-api-key`, parse `candidates[0].content.parts[].inlineData`, write PNG. Unit test parses fixture response (no network).

- [ ] image.mjs + fixture test; `image` subcommand with `--out`, `--model`; commit

### Task 6: Commands, agent, skills, hooks

**Files:** `commands/{rescue,review,adversarial-review,status,result,cancel,setup,transfer,imagine}.md`, `agents/gemini-rescue.md`, `skills/{gemini-cli-runtime,gemini-result-handling,gemini-prompting}/SKILL.md`, `hooks/hooks.json`, `scripts/stop-review-gate-hook.mjs`

**Interfaces:** commands forward to entry script via `${CLAUDE_PLUGIN_ROOT}`; transfer = context-handoff prompt build (per spec); stop gate opt-in via `%LOCALAPPDATA%\gemini-companion\config.json` `{stopReviewGate: bool}`, toggled by `setup --gate on|off`, hook exits 0 fast when disabled.

- [ ] 9 command files + agent (mirror codex-rescue forwarding rules, Gemini flag mapping)
- [ ] 3 skills, hooks.json + gate hook script; commit

### Task 7: E2E with live key + docs

- [ ] Install `@google/gemini-cli` globally
- [ ] E2E: setup → foreground task (trivial repo question) → review on sample diff → background task + status + result → cancel path → image generation (real PNG, verify file magic bytes)
- [ ] README: install, usage, security model, test instructions
- [ ] Fix findings; commit

### Task 8: GitHub private repo

- [ ] `gh repo create gemini-companion --private --source . --push` (confirm gh auth first)
- [ ] Verify remote, push; report

## Risks

- Gemini CLI flag drift (resume, output-format) — feature-detect, degrade.
- Image model naming/tier — default flash-image; REST 4xx rendered clearly.
- Windows detached-process quirks — E2E covers background path explicitly.

## Completion criteria

Goal hook: plugin implemented, tests pass, live E2E OK, private GitHub repo pushed, report delivered.
