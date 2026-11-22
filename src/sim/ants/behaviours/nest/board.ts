// The nursery job board (GDD 02 §10.4) and the claim registry of all in-nest jobs. The board is rebuilt every
// NURSERY_BOARD_PERIOD_S (2 s), on the first read in each aligned window (tick / period), and kept in state
// (SimState.nurseryBoards): a game loaded in mid-window uses the very board the uninterrupted run uses. It is also
// rebuilt at once when a nest's chamber list changed. Claims are live: read back once per tick from the claimants'
// ant.bb (B.jobKind / B.jobId / B.jobTick); jobs are checked against the live brood when they are chosen.

import type { Vec3 } from '@/core/math/vec3';
import type { Ant, Brood, Colony, Nest, NurseryBoardState, NurseryJobState, Sim, SpeciesDef } from '@/sim/types';
import { BroodFlag } from '@/sim/types';
import {
  EVACUATE_FLOOD, JOB_CLAIM_TIMEOUT_S, JOB_DIST_PENALTY_PER_BU, JOB_PRIORITY, NURSERY_BOARD_PERIOD_S, SORT_MOVES_PER_NURSE,
  TEND_DUE_GD, TEND_URGENT_GD,
} from '@/sim/balance/nestwork';
import { ALARM_STRONG } from '@/sim/balance/pheromone';
import { feedUrgency, wantsFeed } from '@/sim/colony';
import { daysToTicks, secondsToTicks } from '@/sim/time';
import { B, skipped } from './fsm';
import { broodSpace, groupOf, moveTarget, sortContext, type SortContext } from './sorting';
import { broodInWater, floodEvac, type FloodEvac } from './floodEvac';
import { BROOD_EVAC_STAGE_BONUS } from '@/sim/balance/weather';

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
  jobs: BoardJob[];
  /** Entity id (brood or item) -> claiming ant id (this tick's claims). */
  claims: Map<number, number>;
  sort: Map<number, SortContext>;
  nurses: number;
}

/** Live claims of one colony, read once per tick. */
interface Live {
  tick: number;
  claims: Map<number, number>;
  /** Chamber id -> brood space of carry jobs heading there. */
  incoming: Map<number, number>;
  nurses: number;
  /** This tick's board (the stored board's view with the live claims). */
  board: Board | null;
}

/** The runtime view of a stored board (rebuilt after a load from the stored data alone). */
interface View { built: NurseryBoardState; jobs: BoardJob[]; sort: Map<number, SortContext> }

const lives = new WeakMap<Sim, Map<number, Live>>();
const views = new WeakMap<Sim, Map<number, View>>();
const PERIOD = secondsToTicks(NURSERY_BOARD_PERIOD_S);
const NOWHERE = { x: Infinity, y: Infinity, z: Infinity };

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
  const l = lives.get(sim)?.get(ant.colony);
  if (l && l.tick === sim.state.tick) l.claims.set(id, ant.id);
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

/**
 * Chamber ids of the nest that are flooded or alarmed (evacuate), once per board build. In a wet nest the water is
 * judged per brood item instead (floodEvac below), so a chamber counts here for its alarm only.
 */
function alarmedChambers(sim: Sim, colonyId: number, nest: Nest, wet: boolean): Set<number> {
  const out = new Set<number>();
  for (const c of nest.chambers) {
    if ((!wet && c.flooded >= EVACUATE_FLOOD) || sim.phero.sample(colonyId, 'alarm', c.center) >= ALARM_STRONG) out.add(c.id);
  }
  return out;
}

/** Per-nest data of one board build. */
interface NestInfo { ctx: SortContext; alarmed: Set<number>; chamberIds: Set<number>; flood: FloodEvac | null }

const markerOut = { marker: false };

/**
 * Where dry brood lying outside its chambers goes back to while the nest is wet (not an evacuation): the
 * best-scoring dry chamber for its stage group, else the evacuation destination (floodEvac.ts: the dry chamber with
 * the highest floor, else DRY_SPOT).
 */
function dryReturnDest(ctx: SortContext, f: FloodEvac, group: number): number {
  let best = -1, bestS = 0;
  for (let i = 0; i < ctx.chambers.length; i++) {
    const s = ctx.scores[group][i];
    if (s > bestS && !f.wetChambers.has(ctx.chambers[i].id)) { best = i; bestS = s; }
  }
  return best >= 0 ? ctx.chambers[best].id : f.dest;
}

/** The highest-priority job of one lying brood item, or null. */
function jobFor(sim: Sim, col: Colony, def: SpeciesDef, nest: Nest, info: NestInfo, b: Brood, movesLeft: number): BoardJob | null {
  const ctx = info.ctx;
  const job = (kind: JobKindId, prio: number, dest = -1, marker = false, feedAfter = false): BoardJob => ({
    kind, id: b.id, dest, prio, pos: b.pos, nestId: nest.id, marker, feedAfter,
  });
  if (info.flood) {
    // a wet nest (GDD 03 §9.4 emergency, §11.3): brood the water reaches (or nearly, while it rises) is carried to the
    // highest dry chamber floor or the nearest dry place, pupae first; no sorting or rescue carries brood into a
    // chamber the water reaches
    if (broodInWater(sim, info.flood, b)) {
      const prio = JOB_PRIORITY.evacuate + BROOD_EVAC_STAGE_BONUS[b.stage];
      // GDD 03 §9.4 "score dryness first", task nest-fix3 item 2 "to the highest dry chamber floor": a brood chamber
      // just above the water would need a second carry when the water rises on
      return job(Job.evacuate, prio, info.flood.dest);
    }
  }
  if (b.chamberId < 0 || !info.chamberIds.has(b.chamberId)) {
    const dest = ctx.best[groupOf(b)];
    // dry brood out of its chamber (evacuated) goes back only to a chamber the water does not reach: the best dry one
    let back = dest >= 0 ? ctx.chambers[dest].id : -1;
    if (dest >= 0 && info.flood?.wetChambers.has(back)) back = dryReturnDest(ctx, info.flood, groupOf(b));
    if (back >= 0) return job(Job.rescue, JOB_PRIORITY.rescue, back);
    // nowhere dry to take it back to (a one-chamber nest under water at night): it is fed and tended where it lies
    // (colony-life round 1: brood put at the dry spot had no job at all, and eggs died untended, larvae starved)
    return careJob(sim, col, def, b, job);
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
  let dest = movesLeft > 0 ? moveTarget(ctx, b, markerOut) : -1;
  if (dest >= 0 && info.flood && info.flood.wetChambers.has(dest)) dest = -1;
  if (dest >= 0) return job(Job.move, markerOut.marker ? JOB_PRIORITY.moveMarker : JOB_PRIORITY.move, dest, markerOut.marker);
  return careJob(sim, col, def, b, job);
}

/** Care of a brood item where it lies: feed a hungry larva, tend an egg or pupa pile that is due; else null. */
function careJob(
  sim: Sim, col: Colony, def: SpeciesDef, b: Brood,
  job: (kind: JobKindId, prio: number) => BoardJob,
): BoardJob | null {
  if (b.stage === 'larva') return wantsFeed(b, def) ? job(Job.feed, JOB_PRIORITY.feedBase + JOB_PRIORITY.feedUrgency * feedUrgency(b, col)) : null;
  const age = sim.state.tick - b.lastTendedTick;
  if (age > daysToTicks(TEND_DUE_GD)) return job(Job.tend, JOB_PRIORITY.tend + (age > daysToTicks(TEND_URGENT_GD) ? JOB_PRIORITY.tendUrgent : 0));
  return null;
}

/** Builds the colony's board from the current state (with this tick's live claims). */
function build(sim: Sim, col: Colony, def: SpeciesDef, live: Live): NurseryBoardState {
  const { claims, incoming, nurses } = live;
  const space = new Map<number, number>();
  for (const b of sim.stores.brood.list) {
    if (b.alive && b.colony === col.id && b.carriedBy < 0 && b.chamberId >= 0) space.set(b.chamberId, (space.get(b.chamberId) ?? 0) + broodSpace(b));
  }
  const infos = new Map<number, NestInfo>();
  const sort: NurseryBoardState['sort'] = [];
  for (const nid of col.nestIds) {
    const nest = sim.stores.nests.get(nid);
    if (!nest) continue;
    const ctx = sortContext(sim, nest, def, (id) => (space.get(id) ?? 0) + (incoming.get(id) ?? 0));
    sort.push({ nestId: nid, chamberIds: ctx.chambers.map((c) => c.id), scores: ctx.scores, best: ctx.best, markerId: ctx.marker ? ctx.marker.id : -1 });
    const flood = floodEvac(sim, nest);
    infos.set(nid, { ctx, alarmed: alarmedChambers(sim, col.id, nest, !!flood), chamberIds: new Set(nest.chambers.map((c) => c.id)), flood });
  }
  const jobs: NurseryJobState[] = [];
  let movesLeft = SORT_MOVES_PER_NURSE * Math.max(1, nurses);
  for (const b of sim.stores.brood.list) {
    if (!b.alive || b.colony !== col.id || b.carriedBy >= 0) continue;
    const nest = sim.stores.nests.get(b.nestId) ?? sim.stores.nests.get(col.nestIds[0]);
    const info = nest ? infos.get(nest.id) : undefined;
    if (!nest || !info) continue;
    const j = jobFor(sim, col, def, nest, info, b, movesLeft);
    if (!j) continue;
    if (j.kind === Job.move && !j.feedAfter && !claims.has(b.id)) movesLeft--;
    jobs.push({ kind: j.kind, id: j.id, dest: j.dest, prio: j.prio, nestId: j.nestId, marker: j.marker ? 1 : 0, feedAfter: j.feedAfter ? 1 : 0 });
  }
  return { colonyId: col.id, builtTick: sim.state.tick, jobs, sort };
}

/** This tick's claims of a colony (read once per tick from the claimants' bb). */
function liveOf(sim: Sim, colonyId: number): Live {
  let m = lives.get(sim);
  if (!m) { m = new Map(); lives.set(sim, m); }
  let l = m.get(colonyId);
  if (l && l.tick === sim.state.tick) return l;
  const claims = new Map<number, number>(), incoming = new Map<number, number>();
  const nurses = readClaims(sim, colonyId, claims, incoming);
  l = { tick: sim.state.tick, claims, incoming, nurses, board: null };
  m.set(colonyId, l);
  return l;
}

/** The board must be rebuilt: a new 2 s window began, or a nest of the colony has other chambers now. */
function stale(sim: Sim, col: Colony, st: NurseryBoardState): boolean {
  if (Math.floor(st.builtTick / PERIOD) !== Math.floor(sim.state.tick / PERIOD)) return true;
  let n = 0;
  for (const nid of col.nestIds) {
    const nest = sim.stores.nests.get(nid);
    if (!nest) continue;
    const s = st.sort[n++];
    if (!s || s.nestId !== nid || s.chamberIds.length !== nest.chambers.length) return true;
    for (let i = 0; i < nest.chambers.length; i++) if (nest.chambers[i].id !== s.chamberIds[i]) return true;
  }
  return n !== st.sort.length;
}

/** Runtime view of a stored board: jobs at the brood's live positions, sort contexts over the live chambers. */
function viewOf(sim: Sim, st: NurseryBoardState): View {
  let m = views.get(sim);
  if (!m) { m = new Map(); views.set(sim, m); }
  const hit = m.get(st.colonyId);
  if (hit && hit.built === st) return hit;
  const jobs: BoardJob[] = st.jobs.map((j) => ({
    kind: j.kind as JobKindId, id: j.id, dest: j.dest, prio: j.prio, nestId: j.nestId, marker: j.marker === 1,
    feedAfter: j.feedAfter === 1, pos: sim.stores.brood.get(j.id)?.pos ?? NOWHERE,
  }));
  const sort = new Map<number, SortContext>();
  for (const s of st.sort) {
    const nest = sim.stores.nests.get(s.nestId);
    if (!nest) continue;
    const chambers = s.chamberIds.map((id) => nest.chambers.find((c) => c.id === id)!);
    sort.set(s.nestId, { chambers, scores: s.scores, best: s.best, marker: sim.stores.markers.get(s.markerId) ?? null });
  }
  const v = { built: st, jobs, sort };
  m.set(st.colonyId, v);
  return v;
}

/** The colony's board for this tick: the stored board (rebuilt when stale) with this tick's claims. */
export function boardOf(sim: Sim, colonyId: number): Board | null {
  const live = liveOf(sim, colonyId);
  if (live.board) return live.board;
  const col = sim.stores.colonies.get(colonyId);
  const def = col ? sim.getSpecies(col.species) : undefined;
  if (!col || !def) return null;
  const list = (sim.state.nurseryBoards ??= []);
  let i = list.findIndex((b) => b.colonyId === colonyId);
  if (i < 0 || stale(sim, col, list[i])) {
    const st = build(sim, col, def, live);
    if (i < 0) { list.push(st); i = list.length - 1; } else list[i] = st;
  }
  const v = viewOf(sim, list[i]);
  live.board = { jobs: v.jobs, claims: live.claims, sort: v.sort, nurses: live.nurses };
  return live.board;
}

/** A job of the stored board still stands for the live brood (it may have hatched, been moved or died since). */
function jobLive(sim: Sim, j: BoardJob, def: SpeciesDef | undefined): Brood | null {
  const b = sim.stores.brood.get(j.id);
  if (!b || b.carriedBy >= 0) return null;
  if (j.kind === Job.feed) return b.stage === 'larva' && (!def || wantsFeed(b, def)) ? b : null;
  if (j.kind === Job.assist) return b.stage === 'pupa' && (b.flags & BroodFlag.READY) !== 0 ? b : null;
  return b;
}

/** A pile item tended since this window's board was built (by a nurse grooming the pile meanwhile). */
function tendedSince(sim: Sim, b: Brood): boolean {
  return b.lastTendedTick >= Math.floor(sim.state.tick / PERIOD) * PERIOD;
}

function defOf(sim: Sim, colonyId: number): SpeciesDef | undefined {
  const col = sim.stores.colonies.get(colonyId);
  return col ? sim.getSpecies(col.species) : undefined;
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
  const bu = sim.world.bu, def = defOf(sim, ant.colony);
  let best: BoardJob | null = null, bestS = -Infinity;
  for (const j of board.jobs) {
    if (j.nestId !== nestId || (skipFeed && j.kind === Job.feed)) continue;
    const c = board.claims.get(j.id);
    if ((c !== undefined && c !== ant.id) || skipped(sim, ant, j.id)) continue;
    const b = jobLive(sim, j, def);
    if (!b) continue;
    j.pos = b.pos;
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
  const def = defOf(sim, ant.colony);
  let best: Brood | null = null, bestD = Infinity;
  for (const j of board.jobs) {
    if (j.kind !== Job.feed) continue;
    const c = board.claims.get(j.id);
    if (c !== undefined && c !== ant.id) continue;
    const b = jobLive(sim, j, def);
    if (!b) continue;
    const d = Math.hypot(b.pos.x - p.x, b.pos.y - p.y, b.pos.z - p.z);
    if (d > radiusMm || d >= bestD) continue;
    best = b; bestD = d;
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
    const b = jobLive(sim, j, undefined);
    if (!b || tendedSince(sim, b)) continue;
    const d = Math.hypot(b.pos.x - p.x, b.pos.y - p.y, b.pos.z - p.z);
    if (d > radiusMm || d >= bestD) continue;
    best = b; bestD = d;
  }
  return best;
}

/**
 * Tend jobs of a colony that nobody has claimed and that were not tended since this window's board was built (the
 * overdue egg and pupa piles of ruling R33): brood id, nest and where it lies. Highest priority first.
 */
export function openTendJobs(sim: Sim, colonyId: number): { id: number; nestId: number; pos: Vec3 }[] {
  const board = boardOf(sim, colonyId);
  if (!board) return [];
  const out: { id: number; nestId: number; pos: Vec3; prio: number }[] = [];
  for (const j of board.jobs) {
    if (j.kind !== Job.tend || board.claims.has(j.id)) continue;
    const b = jobLive(sim, j, undefined);
    if (!b || tendedSince(sim, b)) continue;
    out.push({ id: b.id, nestId: j.nestId, pos: b.pos, prio: j.prio });
  }
  return out.sort((a, b) => b.prio - a.prio || a.id - b.id);
}

/** Number of nurses counted this tick. */
export function nurseCount(sim: Sim, colonyId: number): number {
  return liveOf(sim, colonyId).nurses;
}

/**
 * Unclaimed evacuation jobs in a nest this tick (brood in rising water, floodEvac.ts): idle workers there turn nurse
 * to carry it out (GDD 03 §11.3; a small colony has too few nurses to clear a flooding chamber in time).
 */
export function evacuationOpen(sim: Sim, colonyId: number, nestId: number): boolean {
  const board = boardOf(sim, colonyId);
  if (!board) return false;
  for (const j of board.jobs) if (j.kind === Job.evacuate && j.nestId === nestId && !board.claims.has(j.id)) return true;
  return false;
}
