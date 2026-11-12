# Task sources-core — Food sources (Stage 1A, Opus)

## Goal
The persistent food nodes ants forage from, at the level the first playable colony needs: the catalogue of source kinds, their amounts, renewal and decay, discovery, harvesting into crops or carried pieces, and their creation from the world's placement tables. Herds on plants, live prey and the creature side of ecology are later tasks; design for them.

## Read first
- GDD 05 (`docs/design/gdd/05-ecology-rivals-combat.md`): read in full the food-source catalogue (kinds, nutrient profiles in loads of C and P, amounts, unit sizes, harvesting action and time, renewal or decay, seasonal availability, discovery cues, feed slots), the Tier 1 rules (including the static honeydew-film sites and the core-tier protein sources), carrion and decay, human food and bait, water/dew. `docs/design/gdd/digests/05.md` gives the map. Skim the herd, prey and creature sections to keep your data model compatible.
- GDD 02 digest: what foragers ask of a source (quality, feed slots, harvest rate, item bulk, odour) and the colony demand signal. GDD 04 digest: food anchors and placement tables in `WorldData`.
- `docs/02-design-directions.md` §J (loads; reference economy) and `docs/design/gdd/00-index.md` section C4/C13 (final economy constants and the sanity budget).
- `src/sim/types/**` (`FoodSource`, `Item`, ecology state, events), `src/sim/entities/**`, the stub `src/sim/ecology/index.ts`.

## You own
`src/sim/ecology/sources/**` and the source-related exports of `src/sim/ecology/index.ts` (keep the stub's names and signatures; extend additively). Constants in `src/sim/balance/ecology.ts` (sources section).

## Boundaries
- Foraging behaviour and the harvesting action primitives are other tasks: they call `nearestSource`, `discoverSource`, `harvest` and read source fields.
- World generation places anchors; you turn anchors into live sources at game start and through the seasons.

## Deliverables
1. The source catalogue as data: every Tier 1 kind with nutrient profile, amount, unit size (crop fill versus carried piece and its bulk), harvest rate, feed slots, quality, odour radius, renewal/decay behaviour and seasonal availability; later-tier kinds present as data where the chapter defines them, flagged by tier.
2. Lifecycle: creation from placement tables at game start; renewal, decay and depletion over game time; replacement/respawn rules; seasonal switching by year fraction; removal with events.
3. Harvest API: `harvest(sim, ant, sourceId, dtOrUnits)` returning what was actually taken (liquid into the crop up to capacity, or a solid piece created as an `Item` with nutrients and bulk), slot occupancy (queueing when full), depletion handling.
4. Discovery: per-colony discovered flags, odour-based detection query for perception (`sourcesSmelledFrom(pos)`), `nearestSource(sim, colony, pos, filter)`, quality scoring used for trail strength.
5. Runtime source creation for other systems (food dropped by human events, corpses becoming carrion, windfall), and a `sourcesSystem`.
6. Diagnostics inputs: per-source intake bookkeeping hooks (which source fed the colony how much).

## Acceptance criteria
1. `npm run typecheck` clean; tests green; no `three`/DOM imports.
2. Every Tier 1 source kind in GDD 05 exists with the chapter's numbers (table-driven test against the constants).
3. Renewable sources refill at the stated rate and cap; decaying sources lose amount with the stated half-life or schedule; depleted non-renewable sources are removed and emit the event.
4. `harvest` never takes more than is available or more than the ant can hold; liquid goes to the crop with the right nutrient split; solid harvest creates an item with the right nutrients and bulk; feed slots limit simultaneous harvesters.
5. Seasonal availability follows year fractions for season lengths 5, 7 and 10.
6. The Tier 1 food set of a generated standard world (using placement tables from the test world or a generated world when available) offers, over one summer game day, at least the daily carbohydrate and protein the economy sanity budget in the design index requires for a 300-worker colony (headless calculation in a test; report the numbers).
7. Determinism and plain-data state.
