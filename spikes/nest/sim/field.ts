/**
 * The solid/free field f(p) (docs/01-design-seed.md section 3): signed pseudo-distance in mm, POSITIVE in free space.
 *
 *   f = smin( smax(fSoil, fCavity, k), fHard, k )
 *
 * - fSoil: terrain heightfield (+ diggable primitives) - the substrate the carve grid can open.
 * - fCavity: carve grid (> 0 inside excavated space).
 * - fHard: non-diggable primitives (stone, paving slab, stem, table, wall). Digging never opens them.
 * Seed formula f = max(fSubstrate, fCavity) is the k -> 0 limit when every primitive is diggable; splitting hard
 * primitives out is what lets a tunnel run UNDER a paving slab whose underside then becomes the tunnel ceiling.
 * smin/smax with a small k (fillet) remove the gradient discontinuity at concave/convex creases, which is what keeps
 * the surface walker's normal continuous (no jitter at floor-to-wall corners, smooth wrap over rims). Max deviation
 * from the sharp field is k/4.
 *
 * Pure TypeScript (no three).
 */
import { World, smin, smax } from './world';
import { CarveGrid } from './carve';
import type { Vec3 } from './vec3';

export class Field {
  readonly world: World;
  readonly carve: CarveGrid;
  readonly k: number;
  /** finite-difference step for the gradient (mm) */
  readonly h = 0.05;
  /** evaluation counter (profiling) */
  evals = 0;

  constructor(world: World, carve: CarveGrid, k: number) {
    this.world = world; this.carve = carve; this.k = k;
  }

  f(x: number, y: number, z: number): number {
    this.evals++;
    const w = this.world;
    const soil = w.fSoil(x, y, z);
    // fCavity is bounded by +-ramp/2: far above the ground the soil value dominates and the grid lookup is skipped
    const a = soil > this.carve.ramp * 0.5 + this.k ? soil : smax(soil, this.carve.fCavity(x, y, z), this.k);
    // fHard returns hashMargin (a valid lower bound) when no primitive is registered in this hash cell
    return smin(a, w.fHard(x, y, z), this.k);
  }

  /** substrate distance (soil and hard primitives, ignoring the carve grid): > 0 means open air */
  substrate(x: number, y: number, z: number): number {
    return Math.min(this.world.fSoil(x, y, z), this.world.fHard(x, y, z));
  }

  /** central-difference gradient (unnormalised) into out; returns |grad| */
  grad(x: number, y: number, z: number, out: Vec3): number {
    const h = this.h, i2h = 1 / (2 * h);
    out.x = (this.f(x + h, y, z) - this.f(x - h, y, z)) * i2h;
    out.y = (this.f(x, y + h, z) - this.f(x, y - h, z)) * i2h;
    out.z = (this.f(x, y, z + h) - this.f(x, y, z - h)) * i2h;
    return Math.sqrt(out.x * out.x + out.y * out.y + out.z * out.z);
  }

  /** unit normal (direction of increasing f) into out; returns |grad| (0 => degenerate, out = +Y) */
  normal(x: number, y: number, z: number, out: Vec3): number {
    const g = this.grad(x, y, z, out);
    if (g < 1e-9) { out.x = 0; out.y = 1; out.z = 0; return 0; }
    out.x /= g; out.y /= g; out.z /= g;
    return g;
  }

  /**
   * Sphere trace from o along unit d. Returns the distance t at which a sphere of `radius` first touches solid,
   * or maxT. `safety` < 1 compensates for the pseudo-distance not being exact (ellipsoid, terrain slope).
   */
  sphereTrace(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number, radius: number,
    safety = 0.9, minStep = 0.02): number {
    let t = 0;
    for (let it = 0; it < 256 && t < maxT; it++) {
      const d = this.f(ox + dx * t, oy + dy * t, oz + dz * t) - radius;
      if (d < 0.002) return t;
      t += Math.max(d * safety, minStep);
    }
    return Math.min(t, maxT);
  }
}
