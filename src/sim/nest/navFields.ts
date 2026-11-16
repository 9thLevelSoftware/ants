// Nest-nav fields of one nest (GDD 03 §5.2): D_exit, D_seal and D_ch (the set services.registerNestTargets
// defines), plus one D_plan per active plan seeded at its slots, synced so unchanged fields are kept and update
// incrementally. D_seal is re-seeded at the plug voxels themselves (GDD 03: "seeds:
// plug voxels"), which reaches the nest side of a plug; seeding at the opening would only reach the mouth.
//
// The fields are derived caches: their seeds are a pure function of the persisted state, so a Sim built after a
// load must get the same set. createSim (services.ts) only calls registerNestTargets; ensureNestFields completes
// the set once per Sim before the first tick's readers, and registerNestFields is the hook createServices should
// call so the set is complete even before the first tick.

import type { Vec3 } from '@/core/math/vec3';
import type { CarveGrid, NavSeeds, Nest, NestFieldTarget, NestNav, Sim, SimState } from '@/sim/types';
import { VoxelFlag, nestFieldId } from '@/sim/types';
import { ENTRANCE_SEED_PAD_BU, MAX_PLUG_SEEDS, SEAL_INNER_REACH_BU, THROAT_BU } from '@/sim/balance/nest';
import { OPEN_MIN } from './carve/keys';
import { FlagStore } from './flags';
import { nestRuntime } from './runtime';

/** Plans whose slots are offered (non-terminal and not paused). */
export function planIsLive(status: string): boolean {
  return status === 'queued' || status === 'active' || status === 'stalled';
}

export function refreshNestFields(sim: Sim, nest: Nest): void {
  writeNestFields(sim.nestNav, sim.carve, nestRuntime(sim).flags, nest, sim.world.bu);
}

/**
 * Every field of one nest from its record, the carve grid and the voxel flags. The same set as
 * services.registerNestTargets (exit / seal / chamber fields) with D_seal at the plug voxels and the D_plan fields,
 * written as a sync: a field whose seeds did not change is kept (NestNav.setTarget keeps it), so it updates
 * incrementally; fields of the nest that are no longer wanted are removed. The resulting set is a pure function of
 * the record, as before.
 */
function writeNestFields(nav: NestNav, carve: CarveGrid, flags: FlagStore, nest: Nest, bu: number): void {
  const wanted = new Map<string, NavSeeds>();
  const exits: Vec3[] = [], seals: Vec3[] = [];
  let exitR = 0, sealR = 0;
  for (const e of nest.entrances) {
    if (e.status === 'open') { exits.push(e.pos); exitR = Math.max(exitR, e.radius); }
    else { seals.push(e.pos); sealR = Math.max(sealR, e.radius); }
  }
  const opening = (r: number) => r + ENTRANCE_SEED_PAD_BU * bu;
  if (exits.length > 0) wanted.set(nestFieldId(nest.id, EXIT), { points: exits, radius: opening(exitR) });
  const plugs = plugPoints(carve, flags, nest, bu);
  // a throat closed by plain soil (a collapse, a heap, a fill: no PLUG voxels) is seeded on its nest side too: the
  // mouth itself is buried, and a field seeded there reaches no voxel of the nest (nest-fix3 review: every walk inside
  // such a sealed nest failed)
  if (plugs.length === 0 && seals.length > 0) innerThroatPoints(nav, carve, nest, bu, plugs);
  if (plugs.length > 0) wanted.set(nestFieldId(nest.id, SEAL), { points: plugs, radius: 1.5 * carve.voxel });
  else if (seals.length > 0) wanted.set(nestFieldId(nest.id, SEAL), { points: seals, radius: opening(sealR) });
  for (const c of nest.chambers) {
    const r = Math.max(bu, Math.min(c.radii.x, c.radii.y, c.radii.z));
    wanted.set(nestFieldId(nest.id, { kind: 'chamber', id: c.id }), { points: [c.center], radius: r });
  }
  for (const p of nest.digPlans) {
    if (!planIsLive(p.status) || p.slots.length === 0) continue;
    wanted.set(nestFieldId(nest.id, { kind: 'plan', id: p.id }), { points: p.slots.map((x) => x.pos), radius: carve.voxel });
  }
  const prefix = `nest:${nest.id}:`; // nestFieldId's form
  for (const id of nav.targets()) if (id.startsWith(prefix) && !wanted.has(id)) nav.removeTarget(id);
  for (const [id, seeds] of wanted) nav.setTarget(id, seeds);
}

const EXIT: NestFieldTarget = { kind: 'exit', id: -1 };
const SEAL: NestFieldTarget = { kind: 'seal', id: -1 };

const BUILT = new WeakSet<Sim>();

/** Rebuilds the full field set of every nest once per Sim (after createSim); later changes refresh it in place. */
export function ensureNestFields(sim: Sim): void {
  if (BUILT.has(sim)) return;
  BUILT.add(sim);
  for (const nest of sim.stores.nests.list) if (nest.alive) refreshNestFields(sim, nest);
}

/**
 * The complete field set of every alive nest, for createServices (it has the state and the services but no Sim
 * yet): replaces its registerNestTargets loop.
 */
export function registerNestFields(nav: NestNav, carve: CarveGrid, state: SimState, bu: number): void {
  const flags = new FlagStore(state.worldDelta.carveFlags);
  for (const nest of state.nests) if (nest.alive) writeNestFields(nav, carve, flags, nest, bu);
}

/** Closed PLUG samples in the throats of the nest's sealing / sealed entrances (strided to MAX_PLUG_SEEDS). */
function plugPoints(carve: CarveGrid, flags: FlagStore, nest: Nest, bu: number): Vec3[] {
  const v = carve.voxel, all: Vec3[] = [];
  for (const e of nest.entrances) {
    if (e.status === 'open') continue;
    const R = e.radius + THROAT_BU * bu;
    for (let k = Math.floor((e.pos.z - R) / v); k <= Math.ceil((e.pos.z + R) / v); k++)
      for (let j = Math.floor((e.pos.y - R) / v); j <= Math.ceil((e.pos.y + R) / v); j++)
        for (let i = Math.floor((e.pos.x - R) / v); i <= Math.ceil((e.pos.x + R) / v); i++) {
          if ((flags.get(i, j, k) & VoxelFlag.PLUG) === 0 || carve.sampleAt(i, j, k) >= OPEN_MIN) continue;
          all.push({ x: i * v, y: j * v, z: k * v });
        }
  }
  if (all.length <= MAX_PLUG_SEEDS) return all;
  const step = all.length / MAX_PLUG_SEEDS;
  return Array.from({ length: MAX_PLUG_SEEDS }, (_, n) => all[Math.floor(n * step)]);
}

/**
 * For each closed entrance whose mouth is buried: the open voxels of the nest's own space (the open region of one of
 * its chambers) nearest the mouth, within SEAL_INNER_REACH_BU of it, i.e. the nest side of the closure. Appended to
 * out; nothing for an entrance whose closure is deeper than the reach (the mouth seeds stay, as before).
 */
function innerThroatPoints(nav: NestNav, carve: CarveGrid, nest: Nest, bu: number, out: Vec3[]): void {
  const v = carve.voxel, regions = new Set<number>();
  for (const c of nest.chambers) {
    const r = nav.componentAt(c.center);
    if (r >= 0) regions.add(r);
  }
  if (regions.size === 0) return;
  const p: Vec3 = { x: 0, y: 0, z: 0 };
  for (const e of nest.entrances) {
    if (e.status === 'open') continue;
    const R = e.radius + SEAL_INNER_REACH_BU * bu;
    let best = Infinity;
    const found: { p: Vec3; d: number }[] = [];
    for (let k = Math.floor((e.pos.z - R) / v); k <= Math.ceil((e.pos.z + R) / v); k++)
      for (let j = Math.floor((e.pos.y - R) / v); j <= Math.ceil((e.pos.y + R) / v); j++)
        for (let i = Math.floor((e.pos.x - R) / v); i <= Math.ceil((e.pos.x + R) / v); i++) {
          p.x = i * v; p.y = j * v; p.z = k * v;
          const d = Math.hypot(p.x - e.pos.x, p.y - e.pos.y, p.z - e.pos.z);
          if (d > R || d > best + v || carve.sampleAt(i, j, k) < OPEN_MIN || !regions.has(nav.componentAt(p))) continue;
          if (d < best) best = d;
          found.push({ p: { ...p }, d });
        }
    for (const f of found) if (f.d <= best + v && out.length < MAX_PLUG_SEEDS) out.push(f.p);
  }
}

/** (Re)defines the D_plan field of one plan from its current slots; removes it when the plan has none. */
export function refreshPlanField(sim: Sim, nest: Nest, planId: number): void {
  writePlanField(sim.nestNav, sim.carve, nest, planId);
}

function writePlanField(nav: NestNav, carve: CarveGrid, nest: Nest, planId: number): void {
  const plan = nest.digPlans.find((p) => p.id === planId);
  const id = nestFieldId(nest.id, { kind: 'plan', id: planId });
  if (!plan || !planIsLive(plan.status) || plan.slots.length === 0) {
    if (nav.hasTarget(id)) nav.removeTarget(id);
    return;
  }
  nav.setTarget(id, { points: plan.slots.map((s) => s.pos), radius: carve.voxel });
}
