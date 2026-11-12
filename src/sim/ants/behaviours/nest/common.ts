// Shared steps of the in-nest behaviours: walking up to a target and starting a primitive on it, the end of a task
// cycle (GDD 02 §6.5 re-evaluation, §1.7 fatigue rest), rest itself (§10.11), and the universal failure handling
// of GDD 02 §10.0 (timeouts, stuck, carried items).

import type { ActionId, Ant, Sim, TargetRef } from '@/sim/types';
import { INJURED_HEALTH, INJURED_RECOVER_HEALTH, REST_ENTER, REST_EXIT } from '@/sim/balance';
import {
  APPROACH_BU, BACK_OFF_BU, BACK_OFF_CONE_DEG, CEILING_UP_Y, DROP_ABOVE_BU, REACH_NEAR_BU, REACH_STALL_S,
} from '@/sim/balance/nestwork';
import { secondsToTicks } from '@/sim/time';
import { navStop, navTo } from '@/sim/locomotion';
import { requestTask, taskCycleDone } from '@/sim/colony';
import { releaseDigSite } from '@/sim/nest';
import { canDo, cancel, interruptible } from '@/sim/ants/actions';
import { B, clearJob, noteStuck, setState, skip, timedOut } from './fsm';
import { cancelCare, careRunning, stepCare } from './careActs';
import { chamberIn, homeNest, restChamber } from './places';
import { act, actEnded, busy, entity, travel } from './travel';

export type ReachStatus = 'moving' | 'started' | 'failed';


/**
 * Walks up to the target and starts the primitive on it as soon as it can (reach and facing are the primitive's
 * own test, checked every think). An approach that ends without reach is followed by a closer one; after the
 * last, or a refusal other than reach, 'failed'. Uses B.n of the current state.
 */
export function reachAndAct(sim: Sim, ant: Ant, t: TargetRef, action: ActionId, actTarget: TargetRef | null = t): ReachStatus {
  const check = canDo(sim, ant, action, actTarget);
  if (check.ok) return act(sim, ant, action, actTarget) ? 'started' : 'failed';
  if (check.reason !== 'out-of-reach') return 'failed';
  // close by but not getting there (other ants in the way, an awkward spot): give it up after REACH_STALL_S
  const bu = sim.world.bu;
  if (nearStalled(sim, ant, t, bu)) { skip(ant, t.id); return 'failed'; }
  // on a chamber ceiling right above the target: let go and drop onto the floor (GDD 01 `let-go`)
  if (ant.up.y < CEILING_UP_Y && ant.pos.y - t.pos.y > bu && Math.hypot(t.pos.x - ant.pos.x, t.pos.z - ant.pos.z) < DROP_ABOVE_BU * bu
    && canDo(sim, ant, 'let-go', null).ok) {
    act(sim, ant, 'let-go', null);
    ant.bb[B.began] = 0;
    return 'moving';
  }
  const close = Math.hypot(t.pos.x - ant.pos.x, t.pos.y - ant.pos.y, t.pos.z - ant.pos.z) <= REACH_NEAR_BU * bu;
  for (let tries = ant.bb[B.n] ?? 0; tries < APPROACH_BU.length; tries++) {
    const st = travel(sim, ant, t, APPROACH_BU[tries] * sim.world.bu);
    if (st === 'moving') {
      if (close) ant.thinkTick = sim.state.tick + 1; // close by: check reach every tick, it may last only a moment
      return 'moving';
    }
    if (st === 'failed') return 'failed';
    // arrived but still out of reach: at once a new, closer request; if the target is beside or behind the ant,
    // first a step back along the line through it, so the next approach walks straight at it
    ant.bb[B.n] = tries + 1;
    ant.bb[B.goKind] = -1;
    if (tries === 0 && backOff(sim, ant, t)) return 'moving';
  }
  if (t.id >= 0) skip(ant, t.id);
  return 'failed';
}

const back = { x: 0, y: 0, z: 0 };

/** Steps back from a target that lies outside the ant's forward cone; true if a step was requested. */
function backOff(sim: Sim, ant: Ant, t: TargetRef): boolean {
  const dx = ant.pos.x - t.pos.x, dy = ant.pos.y - t.pos.y, dz = ant.pos.z - t.pos.z;
  const d = Math.hypot(dx, dy, dz);
  if (d < 1e-6 || -(dx * ant.fwd.x + dy * ant.fwd.y + dz * ant.fwd.z) / d > Math.cos((BACK_OFF_CONE_DEG * Math.PI) / 180)) return false;
  const k = (BACK_OFF_BU * sim.world.bu) / d;
  back.x = t.pos.x + dx * k; back.y = t.pos.y + dy * k; back.z = t.pos.z + dz * k;
  return navTo(sim, ant, back, 0.2 * sim.world.bu);
}

/** Has the ant been within REACH_NEAR_BU of this target for more than REACH_STALL_S (per state and target)? */
function nearStalled(sim: Sim, ant: Ant, t: TargetRef, bu: number): boolean {
  const key = t.id >= 0 ? t.id : -2 - Math.round(t.pos.x + t.pos.z);
  if (ant.bb[B.nearId] !== key) { ant.bb[B.nearId] = key; ant.bb[B.near] = -1; }
  if (Math.hypot(t.pos.x - ant.pos.x, t.pos.y - ant.pos.y, t.pos.z - ant.pos.z) > REACH_NEAR_BU * bu) return false;
  const t0 = ant.bb[B.near] ?? -1;
  if (t0 < 0) { ant.bb[B.near] = sim.state.tick; return false; }
  return sim.state.tick - t0 > secondsToTicks(REACH_STALL_S);
}

/**
 * travel() with the near-stall rule of reachAndAct: within REACH_NEAR_BU but not arrived after REACH_STALL_S,
 * 'failed' (entity targets are skipped by this ant for a while) or, with `settle`, 'arrived' where it stands.
 */
export function approach(sim: Sim, ant: Ant, t: TargetRef, arriveMm: number, settle = false): ReturnType<typeof travel> {
  const st = travel(sim, ant, t, arriveMm);
  if (st !== 'moving') return st;
  if (!nearStalled(sim, ant, t, sim.world.bu)) return st;
  if (settle) { navStop(sim, ant); return 'arrived'; }
  if (t.id >= 0) skip(ant, t.id);
  return 'failed';
}

/** The primitive started by reachAndAct / act has ended. */
export function primitiveDone(ant: Ant): boolean {
  return actEnded(ant);
}

export function healthOf(ant: Ant): number {
  return ant.maxHp > 0 ? ant.hp / ant.maxHp : 0;
}

/** Should the ant rest now (fatigue >= REST_ENTER or injured)? Checked at the end of a task cycle. */
export function needsRest(ant: Ant): boolean {
  return ant.fatigue >= REST_ENTER || healthOf(ant) < INJURED_HEALTH;
}

/**
 * End of a task cycle: experience and re-evaluation by the allocator (GDD 02 §6.5), then rest if tired, else
 * back to the entry state. Returns false when the task changed (the runner switches behaviour on its next think).
 */
export function endCycle(sim: Sim, ant: Ant, entry: string, reason: Parameters<typeof setState>[3] = undefined): boolean {
  clearJob(ant);
  const before = ant.task;
  if (taskCycleDone(sim, ant) !== before || ant.task !== before) return false;
  if (needsRest(ant)) { setState(sim, ant, 'rest', 'fatigue'); return true; }
  setState(sim, ant, entry, reason);
  return true;
}

/**
 * The rest state (GDD 02 §10.11): walk to a rest / general chamber (or stay in the current one), stand still;
 * fatigue recovers there (colony physiology). Leaves for `entry` at fatigue <= REST_EXIT and health >= 0.6.
 * Returns true while resting.
 */
export function restStep(sim: Sim, ant: Ant, entry: string): boolean {
  if (ant.state !== 'rest') return false;
  // recovered, or rested for the whole rest timeout (a starving ant never gets its health back): back to work
  if ((ant.fatigue <= REST_EXIT && healthOf(ant) >= INJURED_RECOVER_HEALTH) || timedOut(sim, ant)) {
    setState(sim, ant, entry, ant.fatigue <= REST_EXIT ? 'fatigue' : 'timeout');
    return false;
  }
  const nest = homeNest(sim, ant);
  if (!nest || busy(ant)) return true;
  if (ant.chamberId >= 0 && chamberIn(nest, ant.chamberId)) { if (ant.nav.status === 'moving') navStop(sim, ant); return true; }
  const room = restChamber(sim, nest);
  if (room && travel(sim, ant, entity('chamber', room.id, room.center), 0.6 * Math.min(room.radii.x, room.radii.z)) === 'failed') {
    navStop(sim, ant);
  }
  return true;
}

/**
 * Universal failure handling (GDD 02 §10.0): drop the claims, stop, put a carried item or brood down where the ant
 * stands (it becomes a haul or rescue job), and restart the task at `entry`. The stuck rule (3 failures in 60 s)
 * drops the task to idle. `stuck` = the failure was a nav failure.
 */
export function recover(sim: Sim, ant: Ant, entry: string, reason: 'timeout' | 'stuck' | `job:${string}`, stuck = false): void {
  releaseAll(sim, ant);
  if (ant.carry.kind !== 'none' && !busy(ant)) act(sim, ant, 'put-down', null);
  if (stuck && noteStuck(sim, ant) && ant.carry.kind === 'none') {
    setState(sim, ant, entry, 'stuck');
    requestTask(sim, ant, 'idle', 'stuck');
    return;
  }
  setState(sim, ant, entry, reason);
}

/** Releases every claim of the ant (job, dig slot, care act) and stops walking. */
export function releaseAll(sim: Sim, ant: Ant): void {
  clearJob(ant);
  cancelCare(ant);
  if ((ant.bb.planId ?? -1) >= 0) releaseDigSite(sim, ant);
  if (ant.nav.status === 'moving') navStop(sim, ant);
}

/** One think of an in-nest behaviour: rest, then a running care act, a running primitive, the state timeout, then `step`. */
export function think(
  sim: Sim, ant: Ant, entry: string, step: (sim: Sim, ant: Ant) => void,
  onCare?: (sim: Sim, ant: Ant, result: number) => void,
): void {
  if (restStep(sim, ant, entry)) return;
  const late = timedOut(sim, ant);
  if (careRunning(ant)) {
    const r = stepCare(sim, ant);
    if (r === null) { if (late) recover(sim, ant, entry, 'timeout'); return; }
    if (onCare) onCare(sim, ant, r);
    return;
  }
  if (busy(ant)) {
    if (late && interruptible(ant)) { cancel(sim, ant, null); recover(sim, ant, entry, 'timeout'); }
    return;
  }
  if (late) { recover(sim, ant, entry, 'timeout'); return; }
  step(sim, ant);
}
