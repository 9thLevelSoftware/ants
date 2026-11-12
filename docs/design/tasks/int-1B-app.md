# Task int-1B-app — Stage 1B integration gate, application half: the first playable (Opus, visual)

## Goal
The first complete playable in the browser: title -> new colony -> world generation -> the founding sequence -> first workers -> an autonomous colony the player can watch, join, direct and save — drawn by the real renderers, with the real HUD, views and controls, and shippable as the portable build. A second engineer does the simulation half (colony health, balance, performance of the simulation) at the same time.

## Read first
- `docs/design/tasks/notes-1B.md` — every Stage 1B task's report. Your work list is everything in it that concerns `src/render/**`, `src/game/**`, `src/ui/**`, `src/input/**`, `tools/build/**`, `tests/e2e/**`: resolve each item or record why not.
- `docs/design/tasks/gate-1A-app-report.md` (the state you start from: slots, frame info, the stand-ins the old script needed).
- `docs/00-original-brief.md` (what the player was promised), `docs/design/gdd/digests/01.md`, `06.md`, `08.md`; the owning GDD chapter wherever something looks or behaves wrong.
- `docs/03-architecture.md` §5-§8.

## You own (for this task)
Integration edits anywhere under `src/render/**`, `src/game/**`, `src/ui/**`, `src/input/**`, `src/main.ts`, `index.html`, `tools/build/**`, `tests/e2e/**`. Rules: fix a defect where its root cause lives; keep each edit minimal; never weaken a test; list every file you touched with a one-line reason. Do not edit `src/sim/**`, `src/worldgen/**`, `src/core/**` (the simulation-half engineer owns those and is changing them now) — work through the public API as it stands and describe what you need precisely in your report. Do not start Stage 2 features.

## Work
1. **Baseline.** `npm run typecheck`; the application-side tests; every existing browser script (`smoke`, `determinism`, `stage1a` in strict mode — no stand-ins should be needed any more, `save`, `hud`, `views`, `founding`, `dressing`, `portable`). Record and fix failures at their root.
2. **Seams.** Connect what the Stage 1B tasks left open between each other: the founding flow with the views layer (camera choices, time-lapse camera), HUD and prompts; picking -> inspect card; the Directives panel opened from the queen; colony-view markers and dig plans -> simulation commands -> ghosts and results visible; alerts raised by the simulation shown in the feed; decor, boundary, colour grade and fades active in every view; title backdrop replaced cleanly by a game and restored on quit; save/load from the pause menu restoring view, possession and UI state.
3. **The first-play script** `tests/e2e/firstplay.mjs`, driven through `window.__game` and real input events where a control is being proven, at `test` quality, with a screenshot at every beat: title with backdrop; new-colony screen; generated world with the intro card; the queen in third person on the surface; the site read-out; digging the entrance (mound growing); inside the shaft and the founding chamber (camera usable, never inside solid, no sky through walls); sealing; the first clutch; the time-lapse overlay; first workers at the reopened entrance; a worker possessed, following a trail to food, harvesting and delivering; the queen selected and the Directives panel changing an allocation; the Roster; observer view following a forager with the inspect card; colony view with slice cutaway, a forage marker and a dig plan; game day 2 and 3 at 8x with the HUD showing growth; pause menu -> save -> quit to title -> continue -> same state. Look at every screenshot and fix what is wrong.
4. **Visual sweep of the generated worlds.** For each Tier 1 archetype (one seed): third person at the start, at a large prop, among plants, indoors where the map has an interior, the map edge, and the colony view; one `high`-quality shot per archetype. List every defect you see (z-fighting, missing or stretched textures, floating or sunk props, ants not standing on surfaces, wrong scale, visible tiling, harsh pop-in, void at the map edge, unreadable UI over bright or dark scenes) and fix the ones rooted in application code; report the ones rooted in world generation.
5. **Controls and feel.** Through scripted real key/mouse events: walk, run, climb a wall and a ceiling, pick up and drop, harvest, feed a larva, dig, antennate, lay a trail, place markers; every prompt names the right key; rebinding a key updates prompts; gamepad snapshot injection moves the ant; the game is fully playable without pointer lock.
6. **Performance in the browser** with about 300 ants on a generated world at `test` and `low`: frame statistics from `perf()` (draw calls, triangles, simulation ms per tick, UI bridge ms), memory growth over 5 minutes of 8x play, GPU resource counts after two new-game/quit cycles. Fix clear offenders.
7. **Portable build.** `npm run build:portable` and `npm run verify:portable` pass; a short version of the first-play script passes against the portable build from a sub-path and inside the sandboxed iframe.
8. **Report** `docs/design/tasks/gate-1B-app-report.md`: what the player can do now, the screenshot list with a one-line honest judgement each, defects fixed (file, cause), defects left (with reproduction), performance numbers, every notes item and its outcome, and what Stage 2 tasks must know.

## Acceptance criteria
1. `npm run typecheck` clean; tests under `src/render`, `src/game`, `src/ui`, `src/input` green.
2. `tests/e2e/firstplay.mjs` passes in the harness with no console errors and no stand-ins; its screenshots (looked at) show every beat listed above with the real renderers, readable UI and a usable camera above and below ground.
3. Every previously existing browser script still passes (`stage1a` in strict mode).
4. The visual sweep is in the report with every listed defect either fixed or assigned.
5. Performance numbers are reported; no leak across two game cycles.
6. The portable build passes its verification and the short first-play script in both hosting situations.
7. Every application item in `notes-1B.md` is accounted for in the gate report.
