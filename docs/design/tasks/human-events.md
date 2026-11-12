# Task human-events — Indirect human activity (Stage 2, Opus, visual)

## Goal
People, represented only by what an ant would experience: colossal shoes and their tremor and shadow, a mower, a broom or vacuum indoors, food dropped or spilled, watering, cars and tires, children at play, bait stations — scheduled, telegraphed, and changing resources, trails, access and danger.

## Read in full
GDD 04 (`docs/design/gdd/04-world-habitats-worldgen.md`): the human-activity section in full (all ten event kinds: schedule by time of day and weekday/weekend, telegraphing an ant could sense, spatial paths, effects on ants, resources, trails and terrain including the crush-probability table, reactive bait and wiping rules, difficulty scaling). GDD 02: how ants react to telegraph cues and what events do to pheromones. GDD 05: bait/toxin rules, dropped-food sources. GDD 08: giant human sounds and the warning alert; art direction for human presence (no faces, no characters). `docs/01-design-seed.md` (people are indirect). Digests 04, 02, 05, 08.

## You own
`src/sim/environment/human/**`, `src/render/world/humans/**`, constants in `src/sim/balance/human.ts`, demo page `spikes/human-demo/**`.

## Boundaries
Food created by events goes through the sources module's runtime-creation functions; pheromone effects through the pheromone module; damage through the combat module's `applyDamage` with the right cause; ant reactions (freeze, flee, grip) through cues that existing behaviours read — if a reaction hook is missing, add the cue and report it. No human characters, faces, voices or dialogue.

## Deliverables
1. Scheduler: event generation from the 7-day week, time of day, season (year fractions), zone layout and difficulty; forecast data for the threat overlay.
2. Each event kind as a small state machine with its path/area, telegraph phase (shadow, tremor, sound, airflow cues), impact phase and aftermath: footsteps, mowing, sweeping, vacuum, food-drop, spill, watering, car, children, bait-station.
3. Effects: crush/dislodge rules, removal or scattering of food and items, trail wiping, terrain/decor state changes (mown grass height), wetting, new sources (dropped food, spills), bait behaviour with delayed toxicity.
4. Rendering: the giant shoe with a fading trouser leg, tire, mower deck and wheels, broom/vacuum head, falling food, sprinkler or watering stream, each with a moving shadow and camera tremor (none in reduced motion).
5. Demo page stepping through each event from ant height.

## Acceptance criteria
1. Typecheck and tests green; simulation part pure.
2. Over a simulated 28-day year the event frequencies per kind match the chapter's schedule within sampling error for each difficulty; no event occurs in a zone the map lacks.
3. Each event's telegraph precedes its impact by at least the stated time; an ant using only cue data can avoid it (scripted test); the crush table is honoured statistically.
4. Sweeping removes food and trails in its area; a food-drop creates discoverable sources; bait poisons with the stated delay through the colony's toxin store.
5. Screenshots, looked at: each event reads clearly and dramatically at ant scale (the shoe is colossal and frightening, the mower is a wall of noise and blades) with no human face or body beyond what the design allows. No console errors; works in `test` and `high` and the classic build.
