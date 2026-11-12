// locomotionSystem: every tick, moves every walker (ants and creatures). Per walker: level of detail (walkers far
// from the observer step every 2 or 4 ticks with a proportionally longer dt; on open ground also with longer
// substeps, still inside the kernel's guard, so the free-space invariant holds), prev* snapshot, re-attachment
// where the carve grid changed, the possessed ant from intent or the AI request, steering, walkerStep, the map
// boundary, grip / slope limits, nest membership (nestId / chamberId), breadcrumbs and path integration. Finally the
// entity index is refreshed for the walkers.

import type { Vec3 } from '@/core/math/vec3';
import type { Ant, Creature, Sim, System, Walker, WalkerParams } from '@/sim/types';
import { AntFlag } from '@/sim/types';
import { isLocoEntityIndex } from '@/sim/world/entityIndex';
import { clearCrumbs, integrateHome, recordCrumb, resetHomeVec, startCrumbs } from './crumbs';
import { set3 } from './mathx';
import { chamberAt, nearestOpenEntrance } from './nests';
import { MATERIAL_GRIP, LOCO_TUNING, tiltLimit } from './params';
import { possessedTick } from './possessed';
import { ensureGrid, rt, type DirtyBox, type LocoRuntime } from './runtime';
import { scratchOf, walkerId } from './scratch';
import { addAvoidRepulsion, addEdgeRepulsion, addFloorBias, addSeparation, turnToward } from './steer';
import { walkerLetGo, walkerPlace, walkerSnapshot, walkerStep, walkerSurfaceChanged, type WalkStatus } from './walker';
import { aiUpdate, nestIdOf } from './update';
import { walkerNest } from './trip';

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
  return d2 < r.P.lodFar * r.P.lodFar ? r.P.lodMid : r.P.lodFarEvery;
}

/** Walkers inside a changed carve box re-attach (or fall) and replan. */
function applyDirty(sim: Sim, r: LocoRuntime, boxes: readonly DirtyBox[], list: readonly Walker[]): void {
  if (boxes.length === 0) return;
  const m = r.P.bu;
  for (let i = 0; i < list.length; i++) {
    const w = list[i];
    for (const b of boxes) {
      if (w.pos.x < b.x0 - m || w.pos.x > b.x1 + m || w.pos.y < b.y0 - m || w.pos.y > b.y1 + m || w.pos.z < b.z0 - m || w.pos.z > b.z1 + m) continue;
      if (w.medium !== 'air') walkerSurfaceChanged(sim.field, w, sim.kernel.walker);
      scratchOf(w).planTick = -1;
      r.stats.surfaceChanged++;
      break;
    }
  }
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
  const s = scratchOf(ant);
  if (now !== prev) {
    if (now >= 0) { clearCrumbs(ant); resetHomeVec(ant, s, null); }
    else if (prev >= 0) {
      const e = nearestOpenEntrance(sim, prev, ant.pos);
      startCrumbs(ant, e ? e.pos : ant.pos);
      resetHomeVec(ant, s, e ? e.pos : ant.pos);
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
  if (ant.medium === 'surface') { recordCrumb(ant, r); integrateHome(ant, s, r, sim.state.tick); }
}

function stepWalker(sim: Sim, w: Walker, isAnt: boolean, r: LocoRuntime, obs: Vec3 | null): void {
  const id = walkerId(w), tick = sim.state.tick;
  const possessed = isAnt && ((w as Ant).flags & AntFlag.POSSESSED) !== 0 && sim.state.player.possessedAntId === id;
  const k = possessed ? 1 : lodEvery(w, obs, r);
  if (k > 1 && (tick + id) % k !== 0) { r.stats.lodSkipped++; return; }
  const dt = k * TICK_S;
  walkerSnapshot(w);
  r.stats.stepped++;
  let st: WalkStatus;
  if (possessed) st = possessedTick(sim, w as Ant, TICK_S);
  else if (w.medium === 'air') {
    st = walkerStep(sim.field, w, null, 0, dt, sim.kernel.walker);
    if (st === 'landed') scratchOf(w).planTick = -1;
  } else {
    const s = scratchOf(w);
    const speed = aiUpdate(sim, w, s, r, id, dt, _desired);
    if (speed > 0) {
      if (k === 1 && isAnt) addSeparation(sim, w, id, r, _desired);
      addFloorBias(w, _desired, r.P.floorW);
      if (w.medium === 'surface') {
        addEdgeRepulsion(sim, w, r, _desired);
        if (isAnt) addAvoidRepulsion(sim, w as Ant, r, _desired);
      }
      const dl = Math.hypot(_desired.x, _desired.y, _desired.z);
      if (dl > 1e-9) set3(w.nav.desiredDir, _desired.x / dl, _desired.y / dl, _desired.z / dl);
      turnToward(w, _desired, r.P.aiTurn * dt, r.P.minSteer);
    }
    const open = k > 1 && w.up.y > 0.85 && sim.field.hardXYZ(w.pos.x, w.pos.y, w.pos.z) > r.P.lodHardClear;
    const params = open ? coarseParams(sim.kernel.walker, r.P.lodSubstep) : sim.kernel.walker;
    st = walkerStep(sim.field, w, null, speed, dt, params);
  }
  if (st === 'failed') r.stats.walkerFailed++;
  clampToMap(sim, w, r);
  slopeSlip(sim, w, id, r);
  if (isAnt) membership(sim, w as Ant, r);
  else if (w.medium !== 'air') (w as Creature).nestId = walkerNest(sim, w, nestIdOf(w));
}

export const locomotionSystem: System = {
  name: 'locomotion',
  phase: 'locomotion',
  run(sim: Sim) {
    const r = rt(sim);
    ensureGrid(sim, r);
    const ants = sim.stores.ants.list, creatures = sim.stores.creatures.list;
    if (r.dirty.length > 0) {
      const boxes = r.dirty.splice(0, r.dirty.length);
      applyDirty(sim, r, boxes, ants);
      applyDirty(sim, r, boxes, creatures);
    }
    const obs = observer(sim, r);
    for (let i = 0; i < ants.length; i++) if (ants[i].alive) stepWalker(sim, ants[i], true, r, obs);
    for (let i = 0; i < creatures.length; i++) if (creatures[i].alive) stepWalker(sim, creatures[i], false, r, obs);
    if (isLocoEntityIndex(sim.index)) sim.index.refreshWalkers(); else sim.index.refresh();
  },
};
