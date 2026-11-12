// Adversarial checks of the surface walker (reviewer tests, F2-kernel acceptance criteria 3 and 7).
import { describe, expect, it } from 'vitest';
import type { Vec3 } from '@/core/math/vec3';
import { rngFloat, rngRange, rngSeed } from '@/core/rng';
import { createKernel } from '@/sim/kernel';
import { carveTestNest, emptyCarve, makeFlatWorld, makePrim, makeSceneWorld } from '@/sim/kernel.testWorld';
import { createWalkerKin, walkerPlace, walkerStep, walkerSurfaceChanged, type WalkerKin } from './walker';

const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const finiteKin = (w: WalkerKin) => [w.pos, w.up, w.fwd, w.vel].every((a) => Number.isFinite(a.x + a.y + a.z)) && Number.isFinite(w.gait + w.speed);

describe('surface walker (verify)', () => {
  it('walkers survive digging and filling around them (attached walkers stay out of solids, nothing NaN)', () => {
    const s = makeSceneWorld(7);
    const k = createKernel(s.world, emptyCarve(4));
    carveTestNest(k, s.nest);
    const rng = rngSeed(4);
    const ws: WalkerKin[] = [];
    for (let i = 0; ws.length < 40 && i < 400; i++) {
      const base = i % 2 ? s.nest.chambers[i % 3].c : v(rngRange(rng, 200, 340), 20, rngRange(rng, 200, 340));
      const w = createWalkerKin(k.walker.footOffset);
      if (walkerPlace(k.field, w, v(base.x + rngRange(rng, -5, 5), base.y, base.z + rngRange(rng, -5, 5)), { heading: v(1, 0, 0.3) })) ws.push(w);
    }
    expect(ws.length).toBe(40);
    let bad = 0, airInSolid = 0;
    const dir = v(0, 0, 0);
    for (let tick = 0; tick < 400; tick++) {
      // every tick one brush lands right next to a random walker
      const target = ws[tick % ws.length];
      const c = v(target.pos.x + rngRange(rng, -3, 3), target.pos.y + rngRange(rng, -4, 1), target.pos.z + rngRange(rng, -3, 3));
      if (tick % 3 === 0) k.fillSphere(c, rngRange(rng, 1, 5)); else k.carveSphere(c, rngRange(rng, 1, 6));
      for (const w of ws) if (Math.hypot(w.pos.x - c.x, w.pos.y - c.y, w.pos.z - c.z) < 12) walkerSurfaceChanged(k.field, w);
      for (const w of ws) {
        dir.x = rngFloat(rng) - 0.5; dir.y = rngFloat(rng) - 0.5; dir.z = rngFloat(rng) - 0.5;
        const st = walkerStep(k.field, w, dir, 24, 0.1);
        if (!finiteKin(w)) bad++;
        const f = k.field.sample(w.pos);
        if (w.medium !== 'air' && st !== 'failed' && f < 0.3 * w.footOffset) bad++;
        if (w.medium === 'air' && f < 0) airInSolid++;
      }
    }
    expect(bad).toBe(0);
    // a buried walker is put into 'air' and pops out on its next steps; it must not stay buried for long
    expect(airInSolid).toBeLessThan(40 * 400 * 0.01);
    for (const w of ws) expect(w.medium === 'air' ? true : k.field.sample(w.pos) >= 0.3 * w.footOffset).toBe(true);
  }, 60_000);

  it('does not tunnel through a thin hard sheet (0.8 mm leaf-like plate, foot offset 0.6 mm)', () => {
    const plate = makePrim(1, 'box', v(100, 20, 100), v(30, 0.4, 30), { material: 'leaf' });
    const k = createKernel(makeFlatWorld({ size: 200, prims: [plate] }), emptyCarve(4));
    const rng = rngSeed(8);
    let crossings = 0, minF = Infinity;
    for (let n = 0; n < 30; n++) {
      const w = createWalkerKin(k.walker.footOffset);
      const a = rngFloat(rng) * Math.PI * 2;
      expect(walkerPlace(k.field, w, v(100 + rngRange(rng, -20, 20), 22, 100 + rngRange(rng, -20, 20)), { heading: v(Math.cos(a), 0, Math.sin(a)) })).toBe(true);
      expect(w.up.y).toBeGreaterThan(0.99);
      for (let i = 0; i < 600; i++) {
        const above = w.pos.y > 20;
        const inside = Math.abs(w.pos.x - 100) < 30 && Math.abs(w.pos.z - 100) < 30;
        walkerStep(k.field, w, null, 24, 1 / 30);
        minF = Math.min(minF, k.field.sample(w.pos));
        // switching sides of the plate is only legal around its rim (outside the footprint)
        const insideAfter = Math.abs(w.pos.x - 100) < 30 && Math.abs(w.pos.z - 100) < 30;
        if (inside && insideAfter && (w.pos.y > 20) !== above && w.medium !== 'air') crossings++;
      }
    }
    expect(crossings).toBe(0);
    expect(minF).toBeGreaterThan(0.3 * k.walker.footOffset);
  });

  it('works at Camponotus scale (BU = 9): walks a tunnel and stays on the level set', () => {
    const bu = 9;
    const k = createKernel(makeFlatWorld({ bu, size: 600 }), emptyCarve(bu));
    k.carveCapsule(v(100, -40, 300), v(500, -40, 300), bu, { force: true });
    const w = createWalkerKin(k.walker.footOffset);
    expect(walkerPlace(k.field, w, v(120, -40 - bu + 2, 300), { heading: v(1, 0, 0) })).toBe(true);
    expect(w.medium).toBe('cavity');
    for (let i = 0; i < 300; i++) {
      expect(walkerStep(k.field, w, v(1, 0, 0), 6 * bu, 0.1)).toBe('ok');
      expect(Math.abs(k.field.sample(w.pos) - w.footOffset)).toBeLessThan(0.02 * bu);
    }
    expect(w.pos.x).toBeGreaterThan(400);
  });

  it('a bogus huge speed does not stall the simulation (bounded work per call)', () => {
    const k = createKernel(makeFlatWorld({ size: 400 }), emptyCarve(4));
    const w = createWalkerKin(k.walker.footOffset);
    expect(walkerPlace(k.field, w, v(200, 5, 200), { heading: v(1, 0, 0) })).toBe(true);
    const t0 = performance.now();
    walkerStep(k.field, w, null, 1e7, 0.1); // 1 km in one call: 1e6 substeps of half a voxel
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(50);
  });
});
