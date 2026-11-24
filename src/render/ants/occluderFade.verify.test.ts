// Reviewer tests (app-seams-4 item 3): the occluder fade rule against the integrator's ruling. An ant inside the cone between camera and
// subject and nearer the camera than half the boom is not drawn; everything else solid; the fade is smooth in time and frame-rate independent.
import { describe, expect, it } from 'vitest';
import { fullyHidden, occluderWeight, stepHidden } from './occluderFade';
import { OCCLUDER } from './tuning';

type V = { x: number; y: number; z: number };
const L = 4;
const lerp = (a: V, b: V, t: number): V => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });

describe('occluderWeight against the ruling (reviewer)', () => {
  it('the zone ends at half the boom whatever the boom length and direction', () => {
    const cases: [V, V][] = [
      [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }],
      [{ x: 5, y: 40, z: -3 }, { x: 5, y: 0, z: -3 }], // looking straight down
      [{ x: 100, y: 20, z: 100 }, { x: 160, y: -5, z: 40 }],
    ];
    for (const [cam, sub] of cases) {
      expect(occluderWeight(cam, sub, L, lerp(cam, sub, 0.3), L)).toBeCloseTo(1, 6);
      expect(occluderWeight(cam, sub, L, lerp(cam, sub, 0.62), L)).toBe(0);
      expect(occluderWeight(cam, sub, L, lerp(cam, sub, 0.95), L)).toBe(0); // right in front of her: drawn (only the near half is the zone)
    }
  });

  it('a body that overlaps the line of sight with its own half length counts as in', () => {
    const cam = { x: 0, y: 0, z: 0 }, sub = { x: 40, y: 0, z: 0 };
    const cone = L * OCCLUDER.radiusL * (OCCLUDER.coneStart + (1 - OCCLUDER.coneStart) * 0.25);
    // the ant's centre is just outside the bare cone, its body (half length) still covers the axis
    expect(occluderWeight(cam, sub, L, { x: 10, y: 0, z: cone + 0.3 * L }, L)).toBeGreaterThan(0.5);
  });

  it('is in [0, 1] and finite for degenerate inputs (camera on the subject, zero lengths, far away)', () => {
    const pts: V[] = [{ x: 0, y: 0, z: 0 }, { x: 1e6, y: -1e6, z: 3 }, { x: 0.001, y: 0, z: 0 }];
    const rigs: [V, V, number, number][] = [
      [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, L, L],
      [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, 0, 0],
      [{ x: 0, y: 0, z: 0 }, { x: 1e5, y: 0, z: 0 }, L, L],
    ];
    for (const [cam, sub, sl, al] of rigs) for (const p of pts) {
      const w = occluderWeight(cam, sub, sl, p, al);
      expect(Number.isFinite(w)).toBe(true);
      expect(w).toBeGreaterThanOrEqual(0);
      expect(w).toBeLessThanOrEqual(1);
    }
  });
});

describe('stepHidden in time (reviewer)', () => {
  it('is frame-rate independent: 10 steps of 10 ms equal one step of 100 ms', () => {
    let a = 0;
    for (let i = 0; i < 10; i++) a = stepHidden(a, 1, 0.01);
    const b = stepHidden(0, 1, 0.1);
    expect(a).toBeCloseTo(b, 6);
    let c = 1;
    for (let i = 0; i < 10; i++) c = stepHidden(c, 0, 0.01);
    expect(c).toBeCloseTo(stepHidden(1, 0, 0.1), 6);
  });

  it('a passing ant is fully hidden within about half a second and fully back within a second (no pattern, no lingering ghost)', () => {
    let h = 0, t = 0;
    while (!fullyHidden(h) && t < 2) { h = stepHidden(h, 1, 1 / 60); t += 1 / 60; }
    expect(t).toBeLessThan(0.5);
    t = 0;
    while (h > 0 && t < 3) { h = stepHidden(h, 0, 1 / 60); t += 1 / 60; }
    expect(h).toBe(0);
    expect(t).toBeLessThan(1);
  });

  it('never leaves [0, 1] and settles exactly on 0 or 1', () => {
    let h = 0.5;
    for (let i = 0; i < 400; i++) { h = stepHidden(h, i % 50 < 25 ? 1 : 0, 0.016); expect(h).toBeGreaterThanOrEqual(0); expect(h).toBeLessThanOrEqual(1); }
    let s = 0.3;
    for (let i = 0; i < 300; i++) s = stepHidden(s, 1, 0.016);
    expect(s).toBe(1);
  });
});
