// Adversarial checks of the world field (reviewer tests, F2-kernel acceptance criterion 2).
import { describe, expect, it } from 'vitest';
import type { Vec3 } from '@/core/math/vec3';
import { rngFloat, rngSeed } from '@/core/rng';
import { createKernel, type Kernel } from '@/sim/kernel';
import { carveTestNest, emptyCarve, makeFlatWorld, makeSceneWorld, TEST_BU } from '@/sim/kernel.testWorld';

const BU = TEST_BU;
const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

let cached: Kernel | null = null;
function nestKernel(): Kernel {
  if (cached) return cached;
  const s = makeSceneWorld(7);
  const k = createKernel(s.world, emptyCarve(BU));
  carveTestNest(k, s.nest);
  const slab = s.world.prims.find((p) => p.id === s.ids.slab)!;
  // tunnel under the slab: soil, cavity and the hard slab all meet
  k.carveCapsule(v(380, slab.pos.y - slab.size.y - 3.5, 470), v(620, slab.pos.y - slab.size.y - 3.5, 470), BU, { force: true });
  cached = k;
  return k;
}

function randomDir(rng: number[]): Vec3 {
  for (;;) {
    const d = v(rngFloat(rng) * 2 - 1, rngFloat(rng) * 2 - 1, rngFloat(rng) * 2 - 1);
    const l = Math.hypot(d.x, d.y, d.z);
    if (l > 0.1 && l <= 1) return v(d.x / l, d.y / l, d.z / l);
  }
}

/** True if some lattice point within dist of p has f >= foot while f(p) < foot, or vice versa. */
function levelSetWithin(k: Kernel, p: Vec3, foot: number, dist: number): boolean {
  const s0 = Math.sign(k.field.sample(p) - foot);
  for (let x = -dist; x <= dist; x += 0.5) for (let y = -dist; y <= dist; y += 0.5) for (let z = -dist; z <= dist; z += 0.5) {
    if (x * x + y * y + z * z > dist * dist) continue;
    if (Math.sign(k.field.sampleXYZ(p.x + x, p.y + y, p.z + z) - foot) !== s0) return true;
  }
  return false;
}

describe('world field (verify)', () => {
  it('sphereTrace from inside tunnels and chambers never overshoots into the walls', () => {
    const k = nestKernel();
    const s = makeSceneWorld(7);
    const rng = rngSeed(11);
    const starts: Vec3[] = [...s.nest.chambers.map((c) => c.c), ...s.nest.tunnels.flatMap((t) => t.pts), v(450, -6.5, 470)];
    const radius = 0.3;
    let traced = 0, worst = Infinity;
    for (const o of starts) {
      if (k.field.sample(o) < radius + 0.05) continue;
      for (let n = 0; n < 60; n++) {
        const d = randomDir(rng);
        const t = k.field.sphereTrace(o, d, 60, radius);
        for (let s2 = 0; s2 <= t; s2 += 0.05) {
          const f = k.field.sampleXYZ(o.x + d.x * s2, o.y + d.y * s2, o.z + d.z * s2);
          if (f < worst) worst = f;
        }
        traced++;
      }
    }
    expect(traced).toBeGreaterThan(500);
    // the sweep sphere may touch the surface but must not cross into solid
    expect(worst).toBeGreaterThan(radius - 0.02);
  });

  it('is Lipschitz-bounded (<= ~1.15) everywhere around the nest, slab and primitives', () => {
    const k = nestKernel();
    const rng = rngSeed(5);
    let worst = 0;
    for (let n = 0; n < 40000; n++) {
      const a = v(220 + rngFloat(rng) * 420, -130 + rngFloat(rng) * 160, 220 + rngFloat(rng) * 300);
      const d = randomDir(rng);
      const h = 0.05 + rngFloat(rng) * 0.5;
      const fa = k.field.sample(a);
      const fb = k.field.sampleXYZ(a.x + d.x * h, a.y + d.y * h, a.z + d.z * h);
      worst = Math.max(worst, Math.abs(fb - fa) / h);
    }
    expect(worst).toBeLessThan(1.15);
  });

  it('project converges from 2 BU away around the test nest (walls, ceilings, slab ceiling)', () => {
    const k = nestKernel();
    const s = makeSceneWorld(7);
    const rng = rngSeed(23);
    const foot = k.walker.footOffset, out = v(0, 0, 0), nrm = v(0, 0, 0);
    let fails = 0, n = 0;
    for (const t of s.nest.tunnels) for (const c of t.pts) {
      for (let m = 0; m < 20; m++) {
        const d = randomDir(rng);
        const p = v(c.x + d.x * 2 * BU, c.y + d.y * 2 * BU, c.z + d.z * 2 * BU);
        n++;
        if (k.field.project(p, foot, out, nrm) && Math.abs(k.field.sample(out) - foot) <= 0.02 * BU) continue;
        // only count it if the level set really lies within 2 BU of p (brute-force search on a 0.5 mm lattice)
        if (levelSetWithin(k, p, foot, 2 * BU)) fails++;
      }
    }
    expect(n).toBeGreaterThan(300);
    expect(fails).toBe(0);
  });

  it('never returns NaN for finite queries far outside the world', () => {
    const k = nestKernel();
    const g = v(0, 0, 0);
    for (const p of [v(-5000, 10, -5000), v(1e5, -1e4, 3), v(350, 1e5, 350), v(-1, -1e5, -1)]) {
      expect(Number.isFinite(k.field.sample(p))).toBe(true);
      expect(Number.isFinite(k.field.gradient(p, g))).toBe(true);
      expect(Number.isFinite(g.x + g.y + g.z)).toBe(true);
    }
  });

  it('isUnderground: true in a chamber, false in open air and in solid soil', () => {
    const k = nestKernel();
    const s = makeSceneWorld(7);
    expect(k.field.isUnderground(s.nest.chambers[1].c)).toBe(true);
    expect(k.field.isUnderground(v(100, 30, 100))).toBe(false);
    expect(k.field.isUnderground(v(100, -40, 100))).toBe(false);
  });

  it('a flat world with no primitive and no carve: exact plane distance in the air and on the surface', () => {
    // (below the surface the saturated cavity term caps f at -0.5 BU and the smax lifts it by up to k/4: documented)
    const k = createKernel(makeFlatWorld({ h0: 3 }), emptyCarve(BU));
    for (const y of [3, 3.6, 4, 10]) expect(k.field.sampleXYZ(120, y, 140)).toBeCloseTo(y - 3, 9);
  });
});
