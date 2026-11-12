# src/sim/pheromones — sparse 3D pheromone field (GDD 02 §8)

Owner: phero task. Pure sim code (no three, no DOM).

## Data
- Persisted: `state.phero` (`PheromoneState`): one `PheromoneLayer` per (colony, channel), each a list of 16^3-cell
  chunks (`keys: number[]`, `chunks: Float32Array[]`, 4 BU cells, values in ph) plus the eviction floors
  `cellFloor` / `chunkFloor` and the pending admission counters `pendingCells` / `pendingChunks`. Plain data only; the runtime works on it in place, so there is no `toState` step.
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
| environment wiring | `sim.phero.setHooks({ decayModifier, isFree })`: decay-rate multiplier `(channel, x, y, z, colony)`, called once per 4 x 1 x 4-cell patch per pass (build it with `pheroDecayRateMult(channel, { tempC, exposure, tmicroC, trailHalfLifeS, trailRefC })`; pass the colony's species trail half-life), free-space test for alarm diffusion. **Not installed yet** (src/sim/services.ts): until then every cell decays at the 22 C base and alarm diffuses into solid ground. |
| scent view | `forEachActiveCell(sim, colony, channel, fn(x, y, z, ph))`, `layerVersion(colony, channel)` to skip unchanged layers |
| extinct colony | `clearColony(sim, colony)` |

`pheromoneSystem` (phase `pheromones`, every tick) runs the staggered decay: chunks fall into 10 groups by a hash of
their key, and each tick decays one group by the time since its previous turn, so every cell still decays every
10 ticks (half-lives 900 / 1200 / 15 s at 22 C) while a tick does about a tenth of the work. The due groups follow
from `tick` and `lastDecayTick` alone, so irregular calls (time-lapse) catch every group up. Alarm diffuses on
group 0's turn. Cells below `PHERO_EPS` are dropped and empty chunks freed. `field.step(dt)` is the unstaggered
equivalent (tests, tools). Because a group decays every tick, `layerVersion` of a non-empty layer changes every tick.

## Caps
Per layer: trail 40,000 cells / 192 chunks, home 60,000 / 384, shared alarm 16,000 / 96 (`balance.ts`). At a cap
the weakest 1/16 of cells (1/8 of chunks, by content) are evicted, and the strongest evicted value becomes the
layer's floor (it decays with the layer). From then on a deposit into a NEW cell (chunk) waits in a small pending
counter (`pending.ts`, 256 cells / 64 chunks per layer); once the deposits it has collected beat the floor, the
newcomer is admitted with that sum and the weakest are evicted. Repeated deposits add up, so a reinforced new
trail wins its place within a pass or two, while stray dabs cannot make a saturated layer thrash. Huge
coordinates outside the chunk-key range (+-8192 cells) are refused, never wrapped.
