# Development workflow

Use mise for all project commands. `mise run dev` starts the client and server. Never replace the fixed camera with orbit controls: its azimuth stays fixed, and it follows the player from above.

Debug without computer use. Never control the user's desktop, apps, or existing browser sessions. Use terminal commands and the isolated headless Playwright browser in `mise run playtest` to play, capture screenshots, and inspect runtime state.

For actual user hardware performance, run `mise run perf` and read `artifacts/performance/<session-id>.jsonl`. The game logs manual browser sessions automatically in development; headless runs are tagged automated and excluded from the default report. Do not claim hardware performance from SwiftShader FPS. Read p95/p99 frame intervals, slow frames, viewport/pixel ratio, draw calls, settings, and GPU identity. Render submission is CPU timing, not GPU timing. Never use desktop/browser control to collect these logs.

Keep the game simple and performant. Batch repeated scenery with InstancedMesh; use procedural shaders for grass and water; create new models through Blender (`scripts/models.py`, `mise run assets`). Commit both exported GLBs and editable `.blend` source models when changing assets.

World tuning lives in `settings.json`, validated and exposed by `shared/config.js`. Use the editor or file reload to inspect changes. Gameplay remains authoritative on the server. Avoid adding client-only authoritative values.

After meaningful changes, run `mise run check` and inspect screenshots in `artifacts/`. Use the read-only `window.__game` hook to observe state and metrics. Play through keyboard, mouse, and editor controls. Do not introduce test-only teleport or combat bypasses. Automated playtests temporarily edit settings and restore them; do not run them concurrently with a human's configuration edits.

Respect render budgets (<200 calls, <150k triangles in the starter scene); do not add expensive postprocessing by default. Document limits accurately: this is a local single-zone multiplayer prototype with in-memory progress, not a production MMO.
