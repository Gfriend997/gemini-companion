---
description: Hand the current Claude session's context to Gemini as a task
argument-hint: "[--background] [--write] [instruction for Gemini]"
allowed-tools: Bash(node:*)
---

Gemini cannot import Claude sessions, so build a context handoff:

1. Write a compact briefing of the current session: objective, current state, files touched, decisions made, known issues, and the user's instruction ($ARGUMENTS). No secrets, no API keys, no credentials — review the briefing text before sending.
2. Run exactly one Bash command with that briefing as the task prompt, passing through `--background`/`--write` if present:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/gemini-companion.mjs" task "<briefing>" [flags]
```

3. Show the stdout verbatim.
