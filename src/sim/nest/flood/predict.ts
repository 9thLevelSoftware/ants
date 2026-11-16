// Reference storm (GDD 03 §11.4): integrate the flood model with I = 1 for 75 game s from an empty nest at the
// current soil moisture; the predicted flooded share of each chamber is its `floodRisk` (nest overview, architect,
// inspect panel) and feeds `diag-nest-flood`.

import type { Nest, Sim } from '@/sim/types';
import { FLOOD_REBUILD_TICKS, FLOOD_REF_INTENSITY, FLOOD_REF_S, FLOOD_STEP_TICKS } from '@/sim/balance/weather';
import { TICKS_PER_SECOND } from '@/sim/time';
import { nestInflow } from './inflow';
import { floodGeometry, spillFor } from './runtime';
import { chamberFloodedShare, floodedCount, spillVolume, type SpillCache } from './spill';
import { drainageOf } from './step';

export interface FloodPrediction {
  /** Peak water volume, BU^3, and flooded sample count at the peak. */
  peakWater: number;
  peakFlooded: number;
  /** Predicted flooded share per chamber id. */
  chambers: Map<number, number>;
}

/** Runs the reference storm for a nest (pure: nothing in the state changes). */
export function predictReferenceStorm(sim: Sim, nest: Nest): FloodPrediction {
  return predictWith(sim, nest, spillFor(sim, nest));
}

/** Integrates rain of intensity I for `seconds` from an empty nest (pure; tests and the reference storm). */
export function predictRain(sim: Sim, nest: Nest, intensity: number, seconds: number): FloodPrediction {
  return predictWith(sim, nest, spillFor(sim, nest), intensity, seconds);
}

function predictWith(sim: Sim, nest: Nest, cache: SpillCache, intensity = FLOOD_REF_INTENSITY, seconds = FLOOD_REF_S): FloodPrediction {
  const qIn = nestInflow(sim, nest, undefined, intensity);
  const dt = FLOOD_STEP_TICKS / TICKS_PER_SECOND;
  const cap = spillVolume(cache);
  let w = 0, peak = 0;
  for (let t = 0; t < seconds; t += dt) {
    const out = drainageOf(sim, nest, cache, floodedCount(cache, w));
    w = Math.min(cap, Math.max(0, w + (qIn - out) * dt));
    if (w > peak) peak = w;
  }
  const n = floodedCount(cache, peak);
  const chambers = new Map<number, number>();
  for (const c of nest.chambers) chambers.set(c.id, chamberFloodedShare(cache, c.id, n));
  return { peakWater: peak, peakFlooded: n, chambers };
}

/**
 * Writes Chamber.floodRisk from the reference storm and returns the prediction; null (nothing written) while the
 * nest's flood geometry is frozen by the rebuild throttle (the next period tries again). `minAgeTicks`: the
 * throttle's minimum capture age (runtime.ts floodGeometry).
 */
export function refreshFloodRisk(sim: Sim, nest: Nest, minAgeTicks = FLOOD_REBUILD_TICKS): FloodPrediction | null {
  const cache = floodGeometry(sim, nest, true, minAgeTicks);
  if (!cache) return null;
  const p = predictWith(sim, nest, cache);
  for (const c of nest.chambers) c.floodRisk = p.chambers.get(c.id) ?? 0;
  return p;
}
