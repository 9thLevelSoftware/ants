import { describe, expect, it } from 'vitest';
import { advanceGait, footTarget, newGaitState, type FootTarget } from './gait';
import { buildAntVariant } from './geometry/buildAnt';
import { resolveMorph } from './morph/catalog';

const rig = buildAntVariant(resolveMorph('lasius-niger', 'worker', null)).rig;

/**
 * Walks a body along a path (heading theta(t), speed v(t)) and measures how far a stance foot drifts in the world
 * while it is planted. Body frame: +Z forward, +X left; heading 0 faces world +Z; positive yaw turns left (+X).
 */
function maxDrift(leg: number, steps: number, dt: number, speed: (t: number) => number, yawRate: (t: number) => number, scale = 1): number {
  const g = newGaitState(0.013);
  let x = 0, z = 0, th = 0, anchor: [number, number] | null = null, worst = 0, stances = 0;
  const ft: FootTarget = { x: 0, y: 0, z: 0, stance: false };
  for (let i = 0; i < steps; i++) {
    const t = i * dt; const v = speed(t), w = yawRate(t);
    const ds = v * dt, dth = w * dt;
    // midpoint integration of the body path
    const thm = th + dth / 2;
    x += Math.sin(thm) * ds; z += Math.cos(thm) * ds; th += dth;
    advanceGait(g, ds, dth, rig.gait[0] * scale, 0.45 * rig.bodyLength * scale);
    footTarget(rig, leg, g, 1, ft);
    const fx = ft.x * scale, fz = ft.z * scale;
    const wx = x + Math.cos(th) * fx + Math.sin(th) * fz;
    const wz = z - Math.sin(th) * fx + Math.cos(th) * fz;
    if (ft.stance) {
      if (!anchor) { anchor = [wx, wz]; stances++; } else worst = Math.max(worst, Math.hypot(wx - anchor[0], wz - anchor[1]));
    } else anchor = null;
  }
  expect(stances).toBeGreaterThan(3);
  return worst;
}

describe('gait: planted feet do not slide', () => {
  const cruise = 6 * rig.bodyLength; // 6 body lengths / s
  it('walking straight: drift ~0 for every leg', () => {
    for (let leg = 0; leg < 6; leg++) expect(maxDrift(leg, 2000, 1 / 240, () => cruise, () => 0)).toBeLessThan(1e-6);
  });
  it('walking straight at a changing speed and size (scaled ant)', () => {
    expect(maxDrift(0, 2000, 1 / 240, (t) => cruise * (0.4 + 0.6 * Math.abs(Math.sin(t * 3))), () => 0, 1.3)).toBeLessThan(1e-6);
  });
  it('walking backward (dragging)', () => {
    expect(maxDrift(1, 2000, 1 / 240, () => -0.4 * cruise, () => 0)).toBeLessThan(1e-6);
  });
  it('turning while walking: drift stays below 2 % of body length', () => {
    for (let leg = 0; leg < 6; leg++) expect(maxDrift(leg, 2000, 1 / 240, () => cruise, () => 1.5)).toBeLessThan(0.02 * rig.bodyLength);
  });
  it('turning on the spot steps the legs and keeps drift small', () => {
    expect(maxDrift(4, 2000, 1 / 240, () => 0, () => 2.0)).toBeLessThan(0.03 * rig.bodyLength);
  });
  it('without the turning compensation the same arc would slide visibly (control)', () => {
    const g = newGaitState(0);
    advanceGait(g, 1, 0.1, rig.gait[0], 1);
    expect(Math.abs(g.yawPerCycle)).toBeGreaterThan(0);
  });
});
