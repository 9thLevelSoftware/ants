// Nest flooding (GDD 03 §11), mound rain erosion (§1.4) and the flood diagnostics (App. D), task weather-effects.
// One system in the last tick phase, every FLOOD_STEP_TICKS (1 game s):
//   - each nest's water W (step.ts: inflow, wall drainage, level, chamber flooded shares, events),
//   - submersion of ants and brood (drown.ts),
//   - every FLOOD_PREDICT_TICKS (spread over the period by nest id): reference storm -> Chamber.floodRisk
//     (predict.ts; skipped while the nest's geometry is frozen) and `diag-nest-flood:<id>`,
//   - every EROSION_EVERY_TICKS: one erosion pass over every mound in rain (erosion.ts).
// Registered by one line in src/sim/nest/index.ts.

import type { Nest, Sim, System } from '@/sim/types';
import { EROSION_EVERY_TICKS, FLOOD_PREDICT_TICKS, FLOOD_STEP_TICKS } from '@/sim/balance/weather';
import { foundingFloodAlert, publishFloodDiagnostic } from './diagnostics';
import { drownStep, type WetNest } from './drown';
import { erodeMounds } from './erosion';
import { refreshFloodRisk, type FloodPrediction } from './predict';
import { stepNestFlood } from './step';

export { floodCheats } from './cheats';
export { stepNestFlood, drainageOf } from './step';
export { predictReferenceStorm, refreshFloodRisk } from './predict';
export { entranceInflow, nestInflow, catchmentOf, rimFactorOf } from './inflow';
export { floodDiagnostic } from './diagnostics';
export { drownStep, isUnderWater } from './drown';
export { erodeMound, erodeMounds } from './erosion';
export { floodGeometry, spillFor, spillPeek } from './runtime';
export { floodedCount, waterLevelMm, chamberFloodedShare, spillVolume, type SpillCache } from './spill';
export { floodSurface, type FloodSurface } from './surface';

/** Offsets inside the periods (keep the heavy parts off the diagnostics / architect ticks). */
const PREDICT_OFFSET = 70;
const EROSION_OFFSET = 140;
const ALERT_EVERY = 250;

/** The reference-storm prediction of a nest is due (spread over the period by nest id, so nests do not stack). */
function predictDue(t: number, nest: Nest): boolean {
  const slots = FLOOD_PREDICT_TICKS / FLOOD_STEP_TICKS;
  return (t + PREDICT_OFFSET + (nest.id % slots) * FLOOD_STEP_TICKS) % FLOOD_PREDICT_TICKS === 0;
}

function playerNest(sim: Sim, nest: Nest): boolean {
  return nest.colony === sim.state.colonies[0]?.id;
}

export function runFlood(sim: Sim): void {
  const t = sim.state.tick;
  const wet: WetNest[] = [];
  const frozen = new Set<number>();
  for (const nest of sim.stores.nests.list) {
    if (!nest.alive) continue;
    const wasWet = nest.flood.water > 0;
    const r = stepNestFlood(sim, nest);
    if (r.cache && r.nFlooded > 0) wet.push({ nestId: nest.id, cache: r.cache, nFlooded: r.nFlooded });
    if (r.frozen) frozen.add(nest.id);
    const changed = wasWet !== nest.flood.water > 0;
    let pred: FloodPrediction | null = null;
    const due = predictDue(t, nest);
    if (due && nest.entrances.length > 0) pred = refreshFloodRisk(sim, nest);
    if (playerNest(sim, nest) && (due || changed)) publishFloodDiagnostic(sim, nest, pred);
    if (nest.founding && (changed || t % ALERT_EVERY === 0)) foundingFloodAlert(sim, nest);
  }
  drownStep(sim, wet, frozen);
  if ((t + EROSION_OFFSET) % EROSION_EVERY_TICKS === 0) erodeMounds(sim);
}

/**
 * Nest flooding, submersion, flood risk, mound erosion (weather-effects). Runs in the last phase so that every carve
 * of a tick precedes the flood step (the spill-cache throttle in runtime.ts relies on it).
 */
export const floodSystem: System = { name: 'nest-flood', phase: 'lifecycle', every: FLOOD_STEP_TICKS, run: runFlood };
