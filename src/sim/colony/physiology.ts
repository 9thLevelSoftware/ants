// Individual physiology on the staggered slow tick (GDD 02 §1.3-§1.7): upkeep by metabolic class, crop and
// fat reserve, reserve refill, starvation and health, toxin, ageing, callow hardening, fatigue, activation decay,
// natural death. Queens are handled in queen.ts.

import type { AgeBand, Ant, Colony, ColonyCoreState, Sim, SpeciesDef } from '@/sim/types';
import { AntFlag } from '@/sim/types';
import {
  ACTIVATION_HALF_LIFE_S, AGE_MID_MAX_GD, AGE_RATE_IN_NEST, AGE_YOUNG_MAX_GD, CALLOW_GD, FATIGUE_GAIN_ACTIVE_S,
  FATIGUE_GAIN_LIGHT_S, FATIGUE_RECOVER_S, HEALTH_REGEN_MAX_FATIGUE, HEALTH_REGEN_MAX_THERMAL_LOAD,
  HEALTH_REGEN_RATE, INJURED_HEALTH, INJURED_RECOVER_HEALTH, LOAD_EPS, MET_DORMANT_MULT, MET_HURRY_MULT,
  MET_MASS_EXP, MET_RATE_C, RESERVE_CAP_BY_BAND, RESERVE_REFILL_MIN_DAYS_C, RESERVE_REFILL_RATE,
  STARVE_HEALTH_RATE, TOXIN_EFFECT_GD, TOXIN_HEALTH_PER_LOAD,
} from '@/sim/balance';
import { killAnt } from '@/sim/entities';
import { daysToTicks, TICKS_PER_DAY, TICKS_PER_SECOND } from '@/sim/time';
import { accAdd } from './core';
import { isWorkerCaste } from './census';
import { fMet } from './life';
import { metabolicClass } from './metabolism';
import { daysOfStock } from './needs';
import { withdraw } from './stores';

/** bb keys used by the colony module on ants (numbers only). */
export const BB_TOXIN = 'cc.toxin';
export const BB_STARVING = 'cc.starving';

/** Age band of an ant (GDD 02 §1.3): the callow flag wins, then physiological age. */
export function bandOf(a: Ant): AgeBand {
  if (a.flags & AntFlag.CALLOW) return 'callow';
  if (a.physioAgeGd < AGE_YOUNG_MAX_GD) return 'young';
  return a.physioAgeGd < AGE_MID_MAX_GD ? 'mid' : 'old';
}

export function reserveCap(a: Ant): number {
  return RESERVE_CAP_BY_BAND[bandOf(a)];
}

export function health(a: Ant): number {
  return a.maxHp > 0 ? a.hp / a.maxHp : 0;
}

/** Upkeep rate of a non-queen adult now, C loads per gd. */
export function upkeepRate(sim: Sim, a: Ant, def: SpeciesDef): number {
  const cd = def.castes.find((c) => c.caste === a.caste);
  const cls = metabolicClass(a, sim.world.bu);
  let base: number;
  if (cd?.upkeepOverride) base = cls === 'met-active' ? cd.upkeepOverride.activeC : cd.upkeepOverride.restC;
  else base = MET_RATE_C[cls] * Math.pow(Math.max(0.01, a.massMg / def.stdMassMg), MET_MASS_EXP);
  let r = base * fMet(a.tb);
  if (a.flags & AntFlag.DORMANT) r *= MET_DORMANT_MULT;
  if ((a.flags & AntFlag.POSSESSED) !== 0 && sim.state.player.intent.hurry) r *= MET_HURRY_MULT;
  return r;
}

/** Applies a toxin dose received with food (GDD 02 §5.4.4); it acts over TOXIN_EFFECT_GD. */
export function addToxinDose(a: Ant, toxinLoads: number): void {
  if (toxinLoads > 0) a.bb[BB_TOXIN] = (a.bb[BB_TOXIN] ?? 0) + toxinLoads;
}

/**
 * One slow-tick step of an adult non-queen ant of a full-fidelity colony. Returns true if the ant is a starving
 * worker (empty crop and reserve). May kill the ant.
 */
export function physiologyStep(sim: Sim, a: Ant, col: Colony, core: ColonyCoreState, def: SpeciesDef, dtTicks: number): boolean {
  const dtGd = dtTicks / TICKS_PER_DAY;
  const dtS = dtTicks / TICKS_PER_SECOND;
  const worker = isWorkerCaste(a.caste);
  const inside = a.nestId !== -1;

  // Upkeep: inside the nest pool -> crop -> reserve; outside crop -> reserve (GDD 02 §1.4).
  const rate = upkeepRate(sim, a, def);
  if (worker) accAdd(core, 'cyc.upkeepC', rate);
  else accAdd(core, 'cyc.alateC', rate);
  let owed = rate * dtGd;
  if (inside && owed > 0) {
    const got = withdraw(col, owed, 0, 'workers');
    owed -= got.c;
    addToxinDose(a, got.toxin);
  }
  if (owed > 0 && a.cropC > 0) {
    const x = Math.min(owed, a.cropC);
    a.cropC -= x;
    owed -= x;
    if (a.cropC < LOAD_EPS) a.cropC = 0;
  }
  if (owed > 0 && a.energy > 0) {
    const x = Math.min(owed, a.energy);
    a.energy -= x;
    owed -= x;
    if (a.energy < LOAD_EPS) a.energy = 0;
  }
  const starving = owed > LOAD_EPS || (a.cropC <= 0 && a.energy <= 0 && (!inside || col.stores.c <= 0));
  a.bb[BB_STARVING] = starving ? 1 : 0;

  // Health: starvation, toxin, regeneration, injury flag (GDD 02 §1.4-1.5).
  let poisoned = false;
  if (starving) a.hp -= STARVE_HEALTH_RATE * a.maxHp * dtGd;
  const dose = a.bb[BB_TOXIN] ?? 0;
  if (dose > 0) {
    const take = dose * Math.min(1, dtGd / TOXIN_EFFECT_GD);
    a.bb[BB_TOXIN] = dose - take < LOAD_EPS ? 0 : dose - take;
    a.hp -= TOXIN_HEALTH_PER_LOAD * take * a.maxHp;
    poisoned = true;
  }
  if (!starving && !poisoned && a.heatLoad < HEALTH_REGEN_MAX_THERMAL_LOAD && a.coldLoad < HEALTH_REGEN_MAX_THERMAL_LOAD
    && a.fatigue < HEALTH_REGEN_MAX_FATIGUE && a.hp < a.maxHp) {
    a.hp = Math.min(a.maxHp, a.hp + HEALTH_REGEN_RATE * a.maxHp * dtGd);
  }
  const h = health(a);
  if (h < INJURED_HEALTH) a.flags |= AntFlag.INJURED;
  else if (h >= INJURED_RECOVER_HEALTH) a.flags &= ~AntFlag.INJURED;
  if (a.hp <= 0) {
    killAnt(sim, a.id, starving ? 'starvation' : poisoned ? 'poison' : 'unknown');
    return false;
  }

  // Reserve refill from the pool, inside, while stores allow (stops from starvation stage S1).
  if (worker && inside && col.starvationStage === 'fed') {
    const room = reserveCap(a) - a.energy;
    if (room > 0 && daysOfStock(col).c >= RESERVE_REFILL_MIN_DAYS_C) {
      const got = withdraw(col, Math.min(room, RESERVE_REFILL_RATE * dtGd), 0, 'workers');
      a.energy += got.c;
      addToxinDose(a, got.toxin);
    }
  }

  // Ageing and callow hardening (GDD 02 §1.3).
  const cd = def.castes.find((c) => c.caste === a.caste);
  const ageRate = a.flags & AntFlag.DORMANT ? (cd?.ageRateDormant ?? 0.15) : inside ? AGE_RATE_IN_NEST : (cd?.ageRateOutside ?? AGE_RATE_IN_NEST);
  a.physioAgeGd += ageRate * dtGd;
  if ((a.flags & AntFlag.CALLOW) && sim.state.tick - a.bornTick >= daysToTicks(CALLOW_GD)) a.flags &= ~AntFlag.CALLOW;

  // Fatigue (GDD 02 §1.7) and forager activation decay (§6.6).
  const cls = metabolicClass(a, sim.world.bu);
  if (a.task === 'rest' || a.state === 'rest') a.fatigue = Math.max(0, a.fatigue - FATIGUE_RECOVER_S * dtS);
  else if (cls === 'met-active') a.fatigue = Math.min(1, a.fatigue + FATIGUE_GAIN_ACTIVE_S * dtS);
  else if (cls === 'met-light') a.fatigue = Math.min(1, a.fatigue + FATIGUE_GAIN_LIGHT_S * dtS);
  if (a.activation > 0) {
    a.activation *= Math.pow(0.5, dtS / ACTIVATION_HALF_LIFE_S);
    if (a.activation < 1e-4) a.activation = 0;
  }

  accAdd(core, 'cyc.cropC', a.cropC);
  accAdd(core, 'cyc.cropP', a.cropP);
  if (worker && a.physioAgeGd >= a.lifespanGd) {
    killAnt(sim, a.id, 'old-age');
    return false;
  }
  return worker && a.cropC <= 0 && a.energy <= 0;
}
