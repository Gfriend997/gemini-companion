---
name: gemini-prompting
description: Shaping task prompts for Gemini before forwarding them
---

# Prompting Gemini

Use only to tighten a request into a better Gemini prompt before forwarding. Never to solve the problem yourself.

- State the goal, the repo-relative files involved, and the definition of done in the first lines.
- Gemini works in the repo cwd with its own tools; tell it what to verify (tests to run, commands to check) rather than pasting file contents.
- For diagnosis: describe symptom, exact error text, and what was already ruled out.
- For implementation: name constraints (no new dependencies, follow existing patterns, which tests must pass).
- Keep prompts under a few hundred words; Gemini reads the repo itself.
- Never include secrets, API keys, tokens, or customer data in a prompt.
