import { describe, expect, it } from 'vitest';
import { angleDelta, approach, clamp, clamp01, invLerp, lerp, remap, sign0, smoothstep, wrapAngle } from './scalar';

describe('scalar', () => {
  it('clamp and clamp01 bound values', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
    expect(clamp01(1.5)).toBe(1);
    expect(clamp01(-0.5)).toBe(0);
    expect(clamp01(0.25)).toBe(0.25);
  });

  it('lerp / invLerp are inverses, invLerp handles a degenerate range', () => {
    expect(lerp(10, 20, 0.25)).toBe(12.5);
    expect(invLerp(10, 20, 12.5)).toBe(0.25);
    expect(invLerp(5, 5, 7)).toBe(0);
    expect(lerp(1, 3, 2)).toBe(5); // unclamped
  });

  it('remap maps ranges, including reversed output', () => {
    expect(remap(5, 0, 10, 100, 200)).toBe(150);
    expect(remap(0, 0, 10, 1, -1)).toBe(1);
    expect(remap(10, 0, 10, 1, -1)).toBe(-1);
  });

  it('smoothstep is 0/1 at the edges, 0.5 in the middle, clamped and monotonic', () => {
    expect(smoothstep(0, 1, -1)).toBe(0);
    expect(smoothstep(0, 1, 2)).toBe(1);
    expect(smoothstep(2, 4, 3)).toBe(0.5);
    let prev = -1;
    for (let x = 0; x <= 1; x += 0.01) {
      const s = smoothstep(0, 1, x);
      expect(s).toBeGreaterThanOrEqual(prev);
      prev = s;
    }
    expect(smoothstep(1, 0, 0.9)).toBeLessThan(0.1); // reversed ramp
  });

  it('approach moves by at most maxDelta and never overshoots', () => {
    expect(approach(0, 10, 3)).toBe(3);
    expect(approach(9, 10, 3)).toBe(10);
    expect(approach(10, 0, 4)).toBe(6);
    expect(approach(1, 0, 4)).toBe(0);
    expect(approach(5, 5, 1)).toBe(5);
  });

  it('wrapAngle maps into (-PI, PI]', () => {
    expect(wrapAngle(0)).toBe(0);
    expect(wrapAngle(Math.PI)).toBeCloseTo(Math.PI, 12);
    expect(wrapAngle(-Math.PI)).toBeCloseTo(Math.PI, 12);
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI, 12);
    expect(wrapAngle(2 * Math.PI + 0.5)).toBeCloseTo(0.5, 12);
    for (let a = -50; a < 50; a += 0.37) {
      const w = wrapAngle(a);
      expect(w).toBeGreaterThan(-Math.PI);
      expect(w).toBeLessThanOrEqual(Math.PI);
      expect(Math.cos(w)).toBeCloseTo(Math.cos(a), 9);
      expect(Math.sin(w)).toBeCloseTo(Math.sin(a), 9);
    }
  });

  it('angleDelta gives the shortest signed turn', () => {
    expect(angleDelta(0.1, -0.1)).toBeCloseTo(-0.2, 12);
    expect(angleDelta(Math.PI - 0.1, -Math.PI + 0.1)).toBeCloseTo(0.2, 12); // across the seam
    expect(angleDelta(-Math.PI + 0.1, Math.PI - 0.1)).toBeCloseTo(-0.2, 12);
  });

  it('sign0 returns -1, 0 or 1', () => {
    expect(sign0(-3)).toBe(-1);
    expect(sign0(0)).toBe(0);
    expect(sign0(-0)).toBe(0);
    expect(sign0(2)).toBe(1);
    expect(sign0(Number.NaN)).toBe(0);
  });
});

describe('degenerate ranges (F1a-fixes)', () => {
  it('smoothstep with e0 === e1 is a step at the edge', () => {
    expect(smoothstep(2, 2, 1.999)).toBe(0);
    expect(smoothstep(2, 2, 2)).toBe(1);
    expect(smoothstep(2, 2, 100)).toBe(1);
    expect(smoothstep(2, 2, -Infinity)).toBe(0);
  });

  it('invLerp is 0 and remap is outLo for every x when the input range is degenerate', () => {
    for (const x of [-5, 3, 3.0001, 1e9]) {
      expect(invLerp(3, 3, x)).toBe(0);
      expect(remap(x, 3, 3, 10, 20)).toBe(10);
    }
  });
});
