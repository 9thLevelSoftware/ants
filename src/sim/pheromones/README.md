# src/sim/pheromones — sparse 3D pheromone field (GDD 02 §8)

Owner: phero task. Pure sim code (no three, no DOM).

## Data
- Persisted: `state.phero` (`PheromoneState`): one `PheromoneLayer` per (colony, channel), each a list of 16^3-cell
  chunks (`keys: number[]`, `chunks: Float32Array[]`, 4 BU cells, values in ph) plus the eviction floors
  `cellFloor` / `chunkFloor`. Plain data only; the runtime works on it in place, so there is no `toState` step.
- Runtime (`sim.phero`, built by `createPheromoneField(state.phero)` in `src/sim/services.ts`): chunk index,
  active-cell list, per-chunk flags. Rebuilt from the state on load; a reloaded field behaves bit-identically.
- `trail` and `home` are per colony; `alarm` is ONE shared layer (colony id `PHERO_SHARED_COLONY` = -1), read and
  written whatever colony id you pass (GDD 02 §8.1).

## Calls
| Who | Call |
| --- | --- |
| behaviours / actions | `deposit(sim, colony, channel, p, ph)`; `sample(sim, colony, channel, p)` (own cell, or the trilinear blend of the 8 nearest cells if stronger) |
| locomotion | `sim.phero.sense(colony, channel, p, fwd, up, out)` / `senseDirection(...)`: unit tangent heading into `out`, returns strength; `sim.phero.lastSense` has L/C/R and the turn angle |
| lost ants | `strongestNear(sim, colony, channel, p, radius, out, minValue?)` |
| weather (GDD 06 §3.7) | `washExposed(sim, rainWashFactors(class, dtS, windGround, out), isExposed)` every decay step |
| human events (GDD 04 §15.4) | `wipeRegion(sim, region, { trail, home }, { colony?, filter? })`; regions `sphere`, vertical `cylinder`, yawed `box` (mm) |
| environment wiring | `sim.phero.setHooks({ decayModifier, isFree })`: per-cell decay-rate multiplier (build it with `pheroDecayRateMult(channel, { tempC, exposure, tmicroC })`), free-space test for alarm diffusion |
| scent view | `forEachActiveCell(sim, colony, channel, fn(x, y, z, ph))`, `layerVersion(colony, channel)` to skip unchanged layers |
| extinct colony | `clearColony(sim, colony)` |

`pheromoneSystem` (phase `pheromones`, every 10 ticks) decays all active cells by the elapsed game time
(half-lives 900 / 1200 / 15 s at 22 C), diffuses alarm, drops cells below `PHERO_EPS`, frees empty chunks.

## Caps
Per layer: trail 40,000 cells / 192 chunks, home 60,000 / 384, shared alarm 16,000 / 96 (`balance.ts`). At a cap
the weakest 1/16 of cells (1/8 of chunks, by content) are evicted; then a new cell or chunk is accepted only if its
deposit beats the strongest one evicted (the floor decays with the layer), which stops thrashing when ants cover
more ground than the cap holds.
