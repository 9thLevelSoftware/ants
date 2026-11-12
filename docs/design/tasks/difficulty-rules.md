# Task difficulty-rules — Difficulty presets and custom rules (Stage 3, Sonnet implement / Opus verify)

## Goal
The three presets (`gentle`, `naturalist`, `harsh`) and the custom-rule toggles, applied consistently across every system through one table.

## Read in full
GDD 06 (`docs/design/gdd/06-environment-progression.md`): the difficulty section (the table of every tuned parameter per preset; the custom-rules toggles: predators, rivals, human activity, weather severity, season length, starting season, and any others). Each chapter's "balance levers per difficulty" notes (GDD 04 human-activity scaling, GDD 05 ecological levers). `docs/design/gdd/00-index.md` (final constants). The New Game setup screen's rules UI in GDD 08.

## You own
`src/sim/balance/difficulty.ts` (the single table and accessor functions), `src/sim/config/rules.ts` (validation and defaults of `GameConfig.rules`), tests. For each system that must read a difficulty value but currently uses a constant, the change is a one-line replacement with the accessor: list every file touched outside your paths in your report (these edits are authorised for this task, kept minimal).

## Deliverables
1. The preset table as data with every parameter the design lists, and accessors `difficultyValue(sim, key)`.
2. Custom rules: validation, defaults, incompatibility handling, application at game creation (including season length 5/7/10 and starting season).
3. Wiring: every system reads its tuned values through the accessor.
4. Display data for the New Game screen (what each preset changes, in the design's wording).

## Acceptance criteria
1. Typecheck and tests green.
2. A table-driven test checks every parameter of every preset against GDD 06's table.
3. Three headless 28-day runs (one per preset, same seed) show the expected ordering in threat counts, losses and weather severity (report numbers); disabling predators/rivals/human activity via custom rules yields zero events of that kind.
4. Season length 5 and 10 produce years of 20 and 40 days with all seasonal windows scaled.
