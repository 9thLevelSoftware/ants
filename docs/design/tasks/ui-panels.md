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
