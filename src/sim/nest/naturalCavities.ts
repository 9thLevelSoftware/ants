// Pre-existing cavities (GDD 03 §3): NATURAL voxel flags for world-generation pre-carves, and the joining rule:
// when digging connects a nest to an unowned natural cavity, the cavity joins the nest (WorldDelta.naturalOwners)
// and its openings become `natural` entrances. A cavity owned by another colony only reports contact.

import type { Vec3 } from '@/core/math/vec3';
import type { Entrance, NaturalCavity, Nest, PreCarveOp, Sim } from '@/sim/types';
import { VoxelFlag } from '@/sim/types';
import { sdCapsuleSegment, sdEllipsoid, sdSphere } from '@/core/math/sdf';
import { OPEN_MIN, type VoxelBox } from './carve/keys';
import { nestComponents, nestOfCavityPoint } from './entrances';
import { refreshNestFields } from './navFields';
import { nestRuntime } from './runtime';

/**
 * Flags the open samples of the world's `natural` pre-carves NATURAL. Only on a new game (tick 0): the flags are
 * saved state, and a later call would re-flag voxels that digging has since cleared.
 */
export function flagNaturalPreCarves(sim: Sim): void {
  if (sim.state.tick !== 0) return;
  const flags = nestRuntime(sim).flags, v = sim.carve.voxel;
  for (const op of sim.world.preCarve) {
    if (!op.natural) continue;
    const b = preCarveBox(sim, op);
    for (let k = b.k0; k <= b.k1; k++) for (let j = b.j0; j <= b.j1; j++) for (let i = b.i0; i <= b.i1; i++) {
      if (sim.carve.sampleAt(i, j, k) >= OPEN_MIN && preCarveDistance(op, i * v, j * v, k * v) <= 0) flags.add(i, j, k, VoxelFlag.NATURAL);
    }
  }
}

/** Sample box of a pre-carve shape. */
function preCarveBox(sim: Sim, op: PreCarveOp): VoxelBox {
  const v = sim.carve.voxel;
  const reach = op.shape === 'ellipsoid' ? Math.max(op.b.x, op.b.y, op.b.z) : op.r;
  const lo = op.shape === 'capsule' ? { x: Math.min(op.a.x, op.b.x), y: Math.min(op.a.y, op.b.y), z: Math.min(op.a.z, op.b.z) } : op.a;
  const hi = op.shape === 'capsule' ? { x: Math.max(op.a.x, op.b.x), y: Math.max(op.a.y, op.b.y), z: Math.max(op.a.z, op.b.z) } : op.a;
  return {
    i0: Math.floor((lo.x - reach) / v), j0: Math.floor((lo.y - reach) / v), k0: Math.floor((lo.z - reach) / v),
    i1: Math.ceil((hi.x + reach) / v), j1: Math.ceil((hi.y + reach) / v), k1: Math.ceil((hi.z + reach) / v),
  };
}

/** Signed distance of (x, y, z) to a pre-carve shape, mm (<= 0 inside). */
function preCarveDistance(op: PreCarveOp, x: number, y: number, z: number): number {
  if (op.shape === 'capsule') return sdCapsuleSegment({ x, y, z }, op.a, op.b, op.r);
  const p = { x: x - op.a.x, y: y - op.a.y, z: z - op.a.z };
  return op.shape === 'sphere' ? sdSphere(p, op.r) : sdEllipsoid(p, op.b.x, op.b.y, op.b.z);
}

/**
 * A point of the cavity next to a carve (GDD 03 §3: an open voxel of the cavity 26-adjacent to the carve box):
 * the first open sample (fixed scan order) within one sample of the box that is NATURAL or lies inside one of
 * the cavity's pre-carve shapes and has a nav component. Null when the carve does not touch the cavity's space.
 * The cavity's own samples are probed, not its bounding-box centre: an L-shaped, curved or ring-shaped cavity has
 * solid soil there.
 */
function cavityPointNear(sim: Sim, cav: NaturalCavity, box: VoxelBox): { p: Vec3; comp: number } | null {
  const v = sim.carve.voxel, flags = nestRuntime(sim).flags;
  const ops = sim.world.preCarve.filter((op) => op.cavityId === cav.id);
  const i0 = Math.max(box.i0 - 1, Math.floor(cav.min.x / v) - 1), i1 = Math.min(box.i1 + 1, Math.ceil(cav.max.x / v) + 1);
  const j0 = Math.max(box.j0 - 1, Math.floor(cav.min.y / v) - 1), j1 = Math.min(box.j1 + 1, Math.ceil(cav.max.y / v) + 1);
  const k0 = Math.max(box.k0 - 1, Math.floor(cav.min.z / v) - 1), k1 = Math.min(box.k1 + 1, Math.ceil(cav.max.z / v) + 1);
  for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    if (sim.carve.sampleAt(i, j, k) < OPEN_MIN) continue;
    const x = i * v, y = j * v, z = k * v;
    const natural = (flags.get(i, j, k) & VoxelFlag.NATURAL) !== 0 || ops.some((op) => preCarveDistance(op, x, y, z) <= 0);
    if (!natural) continue;
    const p = { x, y, z };
    const comp = sim.nestNav.componentAt(p);
    if (comp >= 0) return { p, comp };
  }
  return null;
}

/** After a carve: unowned natural cavities whose box touches it and that are now connected to a nest join it. */
export function joinNaturalCavities(sim: Sim, box: VoxelBox): void {
  const cavities = sim.world.cavities;
  if (cavities.length === 0) return;
  const v = sim.carve.voxel, owners = sim.state.worldDelta.naturalOwners;
  for (const cav of cavities) {
    if (cav.max.x < box.i0 * v - v || cav.min.x > box.i1 * v + v || cav.max.y < box.j0 * v - v || cav.min.y > box.j1 * v + v
      || cav.max.z < box.k0 * v - v || cav.min.z > box.k1 * v + v) continue;
    const near = cavityPointNear(sim, cav, box);
    if (!near) continue;
    const comp = near.comp;
    const owner = owners[String(cav.id)];
    if (owner !== undefined) {
      const ownerNest = sim.stores.nests.get(owner);
      for (const nest of sim.stores.nests.list) {
        if (!nest.alive || !ownerNest || nest.colony === ownerNest.colony || !nestComponents(sim, nest).has(comp)) continue;
        sim.emit({ type: 'foreign-cavity-contact', cavityId: cav.id, nestId: nest.id, otherColony: ownerNest.colony });
      }
      continue;
    }
    const nest = nestOfCavityPoint(sim, near.p);
    if (!nest) continue;
    owners[String(cav.id)] = nest.id;
    sim.emit({ type: 'natural-cavity-joined', cavityId: cav.id, nestId: nest.id });
    for (const o of cav.openings) addNaturalEntrance(sim, nest, o.pos, o.normal, o.radius);
    refreshNestFields(sim, nest);
  }
}

function addNaturalEntrance(sim: Sim, nest: Nest, pos: Entrance['pos'], dir: Entrance['dir'], radius: number): void {
  if (nest.entrances.some((e) => Math.hypot(e.pos.x - pos.x, e.pos.y - pos.y, e.pos.z - pos.z) <= e.radius + radius)) return;
  const e: Entrance = {
    id: sim.state.nextId++, kind: 'natural', status: 'open', pos: { ...pos }, dir: { ...dir }, radius,
    moundId: -1, rimTarget: 0, plugVoxelCount: 0, createdTick: sim.state.tick, trafficIn: 0, trafficOut: 0, passSeen: false,
  };
  nest.entrances.push(e);
  sim.emit({ type: 'entrance-opened', entranceId: e.id, nestId: nest.id, kind: 'natural' });
}
