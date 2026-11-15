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

## Addendum (integrator)
- **Do not edit `src/render/world/**`** (materials, terrain, primitives, sky, lighting, decor, vegetation, dressing): the look-pass engineer owns it and may still be working there. Defects you find in the world's look go into your report with a screenshot and a reproduction; wiring defects (a slot not passing a field, a layer not registered) are yours.
- Judge camera framing and the world's look at `high` quality with decor registered, beside the reference images in `docs/research/spike-look-img/` (the possession camera should frame the ant the way the reference does: the ant large in the lower-middle of the frame, the ground filling the foreground, plants and objects towering). Open items from the orchestrator's last screenshot review, to check and fix if still present: the founding queen appears small, foreshortened and partly dithered in the open-view possession shot; the colony slice view is hard to read (the cut face, chamber labels and markers must make the nest's structure obvious at a glance).
- Known items handed to this gate by finished tasks (also in the notes file): the worldgen worker ships in the portable build but the game still generates on the main thread (wire `loadWorkerSource` + `blobWorkerFactory` + `generateWorldAsync`, with the main-thread path as fallback, and keep the loading screen's progress honest); `<button autofocus>` in the title, pause menu and Button component raises a console error inside a cross-origin iframe (focus by ref in an effect, then make `verify:portable` strict by default); the HUD's two stand-ins (queen hand-over written directly, alerts pushed into `progression.alerts`) must be replaced by the real founding hand-over and the simulation's alert events; audio (if `src/audio/**` has landed) must start on the first user gesture and be covered by the portable build's reference scan.
- The harness is slow on this shared machine (software GL): give `page.screenshot` generous timeouts in new scripts, take screenshots at `test` quality unless the beat is about the look, and never run two browser scripts at once.

## Addendum (Nov 15, orchestrator screenshot review of the views fix run)

Seen in `test-output/views-fix2/12-high-colony-slice.png` and `04-possess-tunnel.png`:
- Colony view at `high`: a large flat light-blue disc sits on the ground next to the nest entrance
  (puddle or water body drawn unlit and unshaded in the slice view). Find what it is and make it read
  as what it is (water with the world's water look, or hide it if it is a debug/marker surface).
- HUD overlap: the inspect card (left) overlaps the Reserves/Drying/Health panel — the "Because" row is
  drawn under it. The two panels need to stack, not overlap.
- The founding site read-out ("Good, Q 0.75" with seven factor rows) is still shown in colony view after
  the colony has 14 workers. It belongs to the founding walk only.
- "+2 more" alert chip overlaps the top of the read-out panel.
- The red alert dot in the colony panel is lit in every shot with no visible reason; check what raises it
  (see founding-close item 4, which fixes the empty card and the midden false alarm).

## Addendum (Nov 15, 20:45) — launch state and look-pass hand-over

- **Quality switch ghosting (yours, `src/render/app/renderApp.ts`)**: postprocessing's EffectComposer sets
  `renderer.autoClear = false`; when the post chain is disposed on a switch to a preset without post it is
  never restored, so the direct-grade path draws over old colour and depth. Fix in `applyRendererQuality`
  (or clear in `DirectGrade.render`), remove the gallery workaround, and prove High→Low→High in the game
  with before/after captures (switch vs boot RMSE ≈ 0).
- **Too dark to read under large bodies**: `test-output/look-review/rev/rev-car-park-verge-object-high.png`
  — under a parked car the frame is nearly black and the possessed ant is barely visible. The world must
  stay readable wherever the player can walk: exposure adaptation (or a shade floor on ambient) is in
  `src/render/app/look/**` / the lighting rig hand-off; fix it where the adaptation lives and show the
  same frame after. Do not flatten sunlit scenes to do it.
- **HUD overlaps** (three listed in the earlier addendum, plus the founding "Chamber" bar overlapping the
  possessed-ant card bottom-left in `test-output/look-review/under/a/queen-chamber.png`): the `ui-panels`
  engineer is fixing HUD stacking in `src/ui/hud/**` now. Do not edit `src/ui/hud/**` layout; verify in
  your screenshots at the end and report what is still wrong.
- **Founding in the browser**: `founding-close` is fixing sealing in steep shafts and the default start
  date now. Build your `firstplay` e2e on the real founding flow with no stand-ins; if it fails at a
  founding step that `founding-close` owns, re-run after that task reports (the orchestrator will tell
  you nothing — check `git log` for a commit mentioning founding round 3) and report the state you saw.
- **Look notes for the record (not yours to fix; second look pass)**: grass blades are flat-shaded facets;
  an untextured white pillar stands in the woodland start frame; ground rosette leaves read as paper
  sheets; map edge still "pale primitive masses".
- Machine: 4 cores shared with ~4 other agents; one browser at a time; `--script-timeout` generous
  (views e2e needs 1 500 000 ms under load).
- Gate report: `docs/design/tasks/gate-1B-app-report.md` with the firstplay screenshot list, each
  described after looking at it; portable build + `verify:portable` result; what a player would hit in
  the first ten minutes that is still wrong, most serious first.

## Addendum — arrived after launch (Nov 15, 23:15): founding round 3 landed

`tests/e2e/founding.mjs` now completes on seeds 1 and 2 with no stand-ins (shots: `test-output/fnd-close/seed1`, `seed2`). Build firstplay on it. `window.__founding` gained `opening()` and `sites(x, z, rBu, minQ)`. Start day is Summer 2.

Seen by the integrator in those shots, for you or ui-panels:
- Site read-out: Warmth shows 0 of 5 dots beside the word "Mild" (shot 02). Dots and word must come from the same value.
- The red alert dot in the top-right HUD card is lit in every shot, including with no alert.
- "+2 more" chip sits under the read-out with nothing to expand at game start (the lean-stage food warnings; the sim gate removes their cause).
- Outcome card (shot 08): the queen is a black silhouette; the underground fill does not reach her at that camera distance.
- Shot 10 (first worker outside): ground is bare to the horizon with heavy streaking at grazing angles; check anisotropic filtering on the ground material at standard quality and whether the ground cover is being culled.
