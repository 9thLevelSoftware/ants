/**
 * Leg gait (GDD 08 §11.9: feet do not slide). Every leg vertex carries its foot's rest offset from the hip (aFoot,
 * geometry/builder.ts). The vertex shader (creatureChunk.ts) moves the foot's fore-aft offset along
 * zt = Z + stride / 4 * w(cyc): in stance (cyc 0.25..0.75, foot down) w falls linearly from 1 to -1 while the body
 * advances half a stride, so the planted foot stays where it was put down; in the swing (foot raised) w returns
 * along a cosine. The leg turns about the vertical through its hip toward (X, zt) and stretches to reach it.
 *
 * The stride of a legged look is chosen so that its median leg swings by the look's design angle uLeg.x:
 * stride = 4 X_median sin(swing), shortened if a leg would have to stretch more than GAIT_LOOK.maxStretch. Looks
 * that move by body waves keep their wave stride (looks.ts strideMm); their feet are planted the same way.
 */
import { PART } from './geometry/builder';
import { GAIT_LOOK } from './tuning';

/** w(cyc) of the shader: +1 at touch-down (0.25), -1 at lift-off (0.75), cosine return in the swing. */
export function gaitWave(cyc: number): number {
  const u = (((cyc - 0.25) % 1) + 1) % 1;
  return u < 0.5 ? 1 - 4 * u : -Math.cos(Math.PI * 2 * (u - 0.5));
}

/** CPU replica of the shader: the foot's offset from the hip (outward X, forward Z) at cycle `cyc`. */
export function footOffset(cyc: number, X: number, Z: number, stride: number, moving: number): { x: number; z: number; stretch: number } {
  const t = Math.max(0, Math.min(1, moving / 0.1)), g = t * t * (3 - 2 * t);
  const zt = Z + 0.25 * stride * g * gaitWave(cyc);
  return { x: X, z: zt, stretch: Math.hypot(X, zt) / Math.max(1e-9, Math.hypot(X, Z)) };
}

/** Per hip (key = hip x, z): the foot's rest offset from the hip, from the geometry's aRig / aPivot / aFoot arrays. */
export function legFeet(rig: ArrayLike<number>, piv: ArrayLike<number>, foot: ArrayLike<number>): { hipX: number; hipZ: number; side: number; x: number; z: number; phase: number }[] {
  const out = new Map<string, { hipX: number; hipZ: number; side: number; x: number; z: number; phase: number }>();
  for (let i = 0, n = rig.length / 4; i < n; i++) {
    if (Math.round(rig[i * 4]!) !== PART.LEG) continue;
    const hx = piv[i * 4]!, hz = piv[i * 4 + 2]!, k = `${hx.toFixed(3)},${hz.toFixed(3)}`;
    if (!out.has(k)) out.set(k, { hipX: hx, hipZ: hz, side: piv[i * 4 + 3]!, x: foot[i * 2]!, z: foot[i * 2 + 1]!, phase: rig[i * 4 + 1]! });
  }
  return [...out.values()];
}

/**
 * Stride (mm per gait cycle) at which the median leg swings by `swing` rad, shortened where needed so that no leg
 * has to stretch beyond `maxStretch` of its rest reach (legs pointing forward or back reach by extending); 0 without
 * legs or swing.
 */
export function legStrideMm(rig: ArrayLike<number>, piv: ArrayLike<number>, foot: ArrayLike<number>, swing: number, maxStretch = GAIT_LOOK.maxStretch): number {
  if (!(swing > 0)) return 0;
  const feet = legFeet(rig, piv, foot);
  if (feet.length === 0) return 0;
  const xs = feet.map((f) => Math.abs(f.x)).sort((a, b) => a - b);
  const m = xs.length % 2 ? xs[(xs.length - 1) / 2]! : (xs[xs.length / 2 - 1]! + xs[xs.length / 2]!) / 2;
  let stride = 4 * m * Math.sin(swing);
  for (const f of feet) {
    const X = Math.abs(f.x), rho = Math.hypot(X, f.z);
    // hypot(X, |Z| + stride / 4) <= maxStretch * rho
    const room = Math.sqrt(Math.max(0, (maxStretch * rho) ** 2 - X * X)) - Math.abs(f.z);
    if (rho > 1e-6) stride = Math.min(stride, 4 * Math.max(0, room));
  }
  return stride;
}
