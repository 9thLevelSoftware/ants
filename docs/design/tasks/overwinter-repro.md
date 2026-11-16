# Task overwinter-repro — Winter, reproduction, queen death and the end of a colony (Stage 2, Opus, visual)

## Goal
The long arc of the sandbox: surviving winter through a skippable overwintering time-lapse; rearing alates and launching a nuptial flight that the player can ride; the lineage of daughter colonies; the queen's death, the orphaned colony's decline, and the epitaph.

## Read in full
GDD 06 (`docs/design/gdd/06-environment-progression.md`): the overwintering time-lapse (triggers, what is consumed, loss computation, explanation, skip), reproduction (when alates are reared, cost, the player's control, flight-day conditions, the flight as a possessable experience, what is recorded), the lineage system and founding as a daughter queen, queen death and orphan-colony rules, game-over conditions and the epitaph screen contents. GDD 02: alate brood and investment directives. GDD 01: flight controls and the time-lapse view. GDD 08: time-lapse overlay, lineage and epitaph screens' data. Digests 06, 02, 01, 08.

## You own
`src/sim/colony/{overwinter,reproduction,succession}/**`, `src/game/flows/{overwinter,flight,epitaph}/**`, `src/ui/screens/{overwinter,flight,epitaph,lineage}/**`, constants in `src/sim/balance/lifecycle.ts`, `tests/e2e/lifecycle.mjs`.

## Boundaries
The colony economy, brood and allocation modules exist: extend through their public functions; where you need a hook that does not exist (alate destiny for brood, dormancy flag), add it additively in your folder or request it in your report. The lineage record is persisted by the profile store (`src/game/profile`): call it, do not reimplement storage.

## Deliverables
1. Overwintering: entry conditions, dormancy, the aggregate winter step computed from stores, population and nest quality, losses with causes, the time-lapse flow and overlay, spring restart.
2. Reproduction: alate investment and policy directives, rearing gynes and males, costs, the flight-day gate (season, weather, temperature), launch, the optional possessed flight (take-off, flying, mating, landing or dispersal off-map), bookkeeping.
3. Lineage: recording each flight and colony, the Lineage screen, starting a new game as a daughter queen in a freshly generated locality.
4. Succession and ending: queen death causes and effects, orphan phase, last-ant condition, the epitaph screen with the colony's history graph, causes of death and milestones.
5. End-to-end script covering: forced winter -> spring; forced alate rearing -> flight -> lineage entry; queen death -> decline -> epitaph (using debug cheats to shorten).

## Acceptance criteria
1. Typecheck and tests green; simulation part pure.
2. Winter outcome matches the chapter's loss formulas for three scripted colonies (well stocked, marginal, starving); skipping and watching give the same state.
3. Alates are reared only when the gates in the chapter are met and at the stated cost; flight launches only on a valid day; the lineage gains one record per flight.
4. After the queen dies no eggs are laid, existing brood matures, the game ends when no ants remain, and the epitaph shows the recorded history.
5. The end-to-end script passes with screenshots (looked at) of the winter overlay, a flight in progress, the lineage screen and the epitaph. No console errors.

## Integrator addendum (Nov 16, 14:00)
- **Calendar**: 1 game day = 600 s at 1×; a year is 28 game days, 7 per season (Spring 1–7, Summer 8–14, Autumn 15–21, Winter 22–28). The default Lasius start is day 9; first workers appear around day 12–14, so the first winter arrives about 9 game days after the hand-over with 7–18 workers. **Winter is not implemented today**: colony-life runs stop at the first tick of Winter 1 (`tools/sim/life.ts --until winter`). Your overwintering must take a colony in exactly that state (small, a few days of stores, larvae that may overwinter as larvae, which is natural for Lasius niger) into Spring 2 alive when it meets the chapter's conditions. Prove it on the 11 viable end-states of the last sweep (`test-output/viab/final3/`; regenerate them with `life.ts` if the files are not loadable) and report the losses.
- **Already in the tree**: winter-reserve rule in the colony economy (laying protein withheld in late season under 30 workers so that carbohydrate stores cover the adults until winter: `WINTER_RESERVE_FROM_D28`, `WINTER_RESERVE_MULT`); the founding time-lapse flow and overlay (`src/game/founding/**`, `src/sim/colony/founding/lapse*`): reuse its view pattern for the winter lapse, do not fork its code; the epitaph screen stub and the last-ant rule from the gates (`grep -rn "epitaph" src/game src/ui`); progression milestones (`src/sim/progression/**`) expect events for first winter survived, first flight, queen death: emit them (additive event kinds; the audio router has a compile-time check that every event kind is listed in `src/audio/eventMap.ts`: add yours there as silent or mapped, one line each, and say so).
- **Ownership now**: another engineer (`econ-growth`) owns the rest of `src/sim/colony/**`, `src/sim/balance/**` (except `lifecycle.ts`, yours), `src/sim/ants/behaviours/outdoor/**`. `viab-founding` and `weather-fix2` are still finishing in `src/sim/colony/founding/**`, `src/sim/nest/**`, `src/sim/environment/**`. Ask for hooks in your report or add them additively in your own folders; system registration in `src/sim/systems.ts` is one line each, report it. UI: `src/ui/App.tsx` registration one line each; onboarding and look-fix engineers are editing `src/game/onboarding/**`, `src/ui/hud/prompts/**`, `src/render/**`.
- **Flight**: locomotion has no flying medium for ants. Keep the possessed flight simple and robust: a guided glide on a height field above the terrain with wind drift and a landing choice (GDD 01 flight controls), implemented in your own folder as a special possessed mode that the views layer can follow (camera: possession rig with the open-air distance). If that is more than the chapter needs, follow the chapter. Dispersal off-map ends in the lineage record and the "found a daughter colony" offer.
- **Daughter colony**: starting as a daughter queen is a new game with a fresh seed and locality through the existing new-game path (`src/game/**` new game options), carrying the lineage id.
- **Verification**: sim tests on small fixtures; `tests/e2e/lifecycle.mjs` in the browser with cheats (`?test=1&seed=1&autostart=1`, `cheat.completeFounding`), one headless browser at a time, `quality=test` except for the four screenshots you must look at. 4 cores shared with five engineers; never the whole vitest suite. Evidence under `test-output/lifecycle/`.
