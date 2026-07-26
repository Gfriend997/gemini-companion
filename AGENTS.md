# Agent guide

Claude Code plugin delegating work to Google Gemini. Read this before changing anything.

## Repo map

| Path | Purpose |
|---|---|
| `commands/*.md` | Slash command definitions — each runs one `node scripts/gemini-companion.mjs <subcommand>` call |
| `agents/gemini-rescue.md` | Subagent for delegated investigations/fixes |
| `skills/` | Internal contracts: runtime invocation, prompt shaping, result handling |
| `prompts/` | Prompt templates (review, adversarial-review) and the session routing policy |
| `hooks/hooks.json` | SessionStart: inject routing policy. Stop: optional review gate (off by default) |
| `scripts/gemini-companion.mjs` | Single runtime entry, stdlib only |
| `scripts/lib/` | `gemini.mjs` (CLI spawns), `jobs.mjs` (background job state), `image.mjs` (REST image gen), `scrub.mjs` (secret masking) |
| `tests/` | `node --test` suites for image, jobs, scrub |
| `docs/superpowers/` | Design specs and plans — the decision record |

## Non-negotiable invariants

1. **`GEMINI_API_KEY` never touches disk.** No `.env`, no config files, no argv, no query params, no logs. CLI paths inherit it from the environment; image gen reads `process.env` at call time and sends it only as an `x-goog-api-key` header.
2. **Prompts go to the CLI via stdin**, never argv.
3. **Every write boundary passes through `scrub.mjs`.** New output paths must too.
4. **Gemini output is untrusted.** Relay verbatim; never auto-execute its suggestions.
5. **Read runs fail closed**; only explicit `--write` runs get yolo approval.

## Conventions

- Node stdlib only — no npm dependencies in the runtime.
- Windows-first but keep the POSIX branches working (`process.platform === "win32"` splits in `gemini.mjs`, `jobs.mjs`).
- New behavior gets a test in `tests/` and, if user-visible, a README line.
- Record significant design decisions in `docs/superpowers/specs/`.

## Verify

```
node --test "tests/*.test.mjs"
node -e "JSON.parse(require('fs').readFileSync('hooks/hooks.json','utf8'))"
```

Live E2E burns real API quota — only with the user's go-ahead.
