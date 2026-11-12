# Task ui-hud — In-game HUD, directives, roster, prompts and alerts (Stage 1B, Sonnet implement / Opus verify, visual)

## Goal
The interface the player sees while playing: a minimal hideable HUD, the possessed-ant panel with context prompts, the alerts feed, the Directives panel through which the queen's colony orders are given, and the Roster for finding and possessing ants — fed by a snapshot bridge from the simulation.

## Read first
- GDD 08 (`docs/design/gdd/08-ui-ux-art-audio.md`): read in full the HUD specification (time/season/weather + speed controls, colony summary, possessed-ant panel, context prompts, alerts feed, optional minimap), the Directives panel (allocation sliders, production controls, toggles, how it opens from the queen), the Roster, the alert system (levels, throttling, wording patterns, click-through), and the information hierarchy. GDD 02: directives and what each control changes; GDD 01 §9-10 (prompt rules and inspect read-outs). `docs/design/gdd/digests/08.md`, `02.md`, `01.md` give the maps.
- `docs/00-original-brief.md` §2-3: selecting the queen gives access to colony orders — keep that doorway obvious.
- `src/ui/**` (design system, components, `store.ts`, `api.ts`), `src/game/uiBridge.ts` if it exists (you take ownership) and `src/game/Game.ts` (how the snapshot is refreshed), `src/sim/colony` (directives, population, stores, diagnostics), `src/sim/ants` (`currentPrompt`, `inspect`), `src/input` (key hints from bindings).

## You own
`src/ui/hud/**`, `src/ui/panels/directives/**`, `src/ui/panels/roster/**`, `src/ui/panels/inspect/**`, `src/game/uiBridge.ts`, a demo page `spikes/hud-demo/**`, and `tests/e2e/hud.mjs`. Extend `UiSnapshot` and `GameFacade` additively and list the changes.

## Boundaries
- Colony health ("why") diagnostics, nest overview, journal, codex, lineage, epitaph and overlays are a later task; leave entry points for them.
- No simulation logic in the UI: the bridge builds a plain snapshot a few times per second; controls call facade methods which enqueue commands.

## Deliverables
1. The snapshot bridge: a compact, allocation-light `UiSnapshot` (date and weather, speed, colony population by caste and task group, carbohydrate and protein stores with trends, brood counts by stage, the possessed ant's health/crop/carry/current action, the current prompt with its key hint, alerts, directives state, roster page) refreshed on a throttle; change detection so Preact re-renders only what changed.
2. HUD: date/season/weather strip with speed controls and pause; colony summary with trend arrows; possessed-ant panel; context prompt line anchored per GDD 01 §9; alerts feed with levels, throttling and click-through hooks; HUD hide toggle; layout that never covers the centre of the screen.
3. Directives panel: allocation sliders that always sum correctly with floors and caps, production and policy controls defined for Tier 1, auto-expansion toggle, clear explanation of what each control does (the chapter's wording), opened by the queen prompt/inspect card and by its key; applies through `setDirectives`.
4. Roster: ants grouped by role with counts, sortable/filterable list (virtualised), buttons to follow or possess, quick-possess role keys reflected.
5. Inspect card (plain-data read-outs from the simulation's `inspect`) for the hovered/selected target.
6. Demo page with a mock facade and scripted snapshots; end-to-end script on the real game.

## Acceptance criteria
1. `npm run typecheck` clean; unit tests green (slider-sum logic, snapshot diffing, alert throttling, roster filtering).
2. Harness screenshots, looked at and judged honestly, at 1280x720 and 1920x1080 and UI scale 80/150 %: HUD in possession view, Directives panel open, Roster open, inspect card on an ant, alerts stacking; nothing overlaps or clips; the tone matches GDD 08.
3. In the real game (`tests/e2e/hud.mjs`): possessing the queen shows the colony-orders prompt and opens Directives; moving a slider changes the simulation's directives (read back through `summary()`); pause and speed buttons work; the possessed-ant panel follows possession changes.
4. The bridge costs under 0.5 ms per refresh with 1,500 ants (report), and the HUD causes no layout thrash (no forced reflow in the frame loop).
5. Keyboard and gamepad navigation reach every control; focus visible; no console errors; works in the classic single-file build.
