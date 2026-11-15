// State bookkeeping shared by the in-nest behaviours: entering a `<task>.<state>`, the decision log for the inspect
// card (GDD 02 §7 reason codes), per-state timeouts (GDD 02 §10.0: no ant stays stuck) and the persisted ant.bb
// keys. Behaviour state lives only in ant.state / ant.stateTick / ant.bb (numbers), so save -> load is exact.

import type { Ant, ReasonCode, Sim } from '@/sim/types';
import { BEHAVIOUR_STATES, REASON_CODES } from '@/sim/types';
import { REACH_SKIP_S, STATE_TIMEOUT_DEFAULT_S, WAIT_THINK_TICKS, STATE_TIMEOUT_S, STUCK_MAX, STUCK_WINDOW_S } from '@/sim/balance/nestwork';
import { secondsToTicks } from '@/sim/time';

/** ant.bb keys of the in-nest behaviours (numbers only; -1 = none). */
export const B = {
  /** Nursery / haul / store job: kind index, target id, claim tick, destination chamber id. */
  jobKind: 'bn.jk', jobId: 'bn.ji', jobTick: 'bn.jt', jobDest: 'bn.jd',
  /** Chained actions done in this round (feeds, tends). */
  chain: 'bn.ch',
  /** Travel request: target kind index and id (travel.ts). */
  goKind: 'bn.gk', goId: 'bn.gi',
  /** Nav failures in the stuck window and the window start tick. */
  stuck: 'bn.sk', stuckTick: 'bn.st',
  /** An action primitive was started in this state (1) and has not been seen finished. */
  began: 'bn.bg',
  /** Phase of a multi-leg trip (carry out: 0 to the entrance, 1 to the drop point). */
  leg: 'bn.lg',
  /** Drop point of a trip, mm. */
  dropX: 'bn.dx', dropY: 'bn.dy', dropZ: 'bn.dz',
  /** Generic counter / timer of the current state. */
  n: 'bn.n', until: 'bn.u',
  /** Nurse: tick until which feed jobs are skipped (empty pool). */
  feedBlock: 'bn.fb',
  /** Queen: chamber she resides in (move-queen target), -1 = royal. Carer: last groom tick. */
  home: 'bn.home', groomTick: 'bn.gt',
  /** Tick the ant first came near its reach target in this state (-1 not yet). */
  near: 'bn.nr', nearId: 'bn.ni',
  /** Entity the ant failed to reach, and the tick from which the skip runs. */
  skip: 'bn.sx', skipTick: 'bn.sxt',
  /** Tick from which a running walk has stood still (-1 not standing). */
  stall: 'bn.sl',
  /** Pass point of reachAndAct, mm. */
  passX: 'bn.qx', passY: 'bn.qy', passZ: 'bn.qz',
} as const;

const STATE_INDEX = new Map<string, number>(BEHAVIOUR_STATES.map((s, i) => [s, i]));

/** Timeout of a state, ticks. */
export function stateTimeoutTicks(state: string): number {
  return secondsToTicks(STATE_TIMEOUT_S[state] ?? STATE_TIMEOUT_DEFAULT_S);
}

/** Ticks the ant has been in its current state. */
export function stateAge(sim: Sim, ant: Ant): number {
  return sim.state.tick - ant.stateTick;
}

export function timedOut(sim: Sim, ant: Ant): boolean {
  return stateAge(sim, ant) > stateTimeoutTicks(ant.state);
}

/** Appends a decision to the ant's ring (newest first): reason code index and the new state's index as detail. */
export function logDecision(sim: Sim, ant: Ant, reason: ReasonCode, state: string): void {
  const ring = ant.mem.decisions;
  if (ring.length === 0) return;
  const code = (REASON_CODES as readonly string[]).indexOf(reason.split(':')[0]);
  for (let i = ring.length - 1; i > 0; i--) ring[i] = ring[i - 1];
  ring[0] = { tick: sim.state.tick, code, detail: STATE_INDEX.get(state) ?? -1 };
}

/** Enters a state: stamps the tick, clears the per-state travel, action and trip keys, logs the reason if given. */
export function setState(sim: Sim, ant: Ant, state: string, reason?: ReasonCode): void {
  if (reason) logDecision(sim, ant, reason, state);
  ant.state = state;
  ant.stateTick = sim.state.tick;
  ant.bb[B.goKind] = -1;
  ant.bb[B.goId] = -1;
  ant.bb[B.began] = 0;
  ant.bb[B.n] = 0;
  ant.bb[B.leg] = 0;
  ant.bb[B.near] = -1;
  ant.bb[B.stall] = -1;
  ant.thinkTick = sim.state.tick + 1; // carry on in the new state at once
}

/** Records a nav failure; true when the stuck rule (STUCK_MAX within STUCK_WINDOW_S) fires. */
export function noteStuck(sim: Sim, ant: Ant): boolean {
  const now = sim.state.tick;
  if (now - (ant.bb[B.stuckTick] ?? -1e9) > secondsToTicks(STUCK_WINDOW_S)) {
    ant.bb[B.stuckTick] = now;
    ant.bb[B.stuck] = 0;
  }
  ant.bb[B.stuck] = (ant.bb[B.stuck] ?? 0) + 1;
  return ant.bb[B.stuck] >= STUCK_MAX;
}

/** Clears the job keys. */
export function clearJob(ant: Ant): void {
  ant.bb[B.jobKind] = -1;
  ant.bb[B.jobId] = -1;
  ant.bb[B.jobTick] = -1;
  ant.bb[B.jobDest] = -1;
  ant.bb[B.chain] = 0;
}

/** Reads a bb number with a default. */
export function bbv(ant: Ant, key: string, dflt = -1): number {
  const v = ant.bb[key];
  return v === undefined ? dflt : v;
}

/** Remembers an entity this ant could not reach, so its next job choice passes it over for REACH_SKIP_S. */
export function skip(ant: Ant, id: number): void {
  ant.bb[B.skip] = id;
  ant.bb[B.skipTick] = -1;
}

/** Is this entity one the ant recently failed to reach? */
export function skipped(sim: Sim, ant: Ant, id: number): boolean {
  if ((ant.bb[B.skip] ?? -1) !== id) return false;
  if ((ant.bb[B.skipTick] ?? -1) < 0) ant.bb[B.skipTick] = sim.state.tick;
  return sim.state.tick - (ant.bb[B.skipTick] ?? 0) < secondsToTicks(REACH_SKIP_S);
}

const OWN_TASKS = new Set(['nurse', 'queen-care', 'store', 'dig', 'haul', 'guard', 'idle', 'rest']);

/** The ant runs one of the in-nest behaviours and is in one of its states (not mid-switch from another module's). */
export function ownState(ant: Ant): boolean {
  if (!OWN_TASKS.has(ant.task)) return false;
  return ant.state === 'idle' || ant.state === 'rest' || ant.state.startsWith(`${ant.task}.`) || ant.state.startsWith('queen.');
}

/**
 * A waiting ant (nothing to do right now) thinks less often: once per WAIT_THINK_TICKS, on its own phase (tick + id).
 * Staggered by id, a tenth of the waiting ants think on each tick. Aligned on one tick (sim-fix-ants first version)
 * the mean was the same, but every tenth tick cost about 5x the others (800 in-nest workers: behaviours 7.8 against
 * 1.6 ms), which turns into frame hitches; staggered (with alignedThink kept for groomers) 2.2-2.5 against 1.5 ms.
 * The per-tick job lists they read are then built on most ticks; that is inside the measured mean.
 */
export function waitThink(sim: Sim, ant: Ant): void {
  ant.thinkTick = Math.max(ant.thinkTick, nextPhased(sim, WAIT_THINK_TICKS, ant.id));
}

/**
 * Sets the next think to the next multiple of `every` ticks, the same tick for every ant. For polling that must
 * see the nursery board as soon as it is rebuilt (its 2 s windows start on such ticks): nurses grooming between
 * jobs. Staggering them by id (as waitThink) delayed their answer to new feed requests by half a period on average
 * and raised the mean larval hunger of the colony scenario (0.54 -> 0.58 over 3 seeds).
 */
export function alignedThink(sim: Sim, ant: Ant, every: number): void {
  ant.thinkTick = (Math.floor(sim.state.tick / every) + 1) * every;
}

/** The first tick after now with (tick + phase) % every === 0. */
function nextPhased(sim: Sim, every: number, phase: number): number {
  const t = sim.state.tick + 1;
  return t + ((every - ((t + phase) % every)) % every);
}
