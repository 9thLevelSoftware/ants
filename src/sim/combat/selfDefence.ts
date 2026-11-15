// Fighting in place for ants the colony never sends to fight (GDD 05 §3.10, §4.1): an autonomous queen or gyne
// keeps her task (she does not chase or flee through the fight task) but answers a hostile that hit her within
// QUEEN_DEFENCE_WINDOW_S: one spray on the first hit of a fight while charges allow, then bites on her caste's
// cycle, through the same primitives as everyone else (she turns toward the attacker unless pinned).
// Also the deposit of GDD 02 §8 ALARM_FIGHT_RATE by every ant in a fight.

import type { Ant, Sim, TargetRef } from '@/sim/types';
import { AntFlag } from '@/sim/types';
import { ALARM_FIGHT_DEPOSIT_EVERY_TICKS, FIGHT_SPRAY_MIN_ACID, QUEEN_DEFENCE_WINDOW_S } from '@/sim/balance/combat';
import { ALARM_FIGHT_RATE } from '@/sim/balance/pheromone';
import { TICKS_PER_SECOND } from '@/sim/time';
import { dep } from './late';
import { sprayDisabled } from './acid';
import { combatStats } from './stats';
import { bodyOf, bodyPos, CB, faceToward, isParalysed, isPossessed, isSeized, isStunned, ticksOf } from './state';

const SPRAYED = 'cb.qSpr';

function defendsInPlace(ant: Ant): boolean {
  return (ant.caste === 'queen' || ant.caste === 'gyne') && !isPossessed(ant) && (ant.flags & AntFlag.DORMANT) === 0;
}

/** The queen's answer to a recent hit (call each combat tick for living ants). */
export function selfDefence(sim: Sim, ant: Ant): void {
  if (!defendsInPlace(ant) || ant.action) return;
  const t = ant.bb[CB.hitTick];
  if (t === undefined || sim.state.tick - t > ticksOf(QUEEN_DEFENCE_WINDOW_S)) return;
  if (isStunned(sim, ant) || isSeized(ant) || isParalysed(sim, ant)) return;
  const kind = ant.bb[CB.hitByKind] === 2 ? 'creature' : 'ant';
  const b = bodyOf(sim, kind, ant.bb[CB.hitBy] ?? -1);
  if (!b) return;
  if (b.kind === 'ant' && b.ant.colony === ant.colony) return;
  const p = bodyPos(b);
  const target: TargetRef = { kind, id: b.kind === 'ant' ? b.ant.id : b.c.id, pos: { x: p.x, y: p.y, z: p.z } };
  if (!ant.combat?.pinned) faceToward(ant, p);
  const lib = dep();
  if (combatStats(sim, ant).special === 'spray' && (ant.bb[SPRAYED] ?? 0) === 0 && !sprayDisabled(ant) && ant.acid >= FIGHT_SPRAY_MIN_ACID) {
    if (lib.begin(sim, ant, 'spray-acid', null)) { ant.bb[SPRAYED] = 1; return; }
  }
  lib.begin(sim, ant, 'bite', target);
}

/** Forgets the queen's "sprayed in this fight" mark when her fight record closes. */
export function endSelfDefence(ant: Ant): void {
  delete ant.bb[SPRAYED];
}

/** An ant in a fight right now: in a lock either way, engaging, or it dealt or took damage within the last second. */
function fighting(sim: Sim, ant: Ant): boolean {
  const cs = ant.combat;
  if (cs && (cs.lock || cs.heldBy.length > 0)) return true;
  if (ant.task === 'fight' && ant.state === 'fight.engage') return true;
  return sim.state.tick - (ant.bb[CB.lastDmg] ?? -1e9) < TICKS_PER_SECOND;
}

/** GDD 02 §8: fighting ants deposit `alarm` at ALARM_FIGHT_RATE ph per s (in chunks, staggered by id). */
export function fightAlarmDeposit(sim: Sim, ant: Ant): void {
  if ((sim.state.tick + ant.id) % ALARM_FIGHT_DEPOSIT_EVERY_TICKS !== 0) return;
  if (ant.caste === 'male' || !fighting(sim, ant)) return;
  sim.phero.deposit(ant.colony, 'alarm', ant.pos, (ALARM_FIGHT_RATE * ALARM_FIGHT_DEPOSIT_EVERY_TICKS) / TICKS_PER_SECOND);
}
