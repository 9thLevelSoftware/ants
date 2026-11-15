// Test support: the kernel field without its blending, near a passage. The kernel composes
//   f = smin(smax(fSoil, fCavity, k), fHard, k),  k = 0.375 BU  (src/sim/world/field.ts)
// and the smooth minimum reads up to k/4 low wherever two surfaces face each other: in a 5.8 mm door crack the
// field peaks near 2.05 mm although the slot is 2.9 mm from either face at its middle. GDD 04 §6.1 judges a gap
// by its smallest clear dimension, so the clearance proofs (spherePasses) use the same parts composed with plain
// min / max: terrain (slope-corrected, removed in terrain holes, height overlays included), the primitives in
// their diggable / hard groups as the kernel groups them by default, and the carve grid's cavity term.

import type { Vec3 } from '@/core/math/vec3';
import { DEFAULT_DIGGABLE_MATERIALS, type Kernel } from '@/sim/kernel';
import { makePrimEntry, primEval, type PrimEntry } from '@/sim/world/primHash';
import { byteAt, heightSlope, type HeightSlope } from '@/sim/world/terrainSample';
import { PrimFlag, type MaterialId } from '@/sim/types';

/** A field query f(x, y, z), mm, positive in free space. */
export type FieldFn = (x: number, y: number, z: number) => number;

/**
 * The unblended field inside the box [lo, hi] (primitives whose bounds miss the box are left out, so keep queries
 * inside it). `canDig` must match the kernel's dig rule (default: createKernel's default materials).
 */
export function exactLocalField(k: Kernel, lo: Vec3, hi: Vec3,
  canDig: (m: MaterialId) => boolean = (m) => DEFAULT_DIGGABLE_MATERIALS.includes(m)): FieldFn {
  const soil: PrimEntry[] = [], hard: PrimEntry[] = [];
  for (const p of k.world.prims) {
    if ((p.flags & PrimFlag.VISUAL_ONLY) !== 0) continue;
    const dig = (p.flags & PrimFlag.DIGGABLE) !== 0 && canDig(p.material);
    const e = makePrimEntry(p, dig);
    if (e.maxX < lo.x || e.minX > hi.x || e.maxY < lo.y || e.minY > hi.y || e.maxZ < lo.z || e.minZ > hi.z) continue;
    (dig ? soil : hard).push(e);
  }
  const terrain = k.world.terrain, holes = k.world.terrainHoles;
  const hs: HeightSlope = { h: 0, gx: 0, gz: 0 };
  const p: Vec3 = { x: 0, y: 0, z: 0 };
  return (x, y, z) => {
    let s = Infinity;
    if (!holes || byteAt(holes, x, z) === 0) {
      heightSlope(terrain, x, z, hs);
      s = (y - k.field.height(x, z)) / Math.sqrt(1 + hs.gx * hs.gx + hs.gz * hs.gz);
    }
    for (const e of soil) s = Math.min(s, primEval(e, x, y, z, null));
    p.x = x; p.y = y; p.z = z;
    s = Math.max(s, k.field.cavity(p));
    for (const e of hard) s = Math.min(s, primEval(e, x, y, z, null));
    return s;
  };
}
