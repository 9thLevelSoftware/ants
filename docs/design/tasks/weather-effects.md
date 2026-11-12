# Task weather-effects — What weather does: rain, moisture, puddles, flooding, heat and frost (Stage 2, Opus, visual)

## Goal
Weather with consequences at ant scale: rain that wets soil, washes trails, fills puddles and floods badly sited tunnels; heat and frost that gate activity and can kill; dew; wind — in the simulation and on screen.

## Read in full
GDD 06 (`docs/design/gdd/06-environment-progression.md`): every effect of each weather state (activity, trails washed away, flooding inputs, dew, puddles, visibility, sound), soil moisture dynamics, lethal heat/cold exposure rules. GDD 03 (`docs/design/gdd/03-nest-excavation.md`): flooding (which tunnels flood, what happens to ants and brood, recovery, raised entrances, mound erosion), collapse rules for unstable substrates. GDD 04: puddle hydraulics inputs, water rules. GDD 08: weather look and the rain/wet art direction. `docs/research/spike-look.md` (overcast-after-rain variant). Digests 06, 03, 04.

## You own
`src/sim/environment/{effects,moisture,flooding}*.ts` (+ a `weather/` subfolder if needed), `src/sim/nest/flood/**` and `src/sim/nest/collapse/**` (registered through the nest index with one import line each, reported), `src/render/world/weather/**`, constants in `src/sim/balance/weather.ts`, demo page `spikes/weather-demo/**`.

## Boundaries
The weather state machine and temperature model already exist (`env-core`): you consume them. Pheromone washing goes through the pheromone module's `washExposed`. Brood rescue during floods is carried out by nurses through existing behaviours: you raise the flood state and events; if a behaviour hook is missing, report it.

## Deliverables
1. Simulation: soil moisture per cell with rain input, drainage and evaporation; puddle levels in basins; dew at dawn; rain washing of exposed pheromone cells; raindrop impacts as a hazard for ants in the open (per the chapter); nest flooding (inflow through entrances by rain class and catchment, water level in the nest, flooded chambers, drowning, drying), mound erosion, collapse warnings for unstable substrate; heat and frost exposure effects on ants on hot or frozen surfaces; wind hooks.
2. Diagnostics and alerts (`diag-nest-flood`, flood risk, heat stress), events and cues.
3. Rendering: rain (streaks, splashes on surfaces, ripples on puddles) scaled to ant-scale drama, wet surfaces through the world renderer's wetness input, puddle levels through the decor/water input, overcast and storm lighting adjustments, frost tint, underground water in tunnels (a simple water surface in flooded cavities).
4. Demo page: a nest with a low entrance in a rain storm, time-stepped, with screenshots before/during/after.

## Acceptance criteria
1. Typecheck and tests green; simulation part pure.
2. Moisture, puddle and wash numbers match GDD 06's tables in table-driven tests; flooding matches GDD 03's rules (a nest with a low, unraised entrance floods in a storm; a raised rim reduces inflow by the stated factor; water recedes at the stated rate).
3. Headless scenario: a storm over a 100-worker colony washes outdoor trails, floods the lowest chamber of a badly sited nest and not a well sited one, and reports the flood through diagnostics.
4. Heat: ants crossing sun-heated asphalt at midday in summer accumulate heat load at the chapter's rate; shaded ground does not harm them.
5. Screenshots, looked at: rain reads as rain at ant scale, the ground looks wet, a puddle fills, a flooded tunnel shows water. No console errors; works in `test` and `high` and in the classic build.
