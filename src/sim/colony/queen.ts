// The queen (GDD 02 §3): laying potential, the shared egg budget, laying (AI and possessed queen alike), queen
// nutrition, the laying-protein permission and ration mixes, no-worker mode and the orphan flag.
// A founding queen (queen.founding !== null) belongs to the founding module, except that layEgg serves her clutch.

import { ti } from './taskIdx';
import { clamp } from '@/core/math/scalar';
import type { Ant, BroodCaste, Colony, ColonyCoreState, Sim, SpeciesDef } from '@/sim/types';
import { BroodFlag } from '@/sim/types';
import {
  EGG_BUDGET_CAP, HEALTH_REGEN_RATE, LAYING_CREDIT_CAP, LAYING_CREDIT_FEED_MIN, LAYING_LARVAE_EXTRA, LAYING_RELEASE_FLOOR_DAYS, LAYING_SUPPLY_HORIZON_GD, LAYING_LARVAE_PER_NURSE, LAYING_LARVAL_HUNGER_MAX, LAYING_P_MIN_DAYS,
  NO_WORKER_CLUTCH_MIN_RESERVE_P, PROJECTED_EGG_WEIGHT, QUEEN_FAT_CAP, QUEEN_LAY_MIN_HEALTH, QUEEN_P_UNPAID_HEALTH,
  QUEEN_GUT_CAP, QUEEN_RATION_BASE, QUEEN_RATION_BASE_P, QUEEN_RATION_P_SHARE_WITHHELD, QUEEN_REFILL_MIN_GUT_C,
  QUEEN_RESERVE_REFILL, QUEEN_STARVE_GD, QUEEN_TARGET_GUT_C, QUEEN_TARGET_GUT_P, WORKER_CAP_TAPER, LOAD_EPS,
  DEFAULT_SEASON_LENGTH_DAYS, SMALL_COLONY_N, WINTER_RESERVE_FROM_D28, WINTER_RESERVE_MULT,
  EGGS_PER_NURSE, NURSE_FEED_CAPACITY, PUPAE_PER_NURSE,
} from '@/sim/balance';
import { EGG_COST_P } from '@/sim/balance/actions';
import { killAnt, spawnBrood } from '@/sim/entities';
import { currentDayOfYear, daysPerYear, DEFAULT_DAYS_PER_YEAR, TICKS_PER_DAY } from '@/sim/time';
import { accAdd, accSet, coreOf } from './core';
import { censusOf, cycleCensus, type CensusSnapshot } from './census';
import { chamberTempC, d28Now, pointTempC } from './envAdapter';
import { curveAt, fMet } from './life';
import { daysOfStock, targetDays } from './needs';

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
  /** R29 care factor: room left in what the nurse-capable workforce can tend (balance/colony.ts R29 notes). */
  care: number;
}

export function queenOf(sim: Sim, col: Colony): Ant | undefined {
  const q = sim.stores.ants.get(col.queenId);
  return q && q.queen ? q : undefined;
}

/** Temperature of the queen's chamber (or of her position), °C. */
export function royalTempC(sim: Sim, q: Ant): number {
  return q.chamberId >= 0 ? chamberTempC(sim, q.chamberId) : pointTempC(sim, q.pos);
}

/** Laying potential and its factors (GDD 02 §3.2, with R29's care factor). */
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
  // R29 applies to a queen with workers (a worker-less queen raises her clutch alone, GDD 02 §3.4)
  const care = n > 0 ? careFactor(sim, col, cen) : 1;
  return { potential: ref * season * temp * health * cap * care, ref, size, season, temp, health, cap, care };
}

/**
 * Brood in care in nurse-equivalents at the design's care rates (GDD 02 §6.2's nurse demand without brood moves and
 * diapause larvae, which need no feeding): eggs, pupae, and the larvae's food rate at their temperatures.
 */
export function broodCareNeed(sim: Sim, col: Colony, cen: CensusSnapshot): number {
  const acc = coreOf(col).acc;
  const larval = (acc['inst.larvaC'] ?? 0) + (acc['inst.larvaP'] ?? 0);
  return larval / NURSE_FEED_CAPACITY + cen.eggs / EGGS_PER_NURSE + cen.pupae / PUPAE_PER_NURSE;
}

/**
 * Workers the allocation could put on nursing if nursing and queen care came first (R29): the available workforce
 * (GDD 02 §6.3 `A`) less the queen-care demand, not today's nurse target (which §6.3 halves when demand exceeds `A`).
 */
export function nurseCapable(col: Colony, cen: CensusSnapshot): number {
  return Math.max(0, cen.available - col.alloc.demand[ti('queen-care')]);
}

/** R29 care factor: `clamp(1 - broodCareNeed / nurseCapable, 0, 1)` (0 with nobody to nurse). */
export function careFactor(sim: Sim, col: Colony, cen: CensusSnapshot): number {
  const capable = nurseCapable(col, cen);
  return capable > 0 ? clamp(1 - broodCareNeed(sim, col, cen) / capable, 0, 1) : 0;
}

/**
 * Worker control of laying protein (GDD 02 §3.3): may carers add laying protein to the queen's ration? Withheld in
 * rationing and worse (the pool is empty), not in a stage that is lean by carbohydrate only: protein in store above
 * the brood's need goes to the queen (viab-economy R4; GDD 02 §5.7 withholds it in all of S1).
 */
export function layingProteinPermitted(sim: Sim, col: Colony): boolean {
  const st = col.starvationStage;
  if (st !== 'fed' && st !== 'lean') return false;
  const cen = cycleCensus(sim, col);
  const nurses = cen.nurses;
  return daysOfStock(col).p >= LAYING_P_MIN_DAYS && cen.meanLarvalHunger <= LAYING_LARVAL_HUNGER_MAX
    && cen.larvae - cen.diapause <= LAYING_LARVAE_PER_NURSE * nurses + LAYING_LARVAE_EXTRA
    && !winterReserveShort(sim, col, cen.workers);
}

/** Default-year day (0-based d28) the winter starts: spring, summer, autumn come first. */
const WINTER_D28 = 3 * DEFAULT_SEASON_LENGTH_DAYS;

/**
 * Late in the season a small colony keeps its pool carbohydrate for the adults until the winter (balance
 * WINTER_RESERVE_*, viab-economy R5): true while the pool holds less than that, so no laying protein is released.
 */
export function winterReserveShort(sim: Sim, col: Colony, workers: number): boolean {
  if (workers >= SMALL_COLONY_N) return false;
  const d28 = d28Now(sim);
  if (d28 < WINTER_RESERVE_FROM_D28 || d28 >= WINTER_D28) return false;
  const gdLeft = (WINTER_D28 - d28) * (daysPerYear(sim.state.config) / DEFAULT_DAYS_PER_YEAR);
  const acc = coreOf(col).acc;
  const adultC = (acc['inst.upkeepC'] ?? 0) + (acc['inst.queenC'] ?? 0);
  return col.stores.c < WINTER_RESERVE_MULT * adultC * gdLeft;
}

/** core.acc keys of the protein supply (economy.ts updateProteinSupply): intake EMA, ledger mark, brood need. */
export const PROTEIN_INTAKE_KEY = 'lay.intakeP';
export const PROTEIN_LIFE_KEY = 'lay.lifeP';
export const BROOD_NEED_P_KEY = 'lay.broodNeedP';

/** Share of the laying potential whose protein the carers release (0 while withheld; LAYING_RELEASE_FLOOR_DAYS). */
export function layingReleaseShare(sim: Sim, col: Colony): number {
  if (!layingProteinPermitted(sim, col)) return 0;
  // the protein in store and coming in must first cover what the brood already laid still needs
  const acc = col.core?.acc;
  if (acc && acc[BROOD_NEED_P_KEY] !== undefined) {
    const supply = col.stores.p + (acc[PROTEIN_INTAKE_KEY] ?? 0) * LAYING_SUPPLY_HORIZON_GD;
    if (supply <= acc[BROOD_NEED_P_KEY]) return 0;
  }
  const target = targetDays(col).p;
  return clamp((daysOfStock(col).p - LAYING_RELEASE_FLOOR_DAYS) / Math.max(1e-6, target - LAYING_RELEASE_FLOOR_DAYS), 0, 1);
}

/** P share of a queen-carer's ration (GDD 02 §5.4.2), for the released share of the laying potential. */
export function queenRationPShare(sim: Sim, col: Colony): number {
  const share = layingReleaseShare(sim, col);
  if (share <= 0) return QUEEN_RATION_P_SHARE_WITHHELD;
  const pot = (coreOf(col).acc['lay.potential'] ?? 0) * share;
  return (QUEEN_RATION_BASE_P + EGG_COST_P * pot) / (QUEEN_RATION_BASE + EGG_COST_P * pot);
}

/** Scratch key on the queen (ant.bb): protein she may still take into her gut, loads P (LAYING_CREDIT_CAP). */
export const QUEEN_P_CREDIT_KEY = 'cq.creditP';

/** Protein the queen may still take into her gut now, loads (no credit kept for a founding queen: unlimited). */
export function queenProteinCredit(q: Ant): number {
  if (!q.queen || q.queen.founding) return Infinity;
  return q.bb[QUEEN_P_CREDIT_KEY] ?? LAYING_CREDIT_CAP;
}

/** Books protein taken into the queen's gut against her credit. */
export function spendQueenProteinCredit(q: Ant, p: number): void {
  if (!q.queen || q.queen.founding) return;
  q.bb[QUEEN_P_CREDIT_KEY] = Math.max(0, queenProteinCredit(q) - p);
}

/** Does the queen want food (retinue target, GDD 02 §3.3; protein only while her credit allows it)? */
export function queenWantsFood(q: Ant): boolean {
  if (!q.queen) return false;
  return q.queen.gut.c < QUEEN_TARGET_GUT_C
    || (q.queen.gut.p < QUEEN_TARGET_GUT_P && queenProteinCredit(q) >= LAYING_CREDIT_FEED_MIN);
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

/**
 * The floor point under an ant's feet: where its eggs or brood lie. The walker's position floats footOffset above
 * the surface (more for the large queen), and brood there is out of a nurse's reach (App. E 25: never fed).
 */
export function feetOf(a: Ant): { x: number; y: number; z: number } {
  return { x: a.pos.x - a.up.x * a.footOffset, y: a.pos.y - a.up.y * a.footOffset, z: a.pos.z - a.up.z * a.footOffset };
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
    colony: col.id, stage: 'egg', destined, pos: feetOf(q), nestId: q.nestId, chamberId: q.chamberId, init: { flags },
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
  // protein the carers may pass her: her P upkeep plus the released share of her laying protein (R4)
  const creditRate = def.life.queenUpkeep.p * fMet(q.tb) + EGG_COST_P * f.potential * layingReleaseShare(sim, col);
  q.bb[QUEEN_P_CREDIT_KEY] = Math.min(LAYING_CREDIT_CAP, queenProteinCredit(q) + creditRate * dtGd);

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
