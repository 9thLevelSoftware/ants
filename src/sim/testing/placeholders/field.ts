// Placeholder WorldField: terrain heightfield only (no primitives, no carve grid). Safe, never throws.
// Replaced by the kernel's src/sim/world/field.ts (F2-kernel).

import type { Vec3 } from '@/core/math/vec3';
import type { MaterialId, SpeciesId, WorldData, WorldField } from '@/sim/types';
import { materialFromCode } from '@/sim/types';
import { terrainHeightAt } from '@/sim/entities/placement';
import { getSpecies } from '@/sim/species';

/** fCavity value reported everywhere (no carved space), mm. */
const NO_CAVITY = -1e6;
const GRAD_STEP_MM = 0.5;
const TRACE_MAX_STEPS = 256;
const TRACE_MIN_STEP_MM = 0.05;
const TRACE_HIT_MM = 0.01;
/** Fraction of the distance bound taken per step (the bilinear terrain's gradient varies within a cell). */
const TRACE_SAFETY = 0.9;

export function createPlaceholderField(world: WorldData): WorldField {
  const hf = world.terrain;
  const height = (x: number, z: number): number => terrainHeightAt(hf, x, z);
  const sample = (p: Vec3): number => p.y - height(p.x, p.z);
  const gradient = (p: Vec3, out: Vec3): number => {
    const h = GRAD_STEP_MM;
    out.x = -(height(p.x + h, p.z) - height(p.x - h, p.z)) / (2 * h);
    out.y = 1;
    out.z = -(height(p.x, p.z + h) - height(p.x, p.z - h)) / (2 * h);
    return Math.sqrt(out.x * out.x + out.y * out.y + out.z * out.z);
  };
  const materialAt = (p: Vec3): MaterialId => {
    const g = world.ground.surface;
    const ix = Math.floor(p.x / g.cell), iz = Math.floor(p.z / g.cell);
    if (ix < 0 || iz < 0 || ix >= g.nx || iz >= g.nz) return 'loam';
    return materialFromCode(g.data[iz * g.nx + ix]);
  };
  return {
    height,
    substrate: sample,
    cavity: () => NO_CAVITY,
    sample,
    gradient,
    normal(p, out) {
      const g = gradient(p, out);
      out.x /= g; out.y /= g; out.z /= g;
      return g;
    },
    project(p, offset, out) {
      const x = p.x, z = p.z;
      out.x = x; out.z = z; out.y = height(x, z) + offset;
      return true;
    },
    sphereTrace(o, d, maxDist, r) {
      let t = 0;
      const q = { x: 0, y: 0, z: 0 }, g = { x: 0, y: 0, z: 0 };
      for (let i = 0; i < TRACE_MAX_STEPS && t < maxDist; i++) {
        q.x = o.x + d.x * t; q.y = o.y + d.y * t; q.z = o.z + d.z * t;
        // f is a vertical height difference; dividing by |grad f| turns it into a distance bound, so steep
        // slopes do not make the trace step through the ground.
        const s = sample(q) / gradient(q, g) - r;
        if (s < TRACE_HIT_MM) return t;
        t += Math.max(s * TRACE_SAFETY, TRACE_MIN_STEP_MM);
      }
      return Math.min(t, maxDist);
    },
    materialAt,
    diggability(p: Vec3, species: SpeciesId) {
      return getSpecies(species)?.nestTemplate.nestMaterials[materialAt(p)] ?? 0;
    },
  };
}
