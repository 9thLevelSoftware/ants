// The colony cycle (every PHYSIO_EVERY ticks, at the end of the stagger cycle): rates, spoilage, needs,
// capacity, starvation stage, minim and stores-full timers, yield estimate, directive expiry, day rollover.

import { ti } from './taskIdx';
import type { Colony, ColonyCoreState, Sim, SpeciesDef } from '@/sim/types';
import {
  MINIM_NEED_P, NEED_EMA_GD, PHYSIO_EVERY, STORES_FULL_ALERT_GD, STORES_FULL_SPACE, YIELD_EMA_GD,
  YIELD_PER_FORAGER_DEFAULT, YIELD_PER_FORAGER_MIN,
} from '@/sim/balance';
import { EGG_COST_P } from '@/sim/balance/actions';
import { removeMarker } from '@/sim/entities';
import { calendarTick, currentDayOfYear, dayOf, daysToTicks, TICKS_PER_DAY } from '@/sim/time';
import { accGet, accSet, coreOf, emptyLedger } from './core';
import { censusOf, storeCycleSnapshot } from './census';
import { expireDirectives } from './directives';
import { updateNeeds } from './needs';
import { updateStarvation } from './starvation';
import { measurePileCap, poolSpace, refreshCapacity, spoil } from './stores';
import { fileDay } from './stats';
import { dailyRecount } from './population';
import { queenOf } from './queen';
import { colonyAlert, colonyClearAlert } from './alerts';
import { relaxExperience } from './allocation/assign';

/** Moves the running cycle sums into the instantaneous rates and clears them. */
function closeCycle(core: ColonyCoreState): void {
  for (const k of ['upkeepC', 'alateC', 'larvaC', 'larvaP', 'larvae', 'queenC', 'queenP', 'cropC', 'cropP', 'starving']) {
    accSet(core, `inst.${k}`, accGet(core, `cyc.${k}`));
    accSet(core, `cyc.${k}`, 0);
  }
}

function updateYield(sim: Sim, col: Colony, core: ColonyCoreState, dtGd: number): void {
  const foragers = col.alloc.actual[ti('forage')];
  const decay = Math.exp(-dtGd / YIELD_EMA_GD);
  // Exponentially weighted delivered loads and forager-days; a one forager-day prior keeps the default early on.
  const loads = accGet(core, 'yield.ewLoads') * decay + accGet(core, 'yield.loads');
  const gd = accGet(core, 'yield.ewGd') * decay + foragers * dtGd;
  accSet(core, 'yield.ewLoads', loads);
  accSet(core, 'yield.ewGd', gd);
  accSet(core, 'yield.loads', 0);
  col.yieldPerForager = Math.max(YIELD_PER_FORAGER_MIN, (loads + YIELD_PER_FORAGER_DEFAULT) / (gd + 1));
  void sim;
}

function updateTimers(sim: Sim, col: Colony, core: ColonyCoreState): void {
  const now = sim.state.tick;
  if (col.needs.needP >= MINIM_NEED_P) { if (core.minimSinceTick < 0) core.minimSinceTick = now; } else core.minimSinceTick = -1;
  const space = poolSpace(col);
  const full = space.c < STORES_FULL_SPACE;
  if (full) {
    if (core.fullSinceTick < 0) core.fullSinceTick = now;
    else if (now - core.fullSinceTick >= daysToTicks(STORES_FULL_ALERT_GD) && accGet(core, 'fullAlerted') === 0) {
      accSet(core, 'fullAlerted', 1);
      sim.emit({ type: 'stores-full', colonyId: col.id });
      if (col.isPlayer) colonyAlert(sim, 'stores-full', 'notice', col.id, 'Food stores are full', 'dig a food chamber', 'diag-stores');
    }
  } else if (core.fullSinceTick >= 0) {
    core.fullSinceTick = -1;
    accSet(core, 'fullAlerted', 0);
    if (col.isPlayer) colonyClearAlert(sim, 'stores-full', col.id);
  }
}

/** Starts a new game day: files the finished day, resets the daily ledger and today counters. */
function rollDay(sim: Sim, col: Colony, core: ColonyCoreState, day: number): void {
  const days = core.day >= 0 ? day - core.day : 0;
  if (core.day >= 0) {
    fileDay(sim, col);
    dailyRecount(sim, col);
  }
  core.day = day;
  col.ledger = emptyLedger(sim.state.tick);
  const c = col.counters;
  c.intakeTodayC = 0; c.intakeTodayP = 0; c.useTodayC = 0; c.useTodayP = 0;
  core.departuresToday = 0;
  core.deathsToday = {};
  const q = queenOf(sim, col);
  const doy = currentDayOfYear(sim.state);
  if (q?.queen && doy - 1 < q.queen.layingLog.length) q.queen.layingLog[doy - 1] = 0;
  if (days > 0) for (const a of sim.stores.ants.list) if (a.alive && a.colony === col.id) relaxExperience(a, days);
}

/** Per-tick colony bookkeeping that is not on the cycle: core creation and day rollover. */
export function colonyTick(sim: Sim, col: Colony): ColonyCoreState {
  const day = dayOf(calendarTick(sim.state));
  const core = coreOf(col, sim.state.tick, -1);
  if (core.day !== day) rollDay(sim, col, core, day);
  return core;
}

/** End of a stagger cycle for one colony. `starvingAdults` comes from this cycle's physiology steps. */
export function closeColonyCycle(sim: Sim, col: Colony, core: ColonyCoreState, def: SpeciesDef): void {
  const dtGd = PHYSIO_EVERY / TICKS_PER_DAY;
  closeCycle(core);
  core.workers = censusOf(sim, col.id).workers;
  storeCycleSnapshot(sim, col, core);
  core.pileCap = measurePileCap(sim, col);
  const sp = spoil(sim, col, dtGd);
  accSet(core, 'inst.spoilC', sp.c);
  accSet(core, 'inst.spoilP', sp.p);
  // Laying rate EMA (eggs per gd) from this cycle's eggs.
  const k = Math.exp(-dtGd / NEED_EMA_GD);
  core.layingRate = core.layingRate * k + accGet(core, 'cyc.eggs') / NEED_EMA_GD;
  accSet(core, 'cyc.eggs', 0);
  const rateC = accGet(core, 'inst.upkeepC') + accGet(core, 'inst.alateC') + accGet(core, 'inst.queenC') + accGet(core, 'inst.larvaC');
  // Laying protein uses the realised laying rate (GDD 02 §15 worked example), see the report on §5.5.
  const rateP = accGet(core, 'inst.queenP') + EGG_COST_P * core.layingRate + accGet(core, 'inst.larvaP') + sp.p;
  updateNeeds(col, { rateC, rateP }, dtGd);
  refreshCapacity(col);
  col.stores.inCrops.c = accGet(core, 'inst.cropC');
  col.stores.inCrops.p = accGet(core, 'inst.cropP');
  updateStarvation(sim, col, accGet(core, 'inst.starving'));
  updateTimers(sim, col, core);
  updateYield(sim, col, core, dtGd);
  expireDirectives(sim, col);
  for (const m of sim.stores.markers.list) {
    if (m.alive && m.colony === col.id && m.expiresTick >= 0 && sim.state.tick >= m.expiresTick) removeMarker(sim, m.id, 'expired');
  }
  void def;
}
