/**
 * Gait bookkeeping (pure, no three): the CPU side of the shader's foot placement.
 *
 * Tripod gait: legs L1 R2 L3 (tripod A) and R1 L2 R3 (tripod B) alternate half a cycle apart. The phase advances by
 * the distance walked (translation and turning), so the step rate follows the body. Feet do not slide because each
 * tripod's foot placement is TRACKED, not predicted: while a tripod is in stance its placement is moved by the exact
 * inverse of the body's motion every frame (forward, sideways and heading change), so a planted foot stays where it
 * touched the ground whatever the sim does between ticks. At lift-off the placement freezes; the swing carries the
 * foot from there to the next touchdown target, predicted from the current step (share, heading change per cycle).
 *
 * A placement is a rigid 2-D transform in the body frame (X left, Z forward; rig units, i.e. before the instance
 * scale): foot = R(theta) * restFoot + (tx, tz), with R(a) v = (cos a vx + sin a vz, -sin a vx + cos a vz), the same as
 * the shader's antRotY. footTarget() replicates the shader exactly so tests and the demo can measure sliding.
 */

export interface GaitState {
  /** Gait phase, cycles (unbounded; the shader takes fract). */
  phase: number;
  /** Share of the step that is forward translation (1 walking straight, 0 turning on the spot). */
  share: number;
  /** Heading change per gait cycle, rad (+ = left). */
  yawPerCycle: number;
  /** +1 walking forward, -1 backward (dragging): which end of the swing is the touchdown. */
  dir: number;
  /** Placement per tripod: [thetaA, txA, tzA, thetaB, txB, tzB] (see file comment). */
  feet: Float64Array;
  /** Tripod in stance at the last update, and which stance (floor of its phase) it is. */
  inStance: [boolean, boolean];
  stanceNo: [number, number];
}

export interface RigGait {
  /** [pair] LEFT rest foot (x, y, z, coxa angle). */
  foot: readonly (readonly number[])[];
  /** stride (per cycle), lift, duty, bob, in rig units. */
  gait: readonly number[];
}

export function newGaitState(phase = 0): GaitState {
  return { phase, share: 1, yawPerCycle: 0, dir: 1, feet: new Float64Array(6), inStance: [false, false], stanceNo: [0, 0] };
}

/** Phase offset of tripod k (0 = A, 1 = B). */
const tripodPhase = (g: GaitState, k: number): number => g.phase + 0.5 * k;

/**
 * Places tripod k where the predicted step puts it at stance fraction w (+0.5 touchdown .. -0.5 lift-off when walking
 * forward): turned by the heading change still to come and shifted by the stride still to walk.
 */
function placeIdeal(g: GaitState, rig: RigGait, k: number, w: number): void {
  const L = rig.gait[0]!, duty = rig.gait[2]!;
  const th = g.yawPerCycle * duty * w, c = L * g.share * duty * w;
  const f = g.feet; const o = k * 3;
  f[o] = th; f[o + 1] = Math.sin(th) * c; f[o + 2] = Math.cos(th) * c;
}

/** Resets both placements to the predicted step at the current phase (first frame, teleports). */
export function resetGait(g: GaitState, rig: RigGait): void {
  const duty = rig.gait[2]!;
  for (let k = 0; k < 2; k++) {
    const p = tripodPhase(g, k); const lp = fract(p);
    const stance = lp < duty;
    placeIdeal(g, rig, k, stance ? 0.5 - lp / duty : -0.5 * g.dir);
    g.inStance[k] = stance; g.stanceNo[k] = Math.floor(p);
  }
}

/**
 * Advances the gait by one frame of body motion, given in the PREVIOUS body frame: `dxMm` sideways (+ left), `dzMm`
 * forward (negative when walking backward), `yawRad` heading change (+ left). `scale` = instance scale (mm per rig
 * unit), `leverMm` = effective foot lever for turning on the spot.
 */
export function advanceGait(g: GaitState, rig: RigGait, scale: number, dxMm: number, dzMm: number, yawRad: number, leverMm: number): void {
  const stride = rig.gait[0]! * scale, duty = rig.gait[2]!;
  // planted feet stay on the ground: new body coords = R(-yaw) (old - displacement)
  const dx = dxMm / scale, dz = dzMm / scale, c = Math.cos(yawRad), s = Math.sin(yawRad);
  const f = g.feet;
  for (let k = 0; k < 2; k++) {
    if (!g.inStance[k]) continue;
    const o = k * 3; const x = f[o + 1]! - dx, z = f[o + 2]! - dz;
    f[o] = f[o]! - yawRad; f[o + 1] = c * x - s * z; f[o + 2] = s * x + c * z;
  }
  const turn = yawRad * leverMm;
  const eff = Math.sqrt(dxMm * dxMm + dzMm * dzMm + turn * turn);
  if (eff > 1e-9 && stride > 0) {
    const dir = dzMm < 0 ? -1 : 1;
    const dPhase = (dir * eff) / stride;
    g.phase += dPhase;
    g.share = Math.abs(dzMm) / eff;
    g.yawPerCycle = yawRad / dPhase;
    g.dir = dir;
  }
  // touchdowns start a new tracked stance; lift-offs freeze the placement for the swing
  for (let k = 0; k < 2; k++) {
    const p = tripodPhase(g, k); const lp = fract(p); const n = Math.floor(p);
    const stance = lp < duty;
    if (stance && !(g.inStance[k] && g.stanceNo[k] === n)) { placeIdeal(g, rig, k, 0.5 - lp / duty); g.stanceNo[k] = n; }
    g.inStance[k] = stance;
  }
  if (g.phase > 1e4 || g.phase < -1e4) {
    const w = Math.trunc(g.phase); g.phase -= w; g.stanceNo[0] -= w; g.stanceNo[1] -= w;
  }
}

export interface FootTarget { x: number; y: number; z: number; stance: boolean }

/** Leg 0..5 = L1 L2 L3 R1 R2 R3. Replica of the shader's foot target before IK (instance body frame, unscaled). */
export function footTarget(rig: RigGait, leg: number, g: GaitState, moving: number, out: FootTarget): FootTarget {
  const pair = leg % 3; const s = leg < 3 ? 1 : -1;
  const k = (s > 0) === (pair === 1) ? 1 : 0;
  const lp = fract(g.phase + 0.5 * k);
  const [L, lift0, duty] = rig.gait as [number, number, number];
  const F = rig.foot[pair]!;
  const rx = F[0]! * s, rz = F[2]!;
  const f = g.feet; const o = k * 3;
  const a = f[o]!; const c = Math.cos(a), sn = Math.sin(a);
  let x = c * rx + sn * rz + f[o + 1]!, z = -sn * rx + c * rz + f[o + 2]!, y = 0;
  const stance = lp < duty;
  if (!stance) {
    const u = (lp - duty) / (1 - duty); const e = u * u * (3 - 2 * u);
    const wt = 0.5 * g.dir;
    const ta = g.yawPerCycle * duty * wt; const tc = Math.cos(ta), ts = Math.sin(ta);
    const tz = rz + L * g.share * duty * wt;
    const tx = tc * rx + ts * tz, tzz = -ts * rx + tc * tz;
    const m = g.dir > 0 ? e : 1 - e;
    x += (tx - x) * m; z += (tzz - z) * m;
    y = Math.sin(Math.PI * u) * lift0 * moving;
  }
  out.x = x; out.y = y; out.z = z; out.stance = stance;
  return out;
}

export function fract(x: number): number {
  return x - Math.floor(x);
}
