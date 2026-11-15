// Alarm (GDD 05 §4.5): each trigger deposits `alarm` pheromone (GDD 02 §8 scale) and raises the individual
// alarmLevel of nestmates within its burst radius; alarmLevel decays with a 10 s half-life. Ants whose level
// reaches their θ_fight are recruited to fight (recruit.ts).

import type { Vec3 } from '@/core/math/vec3';
import type { Ant, Sim } from '@/sim/types';
import { AntFlag } from '@/sim/types';
import {
  ALARM_FLAG_LEVEL, ALARM_LEVEL_EPS, ALARM_LEVEL_HALF_LIFE_S, ALARM_LEVEL_MAX, ALARM_NESTMATE_KILLED,
  ALARM_PREDATOR_STRIKE, ALARM_RELEASE_BURST, ALARM_RELEASE_MIN_STRENGTH,
} from '@/sim/balance/combat';
import { TICKS_PER_SECOND } from '@/sim/time';
import { CB, colonyLenMm, dist } from './state';

const DECAY_PER_TICK = Math.pow(0.5, 1 / (ALARM_LEVEL_HALF_LIFE_S * TICKS_PER_SECOND));
const ids: number[] = [];

export interface AlarmBurst {
  radiusL: number;
  add: number;
  /** Pheromone deposited at the point, ph (0 = the caller deposited it). */
  deposit: number;
}

/**
 * One alarm trigger of `colony` at pos: deposit, then +add alarmLevel for every living colony ant within radius
 * (L = the colony's standard worker length). The source point and attacker (-1 unknown) are remembered per ant
 * for recruits. Emits `alarm-raised`. Returns the number of nestmates reached.
 */
export function alarmBurst(sim: Sim, colony: number, pos: Vec3, b: AlarmBurst, source: string, attackerId = -1): number {
  if (b.deposit > 0) sim.phero.deposit(colony, 'alarm', pos, b.deposit);
  const r = b.radiusL * colonyLenMm(sim, colony);
  sim.index.queryAnts(pos, r, ids);
  let n = 0;
  for (let i = 0; i < ids.length; i++) {
    const a = sim.stores.ants.get(ids[i]);
    if (!a || !a.alive || a.colony !== colony || dist(a.pos, pos) > r) continue;
    addAlarm(a, b.add, pos, attackerId);
    n++;
  }
  sim.emit({ type: 'alarm-raised', colonyId: colony, pos: { x: pos.x, y: pos.y, z: pos.z }, strength: b.add, source });
  return n;
}

/** Raises one ant's alarmLevel and remembers where the alarm came from. */
export function addAlarm(a: Ant, add: number, pos: Vec3, attackerId: number): void {
  a.alarmLevel = Math.min(ALARM_LEVEL_MAX, a.alarmLevel + add);
  a.bb[CB.alarmX] = pos.x;
  a.bb[CB.alarmY] = pos.y;
  a.bb[CB.alarmZ] = pos.z;
  if (attackerId >= 0 || a.bb[CB.alarmBy] === undefined) a.bb[CB.alarmBy] = attackerId;
  if (a.alarmLevel >= ALARM_FLAG_LEVEL) a.flags |= AntFlag.ALARMED;
}

/**
 * Public trigger used by the action library (release-alarm, strength = its puff ALARM_PUFF) and the creature
 * module (strength 1 = a predator strike). Strength >= ALARM_RELEASE_MIN_STRENGTH is the release-alarm
 * primitive: its puff is already deposited, the burst is 10 L / +0.8. Otherwise the deposit is `strength` ph and
 * the burst 6 L with +0.7 for strong triggers (>= the killed deposit 1.5) and +0.5 for the others.
 */
export function raiseAlarm(sim: Sim, colony: number, pos: Vec3, strength: number): void {
  if (!sim.stores.colonies.get(colony)) return;
  if (strength >= ALARM_RELEASE_MIN_STRENGTH) {
    alarmBurst(sim, colony, pos, { radiusL: ALARM_RELEASE_BURST.radiusL, add: ALARM_RELEASE_BURST.add, deposit: 0 }, 'release-alarm');
    return;
  }
  const strong = strength >= ALARM_NESTMATE_KILLED.deposit;
  const t = strong ? ALARM_NESTMATE_KILLED : ALARM_PREDATOR_STRIKE;
  alarmBurst(sim, colony, pos, { radiusL: t.radiusL, add: t.add, deposit: Math.max(0, strength) }, strong ? 'killed' : 'strike');
  sim.emit({ type: 'cue', cue: 'alarm-burst', pos: { x: pos.x, y: pos.y, z: pos.z }, strength: Math.min(1, strength) });
}

/** Per-tick decay of an ant's alarmLevel (half-life 10 s) and the ALARMED flag. */
export function decayAlarm(a: Ant): void {
  if (a.alarmLevel <= 0) return;
  a.alarmLevel *= DECAY_PER_TICK;
  if (a.alarmLevel < ALARM_LEVEL_EPS) a.alarmLevel = 0;
  if (a.alarmLevel < ALARM_FLAG_LEVEL) a.flags &= ~AntFlag.ALARMED;
}

/** The alarm source point an ant remembers, or null. */
export function alarmSource(a: Ant, out: Vec3): Vec3 | null {
  const x = a.bb[CB.alarmX];
  if (x === undefined) return null;
  out.x = x; out.y = a.bb[CB.alarmY] ?? 0; out.z = a.bb[CB.alarmZ] ?? 0;
  return out;
}
