---
description: Generate an image with Gemini (Nano Banana)
argument-hint: "[--model <model> | --hq] [--out <file.png>] <image description>"
allowed-tools: Bash(node:*)
---

Run exactly one Bash command and show its stdout verbatim:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/gemini-companion.mjs" image $ARGUMENTS
```

Default model is `gemini-2.5-flash-image` (free-tier quota). `--hq` selects `gemini-3-pro-image` at ~$0.134 per image with no free tier; it cannot be combined with `--model`. Imagen models need a paid tier too; if the API returns a quota or permission error, say so plainly. Report the written file path back to the user.
