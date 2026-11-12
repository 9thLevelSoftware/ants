// Nest-side queries locomotion needs: which nest a point is in, entrances, exit / chamber / plan fields, chamber
// membership, and shared "point fields" for goals inside a nest that no registered field covers.

import type { Vec3 } from '@/core/math/vec3';
import type { Chamber, Entrance, Nest, Sim } from '@/sim/types';
import { nestFieldId } from '@/sim/types';
import type { LocoRuntime } from './runtime';

const EXIT = { kind: 'exit', id: -1 } as const;
const SEAL = { kind: 'seal', id: -1 } as const;

/** Field leading out of a nest: the exit field if registered (open entrances), else the seal field, else ''. */
export function exitField(sim: Sim, nestId: number): string {
  const e = nestFieldId(nestId, EXIT);
  if (sim.nestNav.hasTarget(e)) return e;
  const s = nestFieldId(nestId, SEAL);
  return sim.nestNav.hasTarget(s) ? s : '';
}

/** True if p is below the substrate surface (inside the ground or a solid), i.e. a nest-interior point. */
export function isBelowGround(sim: Sim, p: Vec3): boolean {
  return sim.field.substrateXYZ(p.x, p.y, p.z) < -0.25 * sim.world.bu;
}

/** The alive nest whose open space contains p (finite exit or seal distance), -1 none. `prefer` is tried first. */
export function nestContaining(sim: Sim, p: Vec3, prefer = -1): number {
  if (prefer >= 0) {
    const f = exitField(sim, prefer);
    if (f && Number.isFinite(sim.nestNav.distanceAt(f, p))) return prefer;
  }
  for (const n of sim.state.nests) {
    if (!n.alive || n.id === prefer) continue;
    const f = exitField(sim, n.id);
    if (f && Number.isFinite(sim.nestNav.distanceAt(f, p))) return n.id;
  }
  return -1;
}

export function nestById(sim: Sim, id: number): Nest | undefined {
  return sim.stores.nests.get(id);
}

/** Nearest open entrance of a nest to p (straight line), or null. */
export function nearestOpenEntrance(sim: Sim, nestId: number, p: Vec3): Entrance | null {
  const n = nestById(sim, nestId);
  if (!n) return null;
  let best: Entrance | null = null, bd = Infinity;
  for (const e of n.entrances) {
    if (e.status !== 'open') continue;
    const d = (e.pos.x - p.x) ** 2 + (e.pos.y - p.y) ** 2 + (e.pos.z - p.z) ** 2;
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

export function entranceById(sim: Sim, id: number): { nest: Nest; entrance: Entrance } | null {
  for (const n of sim.state.nests) {
    if (!n.alive) continue;
    for (const e of n.entrances) if (e.id === id) return { nest: n, entrance: e };
  }
  return null;
}

export function chamberById(sim: Sim, id: number): { nest: Nest; chamber: Chamber } | null {
  for (const n of sim.state.nests) {
    if (!n.alive) continue;
    for (const c of n.chambers) if (c.id === id) return { nest: n, chamber: c };
  }
  return null;
}

/** Chamber of a nest whose ellipsoid (radii x 1.2) contains p, -1 none. */
export function chamberAt(nest: Nest, p: Vec3): number {
  for (const c of nest.chambers) {
    const dx = (p.x - c.center.x) / (c.radii.x * 1.2), dy = (p.y - c.center.y) / (c.radii.y * 1.2 + 0.0001);
    const dz = (p.z - c.center.z) / (c.radii.z * 1.2);
    if (dx * dx + dy * dy + dz * dz <= 1) return c.id;
  }
  return -1;
}

/** Field of a chamber, registered by the nest module; '' if not registered. */
export function chamberField(sim: Sim, nestId: number, chamberId: number): string {
  const id = nestFieldId(nestId, { kind: 'chamber', id: chamberId });
  return sim.nestNav.hasTarget(id) ? id : '';
}

/** Field of a dig plan, registered by the nest module; '' if not registered. */
export function planField(sim: Sim, nestId: number, planId: number): string {
  const id = nestFieldId(nestId, { kind: 'plan', id: planId });
  return sim.nestNav.hasTarget(id) ? id : '';
}

/**
 * A shared field to a point inside a nest (goal quantised to a small cell so nearby requests share it). The
 * registry is bounded: the oldest point field is removed beyond pointFieldMax.
 */
export function pointField(sim: Sim, r: LocoRuntime, p: Vec3): string {
  const q = r.P.pointFieldCell;
  const ix = Math.round(p.x / q), iy = Math.round(p.y / q), iz = Math.round(p.z / q);
  const id = `${POINT_PREFIX}${ix},${iy},${iz}`;
  if (sim.nestNav.hasTarget(id)) return id;
  registerPointField(sim, r, id, ix, iy, iz);
  return id;
}

const POINT_PREFIX = 'loco:pt:';

export function isPointField(id: string): boolean {
  return id.startsWith(POINT_PREFIX);
}

/**
 * Makes sure a field a walker follows exists: point fields are derived caches named by their goal cell, so after a
 * load (or eviction from the registry) they are registered again from the name. Other fields are the nest module's.
 */
export function ensureField(sim: Sim, r: LocoRuntime, id: string): void {
  if (!id || sim.nestNav.hasTarget(id) || !isPointField(id)) return;
  const [ix, iy, iz] = id.slice(POINT_PREFIX.length).split(',').map(Number);
  if (Number.isFinite(ix) && Number.isFinite(iy) && Number.isFinite(iz)) registerPointField(sim, r, id, ix, iy, iz);
}

function registerPointField(sim: Sim, r: LocoRuntime, id: string, ix: number, iy: number, iz: number): void {
  const q = r.P.pointFieldCell;
  sim.nestNav.setTarget(id, { points: [{ x: ix * q, y: iy * q, z: iz * q }], radius: r.P.pointFieldR });
  r.pointFields.push(id);
  while (r.pointFields.length > r.P.pointFieldMax) {
    const old = r.pointFields.shift();
    if (old) sim.nestNav.removeTarget(old);
  }
}
