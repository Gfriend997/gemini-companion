# Plan 001: Gemini core update

Revision: 1 (2026-11-22). Status: APPROVED rev 1 (Gary, chat, 2026-11-22). Implements [spec.md](spec.md).

## Changes by file

| File | Change |
|---|---|
| `scripts/lib/ask.mjs` | `buildAskRequest` adds `store: false` and optional `generationConfig.thinkingConfig.thinkingLevel`; `askGemini` takes `thinking`; `MEDIA_TYPES` gains 10 Office/ODF entries (50 MB, ZIP/OLE magic). |
| `scripts/lib/image.mjs` | Default model per D1; request body adds `store: false`. |
| `scripts/lib/gemini.mjs` | `TOKEN_PRICES` adds 6 models, source date 2026-11-22. |
| `scripts/gemini-companion.mjs` | `ask` gains `--thinking` with local validation; usage strings. |
| `tests/ask.test.mjs`, `tests/image.test.mjs`, `tests/gemini.test.mjs` | Tests for each requirement. |
| `README.md`, `commands/ask.md`, `commands/imagine.md`, `prompts/routing-policy.md` | Docs (R6). |
| `.claude-plugin/plugin.json` | Version 0.3.0. |

Invariants unchanged: key handling, stdin prompts, scrub boundary, stdlib only.

## Decisions

- **D1 Image default.** DECIDED by Gary 2026-11-22: `gemini-nano-banana-2.1` (Google's recommended default image model). Jev recommended `gemini-3.1-flash-lite-image` at confidence 0.52 (<= 0.70, human decided). Reason given: none stated.
- **D2 Ask default.** Proposed: keep `gemini-3.8-flash` (GA, free tier, supports Google Search grounding; Grok routing policy depends on its free grounding quota). `gemini-4-hydrogen` costs 2x and has no free-tier grounding. Revisit before 3.8 Flash's 2027-01-01 price change. APPROVED by Gary 2026-11-22.
- **D3 Store opt-out.** Proposed: send `store: false` by default, no flag to turn it on. APPROVED by Gary 2026-11-22.
- **D4 Thinking validation.** Validate against the union set locally; let the API reject per-model mismatches. Avoids a per-model table that goes stale.

## Verification

1. `node --test "tests/*.test.mjs"`.
2. `node -e "JSON.parse(require('fs').readFileSync('hooks/hooks.json','utf8'))"`.
3. Live E2E (acceptance 5) only after credits are restored and Gary says go.

## Rollback

Plugin reads from the local clone: `git checkout 456ac74` restores v0.2.0.
