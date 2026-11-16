// Nest flooding (GDD 03 §11), mound rain erosion (§1.4) and the flood diagnostics (App. D), task weather-effects.
// One system in the last tick phase, every FLOOD_STEP_TICKS (1 game s):
//   - each nest's water W (step.ts: inflow, wall drainage, level, chamber flooded shares, events),
//   - submersion of ants and brood (drown.ts),
//   - every FLOOD_PREDICT_TICKS (spread over the period by nest id): reference storm -> Chamber.floodRisk
//     (predict.ts; skipped while the nest's geometry is frozen; a dry nest of another colony captures a changing
//     geometry at most every FLOOD_PREDICT_DRY_REBUILD_TICKS) and `diag-nest-flood:<id>`,
//   - every EROSION_EVERY_TICKS per mound, spread over the period by mound id: one erosion pass in rain (erosion.ts).
// Registered by one line in src/sim/nest/index.ts.

import type { Nest, Sim, System } from '@/sim/types';
import { FLOOD_PREDICT_DRY_REBUILD_TICKS, FLOOD_PREDICT_TICKS, FLOOD_REBUILD_TICKS, FLOOD_STEP_TICKS } from '@/sim/balance/weather';
import { foundingFloodAlert, possessedFloodAlert, publishFloodDiagnostic, queenFloodAlert } from './diagnostics';
import { drownStep, type WetNest } from './drown';
import { erodeDueMounds } from './erosion';
import { refreshFloodRisk, type FloodPrediction } from './predict';
import { stepNestFlood } from './step';

export { floodCheats } from './cheats';
export { stepNestFlood, drainageOf } from './step';
export { predictRain, predictReferenceStorm, refreshFloodRisk } from './predict';
export { entranceInflow, nestInflow, catchmentOf, rimFactorOf } from './inflow';
export { floodDiagnostic, possessedFloodAlert, queenFloodAlert } from './diagnostics';
export { depthOver, dryPlace, isDryAt, outsidePlace, waterView, type DryPlace, type WaterView } from './dryPlace';
export { drownStep, isUnderWater } from './drown';
export { erodeDueMounds, erodeMound, erodeMounds } from './erosion';
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

/** Minimum geometry-capture age of a prediction: a dry nest of another colony waits longer (its floodRisk is read
 * only by the nest panel; balance FLOOD_PREDICT_DRY_REBUILD_TICKS). */
function predictMinAge(nest: Nest, mine: boolean): number {
  return !mine && nest.flood.water <= 0 ? FLOOD_PREDICT_DRY_REBUILD_TICKS : FLOOD_REBUILD_TICKS;
}

export function runFlood(sim: Sim): void {
  const t = sim.state.tick;
  const wet: WetNest[] = [];
  const frozen = new Set<number>();
  for (const nest of sim.stores.nests.list) {
    if (!nest.alive) continue;
    const wasWet = nest.flood.water > 0;
    const r = stepNestFlood(sim, nest);
    if (r.cache && r.nFlooded > 0) wet.push({ nestId: nest.id, cache: r.cache, nFlooded: r.nFlooded, level: nest.flood.level });
    if (r.frozen) frozen.add(nest.id);
    const changed = wasWet !== nest.flood.water > 0;
    let pred: FloodPrediction | null = null;
    const due = predictDue(t, nest);
    const mine = playerNest(sim, nest);
    if (due && nest.entrances.length > 0) pred = refreshFloodRisk(sim, nest, predictMinAge(nest, mine));
    if (mine && (due || changed)) publishFloodDiagnostic(sim, nest, pred);
    if (nest.founding && (changed || t % ALERT_EVERY === 0)) foundingFloodAlert(sim, nest);
  }
  drownStep(sim, wet, frozen);
  queenFloodAlert(sim);
  possessedFloodAlert(sim);
  erodeDueMounds(sim, t, EROSION_OFFSET);
}

/**
 * Nest flooding, submersion, flood risk, mound erosion (weather-effects). Runs in the last phase so that every carve
 * of a tick precedes the flood step (the spill-cache throttle in runtime.ts relies on it).
 */
export const floodSystem: System = { name: 'nest-flood', phase: 'lifecycle', every: FLOOD_STEP_TICKS, run: runFlood };
