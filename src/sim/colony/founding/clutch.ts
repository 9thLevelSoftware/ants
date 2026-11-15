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
import { FB, bbGet, bbSet, speciesOf } from './access';
import { forecast, type Forecast } from './model';
import { deepMoisture } from './siteAssess';

/** The founding cell chamber (registered by the nest module once ready), if any. */
export function foundingCell(nest: Nest) {
  return nest.chambers.find((c) => c.type === 'founding') ?? nest.chambers.find((c) => c.type === 'royal') ?? nest.chambers[0];
}

/** The clutch cap of GDD 06 §5.10: the species cap and the chamber volume (at least one batch). */
export function clutchCap(sim: Sim, nest: Nest): number {
  const def = speciesOf(sim);
  const cell = foundingCell(nest);
  const byVolume = cell ? Math.floor(cell.volume / EGG_VOLUME_BU3) : def.opening.clutchCap;
  return Math.min(def.opening.clutchCap, Math.max(OPEN_LAY_BATCH_EGGS, byVolume));
}

/** Most eggs the clutch may have now: the clutch cap, or the extra clutch after total brood loss. */
export function clutchLimit(sim: Sim, q: Ant, nest: Nest): number {
  let cap = clutchCap(sim, nest);
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

/**
 * GDD 06 §5.10: `lay-egg` is the key E in the chamber *with the entrance sealed*. The colony's laying rule already
 * admits the founding queen from phase `seal` on (colony/queen.ts FOUNDING_LAY_PHASES, colony-core), so the opening
 * stops a lay begun before the seal, before its effect lands (the action runner's cancel, without importing the
 * action library: colony -> ants would close an import cycle; lay-egg has no onEnd hook to run).
 */
export function refuseLayBeforeSeal(sim: Sim, q: Ant): void {
  const a = q.action;
  if (!a || a.id !== 'lay-egg') return;
  a.phase = 'cancelled';
  a.reason = 'not-allowed-here';
  q.action = null;
  q.pose = 0;
  sim.emit({ type: 'action-cancelled', antId: q.id, action: 'lay-egg', reason: 'not-allowed-here' });
}

/** Eggs laid so far in the current founding clutch (the extra clutch after total brood loss counts from 0). */
export function eggsLaid(q: Ant): number {
  return q.queen?.founding?.eggsLaid ?? 0;
}

/** Eggs of every founding clutch so far (the lapse's "brood lost" counter). */
export function eggsLaidTotal(q: Ant): number {
  return eggsLaid(q) + bbGet(q, FB.earlierEggs, 0);
}

/**
 * Lay phase bookkeeping: batches and forecast events, the colony's founding tick, the passive player's automatic
 * batch. Returns true when the time-lapse begins (GDD 06 §5.1 `lay` exit): the clutch is full, or the automatic
 * batch of a passive player has been laid. "Tend the brood" is the player's command (commands.ts).
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
  // measured from entering `lay` (sealing, or the start of the extra clutch after total brood loss)
  const layingFor = sim.state.tick - bbGet(q, FB.phaseTick, sim.state.tick);
  if (laid === 0 && !q.action && layingFor >= OPEN_AUTO_LAY_GD * TICKS_PER_DAY) {
    // the passive player's batch: laid by the colony's own laying rule (no action: importing the action library
    // here would close an import cycle colony -> ants -> colony)
    for (let i = 0; i < OPEN_LAY_BATCH_EGGS && layEgg(sim, q, 'worker') >= 0; i++) { /* one batch */ }
    if (eggsLaid(q) > 0) bbSet(q, FB.autoLaid, 1);
    return false; // the next tick counts the batch (event) and begins the lapse
  }
  if (laid === 0 || (q.action && q.action.id === 'lay-egg')) return false;
  return laid >= clutchLimit(sim, q, nest) || bbGet(q, FB.autoLaid, 0) === 1;
}
