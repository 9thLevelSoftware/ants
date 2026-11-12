# Task phero — Pheromone field (Stage 1A, Opus)

## Goal
The sparse 3D pheromone field that trails, home-range marking and alarm are built on: fast deposit and sensing, correct decay, washing and wiping, bounded memory, and plain-data persistence.

## Read first
- GDD 02 (`docs/design/gdd/02-colony-simulation.md`): the pheromone section in full (channels `trail` / `home` / `alarm`, deposit amounts, half-lives, diffusion, saturation, per-colony channels, effects of rain and sweeping) and the perception section (what sensing an ant has). Use `docs/design/gdd/digests/02.md` to find them; `digests/05.md` and `06.md` for the alarm numbers and rain washing.
- `docs/02-design-directions.md` §J (cell = 4 BU) and `docs/design/tdd/00-contracts-guidance.md` §7.
- `src/sim/types/**` (`PheromoneState`, `PheromoneField` service interface) and the stub `src/sim/pheromones/index.ts`.

## You own
`src/sim/pheromones/**`. Replace the stub keeping its exported names and signatures (extend additively). If the `PheromoneField` interface in `src/sim/types/services.ts` needs more methods, add them additively and list them in your report.

## Boundaries
- You do not decide when ants deposit or how they react: behaviours and the action library call `deposit` / `sense`; locomotion calls the trail-sensing helper.
- Rendering of the scent view is another task: expose an efficient read-only iteration over active cells for it.

## Deliverables
1. Sparse grid keyed by integer cell coordinates (works on ground, walls, ceilings and inside tunnels), per colony and per channel, stored in a form that maps directly onto plain typed arrays in `SimState` (no Maps in saved state; rebuild indices on load).
2. `deposit(colony, channel, pos, amount)` with saturation; `sample(colony, channel, pos)` (with a cheap neighbourhood blend); `senseDirection(colony, channel, pos, up, fwd, out)` returning the best heading on the tangent plane from three forward sensors plus a strength; `strongestNear(...)` for lost ants.
3. Decay with per-channel half-life read from balance constants, run every N ticks over active cells only; minimal diffusion as specified; removal of cells below a floor; a hard cap on cells per colony with eviction of the weakest.
4. `washExposed(amount, isExposed)` for rain, `wipeRegion(shape, factor)` for sweeping and other human events, `clearColony`.
5. `pheromoneSystem` and persistence helpers (`toState` / `fromState` or direct in-place layout), plus `forEachActiveCell(colony, channel, fn)` for rendering and debugging.

## Acceptance criteria
1. `npm run typecheck` clean; tests green; no `three`/DOM imports.
2. Half-life: a cell at 1.0 reads 0.5 +/- 2 % after one half-life of game time for each channel.
3. Sensing: on a synthetic curved trail, repeatedly stepping along `senseDirection` follows the trail end to end, on flat ground and on a vertical wall.
4. Washing only affects cells for which `isExposed` is true; wiping a region scales exactly those cells.
5. Save/load: state round-trips through core `encode`/`decode` and sampling is identical afterwards.
6. Performance on this machine, measured and reported: decay pass over 100,000 active cells under 3 ms; 2,000 deposits under 0.5 ms; 5,000 `senseDirection` calls under 2 ms.
7. Memory stays bounded when 1,000 ants deposit continuously for 20,000 ticks (cap respected; no growth after saturation).
8. Determinism: identical results for identical call sequences.
