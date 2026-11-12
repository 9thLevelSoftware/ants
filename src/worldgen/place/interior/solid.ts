// Point and overlap queries against the world under construction, denser than the kit's 3^3 collision lattice:
// thin overlaps at primitive ends (a 1.3 mm bowl mat under a bin) fall between the kit's samples.

import { primEval } from '@/sim/world/primHash';
import { primIndex, terrainAt, type GenContext } from '../../kit';
import { FURNISH } from '../../catalog/interior/dims';

const _hits: number[] = [];

/** Clearance at p: the smallest primitive distance near p and the height above the terrain (> 0 = free space). */
export function clearanceAt(ctx: GenContext, x: number, y: number, z: number, ignoreObject = -1): number {
  let d = y - terrainAt(ctx, x, z);
  const ix = primIndex(ctx);
  ix.query(x, z, x, z, _hits);
  for (const i of _hits) {
    const e = ix.entries[i];
    if (e.prim.objectId === ignoreObject || y < e.minY - d || y > e.maxY + d) continue;
    const v = primEval(e, x, y, z, null);
    if (v < d) d = v;
  }
  return d;
}

/**
 * True if any primitive of the object penetrates a primitive of another object by more than `tolMm`, sampled on
 * an (N+1)^3 lattice over each pair's AABB intersection.
 */
export function penetratesWorld(ctx: GenContext, objectId: number, tolMm: number = FURNISH.overlapTolMm): boolean {
  const ix = primIndex(ctx), N = FURNISH.overlapLattice;
  const own = ix.entries.filter((e) => e.prim.objectId === objectId);
  const hits: number[] = [];
  for (const a of own) {
    ix.query(a.minX, a.minZ, a.maxX, a.maxZ, hits);
    for (const j of hits) {
      const b = ix.entries[j];
      if (b.prim.objectId === objectId || b.maxY < a.minY || b.minY > a.maxY) continue;
      const x0 = Math.max(a.minX, b.minX), x1 = Math.min(a.maxX, b.maxX);
      const y0 = Math.max(a.minY, b.minY), y1 = Math.min(a.maxY, b.maxY);
      const z0 = Math.max(a.minZ, b.minZ), z1 = Math.min(a.maxZ, b.maxZ);
      if (x1 - x0 < tolMm || y1 - y0 < tolMm || z1 - z0 < tolMm) continue;
      for (let i = 0; i <= N; i++) for (let k = 0; k <= N; k++) for (let m = 0; m <= N; m++) {
        const x = x0 + ((x1 - x0) * i) / N, y = y0 + ((y1 - y0) * k) / N, z = z0 + ((z1 - z0) * m) / N;
        if (primEval(a, x, y, z, null) < -tolMm && primEval(b, x, y, z, null) < -tolMm) return true;
      }
    }
  }
  return false;
}

/** True if every node of every climb route of the object lies in free space (a route into a wall cannot be walked). */
export function routesFree(ctx: GenContext, objectId: number): boolean {
  for (const r of ctx.world.climbRoutes) {
    if (r.objectId !== objectId) continue;
    for (const p of r.points) if (!(clearanceAt(ctx, p.x, p.y, p.z) > 0)) return false;
  }
  return true;
}
