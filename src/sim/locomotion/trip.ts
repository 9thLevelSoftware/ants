// Trips (navTo-family requests): resolve the goal (surface point, entrance, chamber, plan field, entity, POI), then
// compose legs automatically: nest field out of the current nest -> surface path (nav-grid A*, cached entrance flow
// field, or direct) -> climb route -> entrance -> nest field to the goal. Legs are re-planned when one ends, the walker
// enters or leaves a nest, lands after a fall, the carve grid changed under it, or a moving target moved.

import type { Vec3 } from '@/core/math/vec3';
import type { Ant, Sim, TargetKind, Walker } from '@/sim/types';
import { AntFlag, nestFieldId } from '@/sim/types';
import { isLocoNavGrid } from './grid/navGridImpl';
import { followClimb, followField, followFlow, followPath, followSeek, type LegResult } from './legs';
import { copy3, dist3, distXZ, noise01, set3 } from './mathx';
import {
  chamberById, chamberField, entranceById, exitField, isBelowGround, nearestOpenEntrance, nestContaining, planField,
  pointField,
} from './nests';
import { nearestRouteNode } from './routes';
import { avoidDiscs, colonyEntrances, takePlanBudget, type LocoRuntime } from './runtime';
import { NO_PROGRESS, type NavScratch } from './scratch';

const _d: Vec3 = { x: 0, y: 0, z: 0 };

/** Nest the walker is in now (-1 on the surface); walkers in the air keep their last value. */
export function walkerNest(sim: Sim, w: Walker, prev: number): number {
  if (w.medium === 'air') return prev;
  if (w.medium !== 'cavity') return -1;
  return nestContaining(sim, w.pos, prev);
}

function colonyOf(w: Walker): number {
  const c = (w as Partial<Ant>).colony;
  return typeof c === 'number' ? c : -1;
}

function isAutonomousAnt(w: Walker): boolean {
  const a = w as Partial<Ant>;
  return typeof a.caste === 'string' && ((a.flags ?? 0) & AntFlag.POSSESSED) === 0;
}

/**
 * Sets the steering goal: field goals as they are, point goals jittered within spread x arriveDist of the
 * destination (deterministic per walker and request), so a crowd arriving at one place spreads out instead of
 * piling up (spike-nest §5 item 12). tripArrived uses the remaining (1 - spread) x arriveDist around this goal, so an
 * arrived walker is always within arriveDist of the destination.
 */
export function setGoal(s: NavScratch, dest: Vec3, arrive: number, id: number, spread: number): void {
  if (s.goalNest >= 0 && s.goalField && !s.goalField.startsWith('loco:pt:')) { copy3(s.goal, dest); return; }
  const a = noise01(id, s.reqTick, 17) * 2 * Math.PI, rr = Math.sqrt(noise01(id, s.reqTick, 29)) * spread * arrive;
  set3(s.goal, dest.x + Math.cos(a) * rr, dest.y, dest.z + Math.sin(a) * rr);
}

/** Resolves where a target ref is now; false if it is gone. Also sets the goal nest / field for nest targets. */
export function resolveTarget(sim: Sim, kind: TargetKind, id: number, fallback: Vec3, s: NavScratch, r: LocoRuntime, out: Vec3): boolean {
  s.goalNest = -1; s.goalField = '';
  switch (kind) {
    case 'ant': { const e = sim.stores.ants.get(id); if (!e) return false; copy3(out, e.pos); break; }
    case 'creature': { const e = sim.stores.creatures.get(id); if (!e) return false; copy3(out, e.pos); break; }
    case 'item': { const e = sim.stores.items.get(id); if (!e) return false; copy3(out, e.pos); break; }
    case 'brood': { const e = sim.stores.brood.get(id); if (!e) return false; copy3(out, e.pos); break; }
    case 'source': { const e = sim.stores.sources.get(id); if (!e) return false; copy3(out, e.pos); break; }
    case 'marker': { const e = sim.stores.markers.get(id); if (!e) return false; copy3(out, e.pos); break; }
    case 'entrance': { const h = entranceById(sim, id); if (!h) return false; copy3(out, h.entrance.pos); return true; }
    case 'chamber': {
      const h = chamberById(sim, id);
      if (!h) return false;
      copy3(out, h.chamber.center);
      s.goalNest = h.nest.id;
      s.goalField = chamberField(sim, h.nest.id, id) || pointField(sim, r, h.chamber.center);
      return true;
    }
    case 'plan': {
      copy3(out, fallback);
      for (const n of sim.state.nests) {
        if (!n.alive || !n.digPlans.some((p) => p.id === id)) continue;
        s.goalNest = n.id;
        s.goalField = planField(sim, n.id, id);
      }
      if (s.goalNest < 0) return false;
      if (!s.goalField) s.goalField = pointField(sim, r, fallback);
      return true;
    }
    case 'nest': {
      const n = sim.stores.nests.get(id);
      if (!n) return false;
      const c = n.chambers[0];
      if (c) { copy3(out, c.center); s.goalNest = n.id; s.goalField = chamberField(sim, n.id, c.id) || pointField(sim, r, c.center); return true; }
      const e = n.entrances[0];
      if (!e) return false;
      copy3(out, e.pos);
      return true;
    }
    case 'none': return false;
    default: copy3(out, fallback); break;
  }
  if (isBelowGround(sim, out)) {
    const n = nestContaining(sim, out);
    if (n >= 0) { s.goalNest = n; s.goalField = pointField(sim, r, out); }
  }
  return true;
}

/** Clears leg state (keeps the request). */
function resetLeg(w: Walker, s: NavScratch): void {
  w.nav.path = null; w.nav.pathIdx = 0; w.nav.routeId = -1;
  w.nav.fieldNest = -1; w.nav.fieldTarget = -1; w.nav.fieldKind = 'none';
  s.legField = ''; s.legExit = false; s.flowKey = '';
}

function setSeek(w: Walker, s: NavScratch, t: Vec3): void {
  resetLeg(w, s);
  w.nav.mode = 'seek';
  copy3(s.seekTarget, t);
}

function setField(w: Walker, s: NavScratch, nestId: number, field: string, exit: boolean): void {
  resetLeg(w, s);
  w.nav.mode = 'field';
  s.legField = field;
  s.legExit = exit;
  w.nav.fieldNest = nestId;
  const parts = field.split(':');
  w.nav.fieldKind = exit ? (parts[2] === 'seal' ? 'seal' : 'exit') : parts[2] === 'plan' ? 'plan' : parts[2] === 'chamber' ? 'chamber' : 'none';
  w.nav.fieldTarget = exit ? -1 : Number(parts[3] ?? -1) || -1;
}

function setClimb(w: Walker, s: NavScratch, routeId: number, from: number, to: number, thenSeek: boolean): void {
  resetLeg(w, s);
  w.nav.mode = 'climb';
  w.nav.routeId = routeId;
  s.routeDir = to >= from ? 1 : -1;
  s.routeEnd = to;
  s.routeThenSeek = thenSeek ? 1 : 0;
  w.nav.pathIdx = from;
}

/** Surface leg to t: direct when close and clear, else entrance flow field, else A* (budgeted). False = no route. */
function planSurface(sim: Sim, w: Walker, s: NavScratch, r: LocoRuntime, t: Vec3, flowColony: number): boolean {
  const g = sim.navGrid;
  const discs = isAutonomousAnt(w) ? avoidDiscs(sim, r, colonyOf(w)) : null;
  const loco = isLocoNavGrid(g) ? g : null;
  if (distXZ(w.pos, t) < r.P.direct && (!loco || loco.segmentWalkable(w.pos, t, discs))) { setSeek(w, s, t); return true; }
  if (loco && flowColony >= 0 && (!discs || discs.length === 0)) {
    const f = colonyEntrances(sim, r, flowColony);
    if (f.seeds.length > 0) {
      resetLeg(w, s);
      w.nav.mode = 'path';
      s.flowKey = `colony:${flowColony}`;
      return true;
    }
  }
  if (!takePlanBudget(sim, r)) { setSeek(w, s, t); s.planTick = -1; return true; }
  const path: Vec3[] = [];
  const ok = loco ? loco.findPathEx(w.pos, t, path, { discs }) : g.findPath(w.pos, t, path);
  if (!ok) { r.stats.planFailed++; return false; }
  resetLeg(w, s);
  w.nav.mode = 'path';
  w.nav.path = path;
  w.nav.pathIdx = 0;
  return true;
}

/** Chooses the next leg from where the walker is and where the goal lies. False = no route (request fails). */
export function planLeg(sim: Sim, w: Walker, s: NavScratch, r: LocoRuntime, here: number): boolean {
  const P = r.P;
  s.planTick = sim.state.tick;
  s.legNest = here;
  s.best = NO_PROGRESS; s.bestTick = sim.state.tick; copy3(s.anchor, w.pos);
  if (here >= 0) {
    if (s.goalNest === here) {
      setField(w, s, here, s.goalField || pointField(sim, r, s.goal), false);
      return true;
    }
    const ef = exitField(sim, here);
    if (!ef) return false;
    setField(w, s, here, ef, true);
    const e = nearestOpenEntrance(sim, here, w.pos);
    s.entranceId = e ? e.id : -1;
    return true;
  }
  if (s.goalNest >= 0) {
    const e = nearestOpenEntrance(sim, s.goalNest, w.pos);
    if (!e) return false;
    s.entranceId = e.id;
    if (distXZ(w.pos, e.pos) <= e.radius + P.entranceHandover) {
      set3(_d, e.pos.x - e.dir.x * P.bu, e.pos.y - e.dir.y * P.bu, e.pos.z - e.dir.z * P.bu);
      setSeek(w, s, _d);
      return true;
    }
    const nest = sim.stores.nests.get(s.goalNest);
    const own = nest && nest.colony === colonyOf(w) ? nest.colony : -1;
    return planSurface(sim, w, s, r, e.pos, own);
  }
  const groundW = sim.field.height(w.pos.x, w.pos.z), groundG = sim.field.height(s.goal.x, s.goal.z);
  const walkerUp = w.medium === 'surface' && w.pos.y - groundW > P.elevated;
  const goalUp = s.goal.y - groundG > P.elevated;
  const far = dist3(w.pos, s.goal) > P.routeGoal;
  if (goalUp) {
    const g = nearestRouteNode(sim.world, s.goal, P.routeGoal, 1);
    if (g) {
      const k = nearestRouteNode(sim.world, w.pos, P.routeSnap);
      if (walkerUp && !far) { setSeek(w, s, s.goal); return true; }
      if (k && k.route.id === g.route.id) { setClimb(w, s, g.route.id, k.idx, g.idx, true); return true; }
      if (!walkerUp) return planSurface(sim, w, s, r, g.route.points[0], -1);
    }
  }
  if (walkerUp && far) {
    const k = nearestRouteNode(sim.world, w.pos, P.routeGoal, 1);
    if (k) { setClimb(w, s, k.route.id, k.idx, 0, false); return true; }
  }
  return planSurface(sim, w, s, r, s.goal, -1);
}

/** Whether the trip has arrived (goal field reached inside the goal nest, or within arriveDist of the goal). */
export function tripArrived(sim: Sim, w: Walker, s: NavScratch, here: number, spread: number): boolean {
  const nav = w.nav;
  if (s.goalNest >= 0 && s.goalField && !s.goalField.startsWith('loco:pt:')) {
    if (here !== s.goalNest) return false;
    const d = sim.nestNav.distanceAt(s.goalField, w.pos);
    return d <= Math.max(nav.arriveDist, 1.5 * sim.carve.voxel);
  }
  return dist3(w.pos, s.goal) <= (1 - spread) * nav.arriveDist || dist3(w.pos, nav.dest) <= 0.25 * nav.arriveDist;
}

/** Follows the current leg; leg ends trigger an immediate re-plan (bounded per tick). */
export function followLeg(sim: Sim, w: Walker, s: NavScratch, r: LocoRuntime, out: Vec3): LegResult {
  set3(out, 0, 0, 0);
  switch (w.nav.mode) {
    case 'seek': return followSeek(w, s, r, out);
    case 'path': {
      if (s.flowKey) {
        const colony = Number(s.flowKey.slice(7));
        const f = colonyEntrances(sim, r, colony);
        const g = sim.navGrid;
        const flow = isLocoNavGrid(g) && f.seeds.length > 0 ? g.flowField(s.flowKey, f.sig, f.seeds) : null;
        return followFlow(sim, w, s, r, flow, out);
      }
      return followPath(w, r, out);
    }
    case 'field': return followField(sim, w, s, r, w.nav.arriveDist, out);
    case 'climb': return followClimb(sim, w, s, r, out);
    default: return { state: 'done', metric: 0, advanced: false };
  }
}

/** After a climb leg: seek the goal or re-plan. */
export function afterClimb(w: Walker, s: NavScratch): boolean {
  if (s.routeThenSeek) { setSeek(w, s, s.goal); return true; }
  return false;
}

/** Initialises a goto request on the walker (nav fields + scratch). */
export function startTrip(sim: Sim, w: Walker, s: NavScratch, r: LocoRuntime, dest: Vec3, kind: TargetKind, id: number,
  arrive: number, wid: number): boolean {
  const nav = w.nav;
  if (!resolveTarget(sim, kind, id, dest, s, r, nav.dest)) return false;
  nav.destKind = kind; nav.destId = id; nav.arriveDist = arrive;
  nav.status = 'moving'; nav.stuckTicks = 0;
  s.req = 'goto'; s.reqTick = sim.state.tick; s.retargetTick = sim.state.tick;
  setGoal(s, nav.dest, arrive, wid, r.P.spread);
  s.planTick = -1; s.ladder = 0; s.episodes = 0; s.relocations = 0; s.entranceId = -1;
  s.best = NO_PROGRESS; s.bestTick = sim.state.tick;
  resetLeg(w, s);
  nav.mode = 'seek';
  copy3(s.seekTarget, s.goal);
  // feasibility: a goal inside a nest needs an open entrance unless the walker is already in that nest
  if (s.goalNest >= 0 && w.medium !== 'cavity' && !nearestOpenEntrance(sim, s.goalNest, w.pos)) return false;
  return true;
}

/** Field id helper for nest field requests. */
export function fieldIdFor(sim: Sim, nestId: number, kind: 'exit' | 'seal' | 'chamber' | 'plan', target: number): string {
  const id = nestFieldId(nestId, { kind, id: kind === 'exit' || kind === 'seal' ? -1 : target });
  return sim.nestNav.hasTarget(id) ? id : '';
}
