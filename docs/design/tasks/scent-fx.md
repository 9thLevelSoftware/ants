# Task scent-fx — Scent view, world overlays and particle effects (Stage 2, Opus, visual)

## Goal
Make the invisible visible, tastefully: the scent view (trail ribbons, home range, alarm, food odour), the temperature / moisture / threat / dig-plan overlays, and the small particle effects that sell ant-scale physicality (dig debris, dust, droplets, acid mist, scent motes underground).

## Read in full
GDD 08 (`docs/design/gdd/08-ui-ux-art-audio.md`): the overlays section (scent view, temperature, moisture, threats, dig plans; colour-blind-safe palettes; legends), the underground "scent-lit" art direction, effect cues. GDD 02: pheromone channels and what the player should be able to read from them. `docs/research/spike-look.md` (scent motes, underground look). The pheromone module's read-only iteration API, the environment queries (surface temperature, moisture), the danger grid, the nest module's plans. Digests 08, 02.

## You own
`src/render/fx/{scent,particles,overlays}/**` and a demo page `spikes/fx-demo/**`.

## Boundaries
UI controls and legends for overlays are the `ui-panels` task; you draw in the 3D scene and expose `setOverlay(kind, on)`. Marker and plan ghosts are drawn by `views`; weather particles by `weather-effects`.

## Deliverables
1. Scent view: pheromone cells drawn as soft ribbons/decals hugging surfaces (ground, walls, tunnel walls) with intensity by strength and colour by channel, per-colony distinction, smooth fade as trails decay, efficient updates from the active-cell iteration (budgeted, incremental).
2. Overlays: surface temperature and moisture as ground-hugging colour fields sampled on a coarse grid, threat/danger and human-event forecast, with colour-blind-safe ramps.
3. Particles driven by simulation cue events: dig debris and falling pellets, footstep dust on dry soil, splashes and droplets, acid spray mist, alarm puff, food crumbs when tearing, underground scent motes near brood, food stores and the queen.
4. Budgets per quality preset; everything off in the `test` preset unless explicitly requested.
5. `FxRenderer` with `init`, `setSim`, `update(frame)`, `setOverlay`, `dispose`; demo page.

## Acceptance criteria
1. Typecheck clean; no console errors in the harness.
2. Screenshots, looked at and judged honestly: a foraging trail visible as a ribbon from nest to food including up a wall; home-range marking; an alarm puff; temperature and moisture overlays with legible ramps; dig debris; underground motes around a brood pile. Overlays must inform without hiding the world.
3. Scent view with 100,000 active cells stays within the per-frame budget (report CPU ms and draw calls).
4. Works in `high` quality and in the classic single-file build.

## Integrator addendum (Nov 15, 23:45)
- The UI side exists: `src/ui/overlays/**` (catalogue of overlay ids, legends, controls, `registerOverlayHost({ setOverlay(id, on) })` in `src/ui/overlays/state.ts`). Your drawer implements that host interface for exactly the ids in `src/ui/overlays/catalogue.ts`; use the same colour ramps as the legends (take the values from the catalogue; if the legend and the GDD disagree, the GDD wins and you report it).
- Marker and plan ghosts are already drawn by `src/render/fx/markers/**` (views task): the dig-plans overlay only needs to switch that layer's visibility; do not redraw it.
- The `fx` registry slot is `src/render/slots/fxSlot.ts` (draws nothing today). The first-playable app gate is editing `src/render/slots/**`, `src/render/app/**` and `src/game/**` right now: **do not edit those**. Deliver an `FxRenderer` implementing `SubRenderer` in your folder with a ready-to-paste replacement for the slot and the host registration, prove it in your demo page (real `Sim` from `createNewGame` on the test world, real pheromone grids, real foraging trail laid by ants), and report the exact lines to add.
- Pheromone read API: `src/sim/pheromones/**` (find the read-only iteration functions; no writes). Environment: `src/sim/environment/**` queries. Danger grid: creatures' danger module under `src/sim/ecology/creatures/**`.
- Particles: emit from simulation events (dig bite, pellet drop, acid spray from combat, footfall dust on dry loose soil); pooled, capped, deterministic sim untouched (render-only randomness is fine).
- Machine rules: 4 cores shared with other engineers. Never run the whole vitest suite; run your folder. One headless browser at a time; close it when done. Use the global Playwright (never npm-install it).
- Evidence under `test-output/scent-fx/`. Look at every screenshot you cite.
