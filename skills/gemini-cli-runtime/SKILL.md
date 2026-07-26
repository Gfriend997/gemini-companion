---
name: gemini-cli-runtime
description: Contract for invoking the gemini-companion runtime script from Claude Code
---

# Gemini companion runtime

Single entry point: `node "${CLAUDE_PLUGIN_ROOT}/scripts/gemini-companion.mjs" <subcommand> [flags]`

| Subcommand | Purpose | Key flags |
|---|---|---|
| `setup` | Check CLI + key, toggle stop gate | `--gate on\|off` |
| `task "<prompt>"` | Run Gemini on a task | `--background --write --model <m> --resume-last --timeout-mins <n>` |
| `review` | Review current git diff | `--adversarial --base <ref> --model <m>` |
| `status` | List jobs / one job | `--id <job-id>` |
| `result` | Print finished job output | `--id <job-id>` |
| `cancel` | Kill a background job | `--id <job-id>` |
| `image "<prompt>"` | Generate image via API | `--model <m> --out <file>` |

Rules:

- Prompt text is passed as a quoted positional argument; the script forwards it to Gemini over stdin.
- `--write` lets Gemini edit files (yolo approval). Without it, runs are effectively read-only: tools needing approval fail closed in headless mode.
- Never pass, echo, or log `GEMINI_API_KEY`. The script and CLI read it from the environment themselves.
- Exit code 1 means failure; stderr carries the reason. Relay it, do not retry blindly.
