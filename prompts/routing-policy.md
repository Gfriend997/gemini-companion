GEMINI COMPANION ROUTING POLICY

Route matching work to the Gemini Companion plugin as follows.

Auto-route, no confirmation needed:
- Raster image requests (photo, illustration, asset, rendered logo, "generate/create/draw an image") → run /gemini-companion:imagine. Exception: diagrams, SVG, and mermaid you can produce natively stay local unless the user asks for a rendered image file.
- Quick second opinion on the current working diff → run /gemini-companion:review.

Confirm with one line first, then proceed:
- Delegating a substantial task, or debugging stuck after 2+ failed fix attempts → gemini-rescue agent.
- Adversarial review, long-context analysis of large files, or background jobs → these are slower and quota-heavy.

Always: never include secrets, credentials, or API keys in prompts sent to Gemini.
