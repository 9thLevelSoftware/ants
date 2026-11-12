// The nursery job board (GDD 02 §10.4) and the claim registry of all in-nest jobs. Derived, never persisted: the
// board is rebuilt from the current state the first time it is read in a tick, and claims are read back from the
// claimants' ant.bb (B.jobKind / B.jobId / B.jobTick), so a loaded game sees exactly the same board.

import type { Vec3 } from '@/core/math/vec3';
import type { Ant, Brood, Colony, Nest, Sim, SpeciesDef } from '@/sim/types';
import { BroodFlag } from '@/sim/types';
import {
  EVACUATE_FLOOD, JOB_CLAIM_TIMEOUT_S, JOB_DIST_PENALTY_PER_BU, JOB_PRIORITY, SORT_MOVES_PER_NURSE, TEND_DUE_GD,
  TEND_URGENT_GD,
} from '@/sim/balance/nestwork';
import { ALARM_STRONG } from '@/sim/balance/pheromone';
import { feedUrgency, wantsFeed } from '@/sim/colony';
import { daysToTicks, secondsToTicks } from '@/sim/time';
import { B, skipped } from './fsm';
import { broodSpace, groupOf, moveTarget, sortContext, type SortContext } from './sorting';

/** Job kinds stored in B.jobKind: the nursery jobs in NURSERY_JOBS order, then the other claimable jobs. */
export const Job = {
  rescue: 0, evacuate: 1, assist: 2, feed: 3, move: 4, tend: 5, groom: 6,
  collectEggs: 10, haul: 11, shift: 12, clean: 13,
} as const;
export type JobKindId = (typeof Job)[keyof typeof Job];

/** Jobs that carry brood to B.jobDest. */
export function isCarryJob(k: number): boolean {
  return k === Job.rescue || k === Job.evacuate || k === Job.move;
}

export interface BoardJob {
  kind: JobKindId;
  /** Brood id. */
  id: number;
  /** Destination chamber (carry jobs), -1 otherwise. */
  dest: number;
  prio: number;
  pos: Vec3;
  nestId: number;
  /** move-brood marker decided it (reason `marker:move-brood`). */
  marker: boolean;
  /** A move job of a larva that also asks for food: carried first, fed at the destination (see jobFor). */
  feedAfter: boolean;
}

interface Board {
  tick: number;
  jobs: BoardJob[];
  /** Entity id (brood or item) -> claiming ant id. */
  claims: Map<number, number>;
  /** Chamber id -> brood space of carry jobs heading there. */
  incoming: Map<number, number>;
  sort: Map<number, SortContext>;
  nurses: number;
}

const boards = new WeakMap<Sim, Map<number, Board>>();

/** Whether the ant's claim is still valid (fresh). */
export function claimFresh(sim: Sim, ant: Ant): boolean {
  const k = ant.bb[B.jobKind] ?? -1, t = ant.bb[B.jobTick] ?? -1;
  return k >= 0 && t >= 0 && sim.state.tick - t <= secondsToTicks(JOB_CLAIM_TIMEOUT_S);
}

/** Claims an entity for a job (the claim lives in the ant's bb). */
export function claim(sim: Sim, ant: Ant, kind: JobKindId, id: number, dest = -1): void {
  ant.bb[B.jobKind] = kind;
  ant.bb[B.jobId] = id;
  ant.bb[B.jobTick] = sim.state.tick;
  ant.bb[B.jobDest] = dest;
  const b = boards.get(sim)?.get(ant.colony);
  if (b && b.tick === sim.state.tick) b.claims.set(id, ant.id);
}

function readClaims(sim: Sim, colonyId: number, claims: Map<number, number>, incoming: Map<number, number>): number {
  let nurses = 0;
  for (const a of sim.stores.ants.list) {
    if (!a.alive || a.colony !== colonyId) continue;
    if (a.task === 'nurse') nurses++;
    if (!claimFresh(sim, a)) continue;
    const id = a.bb[B.jobId] ?? -1;
    if (id < 0) continue;
    claims.set(id, a.id);
    const k = a.bb[B.jobKind] ?? -1;
    if (isCarryJob(k)) {
      const b = sim.stores.brood.get(id);
      const dest = a.bb[B.jobDest] ?? -1;
      if (b && dest >= 0) incoming.set(dest, (incoming.get(dest) ?? 0) + broodSpace(b));
    }
  }
  return nurses;
}

/** Chamber ids of the nest that are flooded or alarmed (evacuate), once per board build. */
function alarmedChambers(sim: Sim, colonyId: number, nest: Nest): Set<number> {
  const out = new Set<number>();
  for (const c of nest.chambers) {
    if (c.flooded >= EVACUATE_FLOOD || sim.phero.sample(colonyId, 'alarm', c.center) >= ALARM_STRONG) out.add(c.id);
  }
  return out;
}

/** Per-nest data of one board build. */
interface NestInfo { ctx: SortContext; alarmed: Set<number>; chamberIds: Set<number> }

const markerOut = { marker: false };

/** The highest-priority job of one lying brood item, or null. */
function jobFor(sim: Sim, col: Colony, def: SpeciesDef, nest: Nest, info: NestInfo, b: Brood, movesLeft: number): BoardJob | null {
  const ctx = info.ctx;
  const now = sim.state.tick;
  const job = (kind: JobKindId, prio: number, dest = -1, marker = false, feedAfter = false): BoardJob => ({
    kind, id: b.id, dest, prio, pos: b.pos, nestId: nest.id, marker, feedAfter,
  });
  if (b.chamberId < 0 || !info.chamberIds.has(b.chamberId)) {
    const dest = ctx.best[groupOf(b)];
    return dest >= 0 ? job(Job.rescue, JOB_PRIORITY.rescue, ctx.chambers[dest].id) : null;
  }
  if (info.alarmed.has(b.chamberId)) {
    const dest = ctx.best[groupOf(b)];
    if (dest >= 0 && ctx.chambers[dest].id !== b.chamberId) return job(Job.evacuate, JOB_PRIORITY.evacuate, ctx.chambers[dest].id);
  }
  if (b.stage === 'pupa' && (b.flags & BroodFlag.READY) !== 0) return job(Job.assist, JOB_PRIORITY.assistEclosion);
  if (b.stage === 'larva' && wantsFeed(b, def)) {
    const feedPrio = JOB_PRIORITY.feedBase + JOB_PRIORITY.feedUrgency * feedUrgency(b, col);
    // A hungry larva in the wrong chamber is carried first and fed where it is going (decision: with one job per
    // item and feed above move, larvae that keep asking for food would never be sorted, against GDD 02 App. E 19).
    // These moves are outside the per-pass cap: a larva left out would be fed where it lies and then wait.
    const to = moveTarget(ctx, b, markerOut);
    if (to >= 0) return job(Job.move, Math.min(feedPrio + JOB_PRIORITY.moveHungryBonus, JOB_PRIORITY.moveHungryMax), to, markerOut.marker, true);
    return job(Job.feed, feedPrio);
  }
  const dest = movesLeft > 0 ? moveTarget(ctx, b, markerOut) : -1;
  if (dest >= 0) return job(Job.move, markerOut.marker ? JOB_PRIORITY.moveMarker : JOB_PRIORITY.move, dest, markerOut.marker);
  if (b.stage !== 'larva') {
    const age = now - b.lastTendedTick;
    if (age > daysToTicks(TEND_DUE_GD)) return job(Job.tend, JOB_PRIORITY.tend + (age > daysToTicks(TEND_URGENT_GD) ? JOB_PRIORITY.tendUrgent : 0));
  }
  return null;
}

function build(sim: Sim, col: Colony, def: SpeciesDef): Board {
  const claims = new Map<number, number>(), incoming = new Map<number, number>();
  const nurses = readClaims(sim, col.id, claims, incoming);
  const space = new Map<number, number>();
  for (const b of sim.stores.brood.list) {
    if (b.alive && b.colony === col.id && b.carriedBy < 0 && b.chamberId >= 0) space.set(b.chamberId, (space.get(b.chamberId) ?? 0) + broodSpace(b));
  }
  const sort = new Map<number, SortContext>();
  const infos = new Map<number, NestInfo>();
  for (const nid of col.nestIds) {
    const nest = sim.stores.nests.get(nid);
    if (!nest) continue;
    const ctx = sortContext(sim, nest, def, (id) => (space.get(id) ?? 0) + (incoming.get(id) ?? 0));
    sort.set(nid, ctx);
    infos.set(nid, { ctx, alarmed: alarmedChambers(sim, col.id, nest), chamberIds: new Set(nest.chambers.map((c) => c.id)) });
  }
  const jobs: BoardJob[] = [];
  let movesLeft = SORT_MOVES_PER_NURSE * Math.max(1, nurses);
  for (const b of sim.stores.brood.list) {
    if (!b.alive || b.colony !== col.id || b.carriedBy >= 0) continue;
    const nest = sim.stores.nests.get(b.nestId) ?? sim.stores.nests.get(col.nestIds[0]);
    const info = nest ? infos.get(nest.id) : undefined;
    if (!nest || !info) continue;
    const j = jobFor(sim, col, def, nest, info, b, movesLeft);
    if (!j) continue;
    if (j.kind === Job.move && !j.feedAfter && !claims.has(b.id)) movesLeft--;
    jobs.push(j);
  }
  return { tick: sim.state.tick, jobs, claims, incoming, sort, nurses };
}

/** The colony's board for this tick (rebuilt on the first read in a tick). */
export function boardOf(sim: Sim, colonyId: number): Board | null {
  let m = boards.get(sim);
  if (!m) { m = new Map(); boards.set(sim, m); }
  const cur = m.get(colonyId);
  if (cur && cur.tick === sim.state.tick) return cur;
  const col = sim.stores.colonies.get(colonyId);
  const def = col ? sim.getSpecies(col.species) : undefined;
  if (!col || !def) return null;
  const b = build(sim, col, def);
  m.set(colonyId, b);
  return b;
}

/** Who has claimed an entity (-1 nobody). */
export function claimant(sim: Sim, colonyId: number, id: number): number {
  return boardOf(sim, colonyId)?.claims.get(id) ?? -1;
}

/** Is the entity free for this ant (unclaimed, or claimed by it)? */
export function freeFor(sim: Sim, ant: Ant, id: number): boolean {
  const c = claimant(sim, ant.colony, id);
  return c < 0 || c === ant.id;
}

/** The sorting context of a nest for this tick. */
export function sortOf(sim: Sim, colonyId: number, nestId: number): SortContext | undefined {
  return boardOf(sim, colonyId)?.sort.get(nestId);
}

/**
 * The best job for a nurse (GDD 02 §10.4 `nurse.select`): highest priority minus the distance penalty, unclaimed,
 * in her nest; `skipFeed` leaves feed jobs out (empty pool). Null: nothing to do (groom).
 */
export function selectJob(sim: Sim, ant: Ant, nestId: number, skipFeed: boolean): BoardJob | null {
  const board = boardOf(sim, ant.colony);
  if (!board) return null;
  const bu = sim.world.bu;
  let best: BoardJob | null = null, bestS = -Infinity;
  for (const j of board.jobs) {
    if (j.nestId !== nestId || (skipFeed && j.kind === Job.feed)) continue;
    const c = board.claims.get(j.id);
    if ((c !== undefined && c !== ant.id) || skipped(sim, ant, j.id)) continue;
    const d = Math.hypot(j.pos.x - ant.pos.x, j.pos.y - ant.pos.y, j.pos.z - ant.pos.z) / bu;
    // a hungry larva to be carried out of a poor chamber is fetched from wherever the nurse is (no distance penalty:
    // the nurses feeding next to her would otherwise always be preferred to it)
    const s = j.prio - (j.feedAfter ? 0 : JOB_DIST_PENALTY_PER_BU * d);
    if (s > bestS || (s === bestS && best && j.id < best.id)) { best = j; bestS = s; }
  }
  return best;
}

/** Larvae requesting food within radiusMm of p, unclaimed, nearest first (feed chains). */
export function nextFeedNear(sim: Sim, ant: Ant, p: Vec3, radiusMm: number): Brood | null {
  const board = boardOf(sim, ant.colony);
  if (!board) return null;
  let best: Brood | null = null, bestD = Infinity;
  for (const j of board.jobs) {
    if (j.kind !== Job.feed) continue;
    const c = board.claims.get(j.id);
    if (c !== undefined && c !== ant.id) continue;
    const d = Math.hypot(j.pos.x - p.x, j.pos.y - p.y, j.pos.z - p.z);
    if (d > radiusMm || d >= bestD) continue;
    const b = sim.stores.brood.get(j.id);
    if (b) { best = b; bestD = d; }
  }
  return best;
}

/** Brood of a tend job within radiusMm of p, unclaimed, nearest first (tend rounds). */
export function nextTendNear(sim: Sim, ant: Ant, p: Vec3, radiusMm: number): Brood | null {
  const board = boardOf(sim, ant.colony);
  if (!board) return null;
  let best: Brood | null = null, bestD = Infinity;
  for (const j of board.jobs) {
    if (j.kind !== Job.tend) continue;
    const c = board.claims.get(j.id);
    if (c !== undefined && c !== ant.id) continue;
    const d = Math.hypot(j.pos.x - p.x, j.pos.y - p.y, j.pos.z - p.z);
    if (d > radiusMm || d >= bestD) continue;
    const b = sim.stores.brood.get(j.id);
    if (b) { best = b; bestD = d; }
  }
  return best;
}

/** Number of nurses counted on this tick's board. */
export function nurseCount(sim: Sim, colonyId: number): number {
  return boardOf(sim, colonyId)?.nurses ?? 0;
}
