/**
 * Gait bookkeeping (pure, no three): the CPU side of the shader's foot placement. The renderer advances each ant's
 * phase by the distance it walked; the same functions replicate the shader's stance-foot target so tests and the
 * demo can measure foot sliding.
 */

export interface GaitState {
  /** Gait phase, cycles (unbounded; the shader takes fract). */
  phase: number;
  /** Share of the step that is translation (1 walking straight, 0 turning on the spot). */
  share: number;
  /** Heading change per gait cycle, rad (+ = left). */
  yawPerCycle: number;
}

export function newGaitState(phase = 0): GaitState {
  return { phase, share: 1, yawPerCycle: 0 };
}

/**
 * Advances the gait by one frame of motion. `fwdMm` is the displacement along the body's forward axis (negative when
 * walking backward, e.g. dragging), `yawRad` the heading change, `strideMm` the stride of this ant (rig stride x
 * instance scale), `leverMm` the effective foot lever for turning on the spot.
 */
export function advanceGait(g: GaitState, fwdMm: number, yawRad: number, strideMm: number, leverMm: number): void {
  const turn = yawRad * leverMm;
  const eff = Math.hypot(fwdMm, turn);
  if (eff < 1e-9 || strideMm <= 0) return;
  const dir = fwdMm < 0 ? -1 : 1;
  const dPhase = (dir * eff) / strideMm;
  g.phase += dPhase;
  g.share = Math.abs(fwdMm) / eff;
  g.yawPerCycle = yawRad / dPhase;
  if (g.phase > 1e4 || g.phase < -1e4) g.phase -= Math.trunc(g.phase);
}

export interface RigGait {
  /** [pair] LEFT rest foot (x, y, z, coxa angle). */
  foot: readonly (readonly number[])[];
  /** stride mm, lift mm, duty, bob mm. */
  gait: readonly number[];
}

export interface FootTarget { x: number; y: number; z: number; stance: boolean }

/** Leg 0..5 = L1 L2 L3 R1 R2 R3. Replica of the shader's foot target before IK (instance body frame, unscaled). */
export function footTarget(rig: RigGait, leg: number, g: GaitState, moving: number, out: FootTarget): FootTarget {
  const pair = leg % 3; const s = leg < 3 ? 1 : -1;
  const tripodB = (s > 0) === (pair === 1);
  const lp = fract(g.phase + (tripodB ? 0.5 : 0) + pair * 0.03);
  const [L0, lift0, duty] = rig.gait as [number, number, number];
  const L = L0 * g.share;
  let w: number, lift: number;
  if (lp < duty) { w = 0.5 - lp / duty; lift = 0; } else {
    const u = (lp - duty) / (1 - duty); const e = u * u * (3 - 2 * u);
    w = e - 0.5; lift = Math.sin(Math.PI * u) * lift0 * moving;
  }
  const F = rig.foot[pair]!;
  const fx = F[0]! * s, fz = F[2]! + L * duty * w;
  const a = g.yawPerCycle * duty * w; const c = Math.cos(a), sn = Math.sin(a);
  out.x = c * fx + sn * fz; out.z = -sn * fx + c * fz; out.y = lift; out.stance = lp < duty;
  return out;
}

export function fract(x: number): number {
  return x - Math.floor(x);
}
