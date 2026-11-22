// Sealing the founding cavity (GDD 06 §5.9; tasks founding-close §1, viab-founding items 1-2). In phase `seal`,
// pressing E anywhere (seal-entrance defers to this guide instead of refusing, or the put-down / groom / lay-egg that
// E offers away from the throat) asks the guide to seal: it plans from the actual leak (sealPlan.ts), walks the
// queen near the plug's aim (by her own movement input when possessed, by locomotion otherwise), begins the real
// `seal-entrance` AIMED at the leak, and repeats until the entrance is `sealed` (GDD 06 §5.9: holding E repeats the
// plug about 3 times until sealed). Bounded: SEAL_MAX_PLUGS plugs per strategy. Never a dead end: when no plug has
// landed for SEAL_STRATEGY_TICKS, or a strategy runs out of stands, the guide moves to the next strategy of
// SEAL_STRATEGIES (which aims it tries first) instead of repeating the last one. Movement input from the player takes
// the queen back at once, and the guide then waits for the next press (or OPEN_AUTO_SEAL_GD without input). Out of
// her cavity (she walked out onto the surface, or a plug shut her out above it) she first walks back in by the way
// the cell still reaches the air, or, shut out, walks to the plugged throat and bites back through it there: never a
// bite from wherever she stands, which would open a new hole. The passive player (OPEN_AUTO_SEAL_GD without input)
// and cheat.completeFounding use the same guide.

import type { Vec3 } from '@/core/math/vec3';
import type { ActionId, Ant, Entrance, Nest, Sim } from '@/sim/types';
import { INPUT_DEADZONE, SEAL_ENTRANCE_S } from '@/sim/balance/actions';
import {
  OPEN_AUTO_SEAL_GD, SEAL_DEEP_AFTER_CHANGES, SEAL_EXCLUDE_BU, SEAL_MAX_PLUGS, SEAL_MAX_REPLANS, SEAL_COMMAND_MARGIN_BU, SEAL_OPPORTUNITY_TICKS,
  SEAL_SETTLED_SPEED_BU_S, SEAL_ROUTE_MAX_SAMPLES, SEAL_UNPOCKET_EVERY_TICKS, SEAL_SOIL_WAIT_TICKS, SEAL_STAND_TOL_BU,
  SEAL_STALL_BU, SEAL_STALL_TICKS, SEAL_STRATEGY_TICKS, SEAL_WALK_MAX_TICKS, SEAL_WAYPOINT_BU, SEAL_WAYPOINT_TANGENT,
} from '@/sim/balance/founding';
import { navStop, navTo } from '@/sim/locomotion';
import { isPlugPellet } from '@/sim/ants/actions/defs/dig';
import { TICKS_PER_DAY, TICKS_PER_SECOND } from '@/sim/time';
import { bbGet, bbSet, depthBelowGround, foundingQueen, openingOf, phaseAgeGd } from './access';
import { cavityRoute, floodCavity, floodStart, keyPos } from './leak';
import { biteToward, inThroatOf } from './seal';
import { cavityEntrances } from './dig';
import { aimReachMm } from './plugPredict';
import { SEAL_STRATEGIES, entranceToSeal, inSealReach, planSeal, plugKeepsQueenInside, queenInCavity, type SealPlan } from './sealPlan';

/** ant.bb key the seal-entrance primitive sets when a press was handed to this guide (src/sim/ants/actions/defs/dig.ts). */
const SEAL_DEFERRED_KEY = 'act.sealDefer';

/** Guide state on the queen (ant.bb, numbers only). */
export const SG = {
  state: 'fd.sg', // 0 idle, 1 walking to the stand, 2 plugging, 3 stuck (no stand reachable), 4 back into the cavity, 5 fetching soil
  ask: 'fd.sgAsk', // tick of the latest E press in phase `seal`
  seen: 'fd.sgSeen', // the ask tick already acted on
  auto: 'fd.sgAuto',
  autoTick: 'fd.sgAutoTick', // last passive request
  since: 'fd.sgTick',
  sx: 'fd.sgSx', sy: 'fd.sgSy', sz: 'fd.sgSz',
  tx: 'fd.sgTx', ty: 'fd.sgTy', tz: 'fd.sgTz', // the plug's aim
  dx: 'fd.sgDx', dy: 'fd.sgDy', dz: 'fd.sgDz', // movement input the guide wrote (to tell the player's apart)
  plugs: 'fd.sgPlugs', // plugs of this request
  total: 'fd.sgTotal', // seal-entrance actions begun by the guide in this opening
  replans: 'fd.sgReplans',
  ex: 'fd.sgEx', // excluded stands: fd.sgEx0x.. (up to SEAL_MAX_REPLANS)
  strategy: 'fd.sgStrat', // index into SEAL_STRATEGIES
  progress: 'fd.sgProg', // tick of the request or of the last plug (the strategy watchdog)
  changes: 'fd.sgChanges', // strategy changes in this opening (tests, report)
  lx: 'fd.sgLx', // her distance to the stand at the last stall check, mm
  mouth: 'fd.sgMouth', // shut out: she has reached the plugged opening (1) and digs down from it
  bit: 'fd.sgBit', // shut out: the last bite toward the cavity removed soil (1) or found none in reach (0)
} as const;

const IDLE = 0, WALK = 1, PLUG = 2, STUCK = 3, BACK = 4, SOIL = 5;

/** E-actions that mean "seal" while the opening is in phase `seal`. */
const E_ACTIONS: readonly ActionId[] = ['seal-entrance', 'put-down', 'groom', 'lay-egg'];

const listening = new WeakSet<Sim>();

/** Hears the queen's E presses (failed, started or cancelled E-actions) while the opening is in `seal`. */
export function listenForSealPresses(sim: Sim): void {
  if (listening.has(sim)) return;
  listening.add(sim);
  const note = (antId: number, action: ActionId) => {
    if (openingOf(sim)?.phase !== 'seal' || !E_ACTIONS.includes(action)) return;
    const q = foundingQueen(sim);
    if (!q || q.id !== antId || bbGet(q, SG.state, IDLE) === PLUG) return;
    bbSet(q, SG.ask, sim.state.tick);
  };
  sim.events.on('action-failed', (e) => note(e.antId, e.action));
  sim.events.on('action-started', (e) => note(e.antId, e.action));
  sim.events.on('action-cancelled', (e) => { if (e.action === 'lay-egg') note(e.antId, e.action); });
}

/** Starts (or restarts) a sealing request; `auto` for the passive player and the cheat. */
export function requestSeal(sim: Sim, q: Ant, auto: boolean): void {
  bbSet(q, SG.state, IDLE);
  bbSet(q, SG.auto, auto ? 1 : 0);
  bbSet(q, SG.plugs, 0);
  bbSet(q, SG.replans, 0);
  bbSet(q, SG.progress, sim.state.tick);
  clearExcluded(q);
  if (q.action && q.action.id === 'seal-entrance' && q.bb[SEAL_DEFERRED_KEY] !== 1) {
    // the player's own plug is under way: the guide carries on from it
    bbSet(q, SG.plugs, 1);
    bbSet(q, SG.total, bbGet(q, SG.total, 0) + 1);
    bbSet(q, SG.state, PLUG);
    bbSet(q, SG.since, sim.state.tick);
    return;
  }
  plan(sim, q);
}

function possessed(sim: Sim, q: Ant): boolean {
  return sim.state.player.possessedAntId === q.id;
}

function setIntent(sim: Sim, q: Ant, d: Vec3 | null): void {
  const i = sim.state.player.intent;
  i.dir.x = d ? d.x : 0; i.dir.y = d ? d.y : 0; i.dir.z = d ? d.z : 0;
  bbSet(q, SG.dx, i.dir.x); bbSet(q, SG.dy, i.dir.y); bbSet(q, SG.dz, i.dir.z);
}

/** The player moved the queen (input that the guide did not write): she is hers again. */
function playerTookOver(sim: Sim, q: Ant): boolean {
  if (!possessed(sim, q)) return false;
  const d = sim.state.player.intent.dir;
  if (Math.hypot(d.x, d.y, d.z) <= INPUT_DEADZONE) return false;
  return Math.hypot(d.x - bbGet(q, SG.dx, 0), d.y - bbGet(q, SG.dy, 0), d.z - bbGet(q, SG.dz, 0)) > INPUT_DEADZONE;
}

function stop(sim: Sim, q: Ant, state: number): void {
  if (possessed(sim, q)) setIntent(sim, q, null);
  else navStop(sim, q);
  bbSet(q, SG.state, state);
  bbSet(q, SG.since, sim.state.tick);
}

function excluded(q: Ant): Vec3[] {
  const out: Vec3[] = [];
  for (let n = 0; n < SEAL_MAX_REPLANS; n++) {
    const x = q.bb[`${SG.ex}${n}x`];
    if (x !== undefined) out.push({ x, y: q.bb[`${SG.ex}${n}y`] ?? 0, z: q.bb[`${SG.ex}${n}z`] ?? 0 });
  }
  return out;
}

function clearExcluded(q: Ant): void {
  for (let n = 0; n < SEAL_MAX_REPLANS; n++) for (const c of 'xyz') delete q.bb[`${SG.ex}${n}${c}`];
}

function exclude(q: Ant, p: Vec3): void {
  const n = bbGet(q, SG.replans, 0) % SEAL_MAX_REPLANS;
  bbSet(q, `${SG.ex}${n}x`, p.x); bbSet(q, `${SG.ex}${n}y`, p.y); bbSet(q, `${SG.ex}${n}z`, p.z);
}

function hasPellet(sim: Sim, q: Ant): boolean {
  return q.carry.kind === 'item' && isPlugPellet(sim.stores.items.get(q.carry.id));
}

/** Begins one plug aimed at `aim` where she stands; false when it cannot start here (the guide then re-plans). */
function plugHere(sim: Sim, q: Ant, aim: Vec3): boolean {
  if (!hasPellet(sim, q)) return false;
  const nest = foundingNestOf(sim);
  if (!nest || !plugKeepsQueenInside(sim, nest, q, aim)) return false;
  // a little inside the action's reach: the command starts the plug at the next tick, after she settles
  // the aim within her plug reach (a little inside it: the command starts the plug at the next tick)
  const e = entranceToSeal(sim, nest);
  const reach = aimReachMm(sim, q.lengthBu * sim.world.bu) - SEAL_COMMAND_MARGIN_BU * sim.world.bu;
  if (!e || Math.hypot(aim.x - q.pos.x, aim.y - q.pos.y, aim.z - q.pos.z) > reach) return false;
  // and settled (not sliding or falling: on a steep wall she may still be moving when the input stops)
  if (q.medium === 'air' || q.speed > SEAL_SETTLED_SPEED_BU_S * sim.world.bu) return false;
  // stand still for it: movement input would cancel the plug (GDD 01 §7.2 movement interrupt)
  if (!possessed(sim, q)) { sim.enqueue({ type: 'possess', antId: q.id }); return false; }
  setIntent(sim, q, null);
  // the same command the player's E sends, aimed at the leak (the colony module may not import the action library)
  sim.enqueue({ type: 'action', actionId: 'seal-entrance', phase: 'start', target: { kind: 'entrance', id: e.id, pos: { x: aim.x, y: aim.y, z: aim.z } } });
  bbSet(q, SG.total, bbGet(q, SG.total, 0) + 1);
  bbSet(q, SG.plugs, bbGet(q, SG.plugs, 0) + 1);
  bbSet(q, SG.state, PLUG);
  bbSet(q, SG.since, sim.state.tick);
  // progress: the stands given up so far may serve again around the new plug
  bbSet(q, SG.replans, 0);
  clearExcluded(q);
  return true;
}

/** The plan under the guide's current strategy (SEAL_STRATEGIES). */
function strategyOf(q: Ant) {
  return SEAL_STRATEGIES[bbGet(q, SG.strategy, 0) % SEAL_STRATEGIES.length];
}

/** No plug for SEAL_STRATEGY_TICKS (or a strategy out of stands): the next strategy, fresh stands, plan again. */
function changeStrategy(sim: Sim, q: Ant): void {
  bbSet(q, SG.strategy, (bbGet(q, SG.strategy, 0) + 1) % SEAL_STRATEGIES.length);
  bbSet(q, SG.changes, bbGet(q, SG.changes, 0) + 1);
  bbSet(q, SG.plugs, 0);
  bbSet(q, SG.replans, 0);
  bbSet(q, SG.progress, sim.state.tick);
  clearExcluded(q);
  if (possessed(sim, q)) setIntent(sim, q, null); else navStop(sim, q);
  plan(sim, q);
}

function aimOf(q: Ant): Vec3 {
  return { x: bbGet(q, SG.tx, q.pos.x), y: bbGet(q, SG.ty, q.pos.y), z: bbGet(q, SG.tz, q.pos.z) };
}

function planNow(sim: Sim, q: Ant): SealPlan | null {
  const nest = foundingNestOf(sim);
  // plugs past the throat sphere only once a strategy got stuck laying them inside it (sealPlan.ts plugInThroat)
  const deepOk = bbGet(q, SG.changes, 0) >= SEAL_DEEP_AFTER_CHANGES;
  return nest ? planSeal(sim, nest, q, excluded(q), SEAL_EXCLUDE_BU * sim.world.bu, strategyOf(q), deepOk) : null;
}

/** Nothing to tamp, or shut off from the cell: down toward it until the soil rule finds a wall to scrape. */
function toSoil(sim: Sim, q: Ant, nest: Nest): void {
  bbSet(q, SG.state, SOIL);
  bbSet(q, SG.since, sim.state.tick);
  soilWalk(sim, q, nest);
}

/** Plans the next step: plug here, walk to a stand, or stop (sealed, nothing to plug, or stuck). */
function plan(sim: Sim, q: Ant): void {
  const nest = foundingNestOf(sim);
  if (!nest) { stop(sim, q, IDLE); return; }
  if (bbGet(q, SG.plugs, 0) >= SEAL_MAX_PLUGS) { stop(sim, q, STUCK); return; }
  if (!queenInCavity(sim, nest, q)) { toBack(sim, q); return; } // out of her cavity: back in first
  const p = planNow(sim, q);
  if (!p) { stop(sim, q, IDLE); return; }
  bbSet(q, SG.tx, p.aim.x); bbSet(q, SG.ty, p.aim.y); bbSet(q, SG.tz, p.aim.z);
  if (!hasPellet(sim, q)) { toSoil(sim, q, nest); return; }
  if (p.here.ok && plugHere(sim, q, p.aim)) return;
  if (!p.stand) {
    // in reach but not ready to plug this tick (still sliding): try again shortly; else nothing to walk to
    if (p.here.ok) { bbSet(q, SG.sx, q.pos.x); bbSet(q, SG.sy, q.pos.y); bbSet(q, SG.sz, q.pos.z); bbSet(q, SG.state, WALK); bbSet(q, SG.since, sim.state.tick); return; }
    stop(sim, q, STUCK);
    return;
  }
  bbSet(q, SG.sx, p.stand.x); bbSet(q, SG.sy, p.stand.y); bbSet(q, SG.sz, p.stand.z);
  bbSet(q, SG.lx, -1);
  bbSet(q, SG.state, WALK);
  bbSet(q, SG.since, sim.state.tick);
  if (!possessed(sim, q)) navTo(sim, q, p.stand, SEAL_STAND_TOL_BU * sim.world.bu);
}

function foundingNestOf(sim: Sim): Nest | undefined {
  const col = sim.stores.colonies.get(sim.state.player.colonyId) ?? sim.state.colonies[0];
  if (!col) return undefined;
  for (const id of col.nestIds) { const n = sim.stores.nests.get(id); if (n && n.alive) return n; }
  return undefined;
}

/** Where she should walk for soil when none can be scraped at the stand: toward the cell. */
function soilWalk(sim: Sim, q: Ant, nest: Nest): void {
  const c = floodStart(sim, nest);
  if (possessed(sim, q)) steer(sim, q, nest, c);
  else navTo(sim, q, c, SEAL_STAND_TOL_BU * sim.world.bu);
}

/**
 * The possessed queen's own movement input toward `to`: along a route through the cavity (a waypoint
 * SEAL_WAYPOINT_BU ahead), or, when she is out of the cavity, toward the opening and down into it.
 */
function steer(sim: Sim, q: Ant, nest: Nest, to: Vec3): void {
  const bu = sim.world.bu, v = sim.carve.voxel, p = { x: 0, y: 0, z: 0 };
  const route = cavityRoute(sim, q.pos, to, SEAL_ROUTE_MAX_SAMPLES);
  if (!route) {
    const e = entranceToSeal(sim, nest) ?? nest.entrances[0];
    const at = e ? { x: e.pos.x - e.dir.x * bu, y: e.pos.y - e.dir.y * bu, z: e.pos.z - e.dir.z * bu } : to;
    setIntent(sim, q, unit(q.pos, at));
    return;
  }
  // the first waypoint along the route that lies along the surface she walks on (a walker cannot follow a direction
  // straight off the surface: the tangent part of the input is what moves her)
  let best: Vec3 | null = null, bestT = 0;
  for (const k of route) {
    keyPos(sim, k, p);
    const d = Math.hypot(p.x - q.pos.x, p.y - q.pos.y, p.z - q.pos.z);
    if (d < SEAL_WAYPOINT_BU * bu - v) continue;
    const u = unit(q.pos, p), n = u.x * q.up.x + u.y * q.up.y + u.z * q.up.z;
    const t = { x: u.x - n * q.up.x, y: u.y - n * q.up.y, z: u.z - n * q.up.z }, tl = Math.hypot(t.x, t.y, t.z);
    if (tl > bestT) { bestT = tl; best = { x: t.x / tl, y: t.y / tl, z: t.z / tl }; }
    if (tl >= SEAL_WAYPOINT_TANGENT) break;
  }
  setIntent(sim, q, best ?? unit(q.pos, to));
}

function diff(a: Vec3, b: Vec3): [number, number, number] {
  return [a.x - b.x, a.y - b.y, a.z - b.z];
}

function unit(from: Vec3, to: Vec3): Vec3 {
  const x = to.x - from.x, y = to.y - from.y, z = to.z - from.z, l = Math.hypot(x, y, z) || 1;
  return { x: x / l, y: y / l, z: z / l };
}

/** The stand cannot be reached or plugs nothing: exclude it and plan again (the next strategy after SEAL_MAX_REPLANS). */
function giveUp(sim: Sim, q: Ant, s: Vec3): void {
  exclude(q, s);
  bbSet(q, SG.replans, bbGet(q, SG.replans, 0) + 1);
  if (bbGet(q, SG.replans, 0) > SEAL_MAX_REPLANS) { changeStrategy(sim, q); return; }
  plan(sim, q);
}

/**
 * Below the ground in the throat of one of her cavity's openings. A queen there with no soil in her mandibles goes on
 * with the soil rule (SOIL) even when a plug has narrowed the throat so far that she counts as out of the cavity
 * (colony-life round 9, woodland-edge #4 at the start pose: SOIL sent her BACK, BACK found her in again and planned
 * SOIL, every 5-12 ticks for 5500 ticks; the soil bite's SEAL_SOIL_WAIT_TICKS never came and the seal never ended).
 */
function inOwnThroat(sim: Sim, nest: Nest, q: Ant): boolean {
  return depthBelowGround(sim, q) > 0 && cavityEntrances(sim, nest).some((e) => inThroatOf(sim, q, e));
}

function soilTick(sim: Sim, q: Ant, nest: Nest): void {
  if (!queenInCavity(sim, nest, q) && !inOwnThroat(sim, nest, q)) { toBack(sim, q); return; }
  if (hasPellet(sim, q)) {
    if (possessed(sim, q)) setIntent(sim, q, null); else navStop(sim, q);
    plan(sim, q);
    return;
  }
  const t = sim.state.tick - bbGet(q, SG.since, sim.state.tick);
  if (t > SEAL_WALK_MAX_TICKS) { stop(sim, q, STUCK); return; }
  // no wall to scrape here (the soil rule spares the plug and the ground surface): a bite down toward the cell,
  // away from both, gives the soil
  // (down toward the cell: in a throat that digs its inner side, the cell's side of the plugs, never toward the opening)
  if (t > SEAL_SOIL_WAIT_TICKS && t % SEAL_UNPOCKET_EVERY_TICKS === 0) {
    if (possessed(sim, q)) setIntent(sim, q, null); else navStop(sim, q);
    if (biteToward(sim, q, floodStart(sim, nest))) return;
  }
  if (t <= SEAL_SOIL_WAIT_TICKS) soilWalk(sim, q, nest);
}

/** Out of her cavity: walk back in (backTick) before anything else. */
function toBack(sim: Sim, q: Ant): void {
  bbSet(q, SG.state, BACK);
  bbSet(q, SG.lx, -1);
  bbSet(q, SG.mouth, 0);
  bbSet(q, SG.bit, 0);
  bbSet(q, SG.since, sim.state.tick);
}

/**
 * Where she gets back into her cavity from outside: the last cavity sample of the cell's shortest way to the air
 * (just inside the opening it leaves by); null when the cell no longer reaches the air (a plug shut her out).
 */
function wayIn(sim: Sim, nest: Nest): Vec3 | null {
  const path = floodCavity(sim, floodStart(sim, nest)).path;
  return path && path.length >= 2 ? keyPos(sim, path[path.length - 2], { x: 0, y: 0, z: 0 }) : null;
}

/** The opening of her cavity nearest to her (the plugged throat she was shut out of), or null. */
function nearestOpening(sim: Sim, nest: Nest, q: Ant): Entrance | null {
  let best: Entrance | null = null, bestD = Infinity;
  for (const e of cavityEntrances(sim, nest)) {
    const d = Math.hypot(e.pos.x - q.pos.x, e.pos.y - q.pos.y, e.pos.z - q.pos.z);
    if (d < bestD) { best = e; bestD = d; }
  }
  return best;
}

/** Her own movement input toward `to` (possessed), else locomotion; a failed walk hands her to the guide's input. */
function headFor(sim: Sim, q: Ant, to: Vec3, fresh: boolean): void {
  if (possessed(sim, q)) { setIntent(sim, q, unit(q.pos, to)); return; }
  if (q.nav.status === 'failed') { sim.enqueue({ type: 'possess', antId: q.id }); return; }
  if (fresh || q.nav.status !== 'moving') navTo(sim, q, to, SEAL_STAND_TOL_BU * sim.world.bu);
}

/**
 * Out of her cavity (state BACK). While the cell still reaches the air she walks in by that way (over the lip and
 * down: the walker follows the surface part of the input). Shut out (no way in: her own plug lies between her and
 * the cell) she walks to the plugged opening and, standing over it, bites down through the loose fill toward the
 * cavity beneath it, about one bite per SEAL_UNPOCKET_EVERY_TICKS. Back inside, the guide plans again.
 */
function backTick(sim: Sim, q: Ant, nest: Nest): void {
  if (queenInCavity(sim, nest, q)) {
    if (possessed(sim, q)) setIntent(sim, q, null); else navStop(sim, q);
    plan(sim, q);
    return;
  }
  const t = sim.state.tick - bbGet(q, SG.since, sim.state.tick);
  const way = wayIn(sim, nest);
  if (way) {
    // stalled in the throat on the way in (colony-life round 9: a queen wedged beside her own half-laid plug,
    // possessed, stood still for 5600 ticks and the seal never finished; suburban-garden #4 at the start pose): no
    // progress toward the way in over SEAL_STALL_TICKS, and she bites toward it (loose plug soil gives way), then walks
    // on. Only in the throat of her opening: a bite from the ground beside it would start a new hole.
    const d = Math.hypot(way.x - q.pos.x, way.y - q.pos.y, way.z - q.pos.z);
    if (t === 0 || bbGet(q, SG.lx, -1) < 0) bbSet(q, SG.lx, d);
    else if (t % SEAL_STALL_TICKS === 0) {
      const before = bbGet(q, SG.lx, d);
      bbSet(q, SG.lx, d);
      const e = nearestOpening(sim, nest, q);
      if (before - d < SEAL_STALL_BU * sim.world.bu && e && inThroatOf(sim, q, e)) {
        if (possessed(sim, q)) setIntent(sim, q, null); else navStop(sim, q);
        if (biteToward(sim, q, way)) return;
      }
    }
    headFor(sim, q, way, t === 0);
    return;
  }
  const e = nearestOpening(sim, nest, q);
  if (!e) { stop(sim, q, STUCK); return; }
  // over the opening itself (on the fill that shut her out) first, never anywhere in the throat sphere around it: a
  // bite from the ground beside the opening would start a new hole; from there on down the cut while in the throat
  const over = Math.hypot(q.pos.x - e.pos.x, q.pos.z - e.pos.z) <= e.radius + SEAL_STAND_TOL_BU * sim.world.bu;
  if (over) bbSet(q, SG.mouth, 1);
  if (bbGet(q, SG.mouth, 0) !== 1 || !inThroatOf(sim, q, e)) { bbSet(q, SG.mouth, 0); headFor(sim, q, e.pos, t === 0); return; }
  const face = innerFace(sim, nest, e.pos);
  if (t % SEAL_UNPOCKET_EVERY_TICKS === 0) {
    if (possessed(sim, q)) setIntent(sim, q, null); else navStop(sim, q);
    bbSet(q, SG.bit, biteToward(sim, q, face) ? 1 : 0);
  }
  // a bite that found nothing in reach: a step on down into the cut toward the cavity
  if (bbGet(q, SG.bit, 0) === 0) headFor(sim, q, face, t % SEAL_UNPOCKET_EVERY_TICKS === 0);
}

/** The cell's cavity sample nearest `p` (below a plug in the throat: the plug's inner face), else the cell. */
function innerFace(sim: Sim, nest: Nest, p: Vec3): Vec3 {
  const at = { x: 0, y: 0, z: 0 };
  let best = floodStart(sim, nest), bestD = Infinity;
  for (const k of floodCavity(sim, floodStart(sim, nest)).cavity.keys()) {
    keyPos(sim, k, at);
    const d = Math.hypot(at.x - p.x, at.y - p.y, at.z - p.z);
    if (d < bestD) { bestD = d; best = { x: at.x, y: at.y, z: at.z }; }
  }
  return best;
}

function walkTick(sim: Sim, q: Ant, nest: Nest): void {
  const s = { x: bbGet(q, SG.sx, q.pos.x), y: bbGet(q, SG.sy, q.pos.y), z: bbGet(q, SG.sz, q.pos.z) };
  const t = sim.state.tick - bbGet(q, SG.since, sim.state.tick);
  const d = Math.hypot(s.x - q.pos.x, s.y - q.pos.y, s.z - q.pos.z);
  const arrived = d <= SEAL_STAND_TOL_BU * sim.world.bu || (!possessed(sim, q) && q.nav.status === 'arrived');
  if (arrived) {
    if (!hasPellet(sim, q)) {
      if (t > SEAL_WALK_MAX_TICKS) { giveUp(sim, q, s); return; }
      if (possessed(sim, q)) setIntent(sim, q, null);
      if (t > SEAL_SOIL_WAIT_TICKS) soilWalk(sim, q, nest);
      return;
    }
    if (possessed(sim, q)) setIntent(sim, q, null); else navStop(sim, q);
    const p = planNow(sim, q);
    if (!p) { stop(sim, q, IDLE); return; }
    if (p.here.ok && plugHere(sim, q, p.aim)) return;
    // settling (a walker still sliding on a steep wall): wait a moment, then give the stand up
    if (p.here.ok && t <= SEAL_WALK_MAX_TICKS) return;
    giveUp(sim, q, s);
    return;
  }
  // on the way, a pose that already reaches a plug across the passage is taken (the walker rarely settles exactly)
  if (t % SEAL_OPPORTUNITY_TICKS === 0 && hasPellet(sim, q) && Math.hypot(...diff(q.pos, aimOf(q))) <= aimReachMm(sim, q.lengthBu * sim.world.bu)) {
    const p = planNow(sim, q);
    if (p && p.here.ok && plugHere(sim, q, p.aim)) return;
  }
  // stalled (a walker that cannot get on toward the stand: a steep wall it slides back down, a lip; viab-loco):
  // no progress toward it over SEAL_STALL_TICKS gives the stand up early
  if (t === 0 || bbGet(q, SG.lx, -1) < 0) bbSet(q, SG.lx, d);
  else if (t % SEAL_STALL_TICKS === 0) {
    const before = bbGet(q, SG.lx, d);
    bbSet(q, SG.lx, d);
    if (before - d < SEAL_STALL_BU * sim.world.bu) { giveUp(sim, q, s); return; }
  }
  if (t > SEAL_WALK_MAX_TICKS || (!possessed(sim, q) && q.nav.status === 'failed')) { giveUp(sim, q, s); return; }
  if (possessed(sim, q)) steer(sim, q, nest, s);
}

/** One tick of the guide (phase `seal`, after the soil rule). */
export function sealGuideTick(sim: Sim, q: Ant, nest: Nest): void {
  listenForSealPresses(sim);
  const ask = bbGet(q, SG.ask, -1);
  if (ask >= 0 && ask !== bbGet(q, SG.seen, -1)) {
    bbSet(q, SG.seen, ask);
    requestSeal(sim, q, false);
    return;
  }
  const state = bbGet(q, SG.state, IDLE);
  if (state === STUCK) {
    // never a dead end, never the same attempt again: after a pause, the next strategy from wherever she is now
    if (sim.state.tick - bbGet(q, SG.since, sim.state.tick) >= SEAL_STRATEGY_TICKS) changeStrategy(sim, q);
    return;
  }
  if (state === IDLE) {
    // idle (no request yet, or the player took her back): only a press of E or the passive player's clock starts the
    // guide; never while the player is steering her
    const idleTicks = sim.state.tick - Math.max(sim.state.player.lastInputTick, 0);
    const passive = !possessed(sim, q) || (idleTicks >= OPEN_AUTO_SEAL_GD * TICKS_PER_DAY && !playerTookOver(sim, q));
    const cooled = sim.state.tick - bbGet(q, SG.autoTick, -1e9) >= SEAL_WALK_MAX_TICKS;
    if (passive && cooled && phaseAgeGd(sim, q) >= OPEN_AUTO_SEAL_GD) {
      bbSet(q, SG.autoTick, sim.state.tick);
      requestSeal(sim, q, true);
    }
    return;
  }
  if (playerTookOver(sim, q)) { bbSet(q, SG.state, IDLE); return; }
  if (state === PLUG) {
    if (q.action && q.action.id === 'seal-entrance') return;
    const age = sim.state.tick - bbGet(q, SG.since, sim.state.tick);
    if (age < 1) return; // the command starts the plug at the next tick
    if (age < SEAL_ENTRANCE_S * TICKS_PER_SECOND) {
      // it ended early (cancelled, or deferred: she was not in reach after all): not a plug
      bbSet(q, SG.total, bbGet(q, SG.total, 0) - 1);
      bbSet(q, SG.plugs, bbGet(q, SG.plugs, 0) - 1);
    } else {
      bbSet(q, SG.progress, sim.state.tick);
    }
    plan(sim, q);
    return;
  }
  // the watchdog (viab-founding item 2): no plug for SEAL_STRATEGY_TICKS while a request runs -> another strategy
  if (sim.state.tick - bbGet(q, SG.progress, sim.state.tick) >= SEAL_STRATEGY_TICKS) { changeStrategy(sim, q); return; }
  if (q.action) return; // a bite or anything else under way ends first
  if (state === SOIL) { soilTick(sim, q, nest); return; }
  if (state === BACK) { backTick(sim, q, nest); return; }
  walkTick(sim, q, nest);
}

/** The guide's read-out for the view and the prompts. */
export function sealGuideView(sim: Sim, q: Ant | undefined): { state: 'idle' | 'walking' | 'plugging' | 'stuck'; stand: Vec3 | null; plugs: number } | null {
  if (!q) return null;
  const s = bbGet(q, SG.state, IDLE);
  const state = s === WALK || s === SOIL || s === BACK ? 'walking' : s === PLUG ? 'plugging' : s === STUCK ? 'stuck' : 'idle';
  const stand = s === WALK ? { x: bbGet(q, SG.sx, 0), y: bbGet(q, SG.sy, 0), z: bbGet(q, SG.sz, 0) } : null;
  return { state, stand, plugs: bbGet(q, SG.total, 0) };
}
