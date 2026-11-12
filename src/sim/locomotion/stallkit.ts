// Test support (not used by the game): the floor point under a point in carved space.
import type { Vec3 } from '@/core/math/vec3';
import type { Sim } from '@/sim/types';

/** The surface point (f = 0) straight below p, at most 8 BU down, or null. */
export function floorBelow(sim: Sim, p: Vec3): Vec3 | null {
  const max = 8 * sim.world.bu;
  const t = sim.field.sphereTrace(p, { x: 0, y: -1, z: 0 }, max, 0);
  return t < max ? { x: p.x, y: p.y - t, z: p.z } : null;
}
