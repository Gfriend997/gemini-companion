---
description: Generate an image with Gemini (Nano Banana)
argument-hint: "[--model <model>] [--out <file.png>] <image description>"
allowed-tools: Bash(node:*)
---

Run exactly one Bash command and show its stdout verbatim:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/gemini-companion.mjs" image $ARGUMENTS
```

Default model is `gemini-2.5-flash-image` (free-tier quota). `--model gemini-3-pro-image` (GA since Aug 2026) and Imagen models need a paid tier — if the API returns a quota/permission error, say so plainly. Report the written file path back to the user.
