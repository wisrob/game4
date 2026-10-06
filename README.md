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

WASD or arrow keys move relative to the screen. Click ground to travel directly (collision-aware, no pathfinding). Space cleaves a forward arc with a subdued white slash; Q casts a larger, bright orange skill slash. Both strokes sweep from left to right across the forward arc. Mobs show white slashes when they attack. Damaged players and mobs flash red for 0.4 seconds; E uses a healing potion with a white tint fading over 1.2 seconds. Hit flashes take priority when damage overlaps a potion, then return to the remaining potion tint and original colors. Enter focuses world chat. Camp regenerates health. Defeat five mosslings to earn a quest reward. F3 displays performance metrics. Settings opens the world editor. Under gameplay, `attackArcDegrees` and `skillArcDegrees` set the forward hit arcs (120° and 150° by default, up to 360°); save to apply them on the server. Slash visuals use the server's heading, range, and arc at cast time.

## Live world configuration

Scroll the mouse wheel over the world to zoom in or out. Camera settings provide **Min zoom** (default 0.6), **Max zoom** (default 1.8), and **Angle**. Higher zoom values give a closer view; both limits support 0.3–3, with min no greater than max. Changing a limit clamps the current view immediately. The camera keeps its fixed direction and follows the player.

Edit **`settings.json`** while development is running. Valid changes update both browser tabs immediately and gameplay on the server within 250 ms. Invalid changes leave the last valid configuration active and show an error in the editor. No page reload is needed.

The right-side editor is grouped by Water, Grass, Lighting, Terrain, Camera, Characters, Gameplay, and Performance. Sliders and color pickers preview the world immediately. Characters includes a visual player scale (default 1.2); it does not change collision or combat ranges. **Save to JSON** persists the configuration; **Reload file** discards previews. Gameplay changes take authoritative effect on Save. External changes during a pending preview report a conflict; reload before saving. In a production build, Save downloads JSON instead of writing to the server.

`shared/config.js` defines the controls, limits, and validation in one place. Add fields there, to `settings.json`, and to the consumer in `src/environment.js`, `src/main.js`, or `server/simulation.js`.

Lighting includes **Sun X**, **Sun Height**, and **Sun Z** to position the directional light relative to the player. X and Z range from -40 to 40; height ranges from 2 to 60. Adjust them to change the light and shadow direction. The sun target follows the player to keep shadow coverage nearby; current defaults are (-19, 39, -36). Neutral sunlight and cooler hemisphere fill soften shadow contrast.

## Prop placement

`placements.json` is the source for all placed pines, boulders, leafy understory, logs, lanterns, docks, wardstones, and campfires. Each entry has a stable `id`, a `model`, world-space `x`, `y`, and `z`, a Y-axis `rotation` in radians, and a uniform `scale`. Leaf clusters also have an optional hex `tint`. For example:

```json
{"id":"lantern-0001","model":"lantern","x":4,"y":0,"z":-1,"rotation":-0.5,"scale":1}
```

Open Settings → Props and enable **Move props in scene**, then click and drag any placed prop along the ground. A highlight marks the selection. The Type and Prop lists reach every prop, including those outside the camera view. Position X/Y/Z, rotation (radians), and scale fields preview precise transforms. **Save props** writes `placements.json`; **Reload props** discards previews. Gameplay movement pauses while scene dragging is enabled. Saves update tree collisions and camp healing on the server within 250 ms. Concurrent file edits require reloading before saving. In production, Save props downloads the JSON for use in a rebuild.

You can also edit transforms, add entries with unique IDs, or delete entries directly in the file. Transform changes update the scene without reconnecting players; adding/removing props or changing models reloads the browser. Invalid edits keep the last valid scene and server placements. `shared/placements.js` validates the versioned format. Production builds include a validated copy of the JSON; rebuild after editing placements for production.

Grass, reeds, gravel, terrain paths, and water remain procedural. Wildflowers, lily pads, and submerged rocks use deterministic decorative placements and instanced Blender models. Spawn points and the lake boundary remain in `shared/world.js`. Rocks and other decorative props remain nonblocking; pines retain the existing server-authoritative collision behavior. The placement system keeps scenery instanced.

## AI development loop

1. Run `mise run dev` and keep it running. Vite reloads client code; edits to JavaScript in `server/` or `shared/` automatically restart the backend and reconnect players. Backend code restarts reset in-memory progress. Settings and placement file edits still reload without restarting. After upgrading the dev launcher, restart `mise run dev` once to enable watching.
2. Edit gameplay, shaders, or models. Run `mise run assets` after changing `scripts/models.py`; inspect `.blend` sources in Blender for manual edits.
3. Run `mise run check` for build, unit tests, and a short Chromium smoke test covering world loading, keyboard movement, close zoom, browser errors, and render budgets. It does not edit settings or placements. Use `mise run check-full` for the complete gameplay/editor suite, or a focused playtest flag for the feature being changed. Those longer tests restore settings and placements after completion; avoid concurrent manual edits to either JSON file during them.
4. Inspect `artifacts/smoke-world.png`, `smoke-close.png`, and `smoke-playtest.json`. The full suite also saves `world.png`, `editor.png`, `performance.png`, `compact.png`, and `playtest.json`. Iterate using screenshots, browser errors, and renderer metrics. `window.__game` exposes read-only state, configuration, projected coordinates, and performance for automation; use normal keyboard/mouse interactions to play.

Task shortcuts: `mise run build`, `mise run test`, `mise run playtest`. Browser automation uses an isolated headless Playwright instance; it never controls the user's desktop or existing browser sessions. Tests exercise movement, collisions, cooldowns, rewards, two clients, chat, live slider changes, JSON saves, external edits, save conflicts, malformed settings, and render budgets. Reports include the GPU renderer because software-rendered headless FPS is not representative of hardware browser performance.

The editor's post-processing section controls brightness, contrast, and saturation through validated `settings.json` values. Color grading applies to the world canvas after tone mapping, leaving the HUD unchanged. These browser compositor filters add no Three.js render passes; compositor cost is not included in render-submission timing. Set all three sliders to 1 for neutral color, or disable the section to bypass grading. Canvas `toDataURL` captures omit compositor grading; Playwright page screenshots include it. Run `mise run playtest -- --smoke --grading` for a short editor preview check and graded/ungraded screenshots.

Slash validation records eight rendered frames per attack: before, six animation phases, and after. Run `mise run playtest -- --slashes-only` for a focused visibility check, or run the full `mise run check-full`. It uses normal keyboard casts at default and close zoom, without pausing time or staging the scene. Inspect `artifacts/regular-default-sequence.png`, `skill-default-sequence.png`, `regular-close-sequence.png`, and `skill-close-sequence.png`; individual frames and pixel-count reports live under `artifacts/slashes/`. The test requires visible white/orange stroke pixels in at least three frames, checks that they disappear afterward, and checks render budgets while the effects are active. A state event alone cannot pass this visual check. Slashes render as overlays so foreground foliage cannot hide the stroke.

Gameplay exposes `attackRange`, `skillRange`, and `mobAttackRange` in world units (defaults 1.5, 1.9, and 1.15). These replace the separate visual-radius settings: slash radius equals the server-authoritative damage range. Adjust them in the editor and Save to JSON, or edit `settings.json`; subsequent attacks use the saved range. Mobs approach within their configured range. Slashes follow the rendered attacker while moving, retaining the attack's starting heading, and cycle through horizontal and ±20° diagonal swing planes. Each actor has its own swing sequence; potions and cooldown-rejected attacks do not advance it. Moving-attack screenshots are saved as `artifacts/moving-slash-0.png` through `moving-slash-2.png`.

## Structure and performance

Mob pursuit stops at `mobAttackRange`, not inside it. Movement is clamped to the remaining gap so fast movement or long ticks cannot overshoot; mobs back away if a player closes that gap. Attacks include the exact range boundary. Normal terrain collision still applies to both pursuit and retreat.

Local browser performance logging starts automatically with `mise run dev`. Play normally at **http://127.0.0.1:5173**; no browser or desktop control is needed. Every five seconds, measurements are appended to `artifacts/performance/<session-id>.jsonl`. F3 shows logger status and the session prefix. Reloading starts a new session. Partial windows are also sent when the tab is hidden or closed; closing delivery is best effort.

Run **`mise run perf`** to read the latest manual session. `mise run perf -- --all` lists manual and automated sessions; `mise run perf -- <session-id>` selects one. Manual and headless sessions have separate files. The report shows visible-play duration, overall and per-window FPS, p95/p99 frame intervals, 1% low FPS, worst frames, draw calls, triangles, GPU renderer, viewport/pixel ratio, grass density, and shadows. Raw records also include geometry/texture counts, camera settings, exposure, player/mob counts, and JS heap usage when the browser exposes it. Read logs directly with terminal/file tools to inspect performance while the user plays.

Frame intervals use unclamped animation timestamps. Hidden-tab time and the first interval after returning are excluded. CPU work and render-submission times measure main-thread execution, **not GPU execution time**. FPS reflects the real browser's presentation scheduling, including display refresh, CPU/GPU limits, and browser throttling. GPU identity flags software rendering; it does not prove a GPU bottleneck. Logging stays on the local development server and is disabled in production builds. Each session is capped at 8 MiB; reload for a new log if it fills. Failed deliveries retry with a bounded queue.

- `src/`: rendering, input, UI, live editor; custom GPU shaders for water/ground/grass.
- `shared/`: deterministic map/collisions and configuration schema.
- `server/`: 20 Hz authoritative world; 10 Hz snapshots with client prediction/interpolation.
- `scripts/`: dev orchestration, Blender generation, settings endpoint, browser playtest.
- `tests/`: simulation and network integration.

Layered pines, ferns, slate boulders, fallen logs, lanterns, docks, wildflowers, lily pads, gravel, and 14,000 grass tufts are instanced. Pines use eight whorls of shallow hanging bough panels around a solid canopy core, tapered exposed trunks, and pointed crowns. Alpha-tested foliage and coverage-preserving mipmaps retain the scalloped silhouette at gameplay distance. The painted pine bough texture is packed into the GLB and editable Blender source; `mise run assets -- --pine-only` rebuilds only the pine. Prompts and iteration notes are in `assets/pine-texture.md`. `mise run playtest -- --smoke --pine-review` captures comparison images against `artifacts/target.png` at the reference viewport size. Understory clusters have six broad leaves. The grass buffer still supports up to 18,000 tufts through the editor. Reeds, flowers, and gravel are sparse to keep paths and characters readable. Trees, ferns, and boulders use spatial batches for offscreen culling. Static Blender parts are merged by material. Rounded characters have fitted armor, boots, hands, facial features, and shaped weapons; the hunched mossling has a large head, splayed legs, long ears, and an asymmetric shoulder guard. All changed models ship as GLBs with editable `.blend` sources.

Water combines broad waves with animated capillary normals, IOR-based Fresnel sky reflection, and a GGX sunlight highlight driven by the scene sun. A small linear-HDR capture of the recessed lake bed, bank, instanced rocks, and dock provides image refraction and a sampled depth texture. Snell's law determines the refracted ray direction, with approximate lake-bowl thickness. Beer–Lambert extinction absorbs channels with depth, and a single-scattering approximation adds colored haze. Contact foam compares unrefracted captured depth with the displaced surface depth, converting the orthographic ray gap to a vertical gap in world units. Four neighboring contact-mask samples are interpolated with surface-slope compensation, avoiding nearest-depth stair steps without blending unrelated foreground/background depths. It gathers at shallow ground, rock intersections, and dock piles; procedural breakup moves with water speed. The bed rim meets the bank height to avoid an exposed shoreline seam. Prop edits share transforms and bounds with the capture so contacts follow the editor. The depth texture reuses the refraction pass; foam adds no separate pass. This is a real-time approximation: it does not reflect nearby trees, perform ray-traced multiple scattering, or calculate exact optical thickness at each rock. Contact depth includes the bed, bank, rocks, and dock, rather than every object in the world. Capture resolution follows the drawing buffer up to 2048 pixels wide, increasing pixel work but not draw calls, and it is skipped when the lake is offscreen, opacity is zero, or both transmission and foam strength are zero. Water animation uses elapsed wall time independently of the clamped gameplay animation delta. No postprocessing is added.

Water controls preview live and persist in `settings.json`:

| Setting | Default | Effect |
| --- | --- | --- |
| Opacity | 0.92 | Surface coverage; 0 hides the surface. Use transmission to tune clarity. |
| Transmission | 0.92 | Fraction of submerged light admitted before extinction. |
| IOR | 1.333 | Index of refraction; drives Fresnel reflectance and Snell bending. |
| Refraction | 1 | Distortion multiplier; 0 disables bending, 2 exaggerates it. |
| Absorption color | `#df652b` | Absorbed channels, not transmitted tint; stronger red removes red light. |
| Absorption | 1.2 | Absorption coefficient per world unit. Higher values darken deep water. |
| Scattering | 0.18 | Scattering coefficient per world unit; adds depth haze. |
| Roughness | 0.2 | Controls sun-highlight spread; lower values produce sharper glints. |
| Reflection | 1 | Multiplier for sky and sunlight reflection. |
| Shimmer | 0.65 | Animated small-ripple normal strength. Speed 0 freezes animation. |
| Foam color | `#e4f3ea` | Contact foam tint. |
| Foam strength | 0.75 | Contact foam visibility; 0 disables it. |
| Foam distance | 0.5 | Maximum vertical depth gap in world units; higher values widen the band. |

The existing color is the water's scattering/body color, while highlight colors the sky and shoreline foam. Sunlight reflections use Lighting's sun color, intensity, and direction. Sharp glints appear when the sun and viewing direction align with a ripple normal; roughness broadens their angular spread. Blender-authored notched lily pads follow the broad waves. Botanical GLBs and editable sources live in `public/models/` and `assets/blender/`; `mise run assets -- --details-only` rebuilds these two assets. Grass defaults to 14,000 shorter tufts.

Run `mise run playtest -- --water-only` for water pixel checks and editor-save validation. It records cropped water images and a report in `artifacts/water/`, including successive shimmer frames and comparisons for refraction, absorption, scattering, transmission, and sun reflection. `mise run playtest -- --water-close-only` walks to the lake and captures maximum-zoom shoreline views with normal optics and isolated contact foam. The scene render budget counts the main view plus the underwater capture. Shadow-map calls and triangles are recorded separately, alongside total counts including shadows, in `window.__game.metrics` and performance JSONL logs. The existing scene budget excludes shadow-map work; total counts can exceed that budget. Render-submission timing includes both captures and shadows and remains CPU timing, not GPU timing.

The wanderer has 1,157 triangles (previously 389, about 3×) and the mossling has 992 (previously 392, about 2.5×). The player is 20% larger at the same starting camera zoom. For a quick smoke check, use `mise run playtest -- --smoke`. For a broader visual/editor review without combat, use `mise run playtest -- --visual-only`; this saves default-view screenshots and `artifacts/detail.png` using the mouse wheel for a closer view. `mise run check-full` runs the complete playtest.

This is an **MMORPG development foundation**, not a deployed massive world. The starter permits 64 connections in one in-memory zone; accounts, persistence, inventory, cross-zone scaling, production hosting, TLS, and robust anti-cheat are future work. Progress resets when a player disconnects. Vite's JSON write endpoint exists only during local development.

## Open world and Map Studio

Run `mise run dev`, then open `http://127.0.0.1:5173/map-editor.html` (or the game's Map Studio link). This is a separate 2D authoring app. Draw grass, snow, sand, rock, and water polygons; paths are polylines with widths from 0.25 to 40 units. Later regions override earlier ones; paths override regions, allowing deliberate causeways. Select a region and drag its shoreline vertices, edit exact X/Z coordinates, or insert/remove vertices. Middle/right drag pans and wheel zooms. Enter finishes a drawing and Escape cancels it. Select a path to change its width/material. Place, move, scale and rotate individual landmark props. Undo/redo, JSON import/export, and revision-checked saving are available. Imported documents must pass the same validation as server data.

Select a biome region and request seeded placement with density, spacing and a biome palette. Forests use pines/ferns, snow uses snow-covered pines, desert uses dry trees/cacti, and palm groves use palms. The deterministic compiler excludes the starter clearing and water, reserves road/shore margins, and avoids other prop footprints. Density is a target probability per grid cell, not a guaranteed count. Spacing controls the jitter grid and rejection margin. Regenerating replaces that region's request; manually placed landmarks remain. The editor previews the compiled props immediately. Save writes `world/map.json`; valid external edits reload the game and server. Saving a changed map reloads connected game views and returns their characters to spawn. Export your draft if a concurrent file edit prevents saving. Do not run map tests while manually editing the map.

The authored Far Marches is 768 × 768 units, with 144 chunks, 5,131 props, forest, frostlands, desert, coast, an oasis, three small towns and four ruin sites. Walk north, east, west or south along the starter paths to leave the clearing. The map and roads are planar; there is no terrain elevation sculpting. Houses and ruins are exterior scenery with circular collision footprints, not enterable interiors. New areas support exploration; existing monsters and progression remain near the starting area. Click travel steers from the latest server position and slows near its destination to avoid overshooting when rendering lags.

`world/map.json` is the editable source. `mise run map-build` validates it and exports the manifest and chunk JSON files into `public/world/`. Vite serves freshly compiled chunks in development and emits them on every production build, so source edits are reflected without a separate export command. `mise run map-generate` recreates the supplied example world and overwrites the source; use it only when you intend to reset map authoring. `shared/map.js` provides polygon/path sampling, validation, deterministic scatter, chunk indexing and collision tools for scripts and the editor.

The server retains the complete collision index and enforces the world boundary, water and prop footprints. The browser fetches nearby chunk props/colliders, creates instanced scenery, and disposes chunk textures and instance buffers as the player moves away. Model geometry is shared and cached. Default `settings.json` streaming radius 1 retains at most nine 64-unit chunks; radius 2 retains up to 25 and costs more memory/draw work. Grass per chunk is also exposed in the game settings editor. Ground and shore masks are sampled at 0.25-unit resolution; collision uses the exact source polygons and path widths. Ground grain, grass wind and distant water ripples are procedural. Outer water uses a lightweight surface shader; the original lake retains its refraction and depth-based foam. Outer props omit cast shadows to control rendering cost. No postprocessing passes were added. Fixed camera azimuth and follow behavior are preserved.

`mise run assets -- --world-only` regenerates the seven biome/settlement models from `scripts/world-models.py` through the shared Blender pipeline. Both `public/models/*.glb` and editable `assets/blender/*.blend` are included. Keep both when changing assets. `mise run playtest -- --map-only` checks editor authoring/saving with source restoration, then walks through normal click controls to a town and a snowy settlement, checks chunk eviction and render budgets, and saves `artifacts/map-studio.png`, `map-studio-edit.png`, `open-world-town.png`, and `open-world-snow.png`. Add `--coast-only` to check the coastal route, palms, sand and procedural water instead of snow, capturing `open-world-coast.png`. Travel uses temporary grass/shadow previews to help the software browser sample input; captures restore saved visual settings. Gameplay settings are unchanged. The read-only `window.__game.streaming` reports loaded/pending keys, cumulative loads/evictions and errors. Browser frame rates from this automated SwiftShader test are not hardware performance measurements.

This remains a local single-zone multiplayer prototype with in-memory progress. Streaming bounds client scenery resources; it does not add distributed servers, infinite terrain, persistent accounts, or MMO-scale entity networking.
