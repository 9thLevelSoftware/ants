// Starting and ending a fight for an autonomous ant: the task switches to `fight` (the allocator never touches
// fighting ants, census.isAvailable) with the target and the source point in bb, and back to the remembered task
// afterwards, or to `flee` (GDD 02 §10.13, GDD 05 §4.6). The possessed ant keeps its control: the rules still
// apply to it, its task does not change.

import type { Vec3 } from '@/core/math/vec3';
import type { Ant, ReasonCode, Sim, Task } from '@/sim/types';
import { TASKS, taskIndex } from '@/sim/types';
import { FIGHT_EXIT_FLEE_HEALTH } from '@/sim/balance/combat';
import { dep } from './late';
import { canFight } from './engage';
import { healthOf } from './stats';
import { CB } from './state';

/** Sets the ant's task through the allocator's bookkeeping (falls back to a plain assignment without a colony). */
export function setTask(sim: Sim, ant: Ant, task: Task, reason: ReasonCode): void {
  if (ant.task === task) return;
  const col = sim.stores.colonies.get(ant.colony);
  if (col) dep().switchTask(sim, col, ant, task, reason);
  else { ant.task = task; ant.taskTick = sim.state.tick; }
  ant.thinkTick = sim.state.tick; // think on the next behaviour pass
}

export function setFightTarget(ant: Ant, kind: 'ant' | 'creature' | 'none', id: number): void {
  ant.bb[CB.tgtKind] = kind === 'ant' ? 1 : kind === 'creature' ? 2 : 0;
  ant.bb[CB.tgtId] = id;
}

export function fightTarget(ant: Ant): { kind: 'ant' | 'creature'; id: number } | null {
  const k = ant.bb[CB.tgtKind] ?? 0;
  if (k === 0) return null;
  return { kind: k === 1 ? 'ant' : 'creature', id: ant.bb[CB.tgtId] ?? -1 };
}

export function setFightSource(ant: Ant, p: Vec3): void {
  ant.bb[CB.srcX] = p.x; ant.bb[CB.srcY] = p.y; ant.bb[CB.srcZ] = p.z;
}

export function fightSource(ant: Ant, out: Vec3): Vec3 | null {
  const x = ant.bb[CB.srcX];
  if (x === undefined) return null;
  out.x = x; out.y = ant.bb[CB.srcY] ?? 0; out.z = ant.bb[CB.srcZ] ?? 0;
  return out;
}

/**
 * Puts an autonomous worker into `fight` against a target (and/or toward a source point). False when the ant may
 * not fight (possessed, not a worker caste, dormant, dead) or already flees.
 */
export function startFight(
  sim: Sim, ant: Ant, target: { kind: 'ant' | 'creature'; id: number } | null, source: Vec3 | null, reason: ReasonCode,
): boolean {
  if (!canFight(ant) || ant.task === 'flee') return false;
  if (ant.task !== 'fight') ant.bb[CB.prevTask] = taskIndex(ant.task);
  if (target) setFightTarget(ant, target.kind, target.id);
  if (source) setFightSource(ant, source);
  if (ant.task === 'fight') return true;
  ant.bb[CB.tgtSeen] = sim.state.tick;
  setTask(sim, ant, 'fight', reason);
  return true;
}

/** The task a fighter returns to (its task before the fight; idle when unknown). */
export function resumeTaskOf(ant: Ant): Task {
  const i = ant.bb[CB.prevTask] ?? -1;
  const t = i >= 0 && i < TASKS.length ? TASKS[i] : 'idle';
  return t === 'fight' || t === 'flee' ? 'idle' : t;
}

function clearFightBb(ant: Ant): void {
  delete ant.bb[CB.tgtKind]; delete ant.bb[CB.tgtId]; delete ant.bb[CB.tgtSeen];
  delete ant.bb[CB.srcX]; delete ant.bb[CB.srcY]; delete ant.bb[CB.srcZ]; delete ant.bb[CB.rally];
}

/** Ends the ant's fight: below 0.25 health it flees (then rests), otherwise it resumes its earlier task. */
export function endFight(sim: Sim, ant: Ant, reason: ReasonCode = 'job:resume'): void {
  const resume = resumeTaskOf(ant);
  clearFightBb(ant);
  delete ant.bb[CB.prevTask];
  if (ant.task !== 'fight') return;
  if (healthOf(ant) < FIGHT_EXIT_FLEE_HEALTH && ant.nestId < 0) setTask(sim, ant, 'flee', 'threat');
  else setTask(sim, ant, resume, reason);
}

/** Switches a fighting (or any autonomous) ant to `flee` (GDD 05 §4.6). */
export function startRetreat(sim: Sim, ant: Ant): void {
  if (!canFight(ant)) return;
  clearFightBb(ant);
  // fleeing ants drop what they carry, except brood
  if (ant.carry.kind === 'item') dep().begin(sim, ant, 'drop', null);
  setTask(sim, ant, 'flee', 'threat');
}
