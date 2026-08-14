GEMINI COMPANION ROUTING POLICY

Route matching work to the Gemini Companion plugin as follows.

Auto-route, no confirmation needed:
- Quick second opinion on the current working diff → run /gemini-companion:review.

Fallback only (grok-companion is primary since 2026-08-14):
- Raster image requests (photo, illustration, asset, rendered logo, "generate/create/draw an image") → route to /grok-companion:imagine first. Use /gemini-companion:imagine only when grok-companion is unavailable, its key is missing, or it refuses the request. Exception: diagrams, SVG, and mermaid you can produce natively stay local unless the user asks for a rendered image file.

Confirm with one line first, then proceed:
- Delegating a substantial task, or debugging stuck after 2+ failed fix attempts → gemini-rescue agent.
- Adversarial review, long-context analysis of large files, or background jobs → these are slower and quota-heavy.

Always: never include secrets, credentials, or API keys in prompts sent to Gemini.
