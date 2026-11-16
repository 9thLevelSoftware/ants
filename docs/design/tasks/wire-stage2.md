# Task wire-stage2 — Plug the Stage 2 renderers and hooks into the game (Opus, visual)

## Why
Four Stage 2 renderers and several hooks were built on demo pages because the app gate was editing the registration files. The app gate is finished. Plug them in and prove each in the real game.

## Read
The "needs from others" of each task in `docs/STATUS.md` (entries Nov 15 23:50 to Nov 16 05:00) and each module's ready-to-paste slot file:
- creatures: `src/render/creatures/slot/creaturesSlot.ts` (+ `comfort` from the settings store's accessibility section into `FrameInfo` or `setComfort`; `lookOf(creatureId)` for `ui.look()`; `SPIDER_KINDS` / `comfortFor()` for the camera's "never auto-frame softened spiders" rule, GDD 08 §12).
- scent / overlays / particles: `src/render/fx/overlays/fxSlotReplacement.ts` (replace `src/render/slots/fxSlot.ts`; register the overlay host with `registerOverlayHost` from `src/ui/overlays/state.ts`).
- weather: the slot file under `src/render/world/weather/**`.
- humans: `src/render/world/humans/slot.ts` (needs a `'humans'` member in the `RendererSlot` union and `RENDERER_SLOTS` in `src/render/index.ts`, a debug fallback renderer, the registration line).
- dig-plans overlay: the views layer (`src/game/views/colony/markerScene.ts`, `src/render/fx/markers/**`) must emit plan outlines in every view while `FxRenderer.digPlansOverlay` (or the marker layer's `userData.digPlansOverlay`) is on.
- persistence: `codexUnlocks: () => profile.get().codex` beside `hasLineage` in `src/game/save/install.ts`.
- debug API: `query.rivals` → `rivalSummary(sim)`, `query.territory(pos)` → `claimAt(sim, pos)` (from `@/sim/rivals`); a test-mode hook to spawn a creature / herd / start rain / start a human event if the cheats exist in sim (use existing cheat commands; do not add sim code).
- camera tremor: human `tremor` cues reach `src/game/views/tremorCue.ts` (check with a footstep event).
- audio: weather state and human cues reach `src/audio/**` (ambience, `giants.ts`); list any cue with no sound.

## You own (for this task)
`src/render/slots/**`, `src/render/index.ts`, `src/render/app/**` (only what registration needs), `src/game/**` wiring files named above, `tests/e2e/stage2.mjs`. Do NOT edit `src/sim/**` (four sim engineers are working there now: flooding, founding, economy, locomotion) nor the insides of the four renderer modules (report defects to their owners with a reproduction; a one-line fix inside a renderer is allowed when it is plainly a wiring bug, reported).

## Work
1. Register the four renderers; quality presets and the classic single-file build must still work; `npm run build:portable` + `npm run verify:portable` pass.
2. `tests/e2e/stage2.mjs` on the real game (`?test=1&seed=1&quality=high&autostart=1`; skip the opening with `cheat.completeFounding` — the real opening is being repaired by another engineer): spawn or find each thing and take a screenshot you then look at: a creature of each family near the camera with an ant for scale; an aphid herd on a stem; comfort mode on/off for a spider; scent view on a real foraging trail; temperature, moisture, threats and dig-plans overlays (dig-plans also in possession view); rain with wet ground and a puddle; a footstep event passing the camera with tremor; a mower or broom. No console errors.
3. Frame cost with everything on at `high` on a generated standard world: report draw calls, triangles and ms per frame against the budgets in `docs/03-architecture.md`; if a renderer blows the budget, report which and by how much (do not optimise inside it).
4. Known look defects to check while you are there and report (do not fix inside the modules): the moisture overlay turns the whole ground dark blue (too heavy); creature surfaces plasticky; human legs are plain gradient cylinders.

## Acceptance
1. Typecheck clean; `src/render/slots`, `src/game` tests green (folder by folder; never the whole suite). 2. `stage2.mjs` ok with every screenshot listed and looked at. 3. Portable build verified. 4. Report: what is wired, what each owner still owes. Machine rules: 4 cores shared with four simulation engineers running long sweeps; one headless browser at a time; global Playwright only; evidence under `test-output/stage2/`.
