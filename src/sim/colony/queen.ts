// The queen (GDD 02 §3): laying potential, the shared egg budget, laying (AI and possessed queen alike), queen
// nutrition, the laying-protein permission and ration mixes, no-worker mode and the orphan flag.
// A founding queen (queen.founding !== null) belongs to the founding module, except that layEgg serves her clutch.

import { ti } from './taskIdx';
import { clamp } from '@/core/math/scalar';
import type { Ant, BroodCaste, Colony, ColonyCoreState, Sim, SpeciesDef } from '@/sim/types';
import { BroodFlag } from '@/sim/types';
import {
  EGG_BUDGET_CAP, HEALTH_REGEN_RATE, LAYING_LARVAE_EXTRA, LAYING_LARVAE_PER_NURSE, LAYING_LARVAL_HUNGER_MAX, LAYING_P_MIN_DAYS,
  NO_WORKER_CLUTCH_MIN_RESERVE_P, PROJECTED_EGG_WEIGHT, QUEEN_FAT_CAP, QUEEN_LAY_MIN_HEALTH, QUEEN_P_UNPAID_HEALTH,
  QUEEN_GUT_CAP, QUEEN_RATION_BASE, QUEEN_RATION_BASE_P, QUEEN_RATION_P_SHARE_WITHHELD, QUEEN_REFILL_MIN_GUT_C,
  QUEEN_RESERVE_REFILL, QUEEN_STARVE_GD, QUEEN_TARGET_GUT_C, QUEEN_TARGET_GUT_P, WORKER_CAP_TAPER, LOAD_EPS,
} from '@/sim/balance';
import { EGG_COST_P } from '@/sim/balance/actions';
import { killAnt, spawnBrood } from '@/sim/entities';
import { currentDayOfYear, TICKS_PER_DAY } from '@/sim/time';
import { accAdd, accSet, coreOf } from './core';
import { censusOf, cycleCensus } from './census';
import { chamberTempC, d28Now, pointTempC } from './envAdapter';
import { curveAt, fMet } from './life';
import { daysOfStock } from './needs';

/** Phases of the opening in which the founding queen may lay her clutch. */
const FOUNDING_LAY_PHASES = new Set(['seal', 'lay', 'timelapse', 'handover']);

export interface LayingFactors {
  /** Eggs per gd. */
  potential: number;
  /** Q_MAX x fSize x fecundity: the potential at season = temperature = health = cap = 1. */
  ref: number;
  size: number;
  season: number;
  temp: number;
  health: number;
  cap: number;
}

export function queenOf(sim: Sim, col: Colony): Ant | undefined {
  const q = sim.stores.ants.get(col.queenId);
  return q && q.queen ? q : undefined;
}

/** Temperature of the queen's chamber (or of her position), °C. */
export function royalTempC(sim: Sim, q: Ant): number {
  return q.chamberId >= 0 ? chamberTempC(sim, q.chamberId) : pointTempC(sim, q.pos);
}

/** Laying potential and its factors (GDD 02 §3.2). */
export function layingFactors(sim: Sim, col: Colony, q: Ant, def: SpeciesDef): LayingFactors {
  const cen = cycleCensus(sim, col);
  const life = def.life;
  const n = cen.workers;
  const size = life.sizeBase + (1 - life.sizeBase) * (1 - Math.exp(-n / life.sizeK));
  const d28 = d28Now(sim);
  let season = clamp(curveAt(life.fSeason, d28), 0, 1);
  if (life.layWindows && !life.layWindows.some(([a, b]) => d28 >= a && d28 < b)) season = 0;
  const temp = clamp(curveAt(life.fTempQ, royalTempC(sim, q)), 0, 1);
  const h = q.maxHp > 0 ? q.hp / q.maxHp : 0;
  const health = h >= QUEEN_LAY_MIN_HEALTH ? h : 0;
  const capN = def.scale.simCapWorkers;
  const projected = n + cen.workerPupae + cen.workerLarvae + PROJECTED_EGG_WEIGHT * cen.workerEggs;
  const cap = clamp((capN - projected) / (WORKER_CAP_TAPER * capN), 0, 1);
  const fec = q.queen ? q.queen.fecundity : 1;
  const ref = life.qMax * size * fec;
  return { potential: ref * season * temp * health * cap, ref, size, season, temp, health, cap };
}

/** Worker control of laying protein (GDD 02 §3.3): may carers add laying protein to the queen's ration? */
export function layingProteinPermitted(sim: Sim, col: Colony): boolean {
  if (col.starvationStage !== 'fed') return false;
  const cen = cycleCensus(sim, col);
  const nurses = cen.nurses;
  return daysOfStock(col).p >= LAYING_P_MIN_DAYS && cen.meanLarvalHunger <= LAYING_LARVAL_HUNGER_MAX
    && cen.larvae - cen.diapause <= LAYING_LARVAE_PER_NURSE * nurses + LAYING_LARVAE_EXTRA;
}

/** P share of a queen-carer's ration (GDD 02 §5.4.2). */
export function queenRationPShare(sim: Sim, col: Colony): number {
  if (!layingProteinPermitted(sim, col)) return QUEEN_RATION_P_SHARE_WITHHELD;
  const pot = coreOf(col).acc['lay.potential'] ?? 0;
  return (QUEEN_RATION_BASE_P + EGG_COST_P * pot) / (QUEEN_RATION_BASE + EGG_COST_P * pot);
}

/** Does the queen want food (retinue target, GDD 02 §3.3)? */
export function queenWantsFood(q: Ant): boolean {
  return !!q.queen && (q.queen.gut.c < QUEEN_TARGET_GUT_C || q.queen.gut.p < QUEEN_TARGET_GUT_P);
}

/** Whether the queen can lay one egg now (budget and protein), without laying it. */
export function canLay(sim: Sim, q: Ant): boolean {
  const qs = q.queen;
  if (!q.alive || !qs) return false;
  if (qs.founding) {
    const col = sim.stores.colonies.get(q.colony);
    const def = col ? sim.getSpecies(col.species) : undefined;
    const phase = col?.isPlayer ? sim.state.player.opening?.phase : 'lay';
    return !!def && phase !== undefined && FOUNDING_LAY_PHASES.has(phase) && qs.founding.eggsLaid < def.opening.clutchCap
      && qs.founding.reserveLoads >= EGG_COST_P;
  }
  if (qs.eggBudget < 1) return false;
  return qs.gut.p >= EGG_COST_P || (qs.mode === 'founding' && qs.reserveP >= EGG_COST_P);
}

/** The queen lays one egg (GDD 02 §3.2; GDD 01 `lay-egg` effect). Returns the brood id, -1 if she cannot. */
export function layEgg(sim: Sim, q: Ant, destined: BroodCaste = 'worker'): number {
  if (!canLay(sim, q)) return -1;
  const qs = q.queen!;
  const col = sim.stores.colonies.get(q.colony);
  if (!col) return -1;
  let flags = 0;
  if (qs.founding) {
    qs.founding.reserveLoads -= EGG_COST_P;
    qs.founding.eggsLaid++;
    qs.clutchLaid++;
  } else {
    qs.eggBudget -= 1;
    const fromGut = Math.min(EGG_COST_P, qs.gut.p);
    qs.gut.p -= fromGut;
    qs.reserveP -= EGG_COST_P - fromGut;
    if (qs.gut.p < LOAD_EPS) qs.gut.p = 0;
  }
  if (col.counters.eclosions === 0 && censusOf(sim, col.id).workers === 0) flags |= BroodFlag.FIRST_BROOD | BroodFlag.NANITIC;
  const b = spawnBrood(sim, {
    colony: col.id, stage: 'egg', destined, pos: q.pos, nestId: q.nestId, chamberId: q.chamberId, init: { flags },
  });
  col.counters.eggsLaid++;
  const doy = currentDayOfYear(sim.state);
  if (doy - 1 < qs.layingLog.length) qs.layingLog[doy - 1]++;
  accAdd(coreOf(col), 'cyc.eggs', 1);
  sim.emit({ type: 'egg-laid', broodId: b.id, queenId: q.id, destined });
  return b.id;
}

/**
 * S2 rationing (GDD 02 §5.7): a queen-carer feeds the queen from her own fat reserve. Returns the C moved.
 */
/** GDD 02 §5.7: carers feed the queen from their own reserve only from starvation stage S2 (rationing) to S4. */
export function queenReserveFeedAllowed(col: Colony | undefined): boolean {
  const s = col?.starvationStage;
  return s === 'rationing' || s === 'brood-sacrifice' || s === 'adult-starvation';
}

export function feedQueenFromReserve(sim: Sim, carer: Ant, amount: number): number {
  const col = sim.stores.colonies.get(carer.colony);
  if (!queenReserveFeedAllowed(col)) return 0; // every caller is gated here, not only the ants-side primitive
  const q = col ? queenOf(sim, col) : undefined;
  if (!q || !q.queen) return 0;
  const room = Math.max(0, QUEEN_GUT_CAP - q.queen.gut.c - q.queen.gut.p);
  const x = Math.min(Math.max(0, amount), carer.energy, room);
  carer.energy -= x;
  q.queen.gut.c += x;
  if (x > 0) sim.emit({ type: 'feed', giverId: carer.id, receiverId: q.id, broodId: -1, c: x, p: 0 });
  return x;
}

/** One slow-tick step of an established (or worker-less) queen. */
export function queenStep(sim: Sim, q: Ant, col: Colony, core: ColonyCoreState, def: SpeciesDef, dtTicks: number): void {
  const qs = q.queen;
  if (!qs) return;
  const dtGd = dtTicks / TICKS_PER_DAY;
  const workers = core.workers;
  if (qs.founding) {
    accSet(core, 'lay.potential', 0);
    return; // the founding module drives her until hand-over
  }
  qs.mode = workers > 0 ? 'established' : 'founding';

  const f = layingFactors(sim, col, q, def);
  accSet(core, 'lay.potential', f.potential);
  accSet(core, 'lay.ref', f.ref);
  accSet(core, 'lay.season', f.season);
  accSet(core, 'lay.temp', f.temp);
  accSet(core, 'lay.health', f.health);
  accSet(core, 'lay.cap', f.cap);
  const mayAccrue = qs.mode === 'established' || qs.reserveP >= NO_WORKER_CLUTCH_MIN_RESERVE_P;
  if (mayAccrue) qs.eggBudget = Math.min(EGG_BUDGET_CAP, qs.eggBudget + f.potential * dtGd);

  // Upkeep from the gut, C falling back to the fat reserve (GDD 02 §3.3).
  const m = fMet(q.tb);
  const upC = def.life.queenUpkeep.c * m, upP = def.life.queenUpkeep.p * m;
  accAdd(core, 'cyc.queenC', upC);
  accAdd(core, 'cyc.queenP', upP);
  let owedC = upC * dtGd;
  const gc = Math.min(owedC, qs.gut.c);
  qs.gut.c -= gc;
  owedC -= gc;
  const rc = Math.min(owedC, qs.reserve);
  qs.reserve -= rc;
  owedC -= rc;
  let owedP = upP * dtGd;
  const gp = Math.min(owedP, qs.gut.p);
  qs.gut.p -= gp;
  owedP -= gp;
  if (qs.mode === 'founding' && owedP > 0) {
    const rp = Math.min(owedP, qs.reserveP);
    qs.reserveP -= rp;
    owedP -= rp;
  }
  if (owedP > LOAD_EPS) q.hp -= QUEEN_P_UNPAID_HEALTH * q.maxHp * dtGd;
  if (owedC > LOAD_EPS) q.hp -= (q.maxHp / QUEEN_STARVE_GD) * dtGd;
  if (owedC <= LOAD_EPS && owedP <= LOAD_EPS && q.hp < q.maxHp) q.hp = Math.min(q.maxHp, q.hp + HEALTH_REGEN_RATE * q.maxHp * dtGd);
  if (qs.gut.c > QUEEN_REFILL_MIN_GUT_C && qs.reserve < QUEEN_FAT_CAP) {
    const x = Math.min(QUEEN_RESERVE_REFILL * dtGd, qs.gut.c - QUEEN_REFILL_MIN_GUT_C, QUEEN_FAT_CAP - qs.reserve);
    qs.gut.c -= x;
    qs.reserve += x;
  }
  if (q.hp <= 0) killAnt(sim, q.id, owedC > LOAD_EPS ? 'starvation' : 'unknown');
}
