import { describe, expect, it } from 'vitest';
import { fbm2, fbm3, gradNoise2, gradNoise3, hash2i, hash3i, ridged2, ridged3, valueNoise2, valueNoise3 } from './noise';

/** Deterministic sample coordinates (no rng dependency): a low-discrepancy sequence over [-range, range]. */
function samples(n: number, range: number): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < n; i++) {
    out.push([
      ((i * 0.6180339887498949) % 1) * 2 * range - range,
      ((i * 0.7548776662466927) % 1) * 2 * range - range,
      ((i * 0.5698402909980532) % 1) * 2 * range - range,
    ]);
  }
  return out;
}

function stats(values: number[]) {
  let min = Infinity, max = -Infinity, sum = 0;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
  }
  return { min, max, mean: sum / values.length };
}

describe('noise hashes', () => {
  it('are pinned to fixed values (worlds must not change between versions or engines)', () => {
    // If these change, every generated world changes: bump the generator version deliberately.
    expect([hash2i(0, 0), hash2i(1, 0), hash2i(-1, 7, 3), hash3i(2, -3, 5, 11)].map((v) => Math.round(v * 1e9))).toMatchInlineSnapshot(`
      [
        579341252,
        775335807,
        399337452,
        654300450,
      ]
    `);
    expect([gradNoise2(0.3, 0.7, 1), gradNoise3(1.25, -2.5, 3.75, 2), valueNoise2(-4.2, 9.1, 5)].map((v) => Math.round(v * 1e9))).toMatchInlineSnapshot(`
      [
        -135515723,
        122321129,
        615475689,
      ]
    `);
  });

  it('return floats in [0, 1) with a uniform histogram', () => {
    const bins = new Array(10).fill(0);
    const n = 100_000;
    let i = 0;
    for (let x = -158; x < 158; x++) {
      for (let y = -158; y < 158 && i < n; y++, i++) {
        const h = hash2i(x, y, 99);
        expect(h >= 0 && h < 1).toBe(true);
        bins[Math.floor(h * 10)]++;
      }
    }
    const expected = i / 10;
    const chi2 = bins.reduce((acc, b) => acc + ((b - expected) ** 2) / expected, 0);
    expect(chi2).toBeLessThan(30); // 9 dof: p ~ 0.0005
    const bins3 = new Array(8).fill(0);
    for (let k = 0; k < 40_000; k++) bins3[Math.floor(hash3i(k % 37, (k * 7) % 41, k, 5) * 8)]++;
    const chi3 = bins3.reduce((acc, b) => acc + ((b - 5000) ** 2) / 5000, 0);
    expect(chi3).toBeLessThan(26); // 7 dof
  });

  it('depend on every coordinate, sign and the seed', () => {
    expect(hash2i(1, 2, 0)).not.toBe(hash2i(2, 1, 0));
    expect(hash2i(-1, 2, 0)).not.toBe(hash2i(1, 2, 0));
    expect(hash2i(1, 2, 0)).not.toBe(hash2i(1, 2, 1));
    expect(hash3i(1, 2, 3, 0)).not.toBe(hash3i(1, 2, 4, 0));
    expect(hash2i(5, 6, 7)).toBe(hash2i(5, 6, 7));
    // neighbouring lattice values are uncorrelated
    let sxy = 0;
    const n = 20_000;
    for (let k = 0; k < n; k++) sxy += (hash2i(k, 0, 1) - 0.5) * (hash2i(k + 1, 0, 1) - 0.5);
    expect(Math.abs(sxy / n)).toBeLessThan(0.005); // variance of U(-.5,.5) products is 1/144
  });
});

describe('value and gradient noise', () => {
  it('value noise stays in [-1, 1] and matches the lattice at integer points', () => {
    const v2 = samples(20_000, 50).map(([x, y]) => valueNoise2(x, y, 3));
    const v3 = samples(20_000, 50).map(([x, y, z]) => valueNoise3(x, y, z, 3));
    for (const s of [stats(v2), stats(v3)]) {
      expect(s.min).toBeGreaterThanOrEqual(-1);
      expect(s.max).toBeLessThanOrEqual(1);
      expect(s.max - s.min).toBeGreaterThan(1.2); // uses most of the range
      expect(Math.abs(s.mean)).toBeLessThan(0.05);
    }
    expect(valueNoise2(4, -7, 3)).toBeCloseTo(hash2i(4, -7, 3) * 2 - 1, 9);
  });

  it('gradient noise is zero at lattice points, in [-1, 1], centred, using a good part of the range', () => {
    for (let x = -5; x <= 5; x++) {
      expect(gradNoise2(x, x * 2 - 3, 9)).toBe(0);
      expect(gradNoise3(x, -x, x + 4, 9)).toBe(0);
    }
    const g2 = stats(samples(30_000, 80).map(([x, y]) => gradNoise2(x, y, 4)));
    const g3 = stats(samples(30_000, 80).map(([x, y, z]) => gradNoise3(x, y, z, 4)));
    for (const s of [g2, g3]) {
      expect(s.min).toBeGreaterThanOrEqual(-1);
      expect(s.max).toBeLessThanOrEqual(1);
      expect(s.max).toBeGreaterThan(0.5);
      expect(s.min).toBeLessThan(-0.5);
      expect(Math.abs(s.mean)).toBeLessThan(0.03);
    }
  });

  it('is continuous: small steps give small changes (Lipschitz bound)', () => {
    const h = 1e-3;
    let worst2 = 0, worst3 = 0, worstV = 0;
    for (const [x, y, z] of samples(5000, 30)) {
      worst2 = Math.max(worst2, Math.abs(gradNoise2(x + h, y, 1) - gradNoise2(x, y, 1)) / h);
      worst3 = Math.max(worst3, Math.abs(gradNoise3(x, y, z + h, 1) - gradNoise3(x, y, z, 1)) / h);
      worstV = Math.max(worstV, Math.abs(valueNoise2(x, y + h, 1) - valueNoise2(x, y, 1)) / h);
    }
    expect(worst2).toBeLessThan(4);
    expect(worst3).toBeLessThan(4);
    expect(worstV).toBeLessThan(4);
    // and across cell boundaries (C1 at integer coordinates thanks to the quintic fade)
    const left = gradNoise2(2 - 1e-7, 0.5, 1), right = gradNoise2(2 + 1e-7, 0.5, 1);
    expect(Math.abs(left - right)).toBeLessThan(1e-5);
  });

  it('works for negative coordinates and different seeds give different fields', () => {
    expect(gradNoise2(-3.3, -7.7, 1)).not.toBe(gradNoise2(3.3, 7.7, 1));
    let diff = 0;
    for (const [x, y] of samples(200, 20)) diff += Math.abs(gradNoise2(x, y, 1) - gradNoise2(x, y, 2));
    expect(diff / 200).toBeGreaterThan(0.1);
  });
});

describe('fbm and ridged', () => {
  it('fbm stays in [-1, 1] for any octave settings and equals gradient noise with one octave', () => {
    for (const [oct, lac, gain] of [[1, 2, 0.5], [6, 2, 0.5], [8, 2.3, 0.7], [3, 1.7, 1]]) {
      const s2 = stats(samples(5000, 40).map(([x, y]) => fbm2(x, y, 7, oct, lac, gain)));
      const s3 = stats(samples(5000, 40).map(([x, y, z]) => fbm3(x, y, z, 7, oct, lac, gain)));
      for (const s of [s2, s3]) {
        expect(s.min).toBeGreaterThanOrEqual(-1);
        expect(s.max).toBeLessThanOrEqual(1);
      }
    }
    expect(fbm2(1.7, -2.2, 3, 1)).toBe(gradNoise2(1.7, -2.2, 3));
    expect(fbm3(1.7, -2.2, 0.4, 3, 1)).toBe(gradNoise3(1.7, -2.2, 0.4, 3));
    expect(fbm2(1.7, -2.2, 3, 0)).toBe(0);
  });

  it('fbm octaves add detail: more octaves change the field at fine scale', () => {
    let d = 0;
    for (const [x, y] of samples(300, 10)) d += Math.abs(fbm2(x, y, 1, 1) - fbm2(x, y, 1, 6));
    expect(d / 300).toBeGreaterThan(0.02);
  });

  it('ridged noise is in [0, 1] and exactly 1 on integer lattice points', () => {
    const r2 = stats(samples(5000, 40).map(([x, y]) => ridged2(x, y, 2)));
    const r3 = stats(samples(5000, 40).map(([x, y, z]) => ridged3(x, y, z, 2)));
    for (const s of [r2, r3]) {
      expect(s.min).toBeGreaterThanOrEqual(0);
      expect(s.max).toBeLessThanOrEqual(1);
    }
    expect(ridged2(3, -4, 2)).toBe(1);
    expect(ridged3(3, -4, 8, 2)).toBe(1);
  });
});
