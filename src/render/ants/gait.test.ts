import { describe, expect, it } from 'vitest';
import { advanceGait, footTarget, newGaitState, resetGait, type FootTarget } from './gait';
import { buildAntVariant } from './geometry/buildAnt';
import { resolveMorph } from './morph/catalog';

const rig = buildAntVariant(resolveMorph('lasius-niger', 'worker', null)).rig;

interface Path { speed: (t: number) => number; yawRate: (t: number) => number; slip?: (t: number) => number }

/**
 * Walks a body along a path (heading theta(t), speed v(t), optional sideways slip) and measures how far each stance
 * foot drifts in the world while it is planted. Body frame: +Z forward, +X left; heading 0 faces world +Z; positive
 * yaw turns left (+X). The body motion of a step is handed to the gait in the previous body frame, as the renderer does.
 */
function maxDrift(path: Path, steps: number, dt: number, scale = 1): { worst: number; stances: number } {
  const g = newGaitState(0.013); resetGait(g, rig);
  let x = 0, z = 0, th = 0, worst = 0, stances = 0;
  const anchors: ([number, number] | null)[] = [null, null, null, null, null, null];
  const ft: FootTarget = { x: 0, y: 0, z: 0, stance: false };
  for (let i = 0; i < steps; i++) {
    const t = i * dt; const v = path.speed(t), w = path.yawRate(t), sl = path.slip?.(t) ?? 0;
    const ds = v * dt, dth = w * dt, dl = sl * dt;
    // midpoint integration; displacement expressed in the previous body frame
    const a = dth / 2;
    const fwd = Math.cos(a) * ds - Math.sin(a) * dl, side = Math.sin(a) * ds + Math.cos(a) * dl;
    x += Math.sin(th) * fwd + Math.cos(th) * side; z += Math.cos(th) * fwd - Math.sin(th) * side; th += dth;
    advanceGait(g, rig, scale, side, fwd, dth, 0.45 * rig.bodyLength * scale);
    for (let leg = 0; leg < 6; leg++) {
      footTarget(rig, leg, g, 1, ft);
      const fx = ft.x * scale, fz = ft.z * scale;
      const wx = x + Math.cos(th) * fx + Math.sin(th) * fz;
      const wz = z - Math.sin(th) * fx + Math.cos(th) * fz;
      const an = anchors[leg];
      if (!ft.stance) { anchors[leg] = null; continue; }
      if (!an) { anchors[leg] = [wx, wz]; stances++; continue; }
      worst = Math.max(worst, Math.hypot(wx - an[0], wz - an[1]));
    }
  }
  return { worst, stances };
}

const cruise = 6 * rig.bodyLength; // 6 body lengths / s
const run = (p: Path, scale = 1) => { const r = maxDrift(p, 2000, 1 / 240, scale); expect(r.stances).toBeGreaterThan(18); return r.worst; };

describe('gait: planted feet do not slide', () => {
  it('walking straight', () => {
    expect(run({ speed: () => cruise, yawRate: () => 0 })).toBeLessThan(1e-6);
  });
  it('walking straight at a changing speed and size (scaled ant)', () => {
    expect(run({ speed: (t) => cruise * (0.4 + 0.6 * Math.abs(Math.sin(t * 3))), yawRate: () => 0 }, 1.3)).toBeLessThan(1e-6);
  });
  it('walking backward (dragging)', () => {
    expect(run({ speed: () => -0.4 * cruise, yawRate: () => 0 })).toBeLessThan(1e-6);
  });
  it('turning while walking', () => {
    expect(run({ speed: () => cruise, yawRate: () => 1.5 })).toBeLessThan(1e-6);
  });
  it('turn rate and speed changing mid-stance, with sideways slip', () => {
    const p: Path = { speed: (t) => cruise * (0.5 + 0.5 * Math.sin(t * 5)), yawRate: (t) => 2 * Math.sin(t * 7), slip: (t) => 0.3 * cruise * Math.cos(t * 4) };
    expect(run(p)).toBeLessThan(1e-6);
  });
  it('turning on the spot steps the legs without sliding', () => {
    expect(run({ speed: () => 0, yawRate: () => 2.0 })).toBeLessThan(1e-6);
  });
  it('reversing direction (forward, then dragging backward)', () => {
    expect(run({ speed: (t) => (t < 4 ? cruise : -0.4 * cruise), yawRate: () => 0.5 })).toBeLessThan(1e-6);
  });
  it('a swing ends at the predicted touchdown point (no jump at touchdown when walking straight)', () => {
    const g = newGaitState(0); resetGait(g, rig);
    const ft: FootTarget = { x: 0, y: 0, z: 0, stance: false };
    const step = rig.gait[0]! / 400; let prev: { z: number; stance: boolean } | null = null; let worstJump = 0;
    for (let i = 0; i < 1200; i++) {
      advanceGait(g, rig, 1, 0, step, 0, 1);
      footTarget(rig, 0, g, 1, ft);
      if (prev && !prev.stance && ft.stance) worstJump = Math.max(worstJump, Math.abs(ft.z - prev.z));
      prev = { z: ft.z, stance: ft.stance };
    }
    expect(worstJump).toBeLessThan(rig.gait[0]! * 0.02);
  });
});
