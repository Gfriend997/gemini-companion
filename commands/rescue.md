---
description: Delegate a task, investigation, or fix to Gemini
argument-hint: "[--background] [--write|--read-only] [--resume] [--model <model>] [what Gemini should do]"
allowed-tools: Bash(node:*), Agent
---

Invoke the `gemini-companion:gemini-rescue` subagent via the `Agent` tool (`subagent_type: "gemini-companion:gemini-rescue"`), forwarding the raw user request as the prompt. The final user-visible response must be Gemini's output verbatim — no paraphrase, no commentary.

Raw user request:
$ARGUMENTS

Rules:

- `--background` runs the job detached; default is foreground.
- `--write` allows Gemini to edit files (maps to yolo approval); default for substantial implementation asks. Use read-only for pure diagnosis/review asks or when `--read-only` given.
- `--resume` continues Gemini's latest session; otherwise fresh.
- `--model` passes through only when the user names one.
- If Gemini or the key is missing, the script says so — tell the user to run `/gemini-companion:setup`.
- If no request text given, ask what Gemini should do.
