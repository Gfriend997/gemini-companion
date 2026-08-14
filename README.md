# gemini-companion

Claude Code plugin that delegates work to Google Gemini: task rescue, code review, adversarial review, background jobs, and image generation.

The idea is not original. It is OpenAI's [codex-plugin-cc](https://github.com/openai/codex-plugin-cc), which established the pattern of driving a second model from inside Claude Code and set the command surface this plugin follows. See [Credits](#credits).

## Requirements

- Node.js 18+
- Gemini CLI: `npm install -g @google/gemini-cli`
- A Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey)
- That key exported as an **OS-level environment variable** named `GEMINI_API_KEY`

> **Export the key into your environment. Never put it in a `.env` file.**
>
> This plugin does not read `.env` files and never will. A `.env` sitting in a working
> directory is one forgotten `.gitignore` line away from being committed, and once a key is in
> git history, rotating it is the only real fix. Environment variables leave nothing behind in
> the repo. Same rule for any config file, shell script, or command you type with the key
> inline — the key belongs in your environment, not in your project.

Export the key, then **restart Claude Code** so the new value is inherited by the plugin's processes:

```powershell
# Windows (PowerShell) — persists for your user account
setx GEMINI_API_KEY "your-key-here"
```

```bash
# macOS / Linux — add to ~/.zshrc or ~/.bashrc, then reopen the shell
export GEMINI_API_KEY="your-key-here"
```

Developed and tested on Windows. macOS/Linux code paths exist but are untested — reports welcome.

## Install

In Claude Code:

```
/plugin marketplace add Gfriend997/gemini-companion
/plugin install gemini-companion
```

If the repo is private or you want to run a local checkout, point the marketplace at the directory instead:

```
/plugin marketplace add C:/path/to/gemini-companion
/plugin install gemini-companion
```

Then verify the CLI and key are visible:

```
/gemini-companion:setup
```

`setup` reports whether the `gemini` binary is on PATH and whether the key is present. It never prints the key value.

## Quick start

```
/gemini-companion:imagine --out fox.png a watercolor fox
/gemini-companion:review                       # Gemini reviews your working diff
/gemini-companion:rescue why does tests/jobs.test.mjs flake on CI?
```

## Commands

| Command | What it does |
|---|---|
| `/gemini-companion:setup` | Check CLI + key presence; `--gate on\|off` toggles stop-review gate |
| `/gemini-companion:rescue` | Delegate a task/investigation to Gemini (`--background`, `--write`, `--resume`, `--model`) |
| `/gemini-companion:review` | Gemini reviews your current diff (falls back to last commit) |
| `/gemini-companion:adversarial-review` | Hostile review pass hunting for breakage |
| `/gemini-companion:status` | List background jobs (`--id` for one) |
| `/gemini-companion:result` | Fetch a finished job's output |
| `/gemini-companion:cancel` | Kill a running background job |
| `/gemini-companion:transfer` | Summarize current Claude session into a Gemini task (context handoff) |
| `/gemini-companion:imagine` | Generate an image (`--model`, `--out file.png`); default `gemini-2.5-flash-image` |

Long jobs: add `--background` to `rescue`, then poll with `/gemini-companion:status`, collect with `/gemini-companion:result --id <job-id>`, abandon with `/gemini-companion:cancel --id <job-id>`.

## Models

| Path | Model | Notes |
|---|---|---|
| `rescue`, `review`, `adversarial-review`, `transfer` | your Gemini CLI default | `--model` overrides per run |
| `imagine` | `gemini-2.5-flash-image` | `--model` overrides per run |

Unlike the [grok-companion](https://github.com/Gfriend997/grok-companion) siblings, this
plugin does not pick models per job type — text and review runs go through the Gemini CLI,
which owns the default.

## Cost guards

- Text and review runs spawn your Gemini CLI, so its account quota and billing apply; the
  plugin adds exactly one CLI run per job, nothing in the background.
- `imagine` makes one API call and returns one image per run.
- Every run has a timeout (default 20 min), so a hung call cannot burn quota indefinitely.

## Security model

- **The API key never touches disk.** Text/agentic runs spawn the `gemini` CLI, which reads `GEMINI_API_KEY` from the inherited environment; plugin code never reads it for those paths. Image generation reads it from `process.env` at call time and sends it only as an `x-goog-api-key` header — never a query parameter, never argv, never logged.
- Prompts travel to the CLI over stdin, not argv (argv is visible in the process list).
- Everything written to job state or logs passes a scrubber (`AIza…` pattern, labeled tokens, and the live env key value).
- Job state lives outside any repo: `%LOCALAPPDATA%\gemini-companion\` on Windows, `~/.local/share/gemini-companion/` elsewhere.
- Gemini output is treated as untrusted: commands relay it verbatim and never auto-execute its suggestions.
- Headless runs set `GEMINI_CLI_TRUST_WORKSPACE=true` for the repo you invoked them in — invoking the command on your repo is the trust decision. `--write` runs use yolo approval; without it, tool calls needing approval fail closed.

## Testing

```
node --test "tests/*.test.mjs"
```

Live end-to-end (uses your key, makes real API calls): run `setup`, a foreground `task`, `review`, a `--background` task plus `status`/`result`/`cancel`, and `image` via `scripts/gemini-companion.mjs`.

The entry script's subcommands do not all share a name with the slash commands that call them: `rescue` → `task`, `imagine` → `image`. `adversarial-review` and `transfer` are `task` runs with a different prompt preset. Everything else matches.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `GEMINI_API_KEY: NOT SET` from `setup` | The variable was set after Claude Code started. Restart Claude Code — child processes inherit the environment at launch. |
| `gemini` not found | `npm install -g @google/gemini-cli`, then confirm your global npm bin directory is on PATH. |
| A `--write` run made no edits | Without `--write`, tool calls needing approval fail closed. Re-run with `--write`. |
| Slash commands missing after install | Marketplace changes need a session restart. |

## Roadmap / TODO

- [ ] **Evaluate a secret manager instead of a plain environment variable.** A machine-wide env var is readable by every process running as your user and can leak through crash dumps or a careless `env` in a shell transcript. Options worth testing: the [1Password CLI](https://developer.1password.com/docs/cli/secret-references/) (`op run -- claude`, injecting `GEMINI_API_KEY` from a secret reference so the value exists only for the lifetime of the process), the OS keychain (Windows Credential Manager, macOS Keychain, `libsecret`), or short-lived tokens if Google ships them for this API. Decide whether the plugin reads the secret itself or stays env-only and leaves injection to the launcher — env-only is the smaller attack surface and keeps the current "key never touches disk" invariant intact.

## Routing policy

A `SessionStart` hook injects `prompts/routing-policy.md` into Claude's context each session: raster image requests and quick diff second opinions auto-route to `imagine`/`review`; heavy work (rescue delegation, adversarial review, long-context analysis, background jobs) gets a one-line confirmation first. Edit that file to change routing behavior; restart the session to pick up changes.

## Architecture

One Node entry script (`scripts/gemini-companion.mjs`), stdlib only. Per-job headless `gemini` spawns — no persistent broker (the Codex plugin's app-server protocol has no Gemini equivalent). Libraries: `gemini.mjs` (runner), `jobs.mjs` (state), `image.mjs` (REST), `scrub.mjs` (secret masking).

## Credits

Original idea and command surface: **[openai/codex-plugin-cc](https://github.com/openai/codex-plugin-cc)** (Apache License 2.0, Copyright OpenAI). That plugin worked out the pattern this one copies — slash commands for delegate/review/status/result/cancel, background jobs with an id you poll, and a companion model that returns text for a human to act on rather than editing your files behind your back. The design decisions worth having were theirs first.

No source code was copied. The runtime here was written fresh against the Gemini CLI and the Gemini image API, and the two plugins do not share a codebase. This plugin is MIT licensed and is not affiliated with or endorsed by OpenAI or Google.

Sibling plugin: [kimi-companion](https://github.com/Gfriend997/kimi-companion), same pattern for Moonshot's Kimi models.

## Known limitations

- `--resume` requires a Gemini CLI with `--resume` support; feature-detected, degrades to a fresh session with a notice.
- `transfer` is a context-handoff summary, not a true session import.
- Stop-review gate reviews only dirty working trees and never blocks on its own failure.
