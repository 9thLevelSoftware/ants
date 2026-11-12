# Task colony-core — Colony economy and demographics (Stage 1A, Opus)

## Goal
The colony as an economy and a population: ant physiology, brood development, the queen's egg laying, the food pool and its ledger, starvation, task allocation, directives, population accounting and the colony's diagnostics. No behaviour state machines here — those are later tasks that call your functions.

## Read first
- GDD 02 (`docs/design/gdd/02-colony-simulation.md`): read in full the sections on the individual ant model, brood, queen, food and nutrition, task allocation, directives and markers, population accounting and statistics, diagnostics, and the worked numeric example. Skip the per-task behaviour state machines except to learn which of your functions they call. `docs/design/gdd/digests/02.md` gives the map.
- `docs/02-design-directions.md` §J (loads of C and P; reference economy) and §K (no per-agent weights; caps).
- GDD 06 digest (`docs/design/gdd/digests/06.md`) for the environment values you consume (chamber temperature, activity gates) and GDD 07 digest for the species fields you read (brood durations, lifespans, egg-laying curve, castes).
- `src/sim/types/**` (`Ant`, `Brood`, `Colony`, directives, diagnostics, statistics), `src/sim/entities/**` (spawn helpers), the stubs `src/sim/colony/index.ts` and `src/sim/environment/index.ts`.

## You own
`src/sim/colony/**` except `founding/**`, `overwinter/**`, `reproduction/**`, `succession/**` (later tasks). Replace the stub `src/sim/colony/index.ts` keeping its exported names and signatures (extend additively). Constants go in `src/sim/balance/colony.ts`.

## Boundaries
- Temperature and season inputs come from the environment module's functions (a parallel task; build against the stub and a test fake).
- Food enters and leaves the pool only through your ledger API (`depositFood`, `withdrawFood`, `feedBrood`, …), which the action library and behaviours call.
- You assign TASKS to ants (allocation); you do not move ants or run their behaviours.

## Deliverables
1. Physiology on a staggered ~1 s cadence: upkeep by metabolic class, crop and fat reserve, hunger, health, ageing (faster outside the nest per GDD 02), natural death, death causes recorded.
2. Brood: development rate versus chamber temperature, feeding and hunger, mortality hazards, destined caste, underfed outcomes, first-brood fast-track flags, dormancy hooks.
3. Queen: egg-laying potential from colony size, season, temperature, condition and protein, the egg budget shared with the possessed queen, orphan state flag.
4. Food pool and ledger: C and P stores, capacity from chambers, spoilage, per-source intake bookkeeping, an exact double-entry ledger (every load is accounted for), demand signals (carbohydrate versus protein need) that foragers read.
5. Starvation sequence exactly as GDD 02 orders it.
6. Task allocation: age bands, response thresholds, stimuli, the four slider groups as targets with floors and caps, reassignment cadence, never reassigning a possessed ant, the forager-activation feedback from successful returns.
7. Directives: applying the `setDirectives` command and every toggle GDD 02 defines for Tier 1.
8. Population accounting, hourly/daily time series, and colony diagnostics with weighted limiting factors and remedy ids published into the progression state.
9. `colonySystems` (allocation, queen, brood, economy) with the cadences GDD 02 gives.

## Acceptance criteria
1. `npm run typecheck` clean; tests green; no `three`/DOM imports.
2. Brood stage durations at 21 °C match GDD 02 (egg 1.4, larva 0.6, pupa 1.9 game days) within 3 %, and scale with temperature per the stated curve.
3. The worked example in GDD 02 (60 workers, one summer day) is reproduced by a headless test with scripted intake: needs and stock changes within 5 % of the chapter's numbers.
4. Ledger conservation: over 5 simulated days with random deposits and consumption, (initial stock + inflows - outflows) equals final stock to 1e-6 loads for both nutrients.
5. Starvation order follows GDD 02 in a test where intake is cut to zero.
6. Allocation converges to the slider targets within one ant per group within the stated number of cycles; a possessed ant is never reassigned.
7. Egg laying is limited by protein exactly as specified (a protein-starved queen lays at the reduced rate from the chapter).
8. Performance on this machine, measured and reported: 1,500 ants + 600 brood cost under 0.35 ms per tick on average.
9. Determinism and plain-data state (round-trips through core `encode`/`decode`).
