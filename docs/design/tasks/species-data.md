# Task species-data — The four species as data (Stage 3, Sonnet implement / Opus verify)

## Goal
Complete, validated `SpeciesDef` data for *Lasius niger*, *Camponotus pennsylvanicus*, *Messor barbarus* and *Atta texana*, their climates and appearance parameters — the data every system reads.

## Read in full
GDD 07 (`docs/design/gdd/07-species.md`): the `SpeciesDef` schema and the four species' full data tables (castes with computed stats, life history, founding, colony scale and growth targets, reproduction, diet, nest template, activity, signals, combat style, climate, winter, directives, appearance) and the loader validation rules. `docs/design/gdd/00-index.md` (final constants; combat stats come from GDD 05's formula). The fact-checked dossiers in `docs/research/bio-*.md` for cross-checking values and for honest "estimate" flags in comments. GDD 06: climate tables per climate id.

## You own
`src/sim/species/data/**` (one file per species), `src/sim/species/validate.ts`, `src/sim/environment/climates.ts` additions for the non-default climates (additive), tests.

## Deliverables
1. Four complete species files following the schema field for field, each value commented with its unit and, where the design marks it an estimate, a short note.
2. The loader validation rules from GDD 07 as code, run at startup in development and in tests.
3. Derived-stat helpers (mass -> hit points, bite, carry, crop, upkeep) exactly per the design's formulas, used by `getAntStats`.
4. Climate data for each species' region.

## Acceptance criteria
1. Typecheck and tests green.
2. Every species passes validation; a table-driven test compares at least 40 values per species against the numbers in GDD 07 (transcribed into the test with their section references).
3. Derived stats reproduce the worked rows in GDD 05 §4.1 / GDD 07 caste tables within rounding.
4. With each species selected, a new game starts and the headless soak tool runs 2 game days without invariant violations (species-specific modules not yet implemented are inert, not crashing).

## Addendum (integrator; this task starts early, before the Stage 1B gate balances the Lasius economy)
- `src/sim/species/data/lasius-niger.ts` exists and the whole Lasius game (founding, brood, foraging, nest work) is being built and tested against it right now by other engineers. For Lasius: complete missing fields and fix values that contradict GDD 07 / `00-index.md` section C, but list every changed value (field, old -> new, source section) in your report, and never rename or remove a field. After your Lasius edits run the tests that read species data (`npx vitest run src/sim/species src/sim/colony src/sim/ants/stats` or the equivalent folders) and report any that change outcome.
- The other three species' behaviour modules (wood, granary, fungus) are later tasks: your data must load, validate and run inertly now.
- Acceptance criterion 4's soak: 2 game days per species once, at the default colony start, one process at a time (`node tools/sim/run-ts.mjs tools/sim/soak.ts ...`). The world's queen start is being repaired by another engineer today: if a new game cannot found a nest on the generated world for a reason unrelated to species data, use the soak tool's test world and say so.
