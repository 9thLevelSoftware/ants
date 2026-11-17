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
import { provisionAtHandover } from './handover';
import { SEASON_STOCK_C_KEY, needRates } from './needs';
import { winterStoresNeed } from './overwinter/storesNeed';
import { AUTUMN_STOCK_TARGET_C_MULT, STOCK_TARGET_C_GD, STOCK_TARGET_MULT } from '@/sim/balance/colony';
import { WINTER_STORES_TARGET_MARGIN } from '@/sim/balance/lifecycle';
import { currentSeason } from '@/sim/time';
import { BroodFlag } from '@/sim/types';
import { LARVA_C_REQ, LARVA_P_REQ, LAYING_INTAKE_EMA_GD } from '@/sim/balance';
import { larvaRemainingNeed } from './brood';
import { BROOD_NEED_P_KEY, PROTEIN_INTAKE_KEY, PROTEIN_LIFE_KEY } from './queen';
import { measureLarder, measurePileCap, poolSpace, refreshCapacity, spoil } from './stores';
import { fileDay } from './stats';
import { dailyRecount } from './population';
import { queenOf } from './queen';
import { colonyAlert, colonyClearAlert } from './alerts';
import { relaxExperience } from './allocation/assign';
import { updateMiddenBlocked } from './midden';

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
  accSet(core, 'trailLost.today', 0);
  const q = queenOf(sim, col);
  const doy = currentDayOfYear(sim.state);
  if (q?.queen && doy - 1 < q.queen.layingLog.length) q.queen.layingLog[doy - 1] = 0;
  if (days > 0) for (const a of sim.stores.ants.list) if (a.alive && a.colony === col.id) relaxExperience(a, days);
}

/**
 * Protein supply for the laying gate (R4, queen.ts layingReleaseShare): an EMA of protein intake (loads/gd) and what
 * the brood still needs (feeding larvae's remaining protein, LARVA_P_REQ per egg), into core.acc.
 */
function updateProteinSupply(sim: Sim, col: Colony, core: ColonyCoreState, def: SpeciesDef, dtGd: number): void {
  const life = core.life.inDeliveryP;
  const prev = core.acc[PROTEIN_LIFE_KEY] ?? life;
  const k = 1 - Math.exp(-dtGd / LAYING_INTAKE_EMA_GD);
  const rate = Math.max(0, life - prev) / dtGd;
  core.acc[PROTEIN_INTAKE_KEY] = (core.acc[PROTEIN_INTAKE_KEY] ?? 0) + (rate - (core.acc[PROTEIN_INTAKE_KEY] ?? 0)) * k;
  core.acc[PROTEIN_LIFE_KEY] = life;
  const pShare = LARVA_P_REQ / (LARVA_P_REQ + LARVA_C_REQ);
  let need = 0;
  for (const b of sim.stores.brood.list) {
    if (!b.alive || b.colony !== col.id) continue;
    if (b.stage === 'egg') need += LARVA_P_REQ;
    else if (b.stage === 'larva' && (b.flags & BroodFlag.DIAPAUSE) === 0) need += larvaRemainingNeed(def, b) * pShare;
  }
  core.acc[BROOD_NEED_P_KEY] = need;
}

/** Per-tick colony bookkeeping that is not on the cycle: core creation and day rollover. */
export function colonyTick(sim: Sim, col: Colony): ColonyCoreState {
  const day = dayOf(calendarTick(sim.state));
  const core = coreOf(col, sim.state.tick, -1);
  if (core.day !== day) rollDay(sim, col, core, day);
  return core;
}

/**
 * The autumn multiplier of the carbohydrate stock target (viab-economy R6): at least AUTUMN_STOCK_TARGET_C_MULT, and
 * as much as makes the target R27's winter stores need (overwinter/storesNeed.ts) x WINTER_STORES_TARGET_MARGIN.
 */
function autumnStockMult(sim: Sim, col: Colony): number {
  // the stock target in loads at a season multiplier of 1 (needs.ts targetDays x needRates)
  const baseLoads = STOCK_TARGET_C_GD * (STOCK_TARGET_MULT[col.directives.stockTarget] ?? 1) * needRates(col).c;
  const want = winterStoresNeed(sim, col).needC * WINTER_STORES_TARGET_MARGIN;
  return Math.max(AUTUMN_STOCK_TARGET_C_MULT, baseLoads > 0 ? want / baseLoads : 0);
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
  updateProteinSupply(sim, col, core, def, dtGd);
  accSet(core, SEASON_STOCK_C_KEY, currentSeason(sim.state) === 'autumn' ? autumnStockMult(sim, col) : 1);
  updateNeeds(col, { rateC, rateP }, dtGd);
  measureLarder(sim, col); // after the needs: the larder holds a game day of this cycle's need (R21)
  refreshCapacity(col);
  col.stores.inCrops.c = accGet(core, 'inst.cropC');
  col.stores.inCrops.p = accGet(core, 'inst.cropP');
  provisionAtHandover(sim, col);
  updateStarvation(sim, col, accGet(core, 'inst.starving'));
  updateTimers(sim, col, core);
  updateMiddenBlocked(sim, col);
  updateYield(sim, col, core, dtGd);
  expireDirectives(sim, col);
  for (const m of sim.stores.markers.list) {
    if (m.alive && m.colony === col.id && m.expiresTick >= 0 && sim.state.tick >= m.expiresTick) removeMarker(sim, m.id, 'expired');
  }
  void def;
}
