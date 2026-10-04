# Emberfall

A small, playable Three.js multiplayer RPG foundation for fast AI iteration. Fixed orthographic camera, deterministic forest, procedural water and wind-blown instanced grass, Blender-authored GLB models, authoritative movement/combat, mobs, a quest, gold, healing, respawn, and world chat.

## Local setup with mise

Install [mise](https://mise.jdx.dev/getting-started), then run from this directory:

```sh
mise trust
mise run setup
mise run dev
```

Open **http://127.0.0.1:5173**. Open a second browser tab for another player. Development services bind to localhost. Node is pinned in `mise.toml`; dependency versions are locked in `package-lock.json`.

Blender 5.0 is installed on this workstation. The exported models are included, so playing does not require Blender. To regenerate them:

```sh
mise run assets
```

Elsewhere, install Blender and place it on PATH or set `BLENDER_PATH` to the executable. Model generation writes editable sources to `assets/blender/` and small GLBs to `public/models/`.

## Play

WASD or arrow keys move relative to the screen. Click ground to travel directly (collision-aware, no pathfinding). Space cleaves nearby enemies, Q casts a spirit nova, E heals. Enter focuses world chat. Camp regenerates health. Defeat five mosslings to earn a quest reward. F3 displays performance metrics. Settings opens the world editor.

## Live world configuration

Edit **`settings.json`** while development is running. Valid changes update both browser tabs immediately and gameplay on the server within 250 ms. Invalid changes leave the last valid configuration active and show an error in the editor. No page reload is needed.

The right-side editor is grouped by Water, Grass, Lighting, Terrain, Camera, Gameplay, and Performance. Sliders and color pickers preview the world immediately. **Save to JSON** persists the configuration; **Reload file** discards previews. Gameplay changes take authoritative effect on Save. External changes during a pending preview report a conflict; reload before saving. In a production build, Save downloads JSON instead of writing to the server.

`shared/config.js` defines the controls, limits, and validation in one place. Add fields there, to `settings.json`, and to the consumer in `src/environment.js`, `src/main.js`, or `server/simulation.js`.

## Prop placement

`placements.json` is the source for all placed pines, boulders, leafy understory, logs, lanterns, docks, wardstones, and campfires. Each entry has a stable `id`, a `model`, world-space `x`, `y`, and `z`, a Y-axis `rotation` in radians, and a uniform `scale`. Leaf clusters also have an optional hex `tint`. For example:

```json
{"id":"lantern-0001","model":"lantern","x":4,"y":0,"z":-1,"rotation":-0.5,"scale":1}
```

Edit transforms, add entries with unique IDs, or delete entries to move/add/remove props. Valid development edits reload the browser scene; the server polls every 250 ms to update tree collisions and camp healing. Browser reloads reconnect the player, resetting their in-memory progress. Invalid edits keep the last valid scene and server placements. `shared/placements.js` validates the versioned format; a future drag-and-drop editor should save this same format and preserve IDs. Drag-and-drop and a placement write API are not implemented yet. Production builds include a validated copy of the JSON; rebuild after editing placements for production.

Grass, reeds, small flowers, gravel, terrain paths, and water remain procedural. Spawn points and the lake boundary remain in `shared/world.js`. Rocks and other decorative props remain nonblocking; pines retain the existing server-authoritative collision behavior. The placement system keeps scenery instanced.

## AI development loop

1. Run `mise run dev` and keep it running. Vite reloads code edits; shaders and configuration are easy to tune in small steps.
2. Edit gameplay, shaders, or models. Run `mise run assets` after changing `scripts/models.py`; inspect `.blend` sources in Blender for manual edits.
3. Run `mise run check` for build, server tests, and a real Chromium playtest. Playtests launch their own servers and restore settings and placements after completion. Avoid concurrent manual edits to either JSON file during that test.
4. Inspect `artifacts/world.png`, `editor.png`, `performance.png`, `compact.png`, and `playtest.json`. Iterate using screenshots, browser errors, and renderer metrics. `window.__game` exposes read-only state, configuration, projected coordinates, and performance for automation; use normal keyboard/mouse interactions to play.

Task shortcuts: `mise run build`, `mise run test`, `mise run playtest`. Browser automation uses an isolated headless Playwright instance; it never controls the user's desktop or existing browser sessions. Tests exercise movement, collisions, cooldowns, rewards, two clients, chat, live slider changes, JSON saves, external edits, save conflicts, malformed settings, and render budgets. Reports include the GPU renderer because software-rendered headless FPS is not representative of hardware browser performance.

## Structure and performance

Local browser performance logging starts automatically with `mise run dev`. Play normally at **http://127.0.0.1:5173**; no browser or desktop control is needed. Every five seconds, measurements are appended to `artifacts/performance/<session-id>.jsonl`. F3 shows logger status and the session prefix. Reloading starts a new session. Partial windows are also sent when the tab is hidden or closed; closing delivery is best effort.

Run **`mise run perf`** to read the latest manual session. `mise run perf -- --all` lists manual and automated sessions; `mise run perf -- <session-id>` selects one. Manual and headless sessions have separate files. The report shows visible-play duration, overall and per-window FPS, p95/p99 frame intervals, 1% low FPS, worst frames, draw calls, triangles, GPU renderer, viewport/pixel ratio, grass density, and shadows. Raw records also include geometry/texture counts, camera settings, exposure, player/mob counts, and JS heap usage when the browser exposes it. Read logs directly with terminal/file tools to inspect performance while the user plays.

Frame intervals use unclamped animation timestamps. Hidden-tab time and the first interval after returning are excluded. CPU work and render-submission times measure main-thread execution, **not GPU execution time**. FPS reflects the real browser's presentation scheduling, including display refresh, CPU/GPU limits, and browser throttling. GPU identity flags software rendering; it does not prove a GPU bottleneck. Logging stays on the local development server and is disabled in production builds. Each session is capped at 8 MiB; reload for a new log if it fills. Failed deliveries retry with a bounded queue.

- `src/`: rendering, input, UI, live editor; custom GPU shaders for water/ground/grass.
- `shared/`: deterministic map/collisions and configuration schema.
- `server/`: 20 Hz authoritative world; 10 Hz snapshots with client prediction/interpolation.
- `scripts/`: dev orchestration, Blender generation, settings endpoint, browser playtest.
- `tests/`: simulation and network integration.

Layered pines, ferns, slate boulders, fallen logs, lanterns, docks, flowers, gravel, and 15,000 grass tufts are instanced. Pines and ferns use UV-mapped RGBA cutouts, alpha-tested depth-writing materials, matching cutout shadows, and mipmaps that preserve foliage coverage at distance. Textures are generated alongside the Blender models in `public/textures/` and packed into the editable `.blend` files and exported GLBs. Trees, ferns, and boulders use spatial batches for offscreen culling. Grass density changes the instance count without reallocating buffers; the densest undergrowth is in the central clearing and surrounding forest. Path shaders add worn dirt, irregular edges, and pebbles, complemented by instanced gravel. Static Blender parts are merged by material. One directional shadow map, no postprocessing, capped pixel ratio, shared geometry/materials. The editor exposes quality controls. Actual frame rate depends on GPU and viewport; draw calls and triangle counts are recorded in playtests.

This is an **MMORPG development foundation**, not a deployed massive world. The starter permits 64 connections in one in-memory zone; accounts, persistence, inventory, cross-zone scaling, production hosting, TLS, and robust anti-cheat are future work. Progress resets when a player disconnects. Vite's JSON write endpoint exists only during local development.
