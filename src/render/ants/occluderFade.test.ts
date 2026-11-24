// The occluder fade rule (GDD 01 6.5 rule 2, app-seams-4): inside the camera-to-subject cone and nearer the camera than half the
// boom an ant is hidden (with soft edges); anywhere else it is solid; the per-ant fade is a smooth approach, never a pattern.
import { describe, expect, it } from 'vitest';
import { boomFraction, fullyHidden, occluderWeight, stepHidden } from './occluderFade';
import { OCCLUDER } from './tuning';

const cam = { x: -100, y: 0, z: 0 }, subject = { x: 0, y: 0, z: 0 }, L = 4;
const at = (x: number, y = 0, z = 0) => ({ x, y, z });

describe('occluderWeight', () => {
  it('is 1 on the axis nearer the camera than half the boom, 0 past it', () => {
    for (const x of [-100, -90, -75, -60, -55]) expect(occluderWeight(cam, subject, L, at(x), L)).toBeCloseTo(1, 6);
    expect(occluderWeight(cam, subject, L, at(-45), L)).toBe(0);
    expect(occluderWeight(cam, subject, L, at(-10), L)).toBe(0);
    expect(occluderWeight(cam, subject, L, at(30), L)).toBe(0); // behind the subject
    expect(occluderWeight(cam, subject, L, at(-140), L)).toBe(0); // behind the camera
  });

  it('is 0 beside the cone and 1 inside it, the edge soft and continuous', () => {
    const x = -75; // h = 0.25: the cone is 0.35 + 0.65 * 0.25 of its width = 0.51 * 0.6 L wide, plus half the ant's length
    const r = L * OCCLUDER.radiusL * (OCCLUDER.coneStart + (1 - OCCLUDER.coneStart) * 0.25) + 0.5 * L;
    expect(occluderWeight(cam, subject, L, at(x, 0, r * 0.5), L)).toBeCloseTo(1, 6);
    expect(occluderWeight(cam, subject, L, at(x, 0, r + 2 * OCCLUDER.softL * L), L)).toBe(0);
    let prev = 1, mono = true;
    for (let z = 0; z <= r + 2 * OCCLUDER.softL * L; z += 0.02) {
      const w = occluderWeight(cam, subject, L, at(x, 0, z), L);
      if (w > prev + 1e-9) mono = false;
      expect(Math.abs(w - prev)).toBeLessThan(0.05); // no jump
      prev = w;
    }
    expect(mono).toBe(true);
  });

  it('has no cone when the camera is on the subject', () => {
    expect(occluderWeight(at(0.5), subject, L, at(0.2), L)).toBe(0);
  });

  it('measures the boom fraction along the axis', () => {
    expect(boomFraction(cam, subject, at(-50))).toBeCloseTo(0.5, 9);
    expect(boomFraction(cam, subject, at(-50, 30, 9))).toBeCloseTo(0.5, 9);
  });
});

describe('stepHidden', () => {
  it('approaches the target smoothly, is exact at the ends and never overshoots', () => {
    let h = 0, last = 0;
    for (let i = 0; i < 120; i++) {
      h = stepHidden(h, 1, 1 / 60);
      expect(h).toBeGreaterThanOrEqual(last);
      expect(h).toBeLessThanOrEqual(1);
      expect(h - last).toBeLessThan(0.25); // a few frames of fade, not a pop
      last = h;
    }
    expect(h).toBe(1);
    for (let i = 0; i < 200; i++) h = stepHidden(h, 0, 1 / 60);
    expect(h).toBe(0);
  });

  it('hides at fadeOutS and returns at fadeInS (time constants)', () => {
    const t = (target: number, from: number, until: (v: number) => boolean): number => {
      let h = from, n = 0;
      while (!until(h) && n < 1000) { h = stepHidden(h, target, 1 / 120); n++; }
      return n / 120;
    };
    const out = t(1, 0, (v) => v >= 0.632), back = t(0, 1, (v) => v <= 0.368);
    expect(out).toBeCloseTo(OCCLUDER.fadeOutS, 1);
    expect(back).toBeCloseTo(OCCLUDER.fadeInS, 1);
  });

  it('an ant is dropped from the batches only when it is practically gone', () => {
    expect(fullyHidden(0.5)).toBe(false);
    expect(fullyHidden(1)).toBe(true);
  });
});
