// Builds a TraceFn from any analytic free-space field f(p) (positive in free space, mm). Used by the demo and the
// tests; the game passes the world service's own sphere trace instead.
import type { Vec3 } from '@/core';
import type { TraceFn } from './types';

export type FieldFn = (x: number, y: number, z: number) => number;

export interface TraceOptions {
  /** Maximum march steps (default 128). */
  maxSteps?: number;
  /** Minimum step (mm) so marching along a surface at grazing angles terminates (default 0.02). */
  minStep?: number;
  /** Safety factor < 1 for fields that are not exact distances (default 0.9). */
  relax?: number;
}

/** Sphere tracing: returns the distance a sphere of `radius` travels before f(p) < radius. */
export function makeSphereTracer(f: FieldFn, opts: TraceOptions = {}): TraceFn {
  const maxSteps = opts.maxSteps ?? 128;
  const minStep = opts.minStep ?? 0.02;
  const relax = opts.relax ?? 0.9;
  return (o: Vec3, d: Vec3, maxDist: number, radius: number): number => {
    let t = 0;
    for (let i = 0; i < maxSteps && t < maxDist; i++) {
      const dist = f(o.x + d.x * t, o.y + d.y * t, o.z + d.z * t) - radius;
      if (dist <= 0) return Math.max(0, t - (i === 0 ? t : minStep));
      t += Math.max(dist * relax, minStep);
    }
    return Math.min(t, maxDist);
  };
}
