# Task ui-panels — Colony health, nest overview, journal, codex, markers palette and overlays UI (Stage 2, Sonnet implement / Opus verify, visual)

## Goal
The on-demand panels that make the colony legible: Colony health (the "why" view with cause chains and remedies), Nest overview (chambers, capacity, climate), Journal (milestones timeline and history graphs), Codex, the marker palette and overlay controls.

## Read in full
GDD 08 (`docs/design/gdd/08-ui-ux-art-audio.md`): the specifications of Colony health, Nest overview, Journal, Codex, the Marker tool palette, overlay controls and legends, the alert click-through behaviour, colour-blind-safe palettes, and the information hierarchy. GDD 06: journal, milestones, codex structure. Use the `dataviz` guidance already embodied in the design system for graphs: clear axes, restrained colour, readable at small sizes. Digests 08, 06.

## You own
`src/ui/panels/{health,nest,journal,codex,markers}/**`, `src/ui/overlays/**` (controls and legends only — the 3D overlays themselves are the `scent-fx` task), additive extensions to `UiSnapshot` / `GameFacade` (listed in your report), demo page `spikes/panels-demo/**`, `tests/e2e/panels.mjs`.

## Deliverables
1. Colony health: ranked diagnostics with status, the weighted limiting factors as a readable cause chain, remedies as actionable links (open Directives, place a marker, jump to a chamber), history sparkline per diagnostic.
2. Nest overview: chamber list and a schematic nest diagram (from chamber positions and tunnels), type, capacity versus occupancy, temperature and humidity, flood risk, designation control (`designateChamber`), jump-to-chamber.
3. Journal: milestones timeline with dates, history graphs (population by caste, stores, intake by source, deaths by cause) with range selection, current aims.
4. Codex: categories, locked/unlocked entries, entry view with the naturalist note (text from the content tables; show a neutral placeholder line when an entry's prose is not yet written), search.
5. Marker palette (kinds, radius, counts versus caps) and overlay controls with legends in colour-blind-safe palettes.
6. Demo page with mock data for every panel state; end-to-end script on the real game.

## Acceptance criteria
1. Typecheck clean; unit tests green (graph scales, diagnostic ranking presentation, codex filtering).
2. Screenshots, looked at and judged honestly at 1280x720 and 1920x1080: each panel readable, aligned, with graphs that have labelled axes and legible lines; cause chains understandable at a glance; nothing clipped at UI scale 150 %.
3. On the real game (`tests/e2e/panels.mjs`): a forced protein shortage appears in Colony health with its cause chain; designating a chamber from Nest overview changes the simulation; a fired milestone appears in the Journal.
4. Keyboard and gamepad navigation reach every control; no console errors; works in the classic single-file build.

## Integrator addendum (Nov 15) — the state of the code you build on

- **Data sources exist; use them, do not invent parallel ones.**
  - Diagnostics, alerts, milestones, journal, stats history rings, aims, codex unlocks:
    `src/sim/progression/**` (read its README). Journal entries carry `key` + `tokens`.
  - All player-facing text: `src/content/text/**` and `src/content/codex/**` — `getCodexEntry`,
    `milestoneText`, `alertText`, `aimText`, `journalEntryText`, plural formatting `{n:one|many}`.
    102 codex entries are written; no placeholder prose is needed. Missing text ids you find
    (known: `remedy.slider.tend`, `remedy.possess.tend`) — add them to `src/content/text/words.ts`
    (authorised, additive).
  - Views API for actions: `game.viewsLayer.editPlan`, `designateChamber`, `toggleEntrance`,
    `onCameraState(cb)`; marker tool and dig planner already exist in `src/game/views/**` and
    `src/render/fx/markers` — your marker palette drives them, it does not re-implement them.
  - Herd diagnostics: `diag-herds` inputs come from `src/sim/ecology` (plants); creature threat from
    `src/sim/ecology/creatures`.
- **HUD layout bugs to fix while you are in the UI** (authorised edits in `src/ui/hud/**`, minimal):
  the inspect card overlaps the Reserves/Drying/Health panel; the "+N more" alert chip overlaps the
  panel below it; the founding site read-out stays on screen after the founding ends. Screenshots:
  `test-output/views-fix2/12-high-colony-slice.png`. The empty red alert card is being fixed by another
  engineer (`founding-close`); do not touch alert text lookup.
- **Alert click-through** (GDD 08 E11) is yours: clicking an alert opens Colony health at that diagnostic.
- Harness: `node tools/harness/play.mjs --root . --query 'test=1&quality=test&autostart=1&seed=2' --script
  tests/e2e/panels.mjs --out test-output/panels --script-timeout 900000`. One browser at a time; look at
  every screenshot you report on. Demo page shots can use `--static` builds if faster.
- Test-cost rules: never run the whole vitest suite; run `src/ui/panels src/ui/overlays` only.
  `npm run typecheck` once near the end; `process`-type errors in other engineers' new tests are theirs.
