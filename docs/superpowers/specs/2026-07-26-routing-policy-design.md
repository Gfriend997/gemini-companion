# Gemini routing policy — design

Date: 2026-07-26
Status: approved by Gary (session discussion)

## Problem

Plugin commands work but nothing steers Claude toward them. When Gary asks for an
image (or wants a second opinion), Claude has no standing instruction to route the
task to Gemini. Skill descriptions alone trigger unreliably.

## Solution

Inject a routing policy into context at every session start via a `SessionStart`
hook — the same mechanism the Stop review gate uses, and the same pattern other
plugins (ponytail, caveman) use for persistent behavior.

No new subagent, no new skills. Policy text steers Claude to existing commands
(`imagine`, `review`) and the existing `gemini-rescue` agent.

## Policy rules

Auto-route (no confirmation):

- Raster image requests (photo, illustration, asset, rendered logo) →
  `/gemini-companion:imagine`. Exception: diagrams/SVG/mermaid Claude produces
  natively stay local unless the user wants a rendered image.
- Quick second opinion on the current diff → `/gemini-companion:review`.

Ask first (one-line confirmation, then proceed):

- Substantial task delegation, or debugging stuck after 2+ failed fix attempts →
  `gemini-rescue` agent.
- Adversarial review, long-context analysis of large files, background jobs —
  slower and quota-heavy.

Always: existing security invariant holds — no secrets/credentials in prompts.

## Decisions (from brainstorming)

- Scope: full routing policy, not images-only (Gary's choice).
- Control: auto for cheap operations, confirm for heavy ones.
- Location: plugin hook, not global CLAUDE.md — versioned with the repo, ships
  with the plugin, cannot drift from plugin capabilities.

## Files

- `prompts/routing-policy.md` — policy text (content = context injection payload)
- `scripts/print-routing-policy.mjs` — prints the policy file to stdout
- `hooks/hooks.json` — add `SessionStart` entry

## Testing

- Run `node scripts/print-routing-policy.mjs`, verify exact policy text on stdout,
  exit 0.
- Verify `hooks.json` parses as JSON.
- Fresh-session smoke test: "generate an image of a cat" routes to `imagine`
  without prompting (manual, after install refresh).

## Limitations

- Policy is advisory context, not enforcement — Claude can still deviate; hook
  guarantees the instruction is present, not obeyed.
- Session must restart to pick up hook changes.
