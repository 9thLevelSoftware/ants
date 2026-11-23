// locomotionSystem: every tick, moves every walker (ants and creatures). Per walker: level of detail (walkers far
// from the observer step every 2 or 4 ticks with a proportionally longer dt; on open ground also with longer
// substeps, still inside the kernel's guard, so the free-space invariant holds), prev* snapshot, re-attachment
// where the carve grid changed, the possessed ant from intent or the AI request, steering, walkerStep, the map
// boundary, grip / slope limits, nest membership (nestId / chamberId), breadcrumbs and path integration. Finally the
// entity index is refreshed for the walkers.

import type { Vec3 } from '@/core/math/vec3';
import type { Ant, Creature, Sim, System, Walker, WalkerParams } from '@/sim/types';
import { AntFlag } from '@/sim/types';
import { isLocoEntityIndex as isLocoEntityIndexImp } from '@/sim/world/entityIndex';
import { isLocoNavGrid as isLocoNavGridImp } from './grid/navGridImpl';
import { clearCrumbs as clearCrumbsImp, integrateHome as integrateHomeImp, recordCrumb as recordCrumbImp, resetHomeVec as resetHomeVecImp, startCrumbs as startCrumbsImp } from './crumbs';
import { set3 as set3Imp } from './mathx';
import { chamberAt as chamberAtImp, nearestOpenEntrance as nearestOpenEntranceImp } from './nests';
import { MATERIAL_GRIP, LOCO_TUNING, tiltLimit as tiltLimitImp } from './params';
import { possessedTick as possessedTickImp } from './possessed';
import { antGrid as antGridImp, ensureGrid as ensureGridImp, fillCrowd as fillCrowdImp, rt as rtImp, type LocoRuntime } from './runtime';
import { walkerId as walkerIdImp, type NavScratch } from './scratch';
import { addAvoidRepulsion as addAvoidRepulsionImp, addEdgeRepulsion as addEdgeRepulsionImp, addFloorBias as addFloorBiasImp, addSeparation as addSeparationImp, turnToward as turnTowardImp } from './steer';
import { walkerLetGo as walkerLetGoImp, walkerPlace as walkerPlaceImp, walkerSnapshot as walkerSnapshotImp, walkerStep as walkerStepImp, walkerSurfaceChanged as walkerSurfaceChangedImp, type WalkStatus } from './walker';
import { aiUpdate as aiUpdateImp, nestIdOf as nestIdOfImp } from './update';
import { walkerNest as walkerNestImp } from './trip';
import { syncPuddles as syncPuddlesImp } from './puddles';
import { forgetStall as forgetStallImp, pruneStalls as pruneStallsImp, watchStall as watchStallImp } from './stallWatch';
import { isStunned as isStunnedImp, walkerUnderWater as walkerUnderWaterImp, wetGripMult as wetGripMultImp } from './weather';
import { pauseStall as pauseStallImp } from './stuck';

// Hot imports re-bound as local consts (Vitest reads imported bindings through getters; see 02-kernel.md §2.11).
const antGrid = antGridImp, fillCrowd = fillCrowdImp, isLocoEntityIndex = isLocoEntityIndexImp, isLocoNavGrid = isLocoNavGridImp, clearCrumbs = clearCrumbsImp, integrateHome = integrateHomeImp, recordCrumb = recordCrumbImp, resetHomeVec = resetHomeVecImp, startCrumbs = startCrumbsImp, set3 = set3Imp, chamberAt = chamberAtImp, nearestOpenEntrance = nearestOpenEntranceImp, tiltLimit = tiltLimitImp, possessedTick = possessedTickImp, ensureGrid = ensureGridImp, rt = rtImp, walkerId = walkerIdImp, addAvoidRepulsion = addAvoidRepulsionImp, addEdgeRepulsion = addEdgeRepulsionImp, addFloorBias = addFloorBiasImp, addSeparation = addSeparationImp, turnToward = turnTowardImp, walkerLetGo = walkerLetGoImp, walkerPlace = walkerPlaceImp, walkerSnapshot = walkerSnapshotImp, walkerStep = walkerStepImp, walkerSurfaceChanged = walkerSurfaceChangedImp, aiUpdate = aiUpdateImp, nestIdOf = nestIdOfImp, walkerNest = walkerNestImp, syncPuddles = syncPuddlesImp, watchStall = watchStallImp, forgetStall = forgetStallImp, pruneStalls = pruneStallsImp, pauseStall = pauseStallImp, isStunned = isStunnedImp, walkerUnderWater = walkerUnderWaterImp, wetGripMult = wetGripMultImp;

const TICK_S = 0.1;
const SLIP_EVERY = LOCO_TUNING.slipCheckEveryTicks, STAND_CHECK_EVERY = LOCO_TUNING.standCheckEveryTicks;
const _desired: Vec3 = { x: 0, y: 0, z: 0 }, _obs: Vec3 = { x: 0, y: 0, z: 0 };
const coarse = new WeakMap<WalkerParams, WalkerParams>();

function coarseParams(base: WalkerParams, substep: number): WalkerParams {
  let p = coarse.get(base);
  if (!p) { p = { ...base, maxSubstep: Math.max(base.maxSubstep, substep) }; coarse.set(base, p); }
  return p;
}

/** Observer for LOD: explicit, else the possessed ant, else the player's first nest, else none. */
function observer(sim: Sim, r: LocoRuntime): Vec3 | null {
  if (r.observer) return r.observer;
  const pa = sim.stores.ants.get(sim.state.player.possessedAntId);
  if (pa) return pa.pos;
  const colony = sim.state.colonies[0];
  const nest = colony ? sim.stores.nests.get(colony.nestIds[0] ?? -1) : undefined;
  if (nest) return set3(_obs, nest.origin.x, nest.origin.y, nest.origin.z);
  return null;
}

function lodEvery(w: Walker, obs: Vec3 | null, r: LocoRuntime): number {
  if (!obs || w.medium !== 'surface') return 1;
  const dx = w.pos.x - obs.x, dz = w.pos.z - obs.z, d2 = dx * dx + dz * dz;
  if (d2 < r.P.lodNear * r.P.lodNear) return 1;
  const k = d2 < r.P.lodFar * r.P.lodFar ? r.P.lodMid : r.P.lodFarEvery;
  return w.nav.loco?.req === 'trail' ? Math.min(k, r.P.lodTrailMax) : k;
}

/**
 * After the carve grid changed (any brush or fill since the last tick), a walker no longer on its level set
 * re-attaches (or falls) and replans. The test reads only state, so a restored save behaves like the original.
 */
function surfaceCheck(sim: Sim, w: Walker, r: LocoRuntime): void {
  if (w.medium === 'air' || sim.field.isNearLevel(w.pos.x, w.pos.y, w.pos.z, w.footOffset, r.P.surfaceTol)) return;
  walkerSurfaceChanged(sim.field, w, sim.kernel.walker);
  const sc = w.nav.loco;
  if (sc) { sc.planTick = -1; sc.open = -1; }
  r.stats.surfaceChanged++;
}

/**
 * Hard map limit (GDD 04 §14): positions are kept inside [8 BU, side - 8 BU]. The walker is put back on the surface
 * a little inside the limit (a projection onto a steep face there may slide it a hair outward); if it still ends
 * outside, the coordinate is clamped.
 */
export function clampToMap(sim: Sim, w: Walker, r: LocoRuntime): void {
  const lo = r.P.edgeHard, hi = sim.world.size - r.P.edgeHard;
  const x = w.pos.x, z = w.pos.z;
  if (x >= lo && x <= hi && z >= lo && z <= hi) return;
  r.stats.edgeClamps++;
  const inset = r.P.edgeInset;
  const cx = x < lo ? lo + inset : x > hi ? hi - inset : x, cz = z < lo ? lo + inset : z > hi ? hi - inset : z;
  const p = { x: cx, y: Math.max(w.pos.y, sim.field.height(cx, cz) + 2 * r.P.bu), z: cz };
  if (!walkerPlace(sim.field, w, p, {}, sim.kernel.walker)) { w.pos.x = cx; w.pos.z = cz; }
  if (w.pos.x < lo) w.pos.x = lo; else if (w.pos.x > hi) w.pos.x = hi;
  if (w.pos.z < lo) w.pos.z = lo; else if (w.pos.z > hi) w.pos.z = hi;
}

/** GDD 04 §3: a surface tilted beyond what its grip holds makes the walker let go. */
function slopeSlip(sim: Sim, w: Walker, id: number, r: LocoRuntime): void {
  if (w.medium === 'air' || (sim.state.tick + id) % SLIP_EVERY !== 0) return;
  if (w.up.y > Math.cos((LOCO_TUNING.tiltMaxLowGrip * Math.PI) / 180)) return;
  const grip = (MATERIAL_GRIP[sim.field.materialAt(w.pos)] ?? LOCO_TUNING.gripDefault) * wetGripMult(sim, w, r);
  const tilt = Math.acos(Math.max(-1, Math.min(1, w.up.y)));
  if (tilt <= tiltLimit(grip) + 1e-6) return;
  walkerLetGo(sim.field, w, 0, sim.kernel.walker);
  r.stats.slips++;
}

/** nestId / chamberId, and the crumb trail and home vector when an ant enters or leaves a nest. */
function membership(sim: Sim, ant: Ant, r: LocoRuntime): void {
  const prev = ant.nestId;
  const now = walkerNest(sim, ant, prev);
  if (now !== prev) {
    ant.flags &= ~AntFlag.HOMING; // a new trip (or the end of one)
    if (now >= 0) { clearCrumbs(ant); resetHomeVec(ant, null); }
    else if (prev >= 0) {
      const e = nearestOpenEntrance(sim, prev, ant.pos);
      startCrumbs(ant, e ? e.pos : ant.pos);
      resetHomeVec(ant, e ? e.pos : ant.pos);
      if (e) ant.mem.homeEntranceId = e.id;
    }
    ant.nestId = now;
  }
  if (now >= 0) {
    const nest = sim.stores.nests.get(now);
    ant.chamberId = nest ? chamberAt(nest, ant.pos) : -1;
    return;
  }
  ant.chamberId = -1;
  if (ant.medium === 'surface') {
    // crumbs mark the way out; recorded on the way home too, a retrace resumed after a flee walked them back outward
    if ((ant.flags & AntFlag.HOMING) === 0) recordCrumb(ant, r);
    integrateHome(ant, r, sim.state.tick);
  }
}

/**
 * No hard primitive within lodHardClear of the walker. The result is reused while the walker stays within half that
 * distance of where it was tested (then the clearance is still at least half of it, more than a coarse substep).
 */
function openGround(sim: Sim, w: Walker, s: NavScratch, r: LocoRuntime): boolean {
  const dx = w.pos.x - s.openX, dz = w.pos.z - s.openZ, lim = 0.5 * r.P.lodHardClear;
  if (s.open >= 0 && dx * dx + dz * dz < lim * lim) return s.open === 1;
  s.openX = w.pos.x; s.openZ = w.pos.z;
  s.open = sim.field.hardXYZ(w.pos.x, w.pos.y, w.pos.z) > r.P.lodHardClear ? 1 : 0;
  return s.open === 1;
}

function overridden(sim: Sim, w: Walker, dt: number, r: LocoRuntime): boolean {
  for (let i = 0; i < r.overrides.length; i++) if (r.overrides[i](sim, w, dt)) return true;
  return false;
}

/** Separation is applied where ants bunch up: in nests and near the end of a trip (spike-nest §5 item 12). */
function crowdingMatters(w: Walker, r: LocoRuntime): boolean {
  if (w.medium === 'cavity') return true;
  const d = w.nav.dest, near = r.P.sepNearGoal;
  const dx = w.pos.x - d.x, dy = w.pos.y - d.y, dz = w.pos.z - d.z;
  return dx * dx + dy * dy + dz * dz < near * near;
}

function stepWalker(sim: Sim, w: Walker, isAnt: boolean, r: LocoRuntime, obs: Vec3 | null): void {
  const id = walkerId(w), tick = sim.state.tick;
  const possessed = isAnt && ((w as Ant).flags & AntFlag.POSSESSED) !== 0 && sim.state.player.possessedAntId === id;
  const lo = r.P.edgeHard, hi = sim.world.size - lo;
  const outside = w.pos.x < lo || w.pos.x > hi || w.pos.z < lo || w.pos.z > hi;
  const k = possessed || outside ? 1 : lodEvery(w, obs, r);
  // prev* is "the previous tick's pose" for render interpolation: a skipped walker stands still this tick
  walkerSnapshot(w);
  if (k > 1 && (tick + id) % k !== 0) { r.stats.lodSkipped++; return; }
  const dt = k * TICK_S;
  r.stats.stepped++;
  let st: WalkStatus;
  if (possessed) r.possessedOverriddenId = -1;
  if (r.overrides.length > 0 && overridden(sim, w, dt, r)) {
    st = 'ok';
    if (possessed) r.possessedOverriddenId = id;
    if (isAnt) r.overriddenTick.set(id, tick);
  }
  else if (possessed) st = possessedTick(sim, w as Ant, TICK_S);
  else if (w.medium === 'air') {
    st = walkerStep(sim.field, w, null, 0, dt, sim.kernel.walker);
    if (st === 'landed' && w.nav.loco) w.nav.loco.planTick = -1;
  } else if (!w.nav.loco || w.nav.loco.req === 'none') {
    // no request: stand. A walker already standing on its level set needs no step (carve changes, mounds and
    // dynamic primitives re-attach walkers by surfaceCheck / notifySurfaceChanged); a check now and then remains.
    if (w.speed === 0 && (tick + id) % STAND_CHECK_EVERY !== 0) { r.stats.standSkipped++; st = 'ok'; }
    else st = walkerStep(sim.field, w, null, 0, dt, sim.kernel.walker); // re-attach, fall
  } else if (isAnt && dozing(sim, w, w.nav.loco, id, tick, r)) {
    // dozing in a crowded room: stands this tick, its stuck window paused (the dozed ticks do not count; it resumes
    // where it was when the ant walks again); it did not move, so map limit, slope and membership are as they were
    pauseStall(w.nav.loco, tick, k);
    w.speed = 0;
    r.stats.dozed++;
    return;
  } else if (isAnt && isStunned(sim, w as Ant)) {
    // stunned (GDD 06 §3.3 rain hits, collapses, creatures): stands; its stuck window paused meanwhile
    pauseStall(w.nav.loco!, tick, k);
    w.nav.desiredSpeed = 0;
    st = walkerStep(sim.field, w, null, 0, dt, sim.kernel.walker);
  } else {
    const s = w.nav.loco;
    let speed = aiUpdate(sim, w, s, r, id, dt, _desired);
    // a walk that just ended (arrived or failed): the ant's behaviour thinks on the next tick, not on its cadence
    // (callers need not think every tick near their goal to catch the end)
    if (isAnt && s.req === 'none' && w.nav.status !== 'moving') wake(sim, w as Ant, tick);
    // the leg's direction is a raw offset (mm) or a unit vector: normalise it, so that the unitless steering terms
    // below carry their intended weight; no direction means stand (and turn nowhere)
    const ll = Math.hypot(_desired.x, _desired.y, _desired.z);
    if (ll > 1e-9 && Number.isFinite(ll)) {
      _desired.x /= ll; _desired.y /= ll; _desired.z /= ll;
      // separation is a light preference: applied on every second tick (staggered by id), it halves the neighbour
      // queries of crowded chambers and stays a function of state (a loaded game applies it on the same ticks)
      if (k === 1 && isAnt && ((tick + id) & 1) === 0 && crowdingMatters(w, r)) addSeparation(sim, w, id, r, _desired);
      addFloorBias(w, _desired, r.P.floorW);
      if (w.medium === 'surface' || w.medium === 'water') {
        addEdgeRepulsion(sim, w, r, _desired);
        if (isAnt) addAvoidRepulsion(sim, w as Ant, r, _desired);
      }
      const dl = Math.hypot(_desired.x, _desired.y, _desired.z);
      if (dl > 1e-9) set3(w.nav.desiredDir, _desired.x / dl, _desired.y / dl, _desired.z / dl);
      turnToward(w, _desired, r.P.aiTurn * dt, r.P.minSteer, r.P.pinnedUpY);
    } else speed = 0;
    if (speed > 0 && walkerUnderWater(sim, w, r, isAnt ? (w as Ant).nestId : nestIdOf(w))) speed *= r.P.waterSpeed;
    // open ground (nearly level, no hard primitive within lodHardClear: no thin sheet to tunnel through) takes
    // longer substeps; the kernel's guard still checks every step
    const open = w.medium === 'surface' && w.up.y > 0.85 && openGround(sim, w, s, r);
    const params = open ? coarseParams(sim.kernel.walker, r.P.lodSubstep) : sim.kernel.walker;
    st = walkerStep(sim.field, w, null, speed, dt, params);
  }
  if (st === 'failed') r.stats.walkerFailed++;
  clampToMap(sim, w, r);
  // GDD 06 §3.10: on the surface in a deep puddle the walker swims (medium 'water'; inside a nest it stays 'cavity').
  // Checked every tick, also for a standing walker the stand check did not step: rain hits, heat, dodging and
  // carrying read the medium, so it turns back on the tick the puddle went shallow
  if (w.medium === 'surface' || w.medium === 'water') {
    const under = walkerUnderWater(sim, w, r, -1);
    if (under) w.medium = 'water';
    else if (w.medium === 'water') w.medium = sim.field.isInSubstrate(w.pos.x, w.pos.y, w.pos.z) ? 'cavity' : 'surface';
  }
  slopeSlip(sim, w, id, r);
  if (isAnt) membership(sim, w as Ant, r);
  else if (w.medium !== 'air') (w as Creature).nestId = walkerNest(sim, w, nestIdOf(w));
}

const _crowd: number[] = [];

/**
 * An in-nest wanderer in a crowd dozes for the part of its cycle after dozeAwake (LOCO_TUNING.dozeCrowd): a
 * function of the tick, its id and the positions of the tick start (the crowd grid), so a loaded game dozes alike.
 */
function dozing(sim: Sim, w: Walker, s: NavScratch, id: number, tick: number, r: LocoRuntime): boolean {
  if (s.req !== 'wander' || w.medium !== 'cavity' || !r.crowd) return false;
  if ((tick + 7 * id) % r.P.dozeCycle < r.P.dozeAwake) return false;
  // nestmates only (the crowd grid is tagged by colony): raiders in the room keep the residents awake
  const need = r.P.dozeCrowd;
  return r.crowd.near(w.pos.x, w.pos.y, w.pos.z, r.P.sepR, id, need, _crowd, (w as Ant).colony) >= need;
}

function wake(sim: Sim, ant: Ant, tick: number): void {
  if (ant.thinkTick > tick + 1) ant.thinkTick = tick + 1;
}

/** Micro-connections opened or closed in state (weather strip, debris) open or close their nav-grid portals. */
function syncPortals(sim: Sim): void {
  const g = sim.navGrid, ms = sim.state.worldDelta.microState;
  if (!ms || ms.length === 0 || !isLocoNavGrid(g)) return;
  for (let i = 0; i < ms.length; i++) g.setPortalOpen(ms[i].id, ms[i].open);
}

export const locomotionSystem: System = {
  name: 'locomotion',
  phase: 'locomotion',
  run(sim: Sim) {
    const r = rt(sim);
    ensureGrid(sim, r);
    syncPortals(sim);
    if (isLocoNavGrid(sim.navGrid)) syncPuddles(sim, sim.navGrid, r);
    const ants = sim.stores.ants.list, creatures = sim.stores.creatures.list;
    // a carve since the previous locomotion pass (last tick after this phase, or this tick before it). Read from
    // state (worldDelta.carveChangedTick) so a restored save re-checks exactly when the original run did.
    const changed = sim.state.worldDelta.carveChangedTick ?? -1;
    if (changed >= sim.state.tick - 1 || (r.carveVersion >= 0 && sim.carve.version !== r.carveVersion)) {
      for (let i = 0; i < ants.length; i++) if (ants[i].alive) surfaceCheck(sim, ants[i], r);
      for (let i = 0; i < creatures.length; i++) if (creatures[i].alive) surfaceCheck(sim, creatures[i], r);
    }
    r.carveVersion = sim.carve.version;
    const obs = observer(sim, r);
    antGrid(sim, r); // contact queries (queryAntsNear) read the positions of the tick start
    fillCrowd(sim, r); // and so does separation
    pruneStalls(sim, r);
    for (let i = 0; i < ants.length; i++) {
      if (!ants[i].alive) { forgetStall(r, ants[i].id); continue; }
      stepWalker(sim, ants[i], true, r, obs);
      watchStall(sim, ants[i], r);
    }
    for (let i = 0; i < creatures.length; i++) if (creatures[i].alive) stepWalker(sim, creatures[i], false, r, obs);
    if (isLocoEntityIndex(sim.index)) sim.index.refreshWalkers(); else sim.index.refresh();
  },
};
