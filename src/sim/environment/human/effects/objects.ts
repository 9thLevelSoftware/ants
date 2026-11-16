// Dynamic objects people leave (GDD 04 §15.4, §16): a parked car (body + 4 tyres; shade and shelter, cells under
// the tyres blocked) and a bait station (RB 60 x 12 x 60 plastic; its gel source belongs to ecology). They live in
// worldDelta.dynPrims (saved) and go through the kernel so the field, the nav grid and the meshes follow.

import type { Primitive, Sim } from '@/sim/types';
import type { Vec3 } from '@/core/math/vec3';
import type { Quat } from '@/core/math/quat';
import { PrimFlag } from '@/sim/types';
import { quatFromAxisAngle, quatMultiply } from '@/core/math/quat';
import { notifySurfaceChanged } from '@/sim/locomotion';
import { BAIT_STATION_HALF, CAR_BODY, CAR_TYRE } from '@/sim/balance/human';

const Y: Vec3 = { x: 0, y: 1, z: 0 }, X: Vec3 = { x: 1, y: 0, z: 0 };

/** Rotation turning +X to the heading `yaw` (radians from +X toward +Z) about +Y. */
export function yawQuat(yaw: number): Quat {
  return quatFromAxisAngle({ x: 0, y: 0, z: 0, w: 1 }, Y, -yaw);
}

function addDyn(sim: Sim, p: Primitive, templateId: string): void {
  sim.state.worldDelta.dynPrims.push(p);
  sim.kernel.addPrim(p);
  sim.emit({ type: 'world.dynprim-changed', id: p.id, templateId, change: 'add' });
}

export function removeDyn(sim: Sim, id: number, templateId: string): void {
  const list = sim.state.worldDelta.dynPrims;
  const i = list.findIndex((p) => p.id === id);
  if (i < 0) return;
  const [p] = list.splice(i, 1);
  sim.kernel.removePrim(id);
  sim.emit({ type: 'world.dynprim-changed', id, templateId, change: 'remove' });
  const r = Math.hypot(p.size.x, p.size.y, p.size.z) + 50;
  notifySurfaceChanged(sim, { x: p.pos.x - r, y: p.pos.y - r, z: p.pos.z - r }, { x: p.pos.x + r, y: p.pos.y + r, z: p.pos.z + r });
}

/** A parked car at (x, y, z) heading `yaw`; returns its primitive ids (body first). */
export function addParkedCar(sim: Sim, x: number, y: number, z: number, yaw: number): number[] {
  const q = yawQuat(yaw);
  const ids: number[] = [];
  const body: Primitive = {
    id: sim.state.nextId++, shape: 'box', pos: { x, y: y + CAR_BODY.clear + CAR_BODY.hh, z }, rot: q,
    size: { x: CAR_BODY.hl, y: CAR_BODY.hh, z: CAR_BODY.hw }, round: 120, material: 'metal',
    flags: PrimFlag.DYNAMIC | PrimFlag.SHELTER, objectId: -1, tint: 0.4,
  };
  addDyn(sim, body, 'parked-car');
  ids.push(body.id);
  const tq = quatMultiply({ x: 0, y: 0, z: 0, w: 1 }, q, quatFromAxisAngle({ x: 0, y: 0, z: 0, w: 1 }, X, Math.PI / 2));
  const c = Math.cos(yaw), s = Math.sin(yaw);
  for (const [u, v] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const lx = (u * CAR_TYRE.base) / 2, lz = (v * CAR_TYRE.track) / 2;
    const t: Primitive = {
      id: sim.state.nextId++, shape: 'cylinder', pos: { x: x + lx * c - lz * s, y: y + CAR_TYRE.r, z: z + lx * s + lz * c }, rot: tq,
      size: { x: CAR_TYRE.r, y: CAR_TYRE.w / 2, z: 0 }, round: 40, material: 'rubber', flags: PrimFlag.DYNAMIC | PrimFlag.NAV_BLOCK,
      objectId: -1,
    };
    addDyn(sim, t, 'parked-car');
    ids.push(t.id);
  }
  const r = CAR_BODY.hl + 500;
  notifySurfaceChanged(sim, { x: x - r, y: y - 100, z: z - r }, { x: x + r, y: y + 2000, z: z + r });
  return ids;
}

/** A bait station body on the surface at p; returns its primitive id. */
export function addBaitStation(sim: Sim, p: Vec3): number {
  const h = BAIT_STATION_HALF;
  const prim: Primitive = {
    id: sim.state.nextId++, shape: 'box', pos: { x: p.x, y: p.y + h.y, z: p.z }, rot: { x: 0, y: 0, z: 0, w: 1 },
    size: { x: h.x, y: h.y, z: h.z }, round: 4, material: 'plastic', flags: PrimFlag.DYNAMIC | PrimFlag.CLIMBABLE, objectId: -1, tint: 0.8,
  };
  addDyn(sim, prim, 'bait-station');
  notifySurfaceChanged(sim, { x: p.x - 100, y: p.y - 50, z: p.z - 100 }, { x: p.x + 100, y: p.y + 100, z: p.z + 100 });
  return prim.id;
}
