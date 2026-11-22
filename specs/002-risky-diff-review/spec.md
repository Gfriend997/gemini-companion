# Spec 002: Gemini diff review only on risky diffs

Revision: 1 (2026-11-22). Status: APPROVED rev 1 with change (Gary, chat, 2026-11-22: "Approve + update plugin"). R5 and T2 are replaced: reinstall the plugin from source instead of patching the cache. Gary accepted that this also installs the unmerged v0.3.0 branch `feat/gemini-core-update`.
Request (Gary, Claude Code chat, 2026-11-22): "update the hook so Gemini review only runs on risky diffs".

## Problem

The SessionStart routing policy (`prompts/routing-policy.md`) tells Claude to auto-route every "quick second opinion on the current working diff" to `/gemini-companion:review`. On 2026-11-22 Gary decided that a Claude Sonnet 5.5 subagent is the primary reviewer, and that Gemini adds a second opinion only for large or risky diffs, never for confidential code (decision 7 in `Projects/Computer_Setup/docs/agent-setup/claude-session-rules-2026-11-22.md`).

## Requirements

- **R1.** Remove routine diff review from the "Auto-route, no confirmation needed" list.
- **R2.** Add an auto-route entry: run `/gemini-companion:review` only when the diff is large or touches risky areas (auth, secrets, data storage or deletion, money or payments, schema or data migrations, security controls). Routine diffs get no Gemini review unless the user asks.
- **R3.** Never send confidential or client-confidential code to Gemini for review.
- **R4.** Explicit user requests (`/gemini-companion:review`, "ask Gemini to review") still run.
- **R5.** Apply the same text to the installed plugin copy so the next session uses it without installing the unmerged v0.3.0 branch.

## Exclusions

No code, command, test or version change. The Stop review gate (`hooks.json`, off by default) is unchanged. The Kimi companion's routing line ("Routine second opinion on a diff belongs to Gemini") has no local source here and is out of scope.

## Acceptance criteria

- The routing policy no longer auto-routes routine diffs to Gemini, and it states the risky-diff trigger and the confidentiality rule.
- `hooks/hooks.json` still parses, and `node --test "tests/*.test.mjs"` passes.
- The installed copy (`~/.claude/plugins/cache/gemini-companion/gemini-companion/0.2.0/prompts/routing-policy.md`) has the same review lines.

## Plan and tasks

- T1. Edit the review line in `prompts/routing-policy.md` (R1 to R4).
- T2. Apply the same line edit to the installed cache copy (R5). Leave its other lines, which are v0.2.0 text, unchanged.
- T3. Run the hooks JSON check and the unit tests.

Decision: patching the cache copy directly is a shortcut. Updating the plugin from source would also install the unmerged v0.3.0 branch, `feat/gemini-core-update`. The next plugin update replaces the cache copy with source, and source contains the same change.

REA: not applicable. The change is to instruction text only and has no analysis target.

## Results (2026-11-22)

- T1 done: `prompts/routing-policy.md` review line replaced.
- T3 passed: `hooks.json` parses. Unit tests: 40 pass, 0 fail, 1 skipped.
- T2, as changed by Gary: ran `claude plugin marketplace update gemini-companion`, then `claude plugin update gemini-companion@gemini-companion`. Result: 0.2.0 to 0.3.0, user scope. The installed 0.3.0 copy contains the new review line. Restart sessions to apply it.
- Not committed. The branch `feat/gemini-core-update` remains unmerged.
