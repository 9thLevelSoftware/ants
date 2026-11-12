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
