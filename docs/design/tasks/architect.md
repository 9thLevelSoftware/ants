# Task architect — Automatic nest planning (Stage 1B, Opus)

## Goal
The nest architect: it watches the colony's needs and proposes dig plans so that an untended colony builds itself a navigable, species-typical nest — and so that the player's manual plans and the automatic ones coexist.

## Read first
- `docs/design/tasks/gate-1A-sim-report.md` (§1 what works end to end, §2 what is stubbed, §8 what Stage 1B tasks must know — the public functions to call) and `docs/design/tasks/gate-1A-app-report.md` §7. The scripted stand-ins under `src/sim/testing/e2e/` show working call sequences against the real modules.
- GDD 03 (`docs/design/gdd/03-nest-excavation.md`): read in full the nest-architect section (per-species nest template, the needs that trigger plans, the placement algorithm and spacing rules, modes, blacklist, interaction with player plans), the dig-plan section (templates, validation codes), chamber types and capacities, nest navigation requirements, and the Tier 1 / Tier 2 split of needs. `docs/design/gdd/digests/03.md` gives the map.
- GDD 07 digest: the nest template fields in the species definition (Lasius values for Tier 1).
- `src/sim/nest/**` (plans, validation, chamber registry, nest statistics, queries for free wall space — the nest module's API docs), `src/sim/colony` (population, brood counts, store levels), `src/sim/types/nest.ts` (`ArchitectState`).

## You own
`src/sim/nest/architect/**` and its registration in the nest module through the exported `systems`/handlers arrays the nest `index.ts` assembles (if the nest index needs one import line for your folder, that line is the only edit you make there; report it). Constants in `src/sim/balance/architect.ts`.

## Deliverables
1. Need evaluation on the chapter's cadence: crowding, brood space, food-store overflow, missing chamber types (for example the royal chamber threshold), and the other Tier 1 needs; pressures cached in `ArchitectState.needCache` and published as diagnostics inputs.
2. Placement: choose where to anchor each new tunnel or chamber from the species template (depth bands per chamber type, branching, spacing, footprint radius, minimum wall thickness, maximum entrances), validate through the nest module, and create the plan; avoid intersecting existing space or the player's plans; keep the nest navigable (every chamber reachable, tunnel diameter at least the species minimum).
3. Modes and control: auto and off for Tier 1 (the `setAutoExpand` command), per-need toggles and suggest mode left as documented Tier 2 hooks; blacklist of failed sites with expiry; throttling so the colony's diggers are never flooded with plans.
4. Rival and founding support: a function that lays out a complete small nest for a given worker count from a template (used later to pre-carve rival nests) without running the simulation.

## Acceptance criteria
1. `npm run typecheck` clean; tests green; no `three`/DOM imports.
2. Headless growth scenario: starting from a founding chamber, with population and brood scripted to grow to 300 workers and plans completed instantly by a test digger, the resulting nest matches the Lasius template within the chapter's tolerances (chamber counts by type, depth bands, footprint radius, number of entrances) over 10 seeds.
3. In every such nest: all chambers are reachable from every entrance through nest navigation; no plan was created that fails validation; minimum wall thickness and spacing rules hold (checked by sampling the carve grid).
4. With auto-expansion off, no plans are created; with a player plan occupying a spot, the architect plans around it.
5. A site that fails repeatedly is blacklisted and not retried before its expiry.
6. The layout function produces a valid, navigable nest for 20, 100 and 400 workers in under 50 ms each (report).
7. Determinism.
