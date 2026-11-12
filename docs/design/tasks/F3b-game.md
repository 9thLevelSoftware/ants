# Task F3b — Game orchestrator, frame loop, debug API and UI root

## Goal
The application shell that turns the simulation, the render layer, input and UI into a running game: the `Game` object, the frame loop with time control, possession plumbing, the sub-renderer registry, the debug/test API that every later verification depends on, and the UI root. After this task `?test=1&autostart=1` shows a generated world at ant scale with the founding queen under third-person control (with simple debug rendering where the real renderers have not landed yet).

## Read first
- `docs/03-architecture.md` (all; §5 lists the required URL flags and the `window.__game` API, §8 the packaging rules), `docs/design/tdd/00-contracts-guidance.md` §8.
- GDD 01 (`docs/design/gdd/01-modes-controls-camera.md`): sections 1-2 (application flow, views and hand-overs), section 4 (movement mapping), section 8 (time-speed rules). `docs/design/gdd/digests/01.md` gives the map.
- `src/render/app/**`, `src/render/assets/**`, `src/input/**`, `src/render/camera/**` (task F3a — use them), `src/sim/sim.ts`, `src/sim/createGame.ts`, `src/sim/types/**`, `docs/design/tdd/02-kernel.md`.
- `docs/research/tech-stack.md` §5-7 (harness contract, headless performance: never rely on real-time speed in tests).

## You own
`src/main.ts`, `index.html`, `src/game/**` (except `src/game/save/**` and `src/game/settings/persist*` which a later task adds — keep settings as a plain in-memory object with a clear interface), `src/render/index.ts`, `src/render/debug/**`, `src/ui/App.tsx`, `src/ui/store.ts`, `src/ui/api.ts`, `src/ui/boot/**`, `tests/e2e/**`.

## Work
1. **`Game`** (`src/game/Game.ts` + small modules): modes `title | loading | playing | paused | epitaph`; views `possess | observer | colony | photo` (GDD 01 §1-2); `newGame(options)` (world generation with progress, `createSim`, renderers' `onGameStart`), `endGame`, pause/resume, time scale (1x/2x/4x/8x with the possession rules of GDD 01 §8), autosave hook points (no storage yet).
2. **Frame loop**: fixed-timestep accumulator (0.1 s game time per tick) with a per-frame tick budget in milliseconds and honest reporting of the achieved speed; interpolation alpha; per-frame `integratePossessed`; input sampling -> `PlayerIntent` (camera-relative move mapped to a world-space direction) and action commands; camera rig selection and update with collision through `sim.field.sphereTrace`; underground detection; `FrameInfo`; UI bridge refresh a few times per second; render-on-demand in test mode.
3. **Sub-renderer registry** (`src/render/index.ts`): ordered registration of sub-renderers (`world`, `nest`, `ants`, `creatures`, `fx`) each `{ init, onGameStart, update, onGameEnd, dispose }`; if a real renderer for a slot is not present, the matching **debug renderer** from `src/render/debug/**` is used: a plain heightfield mesh with a soil colour, primitive meshes in flat material colours, carve-chunk meshes from the kernel mesher with a simple material and a breach discard, capsule-and-sphere ants oriented by `pos/up/fwd`, simple brood/item markers. They must be correct (true scale, true orientation), not pretty.
4. **Debug API** `window.__game` exactly as architecture §5 lists (ready promise, newGame, step, renderFrame, summary, query.*, possess, release, setIntent, act, teleport, command, camera.*, cheat.*, ui.*, perf) plus `stateHash()`. `summary()` must be compact JSON safe to return through Playwright. Cheats call simulation commands guarded by a debug flag.
5. **URL flags**: `test`, `seed`, `quality`, `species`, `archetype`, `size`, `autostart`, `view`.
6. **UI root** (`src/ui`): Preact app mounted on `#ui`; a signal store holding a `UiSnapshot` (mode, view, time, speed, colony summary, possessed-ant panel data, alerts, prompt) refreshed by the game; `src/ui/api.ts` declares the `GameFacade` the UI calls (new game, pause, speed, possess, directives, markers, save/load hooks, settings); a minimal boot/title placeholder with a "Begin" button, a minimal HUD line (date, speed, population), an error overlay for uncaught errors and an unsupported-WebGL screen. Real screens come in later tasks: keep the placeholders small and easy to replace.
7. **End-to-end scripts** under `tests/e2e/` for the harness: `smoke.mjs` (boot with `?test=1&autostart=1&seed=1`, step 300 ticks, possess the queen, walk with `setIntent`, take screenshots in third person and observer views, read `summary()`), `determinism.mjs` (two fresh runs with the same seed give the same `stateHash()` after 500 ticks).

## Acceptance criteria
1. `npm run typecheck` clean; `npm test` green (unit tests for the loop accumulator, time scale rules, intent mapping, snapshot building).
2. `node tools/harness/play.mjs --root . --query "test=1&autostart=1&seed=1" --script tests/e2e/smoke.mjs` reports `ok: true`; the screenshots (looked at) show the terrain at ant scale with the queen placeholder upright on the ground, the camera behind her, and no visual garbage; the observer view shows the surroundings.
3. `determinism.mjs` passes.
4. Stepping works without rendering (`step(1000)` returns quickly and `renderFrame()` then shows the advanced state); pause and each time scale behave per GDD 01 §8.
5. The app builds with `npm run build` and `npm run build:classic`; the classic build passes the smoke script under the harness's `--static` mode from a sub-path.
6. No console errors or uncaught promise rejections in any run; a deliberately thrown error shows the error overlay rather than a blank page.
7. `perf()` returns frame time, simulation time per tick, draw calls, triangles and ant count.
