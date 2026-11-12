// The first clutch (GDD 06 §5.10): the queen lays batches with the real `lay-egg` primitive while the opening phase
// is `lay` (the colony's canLay pays each egg from the founding pool); this file counts batches, emits the forecast
// after each, applies the clutch limits (species cap, chamber volume, an extra clutch after total brood loss),
// lays one batch herself when the player stays passive, and starts the time-lapse when the clutch is full.

import type { Ant, Nest, OpeningState, Sim } from '@/sim/types';
import { OPEN_LAY_BATCH_EGGS } from '@/sim/balance/actions';
import { EGG_VOLUME_BU3, OPEN_AUTO_LAY_GD } from '@/sim/balance/founding';
import { TICKS_PER_DAY } from '@/sim/time';
import { layEgg } from '../queen';
import { chamberTempC } from '../envAdapter';
import { FB, bbGet, speciesOf } from './access';
import { forecast, type Forecast } from './model';
import { deepMoisture } from './siteAssess';

/** The founding cell chamber (registered by the nest module once ready), if any. */
export function foundingCell(nest: Nest) {
  return nest.chambers.find((c) => c.type === 'founding') ?? nest.chambers.find((c) => c.type === 'royal') ?? nest.chambers[0];
}

/** Most eggs the clutch may have now: species cap, chamber volume, or the extra clutch after total brood loss. */
export function clutchLimit(sim: Sim, q: Ant, nest: Nest): number {
  const def = speciesOf(sim);
  const cell = foundingCell(nest);
  const byVolume = cell ? Math.floor(cell.volume / EGG_VOLUME_BU3) : def.opening.clutchCap;
  let cap = Math.min(def.opening.clutchCap, Math.max(OPEN_LAY_BATCH_EGGS, byVolume));
  const relay = bbGet(q, FB.relayClutch, -1);
  if (relay >= 0) cap = Math.min(cap, relay);
  const auto = bbGet(q, FB.autoClutch, -1);
  if (auto > 0) cap = Math.min(cap, auto);
  return cap;
}

/** Chamber temperature of the cell now, C. */
export function cellTempC(sim: Sim, nest: Nest, q: Ant): number {
  const cell = foundingCell(nest);
  return cell ? chamberTempC(sim, cell.id) : chamberTempC(sim, q.chamberId);
}

/** The forecast panel's numbers for a clutch of `eggs` at this site and cell. */
export function clutchForecast(sim: Sim, op: OpeningState, q: Ant, nest: Nest, eggs: number): Forecast {
  const def = speciesOf(sim);
  const p = sim.state.config.difficulty.params;
  return forecast(def, eggs, cellTempC(sim, nest, q), op.siteQ, {
    difficultyMult: p.foundingBroodMortalityMult, drainMult: p.reserveDrainMult,
    moisture: deepMoisture(sim, nest.origin.x, nest.origin.z), r0: q.queen?.founding?.R0,
  });
}

/** Eggs laid so far in the founding clutch. */
export function eggsLaid(q: Ant): number {
  return q.queen?.founding?.eggsLaid ?? 0;
}

/**
 * Lay phase bookkeeping: batches and forecast events, the colony's founding tick, the passive player's automatic
 * batch. Returns true when the clutch is complete (the caller starts the time-lapse).
 */
export function layTick(sim: Sim, op: OpeningState, q: Ant, nest: Nest): boolean {
  const laid = eggsLaid(q);
  const batches = Math.ceil(laid / OPEN_LAY_BATCH_EGGS);
  if (laid > 0 && sim.state.env.calendar.foundingTick < 0) sim.state.env.calendar.foundingTick = sim.state.tick;
  if (batches > op.layBatches && !(q.action && q.action.id === 'lay-egg')) {
    const eggs = laid - op.layBatches * OPEN_LAY_BATCH_EGGS;
    op.layBatches = batches;
    sim.emit({ type: 'opening.egg-batch', eggs, total: laid, forecast: clutchForecast(sim, op, q, nest, laid).expected });
  }
  const sealedTick = nest.founding?.sealedTick ?? sim.state.tick;
  if (laid === 0 && !q.action && sim.state.tick - sealedTick >= OPEN_AUTO_LAY_GD * TICKS_PER_DAY) {
    // the passive player's batch: laid by the colony's own laying rule (no action: importing the action library
    // here would close an import cycle colony -> ants -> colony)
    for (let i = 0; i < OPEN_LAY_BATCH_EGGS && layEgg(sim, q, 'worker') >= 0; i++) { /* one batch */ }
  }
  return laid >= clutchLimit(sim, q, nest) && !(q.action && q.action.id === 'lay-egg');
}
