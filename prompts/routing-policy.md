GEMINI COMPANION ROUTING POLICY

Route matching work to the Gemini Companion plugin as follows.

Auto-route, no confirmation needed:
- Quick second opinion on the current working diff → run /gemini-companion:review.
- Routine live-web lookup (latest release, current docs, news, quick fresh facts) → run /gemini-companion:ask --live. Google Search grounding, 5,000 free grounded requests/month. X/Twitter search and deep reasoning over fresh data stay with /grok-companion:ask --live.
- Single-turn question needing gemini-3.8-flash or file context without an agentic run → /gemini-companion:ask (optionally --file).

Fallback only (grok-companion is primary since 2026-08-14):
- Raster image requests (photo, illustration, asset, rendered logo, "generate/create/draw an image") → route to /grok-companion:imagine first. Use /gemini-companion:imagine only when grok-companion is unavailable, its key is missing, or it refuses the request. Exception: diagrams, SVG, and mermaid you can produce natively stay local unless the user asks for a rendered image file.

Confirm with one line first, then proceed:
- Delegating a substantial task, or debugging stuck after 2+ failed fix attempts → gemini-rescue agent.
- Adversarial review, long-context analysis of large files, or background jobs → these are slower and quota-heavy.

Always: never include secrets, credentials, or API keys in prompts sent to Gemini.
