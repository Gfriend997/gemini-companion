# Gemini Companion Plugin — Design Spec

Date: 2026-07-26
Status: Approved by Gary Wong
Author: Claude (brainstormed with Gary)

## Purpose

Claude Code plugin that delegates work to Google Gemini, modeled on the OpenAI Codex plugin (v1.0.6, Apache-2.0). Use cases: task delegation (rescue), code review, adversarial review, second opinions, background jobs, and image generation.

## Decisions made

| Decision | Choice | Rationale |
|---|---|---|
| Runtime | Wrap Gemini CLI (`@google/gemini-cli`) for text/agentic work | Exact Codex pattern; CLI reads `GEMINI_API_KEY` from env natively; agentic file edits for free |
| Scope | Full Codex parity (9 commands incl. image gen) | User decision |
| Image generation | Direct REST call inside companion script, not CLI extension | CLI needs nanobanana extension; REST is ~40 lines, cleaner save-to-file |
| Architecture | Port Codex plugin skeleton, rebuild runtime layer | Codex broker is app-server JSON-RPC (Codex-specific protocol); Gemini CLI has no equivalent — per-job headless spawns instead |
| API key | Windows User-level env var only | User requirement: no key on disk, no `.env`, ever |

## Rejected approaches

- **Persistent broker via Gemini CLI ACP/experimental agent protocol.** Experimental, churn risk, complexity buys nothing over per-job spawns.
- **Direct REST for everything.** No agentic execution; Gemini becomes advice-only.
- **Nanobanana CLI extension for images.** Extra install dependency; awkward scripted output paths.

## Architecture

```
gemini-companion/
  .claude-plugin/plugin.json
  commands/
    rescue.md              delegate task to Gemini (foreground or --background)
    review.md              code review of working diff / branch
    adversarial-review.md  hostile second-pass review
    status.md              list/inspect background jobs
    result.md              fetch finished job output
    cancel.md              stop a background job
    setup.md               verify CLI installed + key present, install guidance
    transfer.md            context handoff: summarize Claude session into Gemini task prompt
    imagine.md             generate image via Gemini API REST
  agents/gemini-rescue.md  thin forwarder (mirrors codex-rescue: one Bash call, no independent work)
  skills/
    gemini-cli-runtime/    contract for calling companion script
    gemini-result-handling/ presenting Gemini output back to user
    gemini-prompting/      Gemini-specific prompt shaping guidance
  hooks/hooks.json         SessionStart/SessionEnd lifecycle + opt-in Stop review gate
  scripts/
    gemini-companion.mjs   single entry: task|review|status|result|cancel|image|setup
    session-lifecycle-hook.mjs
    stop-review-gate-hook.mjs
    lib/
      gemini.mjs           NEW: headless gemini CLI runner (spawn, JSON parse, resume)
      image.mjs            NEW: REST image generation
      job-control.mjs      ported/adapted from Codex plugin
      state.mjs            ported/adapted
      git.mjs              ported/adapted
      render.mjs           ported/adapted
      args.mjs             ported/adapted
      fs.mjs               ported/adapted
      process.mjs          ported/adapted
      scrub.mjs            NEW: key-pattern scrubber for logs/state writes
  schemas/review-output.schema.json
  NOTICE                   Apache-2.0 attribution for ported Codex plugin code
  LICENSE
```

## Runtime layer

**Text/agentic jobs (CLI):**

- Each job spawns `gemini -p "<prompt>" --output-format json --approval-mode <mode> [-m <model>]` in repo cwd.
- Write-capable runs (`--write`): `--approval-mode auto_edit`. Read-only reviews: default approval mode, no auto-edit.
- Foreground: wait, parse JSON, render. Background: detached process, state file tracks status/pid/output path.
- Job state: `%LOCALAPPDATA%\gemini-companion\jobs\<id>.json` (outside any repo).
- `--resume-last` maps to Gemini CLI session resume. Verification spike required: session-ID surfacing in headless JSON output was an open feature request (gemini-cli issue #14435); fallback is `--resume latest` semantics or parsing session directory.

**Image jobs (REST):**

- POST `https://generativelanguage.googleapis.com/v1beta/models/<model>:generateContent`
- Key from `process.env.GEMINI_API_KEY`, sent as `x-goog-api-key` header only. Never query param, never logged, never in argv.
- Default model `gemini-2.5-flash-image` (free-tier quota). `--model` overrides (e.g. `gemini-3-pro-image-preview`, Imagen — paid tier).
- Decode base64 inline image data, write PNG. Output path: `--out <path>` or cwd default with timestamped name.

## Security model

1. Key lives only in Windows User env var. Plugin never writes it anywhere: no `.env`, no config files, no argv, no logs, no job state.
2. CLI path: `gemini` inherits env; plugin code never reads the key at all.
3. REST path: key read from `process.env` at call time, header-only.
4. `/gemini:setup` checks key existence via env lookup; never echoes value.
5. `scrub.mjs` regex guard (Google API key pattern `AIza[0-9A-Za-z_-]{35}` plus generic long-token heuristic) applied at every log/state write boundary.
6. Gemini output treated as untrusted: review/rescue results rendered as text; nothing auto-executed.
7. Job state dir outside repos; plugin repo `.gitignore` excludes any local artifacts regardless.

## Known capability gaps vs Codex plugin

- No persistent broker: per-turn process spawn, slower cold start, simpler lifecycle. Accepted.
- `/transfer` has no native Gemini session-import; ships as context-handoff summarization instead.
- Session resume in headless mode may need workaround (see verification spike).

## Testing

- **Unit:** args parsing, state lifecycle, scrubber, render, image response parsing (fixture JSON).
- **Integration (opt-in, `GEMINI_COMPANION_E2E=1`):** real foreground task, review, background job + status + result + cancel, image generation.
- **Manual acceptance path:** `/gemini:setup` → `/gemini:rescue` foreground → `/gemini:review` → background task → `/gemini:status` → `/gemini:result` → `/gemini:imagine`.

## Build order (value-first)

1. Skeleton + plugin.json + `/gemini:setup` + gemini.mjs runner
2. `/gemini:rescue` foreground + rescue agent + runtime skill
3. `/gemini:review` + schema
4. Background jobs: status/result/cancel
5. `/gemini:imagine` (image.mjs)
6. `/gemini:adversarial-review`, `/gemini:transfer`
7. Stop review gate hook (opt-in)

## Dependencies

- Node.js (present — Codex plugin scripts already run)
- `@google/gemini-cli` global npm install (pending; ask before installing)
- `GEMINI_API_KEY` in Windows User env (present, verified existence 2026-07-26)

## Open items

- Verification spike: headless session resume behavior in current gemini-cli release.
- Confirm current default text model naming at build time (CLI default acceptable; don't hardcode).
