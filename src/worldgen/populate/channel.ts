// A carved passage under a barrier between two walkable nav cells (GDD 04 §6.3 step 4 targeted connections,
// repair R4): mouths at the ground of both cells, a run under the barrier at a fixed depth, one micro-connection
// whose portal joins the two cells. Width >= MICRO_CARVE_MIN_BU (1 BU, two voxels).

import type { MicroKind } from '@/sim/types';
import type { Vec3 } from '@/core/math/vec3';
import type { GenContext } from '../kit/context';
import { addMicro, addPreCarve } from '../kit/records';
import { terrainAt } from '../kit/surface';
import { navCentre } from './common';

export interface ChannelSpec { a: number; b: number; kind: MicroKind; reason: string; radiusBu: number; depthBu: number }

/** Carves the channel and records the connection; false (nothing recorded) when the carve budget refuses. */
export function carveChannel(ctx: GenContext, s: ChannelSpec): boolean {
  const bu = ctx.dims.bu, r = s.radiusBu * bu;
  const pa = navCentre(ctx, s.a), pb = navCentre(ctx, s.b);
  const ga = terrainAt(ctx, pa.x, pa.z), gb = terrainAt(ctx, pb.x, pb.z);
  const dx = pb.x - pa.x, dz = pb.z - pa.z, l = Math.sqrt(dx * dx + dz * dz);
  if (l <= 0) return false;
  // the run starts and ends a quarter cell inside the two cells, at depth below the lower ground
  const inset = Math.min(0.25 * ctx.dims.navCell, l / 4) / l;
  const y = Math.min(ga, gb) - s.depthBu * bu;
  const mouthA: Vec3 = { x: pa.x, y: ga - 0.25 * bu, z: pa.z }, mouthB: Vec3 = { x: pb.x, y: gb - 0.25 * bu, z: pb.z };
  const runA: Vec3 = { x: pa.x + dx * inset, y, z: pa.z + dz * inset }, runB: Vec3 = { x: pb.x - dx * inset, y, z: pb.z - dz * inset };
  const segs: [Vec3, Vec3][] = [[mouthA, runA], [runA, runB], [runB, mouthB]];
  for (const [a, b] of segs) {
    if (!addPreCarve(ctx, { shape: 'capsule', a, b, r, natural: true, cavityId: -1 })) return false;
  }
  let len = 0;
  for (const [a, b] of segs) len += Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2 + (b.z - a.z) ** 2);
  addMicro(ctx, {
    kind: s.kind, posA: { x: pa.x, y: ga, z: pa.z }, posB: { x: pb.x, y: gb, z: pb.z }, gapMm: 2 * r,
    minClearanceBu: 2 * s.radiusBu, lengthBu: len / bu, useful: true, reason: s.reason, path: [runA, runB],
  });
  return true;
}
