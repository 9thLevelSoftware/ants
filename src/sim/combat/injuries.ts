// Injuries and recovery (GDD 05 §4.7). At the end of a fight, a survivor that lost >= 0.3 health in it rolls leg
// loss (p 0.3: speed x0.85 per leg, floor x0.7), antenna loss (p 0.15) and a gaster wound (p 0.1: special
// disabled); injured workers' remaining lifespan is cut to x0.7. Injuries are permanent.
// Recovery: the colony's physiology already regenerates every ant at HEALTH_REGEN_RATE per gd; combat tops this
// up to the GDD 05 in-nest rate (0.25 per gd with crop C > 0). The outside rate (0.1) is lower than the colony's
// base, which combat cannot take back (reported).

import type { Ant, Injury, Sim } from '@/sim/types';
import { INJURIES } from '@/sim/types';
import {
  INJURY_HEALTH_LOST, INJURY_LIFESPAN_MULT, INJURY_P, RECOVERY_EVERY_TICKS, RECOVERY_IN_NEST_PER_GD,
} from '@/sim/balance/combat';
import { HEALTH_REGEN_RATE } from '@/sim/balance/colony';
import { TICKS_PER_DAY } from '@/sim/time';
import { fightHealthLost } from './fightRecord';
import { roll } from './grapple';
import { CB, combatFlags } from './state';

const bit = (k: Injury): number => 1 << INJURIES.indexOf(k);

export function hasInjury(ant: Ant, k: Injury): boolean {
  return (ant.injuries & bit(k)) !== 0;
}

/** Adds an injury (legs stack); emits `ant-injured`. */
export function injure(sim: Sim, ant: Ant, k: Injury): void {
  ant.injuries |= bit(k);
  if (k === 'leg') ant.bb[CB.legs] = (ant.bb[CB.legs] ?? 0) + 1;
  sim.emit({ type: 'ant-injured', antId: ant.id, injury: k });
}

/** Injury roll at the end of the ant's fight. Returns the injuries received. */
export function rollInjuries(sim: Sim, ant: Ant): Injury[] {
  if (!ant.alive || combatFlags(sim).noInjury || combatFlags(sim).noRng) return [];
  if (fightHealthLost(ant) < INJURY_HEALTH_LOST - 1e-9) return [];
  const got: Injury[] = [];
  for (const k of INJURIES) if (roll(sim, INJURY_P[k])) { injure(sim, ant, k); got.push(k); }
  if (got.length > 0 && ant.lifespanGd > ant.physioAgeGd) {
    ant.lifespanGd = ant.physioAgeGd + (ant.lifespanGd - ant.physioAgeGd) * INJURY_LIFESPAN_MULT;
  }
  return got;
}

/** Recovery top-up for one ant over RECOVERY_EVERY_TICKS (call on that cadence). */
export function recoveryTopUp(sim: Sim, ant: Ant): void {
  if (!ant.alive || ant.hp >= ant.maxHp || ant.nestId < 0 || ant.cropC <= 0) return;
  if (sim.stores.nests.get(ant.nestId)?.colony !== ant.colony) return;
  const extra = RECOVERY_IN_NEST_PER_GD - HEALTH_REGEN_RATE;
  if (extra <= 0) return;
  ant.hp = Math.min(ant.maxHp, ant.hp + extra * ant.maxHp * (RECOVERY_EVERY_TICKS / TICKS_PER_DAY));
}
