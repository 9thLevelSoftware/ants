// decor-moss-lichen on solids (GDD 04 §9: "decals on stones, walls, logs where shade >= 0.4"): small moss patches
// baked onto the upper surface of primitives. Each patch is a grid whose vertices are dropped onto that one
// primitive's surface (vertical bisection of its signed distance), lifted by a hair; vertices that miss the solid
// get mask 0 so the patch stops at the edge. Deterministic per primitive id; a patch belongs to the block that holds
// its primitive's centre. Patches are sorted by a rank so the quality density draws a prefix (GDD 04 §9).
import { hash2u, hash3u, rngFloat, rngSeed } from '@/core';
import type { BlockContext } from './blockContext';
import { topOfEntry } from './primColumns';
import { MOSS } from './tuning';

/** Baked patches: per vertex position xyz, card uv (-1..1), mask 0/1, patch random; triangle indices. */
export interface MossPatches {
  position: Float32Array;
  uvMask: Float32Array;
  index: Uint32Array;
  patches: number;
}

/** Triangle indices per baked patch (drawing a prefix of patches = a prefix of the index buffer). */
export const MOSS_PATCH_INDICES = MOSS.primGrid * MOSS.primGrid * 6;

const MOSS_MATERIALS: ReadonlySet<string> = new Set(MOSS.primMaterials);

export function placePrimMoss(ctx: BlockContext): MossPatches {
  const g = ctx.ground, b = ctx.block, n = MOSS.primGrid;
  const list: { rank: number; pos: number[]; uvm: number[] }[] = [];
  for (const e of g.prims.entries) {
    const p = e.prim;
    if (!MOSS_MATERIALS.has(p.material) || p.pos.x < b.x0 || p.pos.x >= b.x1 || p.pos.z < b.z0 || p.pos.z >= b.z1) continue;
    if (g.map01('shade', p.pos.x, p.pos.z) < MOSS.minShade) continue;
    const area = ((e.maxX - e.minX) * (e.maxZ - e.minZ)) / 1e6;
    const s = rngSeed(hash2u(p.id, 0x6d055, g.seed));
    const count = Math.floor(MOSS.primPerM2 * area + rngFloat(s));
    for (let c = 0; c < count; c++) {
      const cx = e.minX + (e.maxX - e.minX) * (0.1 + 0.8 * rngFloat(s)), cz = e.minZ + (e.maxZ - e.minZ) * (0.1 + 0.8 * rngFloat(s));
      const size = MOSS.primSizeMm[0] + (MOSS.primSizeMm[1] - MOSS.primSizeMm[0]) * rngFloat(s), yaw = rngFloat(s) * Math.PI * 2, rnd = rngFloat(s);
      const top = topOfEntry(e, cx, cz, e.minY - 1, e.maxY + 1);
      if (top === null || top < g.height(cx, cz) + 1) continue; // only on the part that stands above the ground
      const pos: number[] = [], uvm: number[] = [], co = Math.cos(yaw), si = Math.sin(yaw);
      for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
        const u = -1 + (2 * i) / n, v = -1 + (2 * j) / n;
        const x = cx + (co * u - si * v) * size * 0.5, z = cz + (si * u + co * v) * size * 0.5;
        // stay on this solid's upper surface near the patch centre: a big drop means the vertex fell off an edge
        const y = topOfEntry(e, x, z, top - size, top + size);
        const ok = y !== null && Math.abs(y - top) < size * 0.6;
        pos.push(x, (ok ? y! : top) + MOSS.primLiftMm, z);
        uvm.push(u, v, ok ? 1 : 0, rnd);
      }
      list.push({ rank: hash3u(p.id, c, 0x6d0557, g.seed) / 4294967296, pos, uvm });
    }
  }
  list.sort((a, b) => a.rank - b.rank); // stable: equal ranks keep placement order
  const vpp = (n + 1) * (n + 1), position = new Float32Array(list.length * vpp * 3), uvMask = new Float32Array(list.length * vpp * 4);
  const index = new Uint32Array(list.length * MOSS_PATCH_INDICES);
  list.forEach((pt, k) => {
    position.set(pt.pos, k * vpp * 3);
    uvMask.set(pt.uvm, k * vpp * 4);
    let o = k * MOSS_PATCH_INDICES;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const a = k * vpp + j * (n + 1) + i, bb = a + 1, cc = a + n + 1, d = cc + 1;
      index[o++] = a; index[o++] = bb; index[o++] = cc; index[o++] = bb; index[o++] = d; index[o++] = cc;
    }
  });
  return { position, uvMask, index, patches: list.length };
}
