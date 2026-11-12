# Task int-1A-app — Stage 1A integration gate, application half (Opus, visual)

## Goal
Make the running game use the real renderers and the real simulation: register the world, nest and ant renderers, connect them to the game shell, close the open review findings on the rendering side, and prove it in the browser. A second engineer is doing the simulation half (module seams, tests, soak) at the same time.

## Read first
- `docs/design/tasks/notes-1A.md` — every Stage 1A task's report. Your work list is everything that concerns `src/render/**`, `src/game/**`, `src/ui/**`, `src/input/**` and `tests/e2e/**`: resolve each item or record why not.
- `docs/design/tasks/notes-truncated-findings.md` — review findings that never reached the engineers who fixed their tasks. For the rendering tasks in it (`render-nest`, `render-ants`, `render-world`): check each against the code; fix every major one and every minor one that is a real defect (for example: the nest shadow depth material not mirroring the wall shader's discards; stars turning into large bokeh discs at night; per-frame allocations in update paths).
- `docs/design/tasks/00-module-map.md`, `docs/03-architecture.md` §5, §6, §8, `src/render/index.ts` (the sub-renderer registry), `src/game/Game.ts`, and the public classes `WorldRenderer`, `NestRenderer`, `AntRenderer` with their documented wiring needs.

## You own (for this task)
Integration edits anywhere under `src/render/**`, `src/game/**`, `src/ui/**`, `src/input/**`, `src/main.ts`, `index.html`, `tests/e2e/**`. Rules: fix a defect where its root cause lives; keep each edit minimal; never weaken a test; list every file you touched with a one-line reason. Do not edit `src/sim/**`, `src/worldgen/**`, `src/core/**` (the simulation-half engineer owns those and is changing them now) — if you need something there, work through the public API as it stands, and describe the need precisely in your report. Do not start Stage 1B features.

## Work
1. Register the real `world`, `nest` and `ants` renderers through the sub-renderer registry (debug renderers remain only for slots with no real renderer); adapters between `FrameInfo` and each renderer's own frame type; the ant renderer's simulation source; `NestRenderer.setSim` on game start; disposal on game end; quality presets passed through and changeable at runtime.
2. Connect the inputs the renderers need: sun/moon direction, light level and weather from the environment module; the underground switch (exposure/fog transition) from the camera position; terrain hole mask from the field's hole test and carve changes; mound patches from the simulation; the possessed ant's pose from locomotion's per-frame prediction (so the possessed ant and camera do not judder); hover/inspect highlights; the level-of-detail observer position passed to locomotion.
3. The third-person camera on the real world: collision through the field, the tunnel/chamber states, depth-of-field focus on the subject; the observer camera's follow-pitch sign defect and the missing "stop following" call reported by the game-shell task.
4. Game flow as far as Stage 1A allows, driven through `window.__game`: new game on a generated world, the founding queen possessed, walking, digging through the action primitive (ramp brush) until a shaft and chamber exist, pellets and a growing mound, an egg laid, cheat-spawned workers visible and moving, time controls, pause, observer view, colony view if available.
5. Browser script `tests/e2e/stage1a.mjs` driving that flow at `test` quality with screenshots: on the surface in third person; at the entrance with the mound; inside the dug tunnel; inside the chamber with the queen and eggs; observer view of the surroundings; one `high`-quality beauty shot on the surface and one underground. Look at every screenshot and fix what is wrong (black frames, missing textures, the ant floating or sunk, holes not opening, seams, wrong scale, camera inside geometry).
6. Performance sanity in the browser at `test` quality: frame statistics from `perf()` for the scene with 60 workers (draw calls, triangles, simulation ms per tick).
7. Write `docs/design/tasks/gate-1A-app-report.md`: what the player can do now, screenshots list with a one-line honest judgement each, defects fixed (file, cause), defects left (with reproduction), every notes item and its outcome, and what Stage 1B tasks (views, founding, HUD, decor, packaging) must know.

## Acceptance criteria
1. `npm run typecheck` clean; tests under `src/render`, `src/game`, `src/ui`, `src/input` green.
2. `tests/e2e/stage1a.mjs` passes in the harness with no console errors; its screenshots (looked at) show the generated world drawn by the real world renderer with real textures, the real ant model for the queen and workers standing correctly on the ground, an entrance hole and mound after digging, and the tunnel and chamber interior drawn by the real nest renderer with the underground look.
3. The existing smoke and determinism scripts still pass; the classic build passes the smoke script in the harness's `--static` mode from a sub-path.
4. Switching quality preset at runtime between `test`, `low` and `high` works without errors or leaks (scripted).
5. Every rendering/game item in both notes files is accounted for in the gate report.
