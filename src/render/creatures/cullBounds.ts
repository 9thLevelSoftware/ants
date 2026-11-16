/**
 * What the per-creature loop needs to know about a look's built geometry, measured once per look (memoized):
 *
 * - the cull sphere in its body frame (mm at the look's nominal size), so long legs and feelers never pop out at the
 *   screen edge. Parts the shader turns about a hinge (legs, wings, jaws, feelers, a raised abdomen) are bounded
 *   by |centre - hinge| + |vertex - hinge| (x the legs' largest stretch; a rotation keeps the distance to its
 *   hinge); body waves, foot lift and the wind-up squash add their amplitudes;
 * - the mid-detail triangle count (detail.ts);
 * - the gait stride (gait.ts): the no-slide stride of legged looks, the body-wave stride (looks.ts) of the others.
 */
import { PART } from './geometry/builder';
import { footOffset, legFeet, legStrideMm } from './gait';
import type { LookDef } from './looks';

export interface CullBounds {
  cx: number; cy: number; cz: number; r: number;
  /** Triangles of the mid-detail look (body + wing membranes). */
  midTris: number;
  /** mm per gait cycle at nominal size (phase advance, and the shader's planted feet in uLeg.w). */
  stride: number;
}

const ROTATING = new Set<number>([PART.LEG, PART.WING, PART.HINDWING, PART.JAW, PART.TENTACLE, PART.ANTENNA]);
const memo = new WeakMap<LookDef, CullBounds>();

export function cullBoundsOf(def: LookDef): CullBounds {
  let b = memo.get(def);
  if (!b) { b = measure(def); memo.set(def, b); }
  return b;
}

/** Gait stride of a look, mm per cycle at nominal size. */
export function lookStrideMm(def: LookDef): number { return cullBoundsOf(def).stride; }

function measure(def: LookDef): CullBounds {
  // mid detail: same limb ends and feelers as near detail (far drops feelers), a fraction of the build time
  const full = def.build(1), built = full.body;
  const g = built.toCreatureGeometry();
  const pos = g.getAttribute('position').array as ArrayLike<number>;
  const rig = g.getAttribute('aRig').array as ArrayLike<number>;
  const piv = g.getAttribute('aPivot').array as ArrayLike<number>;
  const foot = g.getAttribute('aFoot').array as ArrayLike<number>;
  const m = def.motion;
  const legStride = m.wave[3] === 0 ? legStrideMm(rig, piv, foot, m.leg[0] * (def.legAmp ?? 1)) : 0;
  const stride = legStride > 0 ? legStride : def.strideMm;
  let stretch = 1;
  for (const f of legFeet(rig, piv, foot)) for (const c of [0.25, 0.5, 0.75, 1]) stretch = Math.max(stretch, footOffset(c, Math.abs(f.x), f.z, stride, 1).stretch);
  g.computeBoundingSphere();
  const c = g.boundingSphere!.center;
  const cx = c.x, cy = c.y, cz = c.z;
  let r = 0;
  for (let i = 0, n = pos.length / 3; i < n; i++) {
    const x = pos[i * 3]!, y = pos[i * 3 + 1]!, z = pos[i * 3 + 2]!;
    let d = Math.hypot(x - cx, y - cy, z - cz);
    const part = Math.round(rig[i * 4]!);
    if (ROTATING.has(part) || (part === PART.BODY && rig[i * 4 + 3]! > 0)) {
      const px = piv[i * 4]!, py = piv[i * 4 + 1]!, pz = piv[i * 4 + 2]!;
      const k = part === PART.LEG ? stretch : 1;
      d = Math.max(d, Math.hypot(px - cx, py - cy, pz - cz) + Math.hypot(x - px, y - py, z - pz) * k);
    }
    if (d > r) r = d;
  }
  g.dispose();
  r += Math.abs(m.leg[1]) + Math.abs(m.wave[0]) + Math.abs(m.wave[2]) + Math.abs(m.wave[1]) * m.body[1];
  r *= 1 + 0.5 * Math.abs(m.misc[3]);
  return { cx, cy, cz, r, midTris: built.triangles + (full.wings?.triangles ?? 0), stride };
}
