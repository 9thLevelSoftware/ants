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

## Integrator addendum (Nov 16, 02:30)
- Other engineers are working now: the sim gate's review/fix is in `src/sim/{ants,colony,locomotion,nest,ecology,progression}/**` and the app gate is in `src/render/slots/**`, `src/render/app/**`, `src/game/**`, `src/ui/**`. **Do not edit the app gate's paths.** In sim, stay in your own files; a registration line in `src/sim/environment/index.ts` is a single-line additive edit (targeted edit, reported).
- Contracts that exist: `HumanCue` in `src/sim/types/environment.ts` and the world events in `src/sim/types/eventsWorld.ts`; ants already sense cues in `src/sim/ants/perception/sense.ts`. The camera's tremor relay (`src/game/views/tremorCue.ts`) reads `tremor` cues: you MUST write `tremor` HumanCue entries for footfalls, mower, tires and vacuum, with the amplitude scale that file expects (read it and its test).
- Audio: `src/audio/giants.ts` plays giant sounds from events/cues: read which it listens to and emit exactly those; report any cue it lacks.
- Worldgen supplies where people go: interior lanes (`src/worldgen/place/interior/lanes.ts`) and outdoor paths/routes in the world data (find them in the world's layout/POI records). Use them; do not invent paths through walls or furniture. If a habitat has no lane data for an event kind, report it and skip that kind there.
- Damage: `applyDamage(sim, kind, id, dmg, cause, attackerId?)` from the combat module with the crush/toxin cause ids that exist (add a cause id additively if missing and report). The queen in a sealed founding chamber is underground: surface events must not hurt her; a footfall on the entrance mound follows GDD 03/04 (mound damage), not instant death.
- Major threats go through the creatures module's threat director where GDD 05/06 say events share the "one major threat at a time / quiet share" budget; read `src/sim/ecology/creatures/**` director API. If the GDD says human events are outside that budget, say so in the report with the section.
- Progression/alerts: the warning alert text goes in `src/content/text/alerts.ts` (additive ids).
- Render: deliver a `HumansRenderer` implementing `SubRenderer` in `src/render/world/humans/**` with a ready-to-paste slot file and the one registration line; prove it in your demo page on a real `Sim`. No faces, no bodies above what an ant would perceive (sole, tire, blade housing, broom bristles, shadow).
- Machine rules: 4 cores shared. Never run the whole vitest suite; run your folders. One headless browser at a time; close it when done. Global Playwright only.
- Evidence under `test-output/human/`. Look at every screenshot you cite.
