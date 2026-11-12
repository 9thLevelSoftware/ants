// Plan work state (GDD 03 §7.4, §7.5): sphere completion, the active window, the frontier, dig slots and their
// claims by diggers, the spoil point, the aim of a plan digger's bite.

import type { Vec3 } from '@/core/math/vec3';
import type { Ant, DigPlan, DigSlot, Nest, Sim } from '@/sim/types';
import { nestFieldId } from '@/sim/types';
import {
  PLAN_PRIORITY_WEIGHT, PLAN_SLOT_CAP, PLAN_WINDOW, SLOT_OUTSIDE_PENALTY, SLOT_SCORE_DIST_BU, SLOT_SPACING_BU,
  SLOTS_PER_SPHERE, SPHERE_DONE, SPOIL_POINT_BU, SPOIL_RECOMPUTE_BU,
} from '@/sim/balance/nest';
import { OPEN_MIN } from '../carve/keys';
import { refreshPlanField } from '../navFields';
import { digPowerOf } from '../substrate';
import { packSample, sampleI, sampleJ, sampleK } from '../voxelKey';
import { planCache, type PlanCache } from './targets';

const N6 = [1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1];

function isOpen(sim: Sim, key: number): boolean {
  return sim.carve.sampleAt(sampleI(key), sampleJ(key), sampleK(key)) >= OPEN_MIN;
}

/** Closed target samples of a sphere with an open face neighbour. */
export function sphereFrontier(sim: Sim, cache: PlanCache, s: number): number[] {
  const out: number[] = [];
  for (const t of cache.sphereTargets[s]) {
    const key = cache.targets[t];
    if (isOpen(sim, key)) continue;
    const i = sampleI(key), j = sampleJ(key), k = sampleK(key);
    for (let n = 0; n < 18; n += 3) {
      if (sim.carve.sampleAt(i + N6[n], j + N6[n + 1], k + N6[n + 2]) >= OPEN_MIN) { out.push(key); break; }
    }
  }
  return out;
}

/** Updates done / obstructed of every sphere (GDD 03 §7.4, §7.6). */
export function updateSpheres(sim: Sim, plan: DigPlan, cache: PlanCache): void {
  for (let s = 0; s < plan.spheres.length; s++) {
    const sp = plan.spheres[s], list = cache.sphereTargets[s];
    if (list.length === 0) {
      sp.done = cache.sphereNonDig[s] === 0;
      sp.obstructed = !sp.done;
      continue;
    }
    let open = 0;
    for (const t of list) if (isOpen(sim, cache.targets[t])) open++;
    sp.done = open >= SPHERE_DONE * list.length;
    sp.obstructed = false;
  }
}

/** The active window: the first PLAN_WINDOW[kind] spheres that are not done, not obstructed, and reachable. */
function computeWindow(sim: Sim, plan: DigPlan, cache: PlanCache): number[] {
  const want = PLAN_WINDOW[plan.kind] ?? 1, out: number[] = [];
  for (let s = 0; s < plan.spheres.length && out.length < want; s++) {
    const sp = plan.spheres[s];
    if (sp.done || sp.obstructed) continue;
    if (sphereFrontier(sim, cache, s).length > 0) out.push(s);
  }
  return out;
}

/** Slot positions next to a sphere's frontier: open samples with the most open face neighbours, spaced apart. */
function slotPositions(sim: Sim, frontier: number[], taken: Vec3[], count: number): Vec3[] {
  const v = sim.carve.voxel, cand = new Map<number, number>();
  for (const key of frontier) {
    const i = sampleI(key), j = sampleJ(key), k = sampleK(key);
    for (let n = 0; n < 18; n += 3) {
      const ni = i + N6[n], nj = j + N6[n + 1], nk = k + N6[n + 2];
      if (sim.carve.sampleAt(ni, nj, nk) < OPEN_MIN) continue;
      const ck = packSample(ni, nj, nk);
      if (cand.has(ck)) continue;
      let score = 0;
      for (let m = 0; m < 18; m += 3) if (sim.carve.sampleAt(ni + N6[m], nj + N6[m + 1], nk + N6[m + 2]) >= OPEN_MIN) score++;
      cand.set(ck, score);
    }
  }
  const sorted = [...cand.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  const min = SLOT_SPACING_BU * sim.world.bu, out: Vec3[] = [];
  for (const [key] of sorted) {
    if (out.length >= count) break;
    const p = { x: sampleI(key) * v, y: sampleJ(key) * v, z: sampleK(key) * v };
    if ([...taken, ...out].some((q) => Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z) < min)) continue;
    out.push(p);
  }
  if (out.length === 0 && sorted.length > 0) {
    const key = sorted[0][0];
    out.push({ x: sampleI(key) * v, y: sampleJ(key) * v, z: sampleK(key) * v });
  }
  while (out.length < count && out.length > 0) out.push({ ...out[0] }); // a narrow face: diggers share the spot
  return out;
}

/** Sphere index served by slot k (slots are laid out SLOTS_PER_SPHERE per window sphere). */
export function slotSphere(plan: DigPlan, k: number): number {
  return plan.window[Math.floor(k / SLOTS_PER_SPHERE)] ?? -1;
}

function clearClaim(sim: Sim, antId: number, planId: number): void {
  const a = sim.stores.ants.get(antId);
  if (a && a.bb.planId === planId) { a.bb.planId = -1; a.bb.slotIdx = -1; }
}

/**
 * Recomputes spheres, window and slots. Claims on spheres that stay in the window are kept (their ants'
 * slot index follows); claims on spheres that left it (done, obstructed) are released, so a digger never keeps
 * or re-gets a finished sphere. Returns true if the window changed.
 */
export function updateWindowAndSlots(sim: Sim, nest: Nest, plan: DigPlan, cache: PlanCache, withSlots: boolean): boolean {
  updateSpheres(sim, plan, cache);
  const window = withSlots ? computeWindow(sim, plan, cache) : [];
  const same = window.length === plan.window.length && window.every((s, n) => s === plan.window[n]);
  const cap = PLAN_SLOT_CAP[plan.kind] ?? 2;
  const old = new Map<number, DigSlot[]>();
  plan.slots.forEach((slot, k) => {
    const s = slotSphere(plan, k);
    if (!old.has(s)) old.set(s, []);
    old.get(s)!.push(slot);
  });
  const slots: DigSlot[] = [], taken: Vec3[] = [];
  for (let w = 0; w < window.length && slots.length < cap; w++) {
    const s = window[w], keep = old.get(s) ?? [];
    const pos = same && keep.length === SLOTS_PER_SPHERE ? keep.map((x) => x.pos) : slotPositions(sim, sphereFrontier(sim, cache, s), taken, SLOTS_PER_SPHERE);
    for (let n = 0; n < SLOTS_PER_SPHERE && slots.length < cap; n++) {
      const prev = keep[n];
      const p = pos[n] ?? pos[0] ?? plan.spheres[s].c;
      taken.push(p);
      slots.push({ pos: { x: p.x, y: p.y, z: p.z }, antId: prev ? prev.antId : -1, sinceTick: prev ? prev.sinceTick : sim.state.tick });
    }
    old.delete(s);
  }
  for (const list of old.values()) for (const slot of list) if (slot.antId >= 0) clearClaim(sim, slot.antId, plan.id);
  plan.window = window;
  plan.slots = slots;
  slots.forEach((slot, k) => {
    const a = slot.antId >= 0 ? sim.stores.ants.get(slot.antId) : undefined;
    if (a) a.bb.slotIdx = k;
  });
  if (!same || plan.slots.length === 0) refreshPlanField(sim, nest, plan.id);
  if (!same) updateSpoilPoint(sim, nest, plan);
  return !same;
}

/**
 * Spoil point (GDD 03 §7.5): a floor point SPOIL_POINT_BU from the window frontier down the exit field,
 * recomputed when the window moved more than SPOIL_RECOMPUTE from it (the plan starts with it at the anchor).
 */
function updateSpoilPoint(sim: Sim, nest: Nest, plan: DigPlan): void {
  const first = plan.slots[0];
  if (!first) return;
  const bu = sim.world.bu, from = first.pos;
  const sp = plan.spoilPoint;
  if (plan.window.length > 0 && sp.x !== plan.anchor.pos.x
    && Math.hypot(sp.x - from.x, sp.y - from.y, sp.z - from.z) <= SPOIL_RECOMPUTE_BU * bu) return;
  const exit = nestFieldId(nest.id, { kind: 'exit', id: -1 });
  const out = { x: from.x, y: from.y, z: from.z };
  if (sim.nestNav.hasTarget(exit)) {
    const steps = Math.max(1, Math.round((SPOIL_POINT_BU * bu) / sim.carve.voxel));
    const d = sim.nestNav.lookahead(exit, from, steps, out);
    if (!Number.isFinite(d)) { out.x = from.x; out.y = from.y; out.z = from.z; }
  }
  const down = { x: 0, y: -1, z: 0 };
  const t = sim.field.sphereTrace(out, down, 2 * bu, 0);
  plan.spoilPoint = { x: out.x, y: out.y - Math.min(t, 2 * bu), z: out.z };
}

// ---- claims ----

export interface SlotRef { nest: Nest; plan: DigPlan; slot: DigSlot; idx: number }

/** The ant's claimed slot, or null (stale claims count as none). */
export function antSlot(sim: Sim, ant: Ant): SlotRef | null {
  const planId = ant.bb.planId ?? -1, idx = ant.bb.slotIdx ?? -1;
  if (planId < 0 || idx < 0) return null;
  for (const nest of sim.stores.nests.list) {
    if (!nest.alive) continue;
    const plan = nest.digPlans.find((p) => p.id === planId);
    if (!plan) continue;
    const slot = plan.slots[idx];
    return slot && slot.antId === ant.id ? { nest, plan, slot, idx } : null;
  }
  return null;
}

/** Plans whose slots are offered to diggers (GDD 03 §7.8; a no-diggers stall must offer them to recover). */
export function offersSlots(plan: DigPlan): boolean {
  return plan.status === 'queued' || plan.status === 'active' || (plan.status === 'stalled' && plan.blockedReason === 'no-diggers');
}

/**
 * Claims a free slot for a digger (GDD 03 §7.5): plans scored weight(priority) / (1 + D_plan / 40 BU) (ants
 * outside the nest: straight distance x SLOT_OUTSIDE_PENALTY), ties to the lower plan id, then the nearest free slot.
 */
export function claimSlot(sim: Sim, ant: Ant): boolean {
  if (digPowerOf(ant) <= 0) return false;
  if (antSlot(sim, ant)) return true;
  const bu = sim.world.bu;
  let best: { nest: Nest; plan: DigPlan; score: number } | null = null;
  for (const nest of sim.stores.nests.list) {
    if (!nest.alive || nest.colony !== ant.colony) continue;
    for (const plan of nest.digPlans) {
      if (!offersSlots(plan) || !plan.slots.some((s) => s.antId < 0)) continue;
      let d = sim.nestNav.distance(nest.id, { kind: 'plan', id: plan.id }, ant.pos);
      if (d < 0) d = Math.min(...plan.slots.map((s) => Math.hypot(s.pos.x - ant.pos.x, s.pos.y - ant.pos.y, s.pos.z - ant.pos.z))) * SLOT_OUTSIDE_PENALTY;
      const score = PLAN_PRIORITY_WEIGHT[plan.priority] / (1 + d / (SLOT_SCORE_DIST_BU * bu));
      if (!best || score > best.score || (score === best.score && plan.id < best.plan.id)) best = { nest, plan, score };
    }
  }
  if (!best) return false;
  let idx = -1, bestD = Infinity;
  best.plan.slots.forEach((s, k) => {
    if (s.antId >= 0) return;
    const d = Math.hypot(s.pos.x - ant.pos.x, s.pos.y - ant.pos.y, s.pos.z - ant.pos.z);
    if (d < bestD) { bestD = d; idx = k; }
  });
  const slot = best.plan.slots[idx];
  slot.antId = ant.id;
  slot.sinceTick = sim.state.tick;
  ant.bb.planId = best.plan.id;
  ant.bb.slotIdx = idx;
  return true;
}

export function releaseSlot(sim: Sim, ant: Ant): void {
  const ref = antSlot(sim, ant);
  if (ref) { ref.slot.antId = -1; ref.slot.sinceTick = sim.state.tick; }
  ant.bb.planId = -1;
  ant.bb.slotIdx = -1;
}

/**
 * Where a plan digger should bite (GDD 03 §7.5): the frontier sample of its slot's sphere nearest its feet. Writes
 * the horizontal heading into `heading` and returns the ramp slope (degrees below the horizontal), or null.
 */
export function planDigAim(sim: Sim, ant: Ant, feet: Vec3, heading: Vec3): number | null {
  const ref = antSlot(sim, ant);
  if (!ref) return null;
  const cache = planCache(sim, ref.nest, ref.plan);
  const s = slotSphere(ref.plan, ref.idx);
  if (!cache || s < 0) return null;
  const v = sim.carve.voxel;
  let best: Vec3 | null = null, bestD = Infinity;
  for (const key of sphereFrontier(sim, cache, s)) {
    const p = { x: sampleI(key) * v, y: sampleJ(key) * v, z: sampleK(key) * v };
    const d = Math.hypot(p.x - feet.x, p.y - feet.y, p.z - feet.z);
    if (d < bestD) { bestD = d; best = p; }
  }
  if (!best) return null;
  const dx = best.x - feet.x, dz = best.z - feet.z, h = Math.hypot(dx, dz);
  if (h < 1e-6) { heading.x = ant.fwd.x; heading.z = ant.fwd.z; } else { heading.x = dx / h; heading.z = dz / h; }
  heading.y = 0;
  const hl = Math.hypot(heading.x, heading.z) || 1;
  heading.x /= hl; heading.z /= hl;
  return (Math.atan2(feet.y - best.y, Math.max(h, 1e-6)) * 180) / Math.PI;
}
