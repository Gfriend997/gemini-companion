# Before coding

Use the fork source and exact revision in `fork-source.json`. Existing local customizations are preserved and listed in that record. Do not overwrite them through blanket initialization or upgrades.

Before implementing an actual change:

- Verify the existing organization/project/workspace mapping and capture the authorized task and permanent start record.
- Read the actual project constitution and existing instructions. Resolve any blocking conflict before dependent work.
- Write or update the feature's `spec.md`, `plan.md`, `tasks.md` and material decisions. The decision record may be a linked section in the plan or a focused `decisions.md`; do not duplicate authority.
- Resolve material ambiguity. Include scope, exclusions, measurable acceptance criteria, failure cases and verification. Record REA applicability and evidence as required by the standing workflow; do not invent an analysis run for a targetless change.
- Obtain the required actual model assessments and human reviews. Record the actual approval source, scope and artifact revision, keeping recommendations distinct from human choices. The presence of files or a checked box is not approval.
- Review consistency and use the appropriate `$speckit-*` skill before implementation. For a defect, write assessment and repair scope before `$speckit-bug-fix`, then verify through `$speckit-bug-test`.
- If behavior or scope changes, update the affected records before coding that change. Complete appropriate tests, review and convergence before claiming completion.

Generated templates are not completed specifications. Existing code without contemporary artifacts is a historical coverage limit, not permission to fabricate a prior spec or approval. Create prospective artifacts for the next authorized change. This is an instruction gate for participating agents, not a mechanical filesystem or Git enforcement hook.

For new workspaces, use the pinned installed CLI with the Codex integration and PowerShell scripts. Initialize in staging and review collisions before merging into a nonempty workspace. Keep the selected fork when upgrading; do not use a default upgrade route that silently substitutes upstream.
