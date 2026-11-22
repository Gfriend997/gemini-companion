# Spec 001: Gemini core update (Nov 2026)

Revision: 1 (2026-11-22). Status: APPROVED rev 1 (Gary, chat, 2026-11-22: "Approve as written").
Scope chosen by Gary: "Core fixes" (chat, 2026-11-22). Jev recommended `core_fixes` with confidence 0.60 (<= 0.70, so the human chose).

## Problem

The plugin (v0.2.0, commit 456ac74) predates several Gemini API changes from Sep-Nov 2026. It still works with any model ID passed via `--model`, but:

- Paid projects created on/after 2026-10-26 store generateContent requests by default (AI Studio logs, 55-day default retention). The plugin never opts out.
- Image default `gemini-2.5-flash-image` shuts down 2027-03-15.
- The cost table lacks Gemini 4 and `gemini-3.6-flash` prices, so cost prints "n/a".
- `ask` cannot set thinking level.
- `ask --file` rejects Office/OpenDocument files the API now accepts.
- Docs do not mention model reroutes (`gemini-3.7-flash` -> `gemini-3.8-flash`, `gemini-3.5-flash` -> `gemini-3.6-flash`; `gemini-2.5-pro`/`gemini-2.5-flash` reroute 2026-12-01).

## Requirements

- **R1 Privacy opt-out.** `ask` and `image` requests send `store: false` so requests are not logged in AI Studio. If live verification shows the generateContent API rejects the field, remove it and document the AI Studio project-level logging setting instead.
- **R2 Image default.** Change the default image model to `gemini-nano-banana-2.1` (D1). `--hq` stays `gemini-3-pro-image`.
- **R3 Prices.** `TOKEN_PRICES` covers `gemini-3.6-flash`, `gemini-3.5-flash-lite`, `gemini-4-hydrogen`, `gemini-4-neon`, `gemini-4-carbon`, `gemini-4-argon`, with the source date. Unknown models still print "n/a".
- **R4 Thinking level.** `ask --thinking <minimal|low|medium|high|xhigh>` sets the thinking level. Invalid values fail locally before any request. Model-specific rejection by the API is relayed as the API error.
- **R5 Office files.** `ask --file` accepts .docx .dotx .odt .pptx .xlsx .xls .doc .ppt .odp .ods, up to 50 MB each, magic-byte checked (ZIP `PK\x03\x04` for OOXML/ODF; OLE `D0 CF 11 E0` for DOC/PPT/XLS), with the existing media privacy note and credential-name checks.
- **R6 Docs.** README, `commands/ask.md`, `commands/imagine.md` and the routing policy reflect R1-R5 and the reroutes.

## Exclusions

Decisions API, Interactions API (Genie 4, tool retrieval), computer use, `url_context`, code execution, TTS, Omni video, embeddings, `gemini-api` CLI, `task`/`review` thinking control, changing the `ask` default model (see D2).

## Acceptance criteria

1. `node --test "tests/*.test.mjs"` passes with new tests for R1, R3, R4, R5.
2. Request bodies built by `buildAskRequest` and the image request include `store: false` (unit test).
3. `ask --thinking bogus` exits non-zero with no network call.
4. A .docx and .xlsx with valid magic bytes load; a renamed .txt as .docx is rejected.
5. Live (after credits are restored, with Gary's go-ahead): `ask`, `ask --live`, `ask --thinking low`, `ask --file x.docx`, default `image` each return a result; R1 field accepted.

## Failure cases

- API rejects `store` -> R1 fallback path; must not break `ask`.
- Model rejects a thinking level -> relay API error verbatim, scrubbed.
- Office file over 50 MB -> local rejection.

## Open items (verify live)

- Exact generateContent REST placement of `store` (docs show SDK `config.store` only).
- `generationConfig.thinkingConfig.thinkingLevel` casing for generateContent (docs show Interactions `generation_config.thinking_level`, lowercase values).
- Office MIME strings came from a truncated docs page summary.

## REA applicability

Not needed: this changes an identified plugin Gary owns; behavior is understood from direct code review. No REA run.

## Sources

Gemini API changelog, models, pricing, deprecations, thinking, document-processing and google-search pages at aistudio.google.com/docs (redirected from ai.google.dev), read 2026-11-22.
