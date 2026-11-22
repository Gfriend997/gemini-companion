# Tasks 001: Gemini core update

Revision: 1 (2026-11-22). Do not start until spec/plan revision 1 and D1-D3 are approved by Gary.

- [x] T1 Tests first: `store: false` in ask and image bodies (R1).
- [x] T2 Add `store: false` to `buildAskRequest` and image request.
- [x] T3 Tests + `TOKEN_PRICES` entries for 6 models (R3).
- [x] T4 Tests + `--thinking` flag, local validation, `thinkingConfig` in body (R4).
- [x] T5 Tests + Office/ODF `MEDIA_TYPES` entries with ZIP/OLE magic (R5).
- [x] T6 Image default per D1 + test (R2).
- [x] T7 Docs: README, commands/ask.md, commands/imagine.md, routing policy (R6).
- [x] T8 Bump version to 0.3.0.
- [x] T9 Run unit tests and hooks JSON check.
- [x] T10 Live E2E after credits restored and Gary's go-ahead ("please test the gemini again", 2026-11-22); resolve open items; record results here.

## Live E2E results (2026-11-22)

| Test | Result |
|---|---|
| `ask` (default `gemini-3.8-flash`) | PASS: "PONG". Request with top-level `store: false` accepted (no 400). |
| `ask --live` | PASS: grounded answer, sources listed, wrapped as untrusted. |
| `ask --thinking low` | PASS: correct answer (391). |
| `ask --model gemini-4-hydrogen --thinking xhigh` | PASS: "OK"; cost line priced the model (no "n/a"). |
| `ask --thinking minimal` on 3.8 Flash | PASS (expected reject): API 400 "Thinking level MINIMAL is not supported for this model", relayed. |
| `ask --file test.docx` | PASS: read document content ("Mango"); privacy note shown. |
| `image` (default `gemini-nano-banana-2.1`) | PASS: PNG written and visually checked. |
| `task` via Gemini CLI 0.70.0 | PASS: "PONG"; CLI served `gemini-3.5-flash-lite` (router) + `gemini-3.8-flash`. |

Open items resolved: `store` is accepted as a top-level generateContent field; `generationConfig.thinkingConfig.thinkingLevel` with lowercase values works; the DOCX MIME string is accepted. Other Office MIME strings (pptx, xlsx, ods, doc, ppt, xls, odt, odp, dotx) were not live-tested. Whether `store: false` actually suppresses AI Studio logs was not checked in the AI Studio dashboard.

## Approvals

| Artifact | Revision | Approver | Source | Date |
|---|---|---|---|---|
| spec.md / plan.md / tasks.md | 1 | Gary | Claude Code chat, "Approve as written"; D1 = gemini-nano-banana-2.1 | 2026-11-22 |
