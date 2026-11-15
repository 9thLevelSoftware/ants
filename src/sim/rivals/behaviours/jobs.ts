// The jobs of rival agents (GDD 05 §3.3 state table, reduced and cheap): forage, patrol, war front, guard,
// defend / escort, return (absorbed at the entrance), the queen's hiding, the aftermath wander. Raids (rival and
// player raiders) are in raidJobs.ts. Each job runs on the agent's think (about 1 s) and makes one locomotion
// request per leg; fights are combat's (startFight), the encounter ritual is encounter.ts.

import { rngInt, rngRange } from '@/core/rng';
import type { Ant, Sim } from '@/sim/types';
import {
  ABSORB_RADIUS_BU, AGENT_THINK_TICKS, DEFEND_IDLE_S, DEFEND_NEST_BU, DEFEND_SURFACE_BU, ESCORT_ARRIVE_BU, QUEEN_HIDE_S,
  REINFORCE_ARRIVE_BU, REINFORCE_GO_BU, REINFORCE_SEARCH_BU, EMERGE_WALK_L, FORAGE_DWELL_S,
  FORAGE_FRINGE_BU, FORAGE_NODE_SEARCH_BU, FORAGE_RANGE_BU, FORAGE_TAKE_UNITS, FORAGE_TIMEOUT_S, GUARD_RADIUS_L,
  GUARD_RELIEF_GD, LOST_ABSORB_S, PATROL_LOITER_S, PATROL_TOP_CELLS, QUEEN_HIDE_BU, RAID_ENGAGE_L, WAR_HOLD_S,
} from '@/sim/balance/rivals';
import { harvest, nearestSource } from '@/sim/ecology';
import { mayAttack, startFight } from '@/sim/combat';
import { processAntDeath } from '@/sim/ants';
import { secondsToTicks, TICKS_PER_DAY } from '@/sim/time';
import { absorbAgent, setJob } from '../agents';
import { coreRadiusBu } from '../init';
import { lenMm } from '../encounter';
import { d2, d3, goPoint, goTarget, groundPoint, halt, loiter, setTarget, targetOf } from './move';
import { warOf } from '../relations';
import { chambersOf, homeNest } from '../setup';
import { BB, JOB, type RivalColony } from '../state';
import { cellCentre } from '../territory';

const ids: number[] = [];
const QUEEN_HIDE_UNTIL = 'rv.hide';

const since = (sim: Sim, ant: Ant): number => sim.state.tick - (ant.bb[BB.t0] ?? sim.state.tick);

/** Nearest hostile ant within r (mm) of p that this ant may attack; null none. */
export function hostileNear(sim: Sim, ant: Ant, p: { x: number; y: number; z: number }, r: number, insideNest = -1): Ant | null {
  sim.index.queryAnts(p, r, ids);
  let best: Ant | null = null, bestD = Infinity;
  for (const id of ids) {
    const o = sim.stores.ants.get(id);
    if (!o || !mayAttack(sim, ant, o)) continue;
    if (insideNest >= 0 && o.nestId !== insideNest) continue;
    const d = d3(o.pos, p);
    if (d <= r && d < bestD) { best = o; bestD = d; }
  }
  return best;
}

/** Sends the agent home (job return). */
export function goHome(sim: Sim, ant: Ant): void {
  setJob(sim, ant, JOB.ret);
}

// ---- return and absorption ----

export function returnJob(sim: Sim, ant: Ant, col: RivalColony): void {
  const nest = homeNest(sim, col);
  if (!nest || nest.entrances.length === 0 || ant.nestId === nest.id) { absorbAgent(sim, ant); return; }
  let e = nest.entrances[0], best = Infinity;
  for (const x of nest.entrances) { const d = d2(x.pos, ant.pos); if (d < best) { best = d; e = x; } }
  if (best <= e.radius + ABSORB_RADIUS_BU * sim.world.bu) { absorbAgent(sim, ant); return; }
  const st = goTarget(sim, ant, { kind: 'entrance', id: e.id, pos: e.pos }, ABSORB_RADIUS_BU);
  if (st === 'moving') ant.bb[BB.homeTick] = sim.state.tick;
  else if (st === 'arrived') absorbAgent(sim, ant);
  else {
    ant.bb[BB.go] = 0; // try again next think
    if (sim.state.tick - (ant.bb[BB.homeTick] ?? sim.state.tick) > secondsToTicks(LOST_ABSORB_S)) absorbAgent(sim, ant);
  }
}

// ---- forage ----

function pickForageTarget(sim: Sim, ant: Ant, col: RivalColony): void {
  const nest = homeNest(sim, col);
  const home = nest?.entrances[0]?.pos ?? ant.pos;
  const rng = sim.stream('rng.rivals');
  const bu = sim.world.bu;
  const maxR = Math.max(FORAGE_RANGE_BU[0] + 1, Math.min(coreRadiusBu(col.rival.n) + FORAGE_FRINGE_BU, FORAGE_RANGE_BU[1]));
  const p = groundPoint(sim, home, rngRange(rng, FORAGE_RANGE_BU[0], maxR) * bu, rngRange(rng, 0, Math.PI * 2));
  const sid = nearestSource(sim, col.id, p, FORAGE_NODE_SEARCH_BU * bu);
  const s = sid >= 0 ? sim.stores.sources.get(sid) : undefined;
  setTarget(ant, s ? s.pos : p, s ? s.id : -1);
}

export function forageJob(sim: Sim, ant: Ant, col: RivalColony): void {
  if (since(sim, ant) > secondsToTicks(FORAGE_TIMEOUT_S) || (ant.bb[BB.loadC] ?? 0) + (ant.bb[BB.loadP] ?? 0) > 0) {
    goHome(sim, ant);
    return;
  }
  const step = ant.bb[BB.step] ?? 0;
  if (step === 0) { pickForageTarget(sim, ant, col); ant.bb[BB.step] = 1; return; }
  if (step === 1) {
    const st = goPoint(sim, ant);
    if (st === 'moving') return;
    if (st === 'failed') { ant.bb[BB.step] = 0; return; }
    ant.bb[BB.step] = 2;
    ant.bb['rv.dwell'] = sim.state.tick + secondsToTicks(rngRange(sim.stream('rng.rivals'), FORAGE_DWELL_S[0], FORAGE_DWELL_S[1]));
    halt(sim, ant);
    return;
  }
  // dwell at the place, then take what the node gives and head home
  if (sim.state.tick < (ant.bb['rv.dwell'] ?? 0)) return;
  delete ant.bb['rv.dwell'];
  const sid = ant.bb[BB.tid] ?? -1;
  if (sid >= 0 && sim.stores.sources.has(sid)) {
    const got = harvest(sim, ant, sid, FORAGE_TAKE_UNITS);
    ant.bb[BB.loadC] = got.c;
    ant.bb[BB.loadP] = got.p;
  }
  goHome(sim, ant);
}

// ---- patrol and war front ----

function frontOrRing(sim: Sim, ant: Ant, col: RivalColony, war: boolean): void {
  const rng = sim.stream('rng.rivals');
  const rels = sim.state.rivals.relations.filter((r) => (r.a === col.id || r.b === col.id) && r.warFront.length > 0
    && (war ? r.state === 'war' : true));
  const r = war ? warOf(sim.state, col.id) : rels[rngInt(rng, 0, Math.max(0, rels.length - 1))];
  if (r && r.warFront.length > 0) {
    const cell = r.warFront[rngInt(rng, 0, Math.min(PATROL_TOP_CELLS, r.warFront.length) - 1)];
    setTarget(ant, cellCentre(sim, cell));
    return;
  }
  const nest = homeNest(sim, col);
  const home = nest?.entrances[0]?.pos ?? ant.pos;
  setTarget(ant, groundPoint(sim, home, coreRadiusBu(col.rival.n) * sim.world.bu, rngRange(rng, 0, Math.PI * 2)));
}

function holdAtPoint(sim: Sim, ant: Ant, col: RivalColony, war: boolean, holdS: readonly [number, number]): void {
  const step = ant.bb[BB.step] ?? 0;
  if (step === 0) { frontOrRing(sim, ant, col, war); ant.bb[BB.step] = 1; return; }
  if (step === 1) {
    const st = goPoint(sim, ant, 4);
    if (st === 'moving') return;
    ant.bb[BB.step] = 2;
    ant.bb['rv.hold'] = sim.state.tick + secondsToTicks(rngRange(sim.stream('rng.rivals'), holdS[0], holdS[1]));
    ant.bb[BB.go] = 0;
    return;
  }
  const foe = hostileNear(sim, ant, ant.pos, RAID_ENGAGE_L * lenMm(sim, ant));
  if (war && foe) { startFight(sim, ant, { kind: 'ant', id: foe.id }, foe.pos, 'threat'); return; }
  const t = targetOf(ant);
  if (t) loiter(sim, ant, t, 4);
  if (sim.state.tick >= (ant.bb['rv.hold'] ?? 0)) {
    delete ant.bb['rv.hold'];
    if (war) ant.bb[BB.step] = 0;
    else goHome(sim, ant);
  }
}

export function patrolJob(sim: Sim, ant: Ant, col: RivalColony): void {
  holdAtPoint(sim, ant, col, false, PATROL_LOITER_S);
}

export function warJob(sim: Sim, ant: Ant, col: RivalColony): void {
  if (!warOf(sim.state, col.id)) { goHome(sim, ant); return; }
  holdAtPoint(sim, ant, col, true, WAR_HOLD_S);
}

// ---- guard, defend, escort ----

export function guardJob(sim: Sim, ant: Ant, col: RivalColony): void {
  if (since(sim, ant) > GUARD_RELIEF_GD * TICKS_PER_DAY) { goHome(sim, ant); return; }
  const nest = homeNest(sim, col);
  const e = nest?.entrances[0];
  if (!e) { goHome(sim, ant); return; }
  const L = lenMm(sim, ant);
  const foe = hostileNear(sim, ant, e.pos, GUARD_RADIUS_L * L + e.radius);
  if (foe) { startFight(sim, ant, { kind: 'ant', id: foe.id }, foe.pos, 'threat'); return; }
  if (d2(ant.pos, e.pos) > GUARD_RADIUS_L * L + e.radius) {
    setTarget(ant, e.pos);
    goPoint(sim, ant, GUARD_RADIUS_L * (L / sim.world.bu));
    return;
  }
  loiter(sim, ant, e.pos, (GUARD_RADIUS_L * L) / sim.world.bu);
}

/** Defenders and escorts: fight intruders in the nest (or at its entrances, or at a reinforcement call). */
export function defendJob(sim: Sim, ant: Ant, col: RivalColony, escort: boolean): void {
  const nest = homeNest(sim, col);
  if (!nest) { absorbAgent(sim, ant); return; }
  const bu = sim.world.bu;
  let foe: Ant | null = null;
  if (escort) {
    const q = sim.stores.ants.get(col.queenId);
    if (q) foe = hostileNear(sim, ant, q.pos, QUEEN_HIDE_BU * bu);
    if (!foe && q) { setTarget(ant, q.pos); if (goPoint(sim, ant, ESCORT_ARRIVE_BU) !== 'moving') halt(sim, ant); }
  } else {
    foe = hostileNear(sim, ant, ant.pos, DEFEND_NEST_BU * bu, nest.id);
    for (const e of nest.entrances) if (!foe) foe = hostileNear(sim, ant, e.pos, DEFEND_SURFACE_BU * bu);
    const rx = ant.bb['rv.rx'];
    if (!foe && rx !== undefined) {
      const p = { x: rx, y: ant.bb['rv.ry'] ?? 0, z: ant.bb['rv.rz'] ?? 0 };
      foe = hostileNear(sim, ant, p, REINFORCE_SEARCH_BU * bu);
      if (!foe && d3(ant.pos, p) > REINFORCE_ARRIVE_BU * bu) { setTarget(ant, p); goPoint(sim, ant, REINFORCE_GO_BU); return; }
    }
  }
  if (foe) {
    ant.bb['rv.idle'] = sim.state.tick;
    startFight(sim, ant, { kind: 'ant', id: foe.id }, foe.pos, 'threat');
    return;
  }
  if (sim.state.tick - (ant.bb['rv.idle'] ?? ant.bb[BB.t0] ?? 0) > secondsToTicks(DEFEND_IDLE_S)) goHome(sim, ant);
}

// ---- queens and the aftermath ----

/** The queen stays in the royal chamber; a hostile within 10 BU sends her to the deepest chamber (escorts follow). */
export function queenJob(sim: Sim, q: Ant, col: RivalColony): void {
  q.thinkTick = sim.state.tick + AGENT_THINK_TICKS;
  const nest = homeNest(sim, col);
  if (!nest) return;
  const threat = hostileNear(sim, q, q.pos, QUEEN_HIDE_BU * sim.world.bu);
  if (threat) q.bb[QUEEN_HIDE_UNTIL] = sim.state.tick + secondsToTicks(QUEEN_HIDE_S);
  const hiding = (q.bb[QUEEN_HIDE_UNTIL] ?? 0) > sim.state.tick;
  const { royal, deepest } = chambersOf(nest);
  const ch = hiding ? deepest : royal;
  if (!ch) return;
  if (d3(q.pos, ch.center) <= Math.max(ch.radii.x, ch.radii.z)) { halt(sim, q); return; }
  goTarget(sim, q, { kind: 'chamber', id: ch.id, pos: ch.center }, 1.5);
}

/** A queen hides now (escorts are fielded for her). */
export function queenHiding(sim: Sim, q: Ant | undefined): boolean {
  return !!q && (q.bb[QUEEN_HIDE_UNTIL] ?? 0) > sim.state.tick;
}

export function wanderJob(sim: Sim, ant: Ant): void {
  if (sim.state.tick >= (ant.bb[BB.dieTick] ?? 0)) { processAntDeath(sim, ant.id, 'exhaustion'); return; }
  loiter(sim, ant, ant.pos, 30);
}

/** First think of a fresh agent: walk out a few lengths, then the job. */
export function emerged(sim: Sim, ant: Ant): boolean {
  if ((ant.bb['rv.out'] ?? 0) === 1 || ant.nestId >= 0) return true;
  if ((ant.bb['rv.out'] ?? 0) === 0) {
    const a = Math.atan2(ant.fwd.z, ant.fwd.x);
    setTarget(ant, groundPoint(sim, ant.pos, EMERGE_WALK_L * lenMm(sim, ant), a));
    ant.bb['rv.out'] = 2;
  }
  const st = goPoint(sim, ant, 1);
  if (st === 'moving') return false;
  ant.bb['rv.out'] = 1;
  ant.bb[BB.go] = 0;
  return true;
}
