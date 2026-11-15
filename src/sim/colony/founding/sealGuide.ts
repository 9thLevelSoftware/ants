// Sealing the founding cavity (GDD 06 §5.9; task founding-close §1). In phase `seal`, pressing E (any E-action of
// the queen: seal-entrance, or the put-down / groom / lay-egg that E offers away from the throat) asks the guide to
// seal: it plans from the actual leak (sealPlan.ts), walks the queen to a stand from which the real `seal-entrance`
// plug lands across the leak (by her own movement input when possessed, by locomotion otherwise), begins the
// action, and repeats until the entrance is `sealed` (GDD 06 §5.9: holding E repeats the plug about 3 times until
// sealed) or SEAL_MAX_PLUGS plugs were placed. Movement input from the player takes the queen back at once. The
// passive player (OPEN_AUTO_SEAL_GD without input) and cheat.completeFounding use the same guide.

import type { Vec3 } from '@/core/math/vec3';
import type { ActionId, Ant, Nest, Sim } from '@/sim/types';
import { INPUT_DEADZONE, SEAL_ENTRANCE_S } from '@/sim/balance/actions';
import {
  OPEN_AUTO_SEAL_GD, SEAL_EXCLUDE_BU, SEAL_FACE_MAG, SEAL_FACE_TICKS, SEAL_MAX_PLUGS, SEAL_MAX_REPLANS,
  SEAL_COMMAND_MARGIN_BU, SEAL_OPPORTUNITY_TICKS, SEAL_SETTLED_SPEED_BU_S, SEAL_ROUTE_MAX_SAMPLES, SEAL_UNPOCKET_EVERY_TICKS, SEAL_SOIL_WAIT_TICKS, SEAL_STAND_TOL_BU, SEAL_WALK_MAX_TICKS, SEAL_WAYPOINT_BU, SEAL_WAYPOINT_TANGENT,
} from '@/sim/balance/founding';
import { navStop, navTo } from '@/sim/locomotion';
import { TICKS_PER_DAY, TICKS_PER_SECOND } from '@/sim/time';
import { bbGet, bbSet, foundingQueen, openingOf, phaseAgeGd } from './access';
import { cavityRoute, floodStart, keyPos } from './leak';
import { biteToward } from './seal';
import { entranceToSeal, inSealReach, planSeal, plugKeepsQueenInside, queenInCavity } from './sealPlan';

/** Guide state on the queen (ant.bb, numbers only). */
export const SG = {
  state: 'fd.sg', // 0 idle, 1 walking to the stand, 2 plugging, 3 stuck (no stand reachable), 4 facing the leak, 5 fetching soil
  ask: 'fd.sgAsk', // tick of the latest E press in phase `seal`
  seen: 'fd.sgSeen', // the ask tick already acted on
  auto: 'fd.sgAuto',
  autoTick: 'fd.sgAutoTick', // last passive request
  since: 'fd.sgTick',
  sx: 'fd.sgSx', sy: 'fd.sgSy', sz: 'fd.sgSz',
  tx: 'fd.sgTx', ty: 'fd.sgTy', tz: 'fd.sgTz', // where she should face at the stand
  dx: 'fd.sgDx', dy: 'fd.sgDy', dz: 'fd.sgDz', // movement input the guide wrote (to tell the player's apart)
  plugs: 'fd.sgPlugs', // plugs of this request
  total: 'fd.sgTotal', // seal-entrance actions begun by the guide in this opening
  replans: 'fd.sgReplans',
  ex: 'fd.sgEx', // excluded stands: fd.sgEx0x.. (up to SEAL_MAX_REPLANS)
} as const;

const IDLE = 0, WALK = 1, PLUG = 2, STUCK = 3, FACE = 4, SOIL = 5;

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
  // the guide moves and acts for the queen the way the player does: she must be possessed (she is, in the game)
  if (!possessed(sim, q)) sim.enqueue({ type: 'possess', antId: q.id });
  bbSet(q, SG.state, IDLE);
  bbSet(q, SG.auto, auto ? 1 : 0);
  bbSet(q, SG.plugs, 0);
  bbSet(q, SG.replans, 0);
  clearExcluded(q);
  if (q.action && q.action.id === 'seal-entrance') {
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
  return q.carry.kind === 'item' && sim.stores.items.get(q.carry.id)?.kind === 'soil-pellet';
}

/** Begins one plug where she stands; false when the action refused (it then re-plans). */
function plugHere(sim: Sim, q: Ant): boolean {
  if (!hasPellet(sim, q)) return false;
  const nest = foundingNestOf(sim);
  if (!nest || !plugKeepsQueenInside(sim, nest, q)) return false;
  // a little inside the action's reach: the command starts the plug at the next tick, after she settles
  const e = entranceToSeal(sim, nest);
  if (!e || !inSealReach(sim, e, q.pos, SEAL_COMMAND_MARGIN_BU * sim.world.bu)) return false;
  // and settled (not sliding or falling: on a steep wall she may still be moving when the input stops)
  if (q.medium === 'air' || q.speed > SEAL_SETTLED_SPEED_BU_S * sim.world.bu) return false;
  // stand still for it: movement input would cancel the plug (GDD 01 §7.2 movement interrupt)
  if (!possessed(sim, q)) { sim.enqueue({ type: 'possess', antId: q.id }); return false; }
  setIntent(sim, q, null);
  // the same command the player's E sends (the colony module may not import the action library: import cycle)
  sim.enqueue({ type: 'action', actionId: 'seal-entrance', phase: 'start' });
  bbSet(q, SG.total, bbGet(q, SG.total, 0) + 1);
  bbSet(q, SG.plugs, bbGet(q, SG.plugs, 0) + 1);
  bbSet(q, SG.state, PLUG);
  bbSet(q, SG.since, sim.state.tick);
  // progress: the stands given up so far may serve again around the new plug
  bbSet(q, SG.replans, 0);
  clearExcluded(q);
  return true;
}

function planNow(sim: Sim, q: Ant) {
  const nest = foundingNestOf(sim);
  return nest ? planSeal(sim, nest, q, excluded(q), SEAL_EXCLUDE_BU * sim.world.bu) : null;
}

function targetOf(q: Ant): Vec3 {
  return { x: bbGet(q, SG.tx, q.pos.x), y: bbGet(q, SG.ty, q.pos.y), z: bbGet(q, SG.tz, q.pos.z) };
}

/**
 * In reach but her pose would plug beside the leak: she turns toward it (her own slow movement input when possessed)
 * for a moment, then plugs.
 */
function face(sim: Sim, q: Ant): void {
  bbSet(q, SG.state, FACE);
  bbSet(q, SG.since, sim.state.tick);
  if (!possessed(sim, q)) navStop(sim, q); // locomotion leaves her facing the way she came: up the shaft
}

function faceTick(sim: Sim, q: Ant): void {
  const t = sim.state.tick - bbGet(q, SG.since, sim.state.tick);
  const p = planNow(sim, q);
  if (!p) { stop(sim, q, IDLE); return; }
  if (!hasPellet(sim, q)) { if (t > SEAL_FACE_TICKS) giveUp(sim, q, q.pos); return; }
  if (p.here.ok) {
    // stop here and plug once she has settled
    if (possessed(sim, q)) setIntent(sim, q, null); else navStop(sim, q);
    if (plugHere(sim, q)) return;
    if (t < SEAL_FACE_TICKS) return;
  }
  if (!p.inReach || t >= SEAL_FACE_TICKS) {
    // this stand does not give a plug across the leak after all: another one
    if (possessed(sim, q)) setIntent(sim, q, null);
    giveUp(sim, q, { x: bbGet(q, SG.sx, q.pos.x), y: bbGet(q, SG.sy, q.pos.y), z: bbGet(q, SG.sz, q.pos.z) });
    return;
  }
  if (possessed(sim, q)) {
    const u = unit(q.pos, targetOf(q));
    setIntent(sim, q, { x: u.x * SEAL_FACE_MAG, y: u.y * SEAL_FACE_MAG, z: u.z * SEAL_FACE_MAG });
  }
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
  if (!queenInCavity(sim, nest, q)) { toSoil(sim, q, nest); return; } // shut off from her cell: back in first
  const p = planSeal(sim, nest, q, excluded(q), SEAL_EXCLUDE_BU * sim.world.bu);
  if (!p) { stop(sim, q, IDLE); return; }
  if (p.here.ok && (p.here.cuts || !p.standCuts) && hasPellet(sim, q)) {
    if (plugHere(sim, q)) return;
  }
  bbSet(q, SG.tx, p.standAim.x); bbSet(q, SG.ty, p.standAim.y); bbSet(q, SG.tz, p.standAim.z);
  if (!hasPellet(sim, q)) { toSoil(sim, q, nest); return; }
  if (!p.stand) {
    if (!p.inReach) { stop(sim, q, STUCK); return; }
    bbSet(q, SG.sx, q.pos.x); bbSet(q, SG.sy, q.pos.y); bbSet(q, SG.sz, q.pos.z);
    face(sim, q);
    return;
  }
  bbSet(q, SG.sx, p.stand.x); bbSet(q, SG.sy, p.stand.y); bbSet(q, SG.sz, p.stand.z);
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
  const c = floodStart(nest);
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

function unit(from: Vec3, to: Vec3): Vec3 {
  const x = to.x - from.x, y = to.y - from.y, z = to.z - from.z, l = Math.hypot(x, y, z) || 1;
  return { x: x / l, y: y / l, z: z / l };
}

/** The stand cannot be reached or plugs nothing: exclude it and plan again (STUCK after SEAL_MAX_REPLANS). */
function giveUp(sim: Sim, q: Ant, s: Vec3): void {
  exclude(q, s);
  bbSet(q, SG.replans, bbGet(q, SG.replans, 0) + 1);
  if (bbGet(q, SG.replans, 0) > SEAL_MAX_REPLANS) { stop(sim, q, STUCK); return; }
  plan(sim, q);
}

function soilTick(sim: Sim, q: Ant, nest: Nest): void {
  const inside = queenInCavity(sim, nest, q);
  if (!inside) {
    // a plug landed between her and the cell: she bites her way back to it through the loose fill
    if (possessed(sim, q)) setIntent(sim, q, null); else navStop(sim, q);
    const t = sim.state.tick - bbGet(q, SG.since, sim.state.tick);
    if (t % SEAL_UNPOCKET_EVERY_TICKS === 0) biteToward(sim, q, floodStart(nest));
    if (t > SEAL_WALK_MAX_TICKS) bbSet(q, SG.since, sim.state.tick);
    return;
  }
  if (hasPellet(sim, q)) {
    if (possessed(sim, q)) setIntent(sim, q, null); else navStop(sim, q);
    plan(sim, q);
    return;
  }
  const t = sim.state.tick - bbGet(q, SG.since, sim.state.tick);
  if (t > SEAL_WALK_MAX_TICKS) { stop(sim, q, STUCK); return; }
  // no wall to scrape here (the soil rule spares the plug and the ground surface): a bite down toward the cell,
  // away from both, gives the soil
  if (t > SEAL_SOIL_WAIT_TICKS && t % SEAL_UNPOCKET_EVERY_TICKS === 0) {
    if (possessed(sim, q)) setIntent(sim, q, null); else navStop(sim, q);
    if (biteToward(sim, q, floodStart(nest))) return;
  }
  if (t <= SEAL_SOIL_WAIT_TICKS) soilWalk(sim, q, nest);
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
    const p = planNow(sim, q);
    if (!p) { stop(sim, q, IDLE); return; }
    if (p.here.ok && hasPellet(sim, q) && plugHere(sim, q)) return;
    if (p.inReach) { face(sim, q); return; }
    giveUp(sim, q, s);
    return;
  }
  // on the way, a pose that already plugs well enough is taken (the walker rarely settles exactly on the stand)
  if (t % SEAL_OPPORTUNITY_TICKS === 0 && hasPellet(sim, q)) {
    const e = entranceToSeal(sim, nest);
    if (e && inSealReach(sim, e, q.pos)) {
      const p = planNow(sim, q);
      if (p && p.here.ok && plugHere(sim, q)) return;
    }
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
    // never a dead end: after a pause the guide tries again from wherever she is now
    if (sim.state.tick - bbGet(q, SG.since, sim.state.tick) >= SEAL_WALK_MAX_TICKS) requestSeal(sim, q, bbGet(q, SG.auto, 0) === 1);
    return;
  }
  if (state === IDLE && !queenInCavity(sim, nest, q) && bbGet(q, SG.total, 0) > 0) { toSoil(sim, q, nest); return; }
  if (state === IDLE) {
    const idleTicks = sim.state.tick - Math.max(sim.state.player.lastInputTick, 0);
    const passive = !possessed(sim, q) || idleTicks >= OPEN_AUTO_SEAL_GD * TICKS_PER_DAY;
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
      // it ended early (cancelled): not a plug
      bbSet(q, SG.total, bbGet(q, SG.total, 0) - 1);
      bbSet(q, SG.plugs, bbGet(q, SG.plugs, 0) - 1);
    }
    plan(sim, q);
    return;
  }
  if (q.action) return; // a bite or anything else under way ends first
  if (state === FACE) { faceTick(sim, q); return; }
  if (state === SOIL) { soilTick(sim, q, nest); return; }
  walkTick(sim, q, nest);
}

/** The guide's read-out for the view and the prompts. */
export function sealGuideView(sim: Sim, q: Ant | undefined): { state: 'idle' | 'walking' | 'plugging' | 'stuck'; stand: Vec3 | null; plugs: number } | null {
  if (!q) return null;
  const s = bbGet(q, SG.state, IDLE);
  const state = s === WALK || s === FACE || s === SOIL ? 'walking' : s === PLUG ? 'plugging' : s === STUCK ? 'stuck' : 'idle';
  const stand = s === WALK ? { x: bbGet(q, SG.sx, 0), y: bbGet(q, SG.sy, 0), z: bbGet(q, SG.sz, 0) } : null;
  return { state, stand, plugs: bbGet(q, SG.total, 0) };
}
