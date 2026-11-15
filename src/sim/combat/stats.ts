// Combat stats of an ant (GDD 05 §4.1): bite, bite cycle, pull, armour, body length, special weapon, retreat
// health. Playable species read their caste table (fixed stats or the mass formulas) plus the per-caste overrides
// in balance/combat.ts; rival-only species read their RivalSpeciesDef. Pure.

import type { Ant, Sim } from '@/sim/types';
import { AntFlag } from '@/sim/types';
import {
  BITE_PER_MG23, CASTE_COMBAT_OVERRIDES, COMBAT_BITE_CYCLE_S, PULL_PER_MG23, RETREAT_HEALTH_IN, RETREAT_HEALTH_OUT,
} from '@/sim/balance/combat';
import { casteDef } from '@/sim/entities';
import { getRivalSpecies } from '@/sim/species';

export type CombatSpecial = 'spray' | 'sting' | null;

export interface CombatStats {
  /** Damage per strike before outnumbering and armour. */
  bite: number;
  /** Seconds between two strikes (strike 0.5 s + cooldown). */
  biteCycleS: number;
  pull: number;
  /** Damage reduction 0..1. */
  armour: number;
  /** Body length, mm. */
  lenMm: number;
  special: CombatSpecial;
  /** Spray damage multiplier of the species (rival `strong spray` 1.5, `weak spray` 0.5). */
  sprayMult: number;
  /** Retreat below this health outside the nest (species override, e.g. Myrmica 0.2). */
  retreatHealthOut: number;
}

const mg23 = (mg: number): number => Math.pow(Math.max(0, mg), 2 / 3);

function speciesIdOf(sim: Sim, ant: Ant): string {
  return sim.stores.colonies.get(ant.colony)?.species ?? sim.species.id;
}

function overrideFor(species: string, ant: Ant): { pull?: number; armour?: number; biteCycleS?: number } | undefined {
  const founding = ant.caste === 'queen' && (ant.flags & AntFlag.FOUNDING) !== 0;
  return (founding ? CASTE_COMBAT_OVERRIDES[`${species}:queen:founding`] : undefined) ?? CASTE_COMBAT_OVERRIDES[`${species}:${ant.caste}`];
}

/** Combat stats of an ant (looked up each call; cheap, no allocation beyond the result). */
export function combatStats(sim: Sim, ant: Ant): CombatStats {
  const species = speciesIdOf(sim, ant);
  const lenMm = ant.lengthBu * sim.world.bu;
  const def = sim.getSpecies(species as never);
  if (def) {
    const cd = casteDef(def, ant.caste);
    const ov = overrideFor(species, ant);
    const bite = cd?.fixedStats ? cd.fixedStats.bite : BITE_PER_MG23 * mg23(ant.massMg) * (cd ? cd.mandibleFactor : 1);
    const special: CombatSpecial = def.combat.weapons.includes('spray-acid') ? 'spray' : def.combat.weapons.includes('sting') ? 'sting' : null;
    return {
      bite, biteCycleS: ov?.biteCycleS ?? COMBAT_BITE_CYCLE_S, pull: ov?.pull ?? PULL_PER_MG23 * mg23(ant.massMg),
      armour: ov?.armour ?? 0, lenMm, special, sprayMult: 1, retreatHealthOut: RETREAT_HEALTH_OUT,
    };
  }
  const rival = getRivalSpecies(species as never);
  if (rival) {
    const isQueen = ant.caste === 'queen';
    const special: CombatSpecial = rival.special === 'spray-acid' ? 'spray' : rival.special === 'sting' ? 'sting' : null;
    return {
      bite: isQueen ? rival.queenBite : rival.bite, biteCycleS: COMBAT_BITE_CYCLE_S, pull: PULL_PER_MG23 * mg23(ant.massMg),
      armour: rival.armour, lenMm, special, sprayMult: special === 'spray' ? rival.specialPower : 1,
      retreatHealthOut: rival.retreatHealth,
    };
  }
  return {
    bite: BITE_PER_MG23 * mg23(ant.massMg), biteCycleS: COMBAT_BITE_CYCLE_S, pull: PULL_PER_MG23 * mg23(ant.massMg),
    armour: 0, lenMm, special: null, sprayMult: 1, retreatHealthOut: RETREAT_HEALTH_OUT,
  };
}

/** Retreat health of the ant where it is: lower inside its own nest (GDD 05 §4.6). */
export function retreatHealth(sim: Sim, ant: Ant): number {
  const home = ant.nestId >= 0 && sim.stores.nests.get(ant.nestId)?.colony === ant.colony;
  return home ? RETREAT_HEALTH_IN : combatStats(sim, ant).retreatHealthOut;
}

/** Health 0..1. */
export function healthOf(ant: Ant): number {
  return ant.maxHp > 0 ? Math.max(0, ant.hp) / ant.maxHp : 0;
}

/**
 * Local fighting strength of one ant for the retreat ratio: damage per second times remaining health, scaled so
 * that a healthy Lasius worker (bite 1.0 per 1.0 s, 10 HP) is 1.0 (the GDD's CP scale).
 */
export function fightStrength(sim: Sim, ant: Ant): number {
  const s = combatStats(sim, ant);
  return (s.bite / s.biteCycleS) * Math.max(0, ant.hp) / 10;
}
