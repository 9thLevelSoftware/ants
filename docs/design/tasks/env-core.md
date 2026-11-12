# Task env-core — Calendar, light, temperature and weather core (Stage 1A, Sonnet implement / Opus verify)

## Goal
The environment's clockwork: day phases and sun position, the temperature model at every scale the simulation needs, and the weather state machine. Effects of weather on trails, puddles, flooding and human activity are later tasks — expose the values they will need.

## Read first
- GDD 06 (`docs/design/gdd/06-environment-progression.md`): read in full the sections on the calendar and day phases, day/night light, the temperature model (air, surface by material and shade, soil by depth, body temperature, speed multiplier, activity gates, heat/cold load), the weather state machine, wind, and soil moisture inputs. `docs/design/gdd/digests/06.md` gives the map. Skip the opening sequence, overwintering, progression, reproduction and difficulty sections (other tasks).
- `docs/02-design-directions.md` §K (calendar anchor, year fractions, configurable season length, 7-day week).
- GDD 04 digest for the static per-cell inputs the world provides (shade, materials, moisture) and GDD 07 digest for the species' thermal profile and climate id.
- `src/sim/time.ts`, `src/sim/types/**` (`EnvironmentState`, `WorldData`, species thermal fields) and the stub `src/sim/environment/index.ts`.

## You own
`src/sim/environment/**` except files named `effects*`, `moisture*`, `flooding*`, the `human/` folder and anything about overwintering (later tasks). Replace the stub keeping its exported names and signatures (extend additively). Constants go in `src/sim/balance/environment.ts`; climate tables per climate id in `src/sim/environment/climates.ts`.

## Deliverables
1. Calendar helpers on top of `src/sim/time.ts`: day phases with their times, year fraction, season with configurable length, weekday/weekend, moon phase if the chapter defines one. All seasonal windows are read as year fractions.
2. Sun and moon direction and light level for any tick (used by rendering and by activity rules).
3. Temperature: air temperature curve by climate, season, time of day and weather; surface temperature by material and shade; soil temperature by depth with lag; `chamberTemp(sim, nest, chamber)` and chamber humidity from depth, cover and soil moisture; body temperature of an entity from where it stands; `speedMult(species, T)`; activity gates and heat/cold load accumulation exactly as GDD 06 specifies.
4. Weather state machine: states `clear`, `overcast`, `rain`, `storm`, `heat`, `frost` with seasonal transition probabilities and durations from the chapter, wind, a short forecast (next state hint) for telegraphing, driven only by the seeded RNG.
5. `environmentSystem` and events: new day, day-phase change, season change, weather change (with the outgoing and incoming state), temperature alerts.
6. Pure query functions other modules call: `airTemp(sim)`, `surfaceTemp(sim, x, z)`, `soilTemp(sim, depthMm, x, z)`, `lightLevel(sim)`, `sunDirection(sim, out)`, `isRaining(sim)`, `rainRate(sim)`, `windAt(sim)`.

## Acceptance criteria
1. `npm run typecheck` clean; tests green; no `three`/DOM imports.
2. With the default calendar, the day phases, season boundaries and weekday/weekend match GDD 06 and directions §K; with season length 5 and 10 every seasonal window scales by year fraction (tests for both).
3. Temperature tables: for the reference climate, midday and pre-dawn air temperatures in each season match the chapter within 0.5 °C; asphalt in full summer sun versus shaded soil differ by the chapter's amounts; soil at depth lags and damps as specified.
4. `speedMult` matches the chapter's curve at its tabulated points; activity gates open and close at the stated temperatures.
5. Weather: over 200 simulated years per season the state frequencies match the transition table within sampling error; durations respect the stated bounds; identical seeds give identical sequences.
6. No weather or temperature function allocates per call (hot paths), verified by reading the code.
7. Determinism and plain-data state.
