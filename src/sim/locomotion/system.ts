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
import { ensureGrid as ensureGridImp, rt as rtImp, type LocoRuntime } from './runtime';
import { walkerId as walkerIdImp, type NavScratch } from './scratch';
import { addAvoidRepulsion as addAvoidRepulsionImp, addEdgeRepulsion as addEdgeRepulsionImp, addFloorBias as addFloorBiasImp, addSeparation as addSeparationImp, turnToward as turnTowardImp } from './steer';
import { walkerLetGo as walkerLetGoImp, walkerPlace as walkerPlaceImp, walkerSnapshot as walkerSnapshotImp, walkerStep as walkerStepImp, walkerSurfaceChanged as walkerSurfaceChangedImp, type WalkStatus } from './walker';
import { aiUpdate as aiUpdateImp, nestIdOf as nestIdOfImp } from './update';
import { walkerNest as walkerNestImp } from './trip';

// Hot imports re-bound as local consts (Vitest reads imported bindings through getters; see 02-kernel.md §2.11).
const isLocoEntityIndex = isLocoEntityIndexImp, isLocoNavGrid = isLocoNavGridImp, clearCrumbs = clearCrumbsImp, integrateHome = integrateHomeImp, recordCrumb = recordCrumbImp, resetHomeVec = resetHomeVecImp, startCrumbs = startCrumbsImp, set3 = set3Imp, chamberAt = chamberAtImp, nearestOpenEntrance = nearestOpenEntranceImp, tiltLimit = tiltLimitImp, possessedTick = possessedTickImp, ensureGrid = ensureGridImp, rt = rtImp, walkerId = walkerIdImp, addAvoidRepulsion = addAvoidRepulsionImp, addEdgeRepulsion = addEdgeRepulsionImp, addFloorBias = addFloorBiasImp, addSeparation = addSeparationImp, turnToward = turnTowardImp, walkerLetGo = walkerLetGoImp, walkerPlace = walkerPlaceImp, walkerSnapshot = walkerSnapshotImp, walkerStep = walkerStepImp, walkerSurfaceChanged = walkerSurfaceChangedImp, aiUpdate = aiUpdateImp, nestIdOf = nestIdOfImp, walkerNest = walkerNestImp;

const TICK_S = 0.1;
/** Slope / grip checks run every this many ticks per walker (staggered). */
const SLIP_EVERY = 4;
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

/** Hard map limit (GDD 04 §14): positions are kept inside [8 BU, side - 8 BU]. */
function clampToMap(sim: Sim, w: Walker, r: LocoRuntime): void {
  const lo = r.P.edgeHard, hi = sim.world.size - r.P.edgeHard;
  const x = w.pos.x, z = w.pos.z;
  if (x >= lo && x <= hi && z >= lo && z <= hi) return;
  const cx = Math.min(hi, Math.max(lo, x)), cz = Math.min(hi, Math.max(lo, z));
  r.stats.edgeClamps++;
  const p = { x: cx, y: Math.max(w.pos.y, sim.field.height(cx, cz) + 2 * r.P.bu), z: cz };
  if (!walkerPlace(sim.field, w, p, {}, sim.kernel.walker)) { w.pos.x = cx; w.pos.z = cz; }
}

/** GDD 04 §3: a surface tilted beyond what its grip holds makes the walker let go. */
function slopeSlip(sim: Sim, w: Walker, id: number, r: LocoRuntime): void {
  if (w.medium === 'air' || (sim.state.tick + id) % SLIP_EVERY !== 0) return;
  if (w.up.y > Math.cos((LOCO_TUNING.tiltMaxLowGrip * Math.PI) / 180)) return;
  const grip = MATERIAL_GRIP[sim.field.materialAt(w.pos)] ?? LOCO_TUNING.gripDefault;
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
  if (ant.medium === 'surface') { recordCrumb(ant, r); integrateHome(ant, r, sim.state.tick); }
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
  if (r.overrides.length > 0 && overridden(sim, w, dt, r)) st = 'ok';
  else if (possessed) st = possessedTick(sim, w as Ant, TICK_S);
  else if (w.medium === 'air') {
    st = walkerStep(sim.field, w, null, 0, dt, sim.kernel.walker);
    if (st === 'landed' && w.nav.loco) w.nav.loco.planTick = -1;
  } else if (!w.nav.loco || w.nav.loco.req === 'none') {
    st = walkerStep(sim.field, w, null, 0, dt, sim.kernel.walker); // no request: stand (re-attach, fall)
  } else {
    const s = w.nav.loco;
    let speed = aiUpdate(sim, w, s, r, id, dt, _desired);
    // the leg's direction is a raw offset (mm) or a unit vector: normalise it, so that the unitless steering terms
    // below carry their intended weight; no direction means stand (and turn nowhere)
    const ll = Math.hypot(_desired.x, _desired.y, _desired.z);
    if (ll > 1e-9 && Number.isFinite(ll)) {
      _desired.x /= ll; _desired.y /= ll; _desired.z /= ll;
      if (k === 1 && isAnt && crowdingMatters(w, r)) addSeparation(sim, w, id, r, _desired);
      addFloorBias(w, _desired, r.P.floorW);
      if (w.medium === 'surface') {
        addEdgeRepulsion(sim, w, r, _desired);
        if (isAnt) addAvoidRepulsion(sim, w as Ant, r, _desired);
      }
      const dl = Math.hypot(_desired.x, _desired.y, _desired.z);
      if (dl > 1e-9) set3(w.nav.desiredDir, _desired.x / dl, _desired.y / dl, _desired.z / dl);
      turnToward(w, _desired, r.P.aiTurn * dt, r.P.minSteer);
    } else speed = 0;
    // open ground (nearly level, no hard primitive within lodHardClear: no thin sheet to tunnel through) takes
    // longer substeps; the kernel's guard still checks every step
    const open = w.medium === 'surface' && w.up.y > 0.85 && openGround(sim, w, s, r);
    const params = open ? coarseParams(sim.kernel.walker, r.P.lodSubstep) : sim.kernel.walker;
    st = walkerStep(sim.field, w, null, speed, dt, params);
  }
  if (st === 'failed') r.stats.walkerFailed++;
  clampToMap(sim, w, r);
  slopeSlip(sim, w, id, r);
  if (isAnt) membership(sim, w as Ant, r);
  else if (w.medium !== 'air') (w as Creature).nestId = walkerNest(sim, w, nestIdOf(w));
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
    const ants = sim.stores.ants.list, creatures = sim.stores.creatures.list;
    if (sim.carve.version !== r.carveVersion) {
      r.carveVersion = sim.carve.version;
      for (let i = 0; i < ants.length; i++) if (ants[i].alive) surfaceCheck(sim, ants[i], r);
      for (let i = 0; i < creatures.length; i++) if (creatures[i].alive) surfaceCheck(sim, creatures[i], r);
    }
    const obs = observer(sim, r);
    for (let i = 0; i < ants.length; i++) if (ants[i].alive) stepWalker(sim, ants[i], true, r, obs);
    for (let i = 0; i < creatures.length; i++) if (creatures[i].alive) stepWalker(sim, creatures[i], false, r, obs);
    if (isLocoEntityIndex(sim.index)) sim.index.refreshWalkers(); else sim.index.refresh();
  },
};
