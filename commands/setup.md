---
description: Verify Gemini CLI and API key, toggle the stop-review gate
argument-hint: "[--gate on|off]"
allowed-tools: Bash(node:*)
---

Run exactly one Bash command and show its stdout verbatim:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/gemini-companion.mjs" setup $ARGUMENTS
```

If the CLI is missing, offer to run `npm install -g @google/gemini-cli`. If the key is missing, tell the user to add `GEMINI_API_KEY` as an OS-level environment variable (Windows: System Properties → Environment Variables) and restart Claude Code so the new value is inherited. Never suggest a `.env` file, never ask for or echo the key value.
