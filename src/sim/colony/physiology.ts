// Individual physiology on the staggered slow tick (GDD 02 §1.3-§1.7): upkeep by metabolic class, crop and
// fat reserve, reserve refill, starvation and health, toxin, ageing, callow hardening, fatigue, activation decay,
// natural death. Queens are handled in queen.ts.

import type { AgeBand, Ant, Colony, MetabolicClass, Sim, SpeciesDef } from '@/sim/types';
import { AntFlag } from '@/sim/types';
import {
  ACTIVATION_HALF_LIFE_S, AGE_MID_MAX_GD, AGE_RATE_IN_NEST, AGE_YOUNG_MAX_GD, CALLOW_GD, FATIGUE_GAIN_ACTIVE_S,
  FATIGUE_GAIN_LIGHT_S, FATIGUE_RECOVER_S, HEALTH_REGEN_MAX_FATIGUE, HEALTH_REGEN_MAX_THERMAL_LOAD,
  HEALTH_REGEN_ELSEWHERE, HEALTH_REGEN_IN_NEST, INJURED_HEALTH, INJURED_RECOVER_HEALTH, LOAD_EPS, MET_DORMANT_MULT, MET_HURRY_MULT,
  MET_MASS_EXP, MET_RATE_C, RESERVE_CAP_BY_BAND, RESERVE_REFILL_MIN_DAYS_C, RESERVE_REFILL_RATE,
  STARVE_HEALTH_RATE, TOXIN_EFFECT_GD, TOXIN_HEALTH_PER_LOAD,
} from '@/sim/balance';
import { killAnt } from '@/sim/entities';
import { daysToTicks, TICKS_PER_DAY, TICKS_PER_SECOND } from '@/sim/time';
import { isWorkerCaste } from './census';
import { casteOf, fMet } from './life';
import { metabolicClass } from './metabolism';
import { daysOfStock } from './needs';
import { HELD_LEAN_KEY } from './starvation';
import { withdraw } from './stores';

// Imported bindings are accessor reads under Vite's SSR module runner (tests, headless tools); the hot per-entity
// steps below read these module-local copies instead.
const _AntFlag = AntFlag;
const _ACTIVATION_HALF_LIFE_S = ACTIVATION_HALF_LIFE_S;
const _AGE_MID_MAX_GD = AGE_MID_MAX_GD;
const _AGE_RATE_IN_NEST = AGE_RATE_IN_NEST;
const _AGE_YOUNG_MAX_GD = AGE_YOUNG_MAX_GD;
const _CALLOW_GD = CALLOW_GD;
const _FATIGUE_GAIN_ACTIVE_S = FATIGUE_GAIN_ACTIVE_S;
const _FATIGUE_GAIN_LIGHT_S = FATIGUE_GAIN_LIGHT_S;
const _FATIGUE_RECOVER_S = FATIGUE_RECOVER_S;
const _HEALTH_REGEN_MAX_FATIGUE = HEALTH_REGEN_MAX_FATIGUE;
const _HEALTH_REGEN_MAX_THERMAL_LOAD = HEALTH_REGEN_MAX_THERMAL_LOAD;
const _HEALTH_REGEN_IN_NEST = HEALTH_REGEN_IN_NEST;
const _HEALTH_REGEN_ELSEWHERE = HEALTH_REGEN_ELSEWHERE;
const _INJURED_HEALTH = INJURED_HEALTH;
const _INJURED_RECOVER_HEALTH = INJURED_RECOVER_HEALTH;
const _LOAD_EPS = LOAD_EPS;
const _MET_DORMANT_MULT = MET_DORMANT_MULT;
const _MET_HURRY_MULT = MET_HURRY_MULT;
const _MET_MASS_EXP = MET_MASS_EXP;
const _MET_RATE_C = MET_RATE_C;
const _RESERVE_CAP_BY_BAND = RESERVE_CAP_BY_BAND;
const _RESERVE_REFILL_MIN_DAYS_C = RESERVE_REFILL_MIN_DAYS_C;
const _RESERVE_REFILL_RATE = RESERVE_REFILL_RATE;
const _STARVE_HEALTH_RATE = STARVE_HEALTH_RATE;
const _TOXIN_EFFECT_GD = TOXIN_EFFECT_GD;
const _TOXIN_HEALTH_PER_LOAD = TOXIN_HEALTH_PER_LOAD;
const _killAnt = killAnt;
const _daysToTicks = daysToTicks;
const _TICKS_PER_DAY = TICKS_PER_DAY;
const _TICKS_PER_SECOND = TICKS_PER_SECOND;
const _isWorkerCaste = isWorkerCaste;
const _casteOf = casteOf;
const _fMet = fMet;
const _metabolicClass = metabolicClass;
const _daysOfStock = daysOfStock;
const _withdraw = withdraw;

/** bb keys used by the colony module on ants (numbers only). */
export const BB_TOXIN = 'cc.toxin';

/** Age band of an ant (GDD 02 §1.3): the callow flag wins, then physiological age. */
export function bandOf(a: Ant): AgeBand {
  if (a.flags & _AntFlag.CALLOW) return 'callow';
  if (a.physioAgeGd < _AGE_YOUNG_MAX_GD) return 'young';
  return a.physioAgeGd < _AGE_MID_MAX_GD ? 'mid' : 'old';
}

export function reserveCap(a: Ant): number {
  return _RESERVE_CAP_BY_BAND[bandOf(a)];
}

export function health(a: Ant): number {
  return a.maxHp > 0 ? a.hp / a.maxHp : 0;
}

/** Per-run sums of one colony's physiology steps (flushed into Colony.core by the economy system). */
export interface PhysioAcc {
  upkeepC: number;
  alateC: number;
  cropC: number;
  cropP: number;
  /** Workers that had no food source this run: unpaid upkeep, or empty crop and reserve with no pool access. */
  starving: number;
  /** Reserve refills allowed this run (stage fed and daysC >= _RESERVE_REFILL_MIN_DAYS_C). */
  refillOk: boolean;
  /**
   * Pool C this run's ants may still draw, and what they drew for upkeep / refills. Ants draw in id order as if
   * each withdrew on its own; the economy system books the total with one withdrawal (same ledger result).
   */
  poolLeft: number;
  upkeepDrawn: number;
  refillDrawn: number;
  /** Pool toxin per load of pool food at the start of the run. */
  toxinPerLoad: number;
}

export function newPhysioAcc(col: Colony): PhysioAcc {
  const s = col.stores;
  const total = s.c + s.p;
  return {
    upkeepC: 0, alateC: 0, cropC: 0, cropP: 0, starving: 0,
    refillOk: col.starvationStage === 'fed' && _daysOfStock(col).c >= _RESERVE_REFILL_MIN_DAYS_C
      && col.core?.acc[HELD_LEAN_KEY] !== 1, // R2 hold: pool under target, no refill
    poolLeft: s.c, upkeepDrawn: 0, refillDrawn: 0, toxinPerLoad: total > 0 ? s.toxin / total : 0,
  };
}

/** Books the run's pool draws (one withdrawal per purpose); called once per colony after the physiology steps. */
export function settlePhysioAcc(col: Colony, acc: PhysioAcc): void {
  if (acc.upkeepDrawn > 0) _withdraw(col, acc.upkeepDrawn, 0, 'workers');
  if (acc.refillDrawn > 0) _withdraw(col, acc.refillDrawn, 0, 'workers');
}

/** Draws up to `want` C from the run's pool budget. */
function drawPool(acc: PhysioAcc, want: number): number {
  const x = want < acc.poolLeft ? want : acc.poolLeft;
  acc.poolLeft -= x;
  return x;
}

/** Upkeep rate of a non-queen adult now, C loads per gd. */
export function upkeepRate(sim: Sim, a: Ant, def: SpeciesDef, cls: MetabolicClass = _metabolicClass(a, sim.world.bu)): number {
  const cd = _casteOf(def, a.caste);
  let base: number;
  if (cd?.upkeepOverride) base = cls === 'met-active' ? cd.upkeepOverride.activeC : cd.upkeepOverride.restC;
  else base = _MET_RATE_C[cls] * Math.pow(Math.max(0.01, a.massMg / def.stdMassMg), _MET_MASS_EXP);
  let r = base * _fMet(a.tb);
  if (a.flags & _AntFlag.DORMANT) r *= _MET_DORMANT_MULT;
  if ((a.flags & _AntFlag.POSSESSED) !== 0 && sim.state.player.intent.hurry) r *= _MET_HURRY_MULT;
  return r;
}

/** Applies a toxin dose received with food (GDD 02 §5.4.4); it acts over _TOXIN_EFFECT_GD. */
export function addToxinDose(a: Ant, toxinLoads: number): void {
  if (toxinLoads > 0) a.bb[BB_TOXIN] = (a.bb[BB_TOXIN] ?? 0) + toxinLoads;
}

/**
 * One slow-tick step of an adult non-queen ant of a full-fidelity colony; adds its rates and starving state to
 * `acc`. May kill the ant.
 */
export function physiologyStep(sim: Sim, a: Ant, col: Colony, def: SpeciesDef, dtTicks: number, acc: PhysioAcc): void {
  const dtGd = dtTicks / _TICKS_PER_DAY;
  const dtS = dtTicks / _TICKS_PER_SECOND;
  const worker = _isWorkerCaste(a.caste);
  const inside = a.nestId !== -1;
  const cls = _metabolicClass(a, sim.world.bu);

  // Upkeep: inside the nest pool -> crop -> reserve; outside crop -> reserve (GDD 02 §1.4).
  const rate = upkeepRate(sim, a, def, cls);
  if (worker) acc.upkeepC += rate;
  else acc.alateC += rate;
  let owed = rate * dtGd;
  if (inside && owed > 0) {
    const got = drawPool(acc, owed);
    acc.upkeepDrawn += got;
    owed -= got;
    if (acc.toxinPerLoad > 0) addToxinDose(a, got * acc.toxinPerLoad);
  }
  if (owed > 0 && a.cropC > 0) {
    const x = Math.min(owed, a.cropC);
    a.cropC -= x;
    owed -= x;
    if (a.cropC < _LOAD_EPS) a.cropC = 0;
  }
  if (owed > 0 && a.energy > 0) {
    const x = Math.min(owed, a.energy);
    a.energy -= x;
    owed -= x;
    if (a.energy < _LOAD_EPS) a.energy = 0;
  }
  const starving = owed > _LOAD_EPS || (a.cropC <= 0 && a.energy <= 0 && (!inside || acc.poolLeft <= 0));

  // Health: starvation, toxin, regeneration, injury flag (GDD 02 §1.4-1.5).
  let poisoned = false;
  if (starving) a.hp -= _STARVE_HEALTH_RATE * a.maxHp * dtGd;
  const dose = a.bb[BB_TOXIN];
  if (dose !== undefined && dose > 0) {
    const take = dose * Math.min(1, dtGd / _TOXIN_EFFECT_GD);
    a.bb[BB_TOXIN] = dose - take < _LOAD_EPS ? 0 : dose - take;
    a.hp -= _TOXIN_HEALTH_PER_LOAD * take * a.maxHp;
    poisoned = true;
  }
  if (!starving && !poisoned && a.heatLoad < _HEALTH_REGEN_MAX_THERMAL_LOAD && a.coldLoad < _HEALTH_REGEN_MAX_THERMAL_LOAD
    && a.fatigue < _HEALTH_REGEN_MAX_FATIGUE && a.hp < a.maxHp) {
    // GDD 02 §1.4 conditions, GDD 05 §4.7 rates: 0.25 per gd in the nest with crop C, 0.1 per gd elsewhere
    const rate = inside && a.cropC > 0 ? _HEALTH_REGEN_IN_NEST : _HEALTH_REGEN_ELSEWHERE;
    a.hp = Math.min(a.maxHp, a.hp + rate * a.maxHp * dtGd);
  }
  const h = health(a);
  if (h < _INJURED_HEALTH) a.flags |= _AntFlag.INJURED;
  else if (h >= _INJURED_RECOVER_HEALTH) a.flags &= ~_AntFlag.INJURED;
  if (a.hp <= 0) {
    _killAnt(sim, a.id, starving ? 'starvation' : poisoned ? 'poison' : 'unknown');
    return;
  }

  // Reserve refill from the pool, inside, while stores allow (stops from starvation stage S1).
  if (worker && inside && acc.refillOk) {
    const room = reserveCap(a) - a.energy;
    if (room > 0) {
      const got = drawPool(acc, Math.min(room, _RESERVE_REFILL_RATE * dtGd));
      acc.refillDrawn += got;
      a.energy += got;
      if (acc.toxinPerLoad > 0) addToxinDose(a, got * acc.toxinPerLoad);
    }
  }

  // Ageing and callow hardening (GDD 02 §1.3).
  const cd = _casteOf(def, a.caste);
  const ageRate = a.flags & _AntFlag.DORMANT ? (cd?.ageRateDormant ?? 0.15) : inside ? _AGE_RATE_IN_NEST : (cd?.ageRateOutside ?? _AGE_RATE_IN_NEST);
  a.physioAgeGd += ageRate * dtGd;
  if ((a.flags & _AntFlag.CALLOW) && sim.state.tick - a.bornTick >= _daysToTicks(_CALLOW_GD)) a.flags &= ~_AntFlag.CALLOW;

  // Fatigue (GDD 02 §1.7) and forager activation decay (§6.6).
  if (a.task === 'rest' || a.state === 'rest') a.fatigue = Math.max(0, a.fatigue - _FATIGUE_RECOVER_S * dtS);
  else if (cls === 'met-active') a.fatigue = Math.min(1, a.fatigue + _FATIGUE_GAIN_ACTIVE_S * dtS);
  else if (cls === 'met-light') a.fatigue = Math.min(1, a.fatigue + _FATIGUE_GAIN_LIGHT_S * dtS);
  if (a.activation > 0) {
    a.activation *= Math.pow(0.5, dtS / _ACTIVATION_HALF_LIFE_S);
    if (a.activation < 1e-4) a.activation = 0;
  }

  acc.cropC += a.cropC;
  acc.cropP += a.cropP;
  if (worker && a.physioAgeGd >= a.lifespanGd) {
    _killAnt(sim, a.id, 'old-age');
    return;
  }
  // S4 gate (GDD 02 §5.7): reserve 0 AND no food source. An ant whose upkeep the pool paid is not starving.
  if (worker && starving) acc.starving++;
}
