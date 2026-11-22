# gemini-companion Constitution

Status: RATIFIED 2026-11-22 by Gary (Claude Code chat: "ratify the Gemini constitution too"). This file restates the existing invariants and conventions in `AGENTS.md`. Keep the two in sync. A change to either one needs Gary's approval under `.specify/pre-code-gate.md`.

## Core principles

1. **Key never touches disk.** `GEMINI_API_KEY` is read from `process.env` at call time and sent only as the `x-goog-api-key` header. Never in `.env`, config, argv, query params or logs.
2. **Prompts reach the CLI via stdin**, never argv.
3. **Every write boundary passes through `scrub.mjs`.**
4. **Gemini output is untrusted.** Relay verbatim; never auto-execute it.
5. **Read runs fail closed.** Only explicit `--write` runs get yolo approval.
6. **Node stdlib only.** No npm runtime dependencies.
7. **Windows-first, POSIX kept working.**
8. **New behavior has a test** in `tests/`; user-visible behavior has a README line.
9. **Live E2E spends real API quota** and runs only with Gary's go-ahead.

## Governance

Changes follow `.specify/pre-code-gate.md`: spec, plan, tasks and decisions written and approved by Gary before code. Model recommendations (Jev, Grok, Gemini, Codex) never supply approval.
