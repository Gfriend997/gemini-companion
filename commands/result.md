---
description: Fetch the output of a finished Gemini background job
argument-hint: "--id <job-id>"
allowed-tools: Bash(node:*)
---

Run exactly one Bash command and show its stdout verbatim:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/gemini-companion.mjs" result $ARGUMENTS
```
