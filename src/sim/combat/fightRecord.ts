// The fight record of one ant (GDD 05 §4.7): when its fight began, its health then, and the last tick of fight
// activity (a lock, a hit, damage). The combat system closes the record after FIGHT_END_QUIET_S of quiet and rolls
// injuries. Kept in ant.bb so it persists.

import type { Ant, Sim } from '@/sim/types';
import { CB } from './state';

/** Starts the record if none is open and marks activity now. */
export function noteFightActivity(sim: Sim, ant: Ant): void {
  const now = sim.state.tick;
  if ((ant.bb[CB.fight0] ?? -1) < 0) {
    ant.bb[CB.fight0] = now;
    ant.bb[CB.hp0] = ant.hp;
  }
  ant.bb[CB.lastAct] = now;
}

export function inFightRecord(ant: Ant): boolean {
  return (ant.bb[CB.fight0] ?? -1) >= 0;
}

/** Health fraction lost since the record opened (0 when none). */
export function fightHealthLost(ant: Ant): number {
  if (!inFightRecord(ant) || ant.maxHp <= 0) return 0;
  return Math.max(0, (ant.bb[CB.hp0] ?? ant.hp) - ant.hp) / ant.maxHp;
}

export function closeFightRecord(ant: Ant): void {
  delete ant.bb[CB.fight0];
  delete ant.bb[CB.hp0];
  delete ant.bb[CB.lastAct];
}
