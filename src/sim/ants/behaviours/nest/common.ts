// Shared steps of the in-nest behaviours: walking up to a target and starting a primitive on it, the end of a task
// cycle (GDD 02 §6.5 re-evaluation, §1.7 fatigue rest), rest itself (§10.11), and the universal failure handling
// of GDD 02 §10.0 (timeouts, stuck, carried items).

import type { ActionId, Ant, Sim, TargetRef } from '@/sim/types';
import { INJURED_HEALTH, INJURED_RECOVER_HEALTH, REST_ENTER, REST_EXIT } from '@/sim/balance';
import {
  CEILING_UP_Y, CLOSE_THINK_BU, DROP_ABOVE_BU, PASS_ARRIVE_BU, PASS_BEYOND_BU, PASS_TRIES, REACH_APPROACH_BU,
  REACH_NEAR_BU, REACH_STALL_S, ROOM_ARRIVE_FRAC, SHORT_HOP_BU, SHORT_HOP_SPEED_MULT, STALL_ACCEPT_BU, WALK_STALL_S,
  WALK_STALL_SPEED_BU,
} from '@/sim/balance/nestwork';
import { secondsToTicks } from '@/sim/time';
import { navStop, navTo } from '@/sim/locomotion';
import { requestTask, taskCycleDone } from '@/sim/colony';
import { releaseDigSite } from '@/sim/nest';
import { canDo, cancel, interruptible } from '@/sim/ants/actions';
import { B, clearJob, noteStuck, setState, skip, timedOut } from './fsm';
import { cancelCare, careRunning, stepCare } from './careActs';
import { deliverHeldBrood } from './deliver';
import { chamberIn, dist, homeNest, restChamber } from './places';
import { act, actEnded, busy, entity, resetTravel, travel } from './travel';

export type ReachStatus = 'moving' | 'started' | 'failed';


/**
 * Walks up to the target and starts the primitive on it as soon as it can (reach and facing are the primitive's
 * own test, checked every think, and every tick close by). An approach that ends, or stalls, beside the target
 * without reach is followed by a pass: a walk to a point PASS_BEYOND_BU beyond the target on the line from the ant
 * through it, so the target comes into the ant's path ahead (the nest walker cannot make sub-voxel adjustments, so
 * short corrective steps do not work). After PASS_TRIES passes, or a refusal other than reach, 'failed'.
 * Uses B.n of the current state (0 approach, k = pass k) and the pass point keys.
 */
export function reachAndAct(sim: Sim, ant: Ant, t: TargetRef, action: ActionId, actTarget: TargetRef | null = t): ReachStatus {
  const check = canDo(sim, ant, action, actTarget);
  if (check.ok) return act(sim, ant, action, actTarget) ? 'started' : 'failed';
  if (check.reason !== 'out-of-reach') return 'failed';
  const bu = sim.world.bu;
  // close by but not getting there (other ants in the way, an awkward spot): give it up after REACH_STALL_S
  if (nearStalled(sim, ant, t, bu)) { skip(ant, t.id); return 'failed'; }
  if (dropOntoTarget(sim, ant, t)) return 'moving';
  const d = dist(ant.pos, t.pos);
  thinkCloseBy(sim, ant, d);
  const phase = ant.bb[B.n] ?? 0;
  let st: ReturnType<typeof travel>;
  // a short hop is walked slowly: at cruise the turning circle is wider than the hop and the ant circles the target
  if (phase === 0) st = travel(sim, ant, t, REACH_APPROACH_BU * bu, d <= SHORT_HOP_BU * bu ? SHORT_HOP : undefined);
  else {
    pass.x = ant.bb[B.passX]; pass.y = ant.bb[B.passY]; pass.z = ant.bb[B.passZ];
    st = ant.nav.status === 'moving' ? 'moving' : ant.nav.status === 'failed' ? 'failed' : 'arrived';
  }
  // standing still beside the target while the walk still runs ends this approach or pass
  if (st === 'moving' && d <= REACH_NEAR_BU * bu && walkStalled(sim, ant)) st = 'arrived';
  if (st === 'moving') return 'moving';
  if (st === 'failed' && phase === 0) return 'failed';
  if (phase >= PASS_TRIES) { if (t.id >= 0) skip(ant, t.id); return 'failed'; }
  return startPass(sim, ant, t) ? 'moving' : 'failed';
}

const pass = { x: 0, y: 0, z: 0 };

/** Starts the next pass over the target (see reachAndAct); false when no pass point can be walked to. */
function startPass(sim: Sim, ant: Ant, t: TargetRef): boolean {
  const bu = sim.world.bu;
  let dx = t.pos.x - ant.pos.x, dz = t.pos.z - ant.pos.z;
  let l = Math.hypot(dx, dz);
  if (l < 0.05 * bu) { dx = ant.fwd.x; dz = ant.fwd.z; l = Math.hypot(dx, dz) || 1; }
  const k = (PASS_BEYOND_BU * bu) / l;
  pass.x = t.pos.x + dx * k; pass.y = t.pos.y; pass.z = t.pos.z + dz * k;
  ant.bb[B.n] = (ant.bb[B.n] ?? 0) + 1;
  ant.bb[B.passX] = pass.x; ant.bb[B.passY] = pass.y; ant.bb[B.passZ] = pass.z;
  ant.bb[B.stall] = -1;
  resetTravel(ant);
  return navTo(sim, ant, pass, PASS_ARRIVE_BU * bu, SHORT_HOP);
}

const SHORT_HOP = { speedMult: SHORT_HOP_SPEED_MULT };

/**
 * Walking upside down on a chamber ceiling right above the target: let go and drop onto the floor (GDD 01
 * `let-go`). True if the ant let go (the caller waits for the landing).
 */
function dropOntoTarget(sim: Sim, ant: Ant, t: TargetRef): boolean {
  const bu = sim.world.bu;
  if (ant.up.y >= CEILING_UP_Y || ant.pos.y - t.pos.y <= bu) return false;
  if (Math.hypot(t.pos.x - ant.pos.x, t.pos.z - ant.pos.z) >= DROP_ABOVE_BU * bu || !canDo(sim, ant, 'let-go', null).ok) return false;
  act(sim, ant, 'let-go', null);
  ant.bb[B.began] = 0;
  resetTravel(ant);
  return true;
}

/** Near the target the ant thinks every tick: the reach window of a walking ant may last only a tick or two. */
function thinkCloseBy(sim: Sim, ant: Ant, distMm: number): void {
  if (distMm <= CLOSE_THINK_BU * sim.world.bu) ant.thinkTick = sim.state.tick + 1;
}

/**
 * The walk is under way but the ant has stood still for WALK_STALL_S (the walker can hold a request it cannot
 * finish right beside its goal). Uses B.stall of the current state.
 */
function walkStalled(sim: Sim, ant: Ant): boolean {
  if (ant.nav.status !== 'moving' || ant.speed > WALK_STALL_SPEED_BU * sim.world.bu) { ant.bb[B.stall] = -1; return false; }
  const t0 = ant.bb[B.stall] ?? -1;
  if (t0 < 0) { ant.bb[B.stall] = sim.state.tick; return false; }
  return sim.state.tick - t0 >= secondsToTicks(WALK_STALL_S);
}

/** Has the ant been within REACH_NEAR_BU of this target for more than REACH_STALL_S (per state and target)? */
function nearStalled(sim: Sim, ant: Ant, t: TargetRef, bu: number): boolean {
  const key = t.id >= 0 ? t.id : -2 - Math.round(t.pos.x + t.pos.z);
  if (ant.bb[B.nearId] !== key) { ant.bb[B.nearId] = key; ant.bb[B.near] = -1; }
  if (dist(t.pos, ant.pos) > REACH_NEAR_BU * bu) return false;
  const t0 = ant.bb[B.near] ?? -1;
  if (t0 < 0) { ant.bb[B.near] = sim.state.tick; return false; }
  return sim.state.tick - t0 > secondsToTicks(REACH_STALL_S);
}

/**
 * travel() with the rules of reachAndAct: let go of a ceiling above the target, think every tick close by, and a
 * walk that stalls (WALK_STALL_S) within `acceptMm` of the target counts as arrived (default: REACH_NEAR_BU with
 * `settle`, a drop spot being good anywhere close by; else STALL_ACCEPT_BU, a care act wanting the ant close).
 * Farther out the walker's own recovery is left to work (a fresh request would restart it). Within REACH_NEAR_BU
 * but not arrived after REACH_STALL_S: 'failed' (entity targets are skipped by this ant for a while) or, with
 * `settle`, 'arrived' where it stands.
 */
export function approach(sim: Sim, ant: Ant, t: TargetRef, arriveMm: number, settle = false, acceptMm = -1): ReturnType<typeof travel> {
  if (dropOntoTarget(sim, ant, t)) return 'moving';
  const st = travel(sim, ant, t, arriveMm);
  if (st !== 'moving') return st;
  const bu = sim.world.bu, d = dist(ant.pos, t.pos);
  thinkCloseBy(sim, ant, d);
  const accept = acceptMm >= 0 ? acceptMm : (settle ? REACH_NEAR_BU : STALL_ACCEPT_BU) * bu;
  if (d <= Math.max(arriveMm, accept) && walkStalled(sim, ant)) { navStop(sim, ant); return 'arrived'; }
  if (!nearStalled(sim, ant, t, bu)) return st;
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
  if (room && travel(sim, ant, entity('chamber', room.id, room.center), ROOM_ARRIVE_FRAC * Math.min(room.radii.x, room.radii.z)) === 'failed') {
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
  if (deliverHeldBrood(sim, ant)) return;
  step(sim, ant);
}
