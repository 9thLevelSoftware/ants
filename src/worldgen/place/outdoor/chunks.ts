// Carve-chunk keys of a pre-carve operation, the same cells the kit's addPreCarve counts against
// PRECARVE_CHUNK_MAX (kit/records.ts opChunks, which is not exported: keep CHUNK_BU and the key span in step).
// The outdoor placers need them to admit a cavity as a whole (all its carves or none) within their share of the
// budget, and to give a removed object's chunks back.

import type { PreCarveOp } from '@/sim/types';

const CHUNK_BU = 8;
const CHUNK_KEY_SPAN = 4096;

export function opChunkKeys(bu: number, op: Pick<PreCarveOp, 'shape' | 'a' | 'b' | 'r'>, out: Set<number>): Set<number> {
  const c = CHUNK_BU * bu;
  let lx: number, ly: number, lz: number, hx: number, hy: number, hz: number;
  if (op.shape === 'sphere') {
    lx = op.a.x - op.r; ly = op.a.y - op.r; lz = op.a.z - op.r; hx = op.a.x + op.r; hy = op.a.y + op.r; hz = op.a.z + op.r;
  } else if (op.shape === 'ellipsoid') {
    lx = op.a.x - op.b.x; ly = op.a.y - op.b.y; lz = op.a.z - op.b.z; hx = op.a.x + op.b.x; hy = op.a.y + op.b.y; hz = op.a.z + op.b.z;
  } else {
    lx = Math.min(op.a.x, op.b.x) - op.r; ly = Math.min(op.a.y, op.b.y) - op.r; lz = Math.min(op.a.z, op.b.z) - op.r;
    hx = Math.max(op.a.x, op.b.x) + op.r; hy = Math.max(op.a.y, op.b.y) + op.r; hz = Math.max(op.a.z, op.b.z) + op.r;
  }
  for (let k = Math.floor(lz / c); k <= Math.floor(hz / c); k++)
    for (let j = Math.floor(ly / c); j <= Math.floor(hy / c); j++)
      for (let i = Math.floor(lx / c); i <= Math.floor(hx / c); i++) out.add(i + CHUNK_KEY_SPAN * (j + CHUNK_KEY_SPAN * k));
  return out;
}
