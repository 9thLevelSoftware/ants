// Dig plan lifecycle (GDD 03 §7): creation after validation, the status machine with blocked reasons, progress,
// completion (snap, chamber registration), cancel / pause / resume / priority, seal and reopen plans, and the
// instant carve used by cheats and generated nests.

import type { DigPlan, Nest, PlanBlockedReason, PlanPriority, PlanSource, PlanSpec, PlanStatus, Sim } from '@/sim/types';
import {
  ARCH_PROPOSAL_S, BULKING, NO_HAULERS_S, PLAN_CLIP_BU, PLAN_DROP_S, PLAN_SNAP, PLAN_SNAP_MIN_OPEN,
  SLOT_HOLD_S, SLOT_REACH_BU, SLOT_TIMEOUT_S, SPOIL_PILE_MAX, STALL_DEBOUNCE_S, V_BITE_NOMINAL, nestTemplate,
} from '@/sim/balance/nest';
import { TICKS_PER_SECOND } from '@/sim/time';
import { OPEN_MIN } from '../carve/keys';
import { carveSphere } from '../carveOps';
import { registerPlannedChamber, regionStats } from '../chambers/registry';
import { entranceById } from '../entrances';
import { createMound, deposit, moundById, publishMound } from '../mounds';
import { planIsLive, refreshPlanField } from '../navFields';
import { loosePellets, spawnPellet } from '../pellets';
import { nestRuntime } from '../runtime';
import { packSample, sampleI, sampleJ, sampleK } from '../voxelKey';
import { expandSpheres, planG } from './geometry';
import { draftPlan } from './resolve';
import { antSlot, updateWindowAndSlots } from './frontier';
import { planCache, planSpecies, remainingTargets, type PlanCache } from './targets';
import { validatePlanImpl } from './validate';

const T = TICKS_PER_SECOND;
export const isTerminal = (s: PlanStatus): boolean => s === 'complete' || s === 'cancelled';

export function planById(sim: Sim, planId: number): { nest: Nest; plan: DigPlan } | null {
  for (const nest of sim.stores.nests.list) {
    if (!nest.alive) continue;
    const plan = nest.digPlans.find((p) => p.id === planId);
    if (plan) return { nest, plan };
  }
  return null;
}

function setStatus(sim: Sim, plan: DigPlan, status: PlanStatus, reason: PlanBlockedReason | null): void {
  if (plan.status === status && plan.blockedReason === reason) return;
  plan.status = status;
  plan.blockedReason = reason;
  plan.statusTick = sim.state.tick;
  sim.emit({ type: 'plan-status-changed', planId: plan.id, status, blockedReason: reason });
}

/** Creates a plan after validation (source rules of GDD 03 §7.3); returns its id, -1 if rejected. */
export function createPlanImpl(sim: Sim, spec: PlanSpec, source: PlanSource): number {
  const v = validatePlanImpl(sim, spec, source);
  if (!v.ok || !v.resolved || !v.geometry) return -1;
  if (v.warnings.length > 0 && source === 'player' && !spec.confirmWarnings) return -1;
  const nest = sim.stores.nests.get(spec.nestId)!;
  const plan = draftPlan(nest, spec, v.resolved);
  plan.id = sim.state.nextId++;
  plan.source = source;
  plan.status = source === 'architect' ? 'proposed' : 'queued';
  plan.warnings = [...v.warnings];
  plan.spheres = expandSpheres(v.geometry, sim.world.bu);
  plan.targetVolume = v.targetVolume;
  plan.createdTick = plan.statusTick = sim.state.tick;
  nest.digPlans.push(plan);
  const cache = planCache(sim, nest, plan);
  if (cache) updateWindowAndSlots(sim, nest, plan, cache, planIsLive(plan.status));
  sim.emit({ type: 'plan-created', planId: plan.id, kind: plan.kind, priority: plan.priority });
  return plan.id;
}

/** Seal / reopen plan for an entrance (`sealEntrance` / `reopenEntrance` commands): one slot in the throat. */
export function createEntrancePlan(sim: Sim, entranceId: number, kind: 'seal' | 'reopen'): number {
  const found = entranceById(sim, entranceId);
  if (!found) return -1;
  const { nest, e } = found;
  if (kind === 'seal' ? e.status === 'sealed' : e.status === 'open') return -1;
  if (nest.digPlans.some((p) => !isTerminal(p.status) && p.kind === kind && p.anchor.pos.x === e.pos.x && p.anchor.pos.z === e.pos.z)) return -1;
  const bu = sim.world.bu, depth = e.radius + bu;
  const at = { x: e.pos.x - e.dir.x * depth, y: e.pos.y - e.dir.y * depth, z: e.pos.z - e.dir.z * depth };
  const spec: PlanSpec = { nestId: nest.id, kind, anchor: { pos: { ...e.pos }, normal: { ...e.dir } }, priority: 'high', confirmWarnings: true };
  const plan = draftPlan(nest, spec, { anchor: spec.anchor, geom: { end: null, bend: null, length: 0, yawDeg: 0, surfacePoint: null }, size: null });
  plan.id = sim.state.nextId++;
  plan.spheres = [{ c: at, r: e.radius + 0.25 * bu, done: false, obstructed: false }];
  plan.window = [0];
  plan.slots = (kind === 'seal' ? [at] : [at, at]).map((p) => ({ pos: { ...p }, antId: -1, sinceTick: sim.state.tick }));
  plan.spoilPoint = { ...at };
  plan.createdTick = plan.statusTick = sim.state.tick;
  nest.digPlans.push(plan);
  refreshPlanField(sim, nest, plan.id);
  sim.emit({ type: 'plan-created', planId: plan.id, kind, priority: plan.priority });
  return plan.id;
}

function freeSlots(sim: Sim, plan: DigPlan): void {
  for (const s of plan.slots) {
    if (s.antId < 0) continue;
    const a = sim.stores.ants.get(s.antId);
    if (a && a.bb.planId === plan.id) { a.bb.planId = -1; a.bb.slotIdx = -1; }
    s.antId = -1;
    s.sinceTick = sim.state.tick;
  }
}

export function cancelPlanImpl(sim: Sim, planId: number, reason: string): boolean {
  const found = planById(sim, planId);
  if (!found || isTerminal(found.plan.status)) return false;
  const { nest, plan } = found;
  freeSlots(sim, plan);
  plan.slots = [];
  plan.window = [];
  setStatus(sim, plan, 'cancelled', null);
  refreshPlanField(sim, nest, plan.id);
  if (reason === 'player' && plan.source === 'architect') {
    nest.architect.blacklist.push({ pos: { ...plan.anchor.pos }, untilTick: sim.state.tick + 1200 * T });
  }
  return true;
}

export function setPlanPriorityImpl(sim: Sim, planId: number, priority: PlanPriority): boolean {
  const found = planById(sim, planId);
  if (!found || isTerminal(found.plan.status)) return false;
  found.plan.priority = priority;
  return true;
}

export function pausePlanImpl(sim: Sim, planId: number): boolean {
  const found = planById(sim, planId);
  if (!found || isTerminal(found.plan.status) || found.plan.status === 'paused') return false;
  freeSlots(sim, found.plan);
  setStatus(sim, found.plan, 'paused', null);
  refreshPlanField(sim, found.nest, planId);
  return true;
}

export function resumePlanImpl(sim: Sim, planId: number): boolean {
  const found = planById(sim, planId);
  if (!found || found.plan.status !== 'paused') return false;
  setStatus(sim, found.plan, 'queued', null);
  const cache = planCache(sim, found.nest, found.plan);
  if (cache) updateWindowAndSlots(sim, found.nest, found.plan, cache, true);
  refreshPlanField(sim, found.nest, planId);
  return true;
}

// ---- per-update work ----

/** Frees slots whose digger is gone, switched plans, or stayed out of reach too long (GDD 03 §7.5). */
function expireSlots(sim: Sim, plan: DigPlan): void {
  const now = sim.state.tick, reach = SLOT_REACH_BU * sim.world.bu;
  for (const s of plan.slots) {
    if (s.antId < 0) continue;
    const a = sim.stores.ants.get(s.antId);
    if (!a || a.bb.planId !== plan.id) { s.antId = -1; s.sinceTick = now; continue; }
    if (Math.hypot(a.pos.x - s.pos.x, a.pos.y - s.pos.y, a.pos.z - s.pos.z) <= reach) { s.sinceTick = now; continue; }
    const limit = (a.carry.kind === 'item' ? SLOT_HOLD_S : SLOT_TIMEOUT_S) * T;
    if (now - s.sinceTick > limit) {
      a.bb.planId = -1; a.bb.slotIdx = -1;
      s.antId = -1; s.sinceTick = now;
    }
  }
}

/** The block condition holding now (GDD 03 §7.8), or null. `no-haulers` is not a stall (see planDiagnostics). */
function blockReason(sim: Sim, nest: Nest, plan: DigPlan, cache: PlanCache | null): PlanBlockedReason | null {
  const now = sim.state.tick;
  if (nest.volumeOpen >= nestTemplate(planSpecies(sim, nest)).volumeCap) return 'cap';
  if (cache) {
    const left = plan.spheres.filter((s) => !s.done);
    if (left.length > 0 && left.every((s) => s.obstructed)) return 'obstructed';
    if (left.length > 0 && plan.window.length === 0) return 'unreachable';
  }
  if (plan.slots.length > 0 && plan.slots.every((s) => s.antId < 0 && now - s.sinceTick >= STALL_DEBOUNCE_S * T)) return 'no-diggers';
  return null;
}

/** Spoil pile of a plan full for NO_HAULERS_S (diagnostic `no-haulers`; the plan stays active). */
export function noHaulers(sim: Sim, plan: DigPlan): boolean {
  const pile = loosePellets(sim, plan.nestId).filter((it) => it.spoilPlanId === plan.id).sort((a, b) => b.droppedTick - a.droppedTick);
  return pile.length >= SPOIL_PILE_MAX && sim.state.tick - pile[SPOIL_PILE_MAX - 1].droppedTick >= NO_HAULERS_S * T;
}

/** One update of a plan: slots, window, progress, completion, status (called every PLAN_UPDATE_TICKS). */
export function updatePlan(sim: Sim, nest: Nest, plan: DigPlan): void {
  const now = sim.state.tick;
  if (isTerminal(plan.status)) return;
  if (plan.status === 'proposed') {
    if (nest.architect.mode === 'auto' && now - plan.createdTick >= ARCH_PROPOSAL_S * T) setStatus(sim, plan, 'queued', null);
    return;
  }
  if (plan.status === 'paused') return;
  if (plan.kind === 'seal' || plan.kind === 'reopen') { updateEntrancePlan(sim, nest, plan); return; }
  const cache = planCache(sim, nest, plan);
  if (!cache) { setStatus(sim, plan, 'stalled', 'invalidated'); return; }
  expireSlots(sim, plan);
  updateWindowAndSlots(sim, nest, plan, cache, true);
  const unit = (sim.carve.voxel / sim.world.bu) ** 3;
  const initial = plan.targetVolume / unit;
  const remaining = Math.min(initial, remainingTargets(sim, cache));
  const removed = initial > 0 ? (initial - remaining) * unit : 0;
  if (removed !== plan.removedVolume) {
    plan.removedVolume = removed;
    sim.emit({ type: 'plan-progress', planId: plan.id, progress: progressOf(plan) });
  }
  // complete at PLAN_SNAP of the volume, or once every sphere is done (spheres are done at 90 %, GDD 03 §7.4)
  const spheresDone = plan.spheres.every((s) => s.done || s.obstructed) && plan.spheres.some((s) => s.done);
  if (initial <= 0 || remaining <= (1 - PLAN_SNAP) * initial || spheresDone) { completePlan(sim, nest, plan, cache); return; }
  const reason = blockReason(sim, nest, plan, cache);
  if (reason) {
    if (plan.status !== 'stalled' || plan.blockedReason !== reason) setStatus(sim, plan, 'stalled', reason);
  } else if (plan.status === 'stalled') setStatus(sim, plan, plan.removedVolume > 0 ? 'active' : 'queued', null);
  else if (plan.status === 'queued' && plan.removedVolume > 0) setStatus(sim, plan, 'active', null);
}

export function progressOf(plan: DigPlan): number {
  return plan.targetVolume > 0 ? Math.min(1, plan.removedVolume / plan.targetVolume) : 1;
}

/** A bite by a plan digger counts: queued -> active at once (GDD 03 §7.8 "first bite"). */
export function notePlanBite(sim: Sim, planId: number): void {
  const found = planById(sim, planId);
  if (found && found.plan.status === 'queued') setStatus(sim, found.plan, 'active', null);
}

function updateEntrancePlan(sim: Sim, nest: Nest, plan: DigPlan): void {
  const e = nest.entrances.find((x) => x.pos.x === plan.anchor.pos.x && x.pos.z === plan.anchor.pos.z);
  if (!e) { setStatus(sim, plan, 'cancelled', null); freeSlots(sim, plan); return; }
  expireSlots(sim, plan);
  if (plan.kind === 'seal' ? e.status === 'sealed' : e.status === 'open') {
    freeSlots(sim, plan);
    plan.slots = [];
    plan.spheres[0].done = true;
    setStatus(sim, plan, 'complete', null);
    refreshPlanField(sim, nest, plan.id);
    sim.emit({ type: 'plan-complete', planId: plan.id, kind: plan.kind });
  } else if (plan.status === 'queued' && plan.slots.some((s) => s.antId >= 0)) setStatus(sim, plan, 'active', null);
}

/**
 * Completion (GDD 03 §7.4): remaining target voxels with openness >= 64 are opened, pellets for that volume are
 * spawned at the spoil point (ceil(V / 0.85)), status `complete`; chamber plans register their chamber.
 */
export function completePlan(sim: Sim, nest: Nest, plan: DigPlan, cache: PlanCache): void {
  const v = sim.carve.voxel, bu = sim.world.bu;
  const clip = PLAN_CLIP_BU * bu, g = cache.geometry;
  const canDig = (x: number, y: number, z: number) => planG(g, x, y, z) > -clip && sim.kernel.canDigAt(x, y, z);
  let snapped = 0;
  for (const key of cache.targets) {
    const i = sampleI(key), j = sampleJ(key), k = sampleK(key), o = sim.carve.sampleAt(i, j, k);
    if (o >= OPEN_MIN || o < PLAN_SNAP_MIN_OPEN) continue;
    snapped += carveSphere(sim, { x: i * v, y: j * v, z: k * v }, v, { canDig }).volume;
  }
  const vol = snapped / bu ** 3;
  if (vol > 0) {
    const n = Math.ceil(vol / V_BITE_NOMINAL);
    for (let m = 0; m < n; m++) spawnPellet(sim, plan.spoilPoint, vol / n, sim.field.materialAt(g.mouth), nest.id, nest.colony, -1);
  }
  freeSlots(sim, plan);
  plan.slots = [];
  plan.window = [];
  for (const s of plan.spheres) if (!s.obstructed) s.done = true;
  plan.removedVolume = plan.targetVolume;
  setStatus(sim, plan, 'complete', null);
  refreshPlanField(sim, nest, plan.id);
  sim.emit({ type: 'plan-complete', planId: plan.id, kind: plan.kind });
  if (plan.kind === 'chamber' && g.ellipsoid && plan.chamberType) {
    const keys: number[] = [];
    for (const key of cache.targets) {
      const i = sampleI(key), j = sampleJ(key), k = sampleK(key);
      if (sim.carve.sampleAt(i, j, k) < OPEN_MIN) continue;
      // the room, not its neck: samples inside the ellipsoid part
      const e = g.ellipsoid, dx = i * v - e.c.x, dy = j * v - e.c.y, dz = k * v - e.c.z;
      const lw = dx * e.aw.x + dz * e.aw.z, ll = dx * e.al.x + dz * e.al.z;
      if ((lw / e.hw) ** 2 + (dy / e.hh) ** 2 + (ll / e.hl) ** 2 <= 1.0001) keys.push(packSample(i, j, k));
    }
    if (keys.length > 0) registerPlannedChamber(sim, nest, plan.chamberType, plan.source === 'player' ? 'player' : 'auto', regionStats(sim, keys.sort((a, b) => a - b)));
  }
}

/**
 * Carves a whole plan at once (cheat.instantPlan, generated nests: GDD 03 §15 `instantCarve`): every sphere,
 * clipped to the plan volume, with the species' dig predicate; the removed volume x BULKING goes to the mound of
 * the nest's first entrance (if any). Then completes the plan. Returns the removed volume, BU^3.
 */
export function instantCarvePlan(sim: Sim, planId: number): number {
  const found = planById(sim, planId);
  if (!found || isTerminal(found.plan.status)) return 0;
  const { nest, plan } = found;
  const cache = planCache(sim, nest, plan);
  if (!cache) return 0;
  const bu = sim.world.bu, g = cache.geometry, clip = PLAN_CLIP_BU * bu;
  const canDig = (x: number, y: number, z: number) => planG(g, x, y, z) > -clip && sim.kernel.canDigAt(x, y, z);
  let removed = 0;
  for (const s of plan.spheres) removed += carveSphere(sim, s.c, s.r, { canDig }).volume;
  const vol = removed / bu ** 3;
  const e = nest.entrances[0];
  if (e && vol > 0) {
    const m = (e.moundId >= 0 ? moundById(sim, e.moundId) : undefined) ?? createMound(sim, nest, e, e.pos.x, e.pos.z, sim.field.materialAt(g.mouth));
    deposit(sim, m, e.pos.x + e.radius + 2 * bu, e.pos.z, vol * BULKING * bu ** 3);
    publishMound(sim, m);
  }
  completePlan(sim, nest, plan, cache);
  return vol;
}

/** Terminal plans older than PLAN_DROP_S are dropped from the nest record (and their caches). */
export function dropOldPlans(sim: Sim, nest: Nest): void {
  const now = sim.state.tick, rt = nestRuntime(sim);
  const keep = nest.digPlans.filter((p) => !isTerminal(p.status) || now - p.statusTick < PLAN_DROP_S * T);
  if (keep.length === nest.digPlans.length) return;
  for (const p of nest.digPlans) if (!keep.includes(p)) rt.geom.delete(p.id);
  nest.digPlans = keep;
}

/** Is the ant's claimed slot within reach (behaviours: go-to-slot -> bite)? */
export function slotInReach(sim: Sim, antId: number): boolean {
  const a = sim.stores.ants.get(antId);
  const ref = a ? antSlot(sim, a) : null;
  return !!ref && Math.hypot(a!.pos.x - ref.slot.pos.x, a!.pos.y - ref.slot.pos.y, a!.pos.z - ref.slot.pos.z) <= SLOT_REACH_BU * sim.world.bu;
}

