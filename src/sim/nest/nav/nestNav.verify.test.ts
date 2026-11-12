// Adversarial checks of the nest navigation (reviewer tests, F2-kernel acceptance criterion 6).
import { describe, expect, it } from 'vitest';
import type { Vec3 } from '@/core/math/vec3';
import { rngFloat, rngRange, rngSeed } from '@/core/rng';
import { createCarveGrid, type CarveGrid } from '@/sim/nest/carve/grid';
import { createKernel } from '@/sim/kernel';
import { carveTestNest, emptyCarve, makeSceneWorld } from '@/sim/kernel.testWorld';
import { createNestNav, type NestNav } from './nestNav';

const BU = 4;
const V = BU / 2;
const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

function mismatches(grid: CarveGrid, a: NestNav, b: NestNav, id: string): { n: number; bad: string[] } {
  let n = 0;
  const bad: string[] = [];
  for (const key of grid.data.keys) {
    grid.forEachOpenSample(key, (i, j, k) => {
      const p = v(i * V, j * V, k * V);
      const da = a.distanceAt(id, p), db = b.distanceAt(id, p);
      if (da !== db && bad.length < 5) bad.push(`${i},${j},${k}: incremental ${da} vs rebuild ${db}`);
      n++;
    });
  }
  return { n, bad };
}

describe('nest nav (verify)', () => {
  it('mixed random carves AND fills, queried in between, equal a fresh build (with hard-group blocking)', () => {
    const s = makeSceneWorld(7);
    const k = createKernel(s.world, emptyCarve(BU));
    carveTestNest(k, s.nest);
    const seeds = { points: [s.nest.entrance], radius: 1.5 * BU };
    k.nav.setTarget('exit', seeds);
    k.nav.setTarget('c3', { points: [s.nest.chambers[2].c], radius: 2 * BU });
    k.nav.build('exit');
    const rng = rngSeed(77);
    for (let step = 0; step < 60; step++) {
      const c = v(rngRange(rng, 240, 360), rngRange(rng, -120, 0), rngRange(rng, 240, 420));
      const r = rngRange(rng, 1, 6);
      if (rngFloat(rng) < 0.25) k.fillSphere(c, r);
      else if (step % 2) k.carveSphere(c, r);
      else k.carveCapsule(c, v(c.x + rngRange(rng, -20, 20), c.y + rngRange(rng, -10, 10), c.z + rngRange(rng, -20, 20)), r);
      if (step % 3 === 0) { k.nav.distanceAt('exit', s.nest.entrance); }
      if (step % 7 === 0) { k.nav.distanceAt('c3', s.nest.entrance); }
    }
    const fresh = createNestNav(k.carve, { isBlocked: (x, y, z) => k.field.hardXYZ(x, y, z) <= 0 });
    fresh.setTarget('exit', seeds);
    fresh.setTarget('c3', { points: [s.nest.chambers[2].c], radius: 2 * BU });
    for (const id of ['exit', 'c3']) {
      const r = mismatches(k.carve, k.nav, fresh, id);
      expect(r.n).toBeGreaterThan(1000);
      expect(r.bad, r.bad.join('\n')).toEqual([]);
    }
    // components agree with a fresh service too
    expect(k.nav.componentAt(s.nest.entrance)).toBe(fresh.componentAt(s.nest.entrance));
  });

  it('a seed that fell back to the nearest voxel stays consistent with a rebuild after a carve opens the seed sphere', () => {
    // Seed point inside solid, 1.5 voxels from a tunnel: no passable sample within the 1 mm radius, so the full build
    // seeds the nearest passable sample instead. A later carve opens samples inside the seed sphere: a fresh build
    // now seeds ONLY those; the incrementally updated field must agree.
    const grid = createCarveGrid(emptyCarve(BU));
    grid.carveCapsule(v(0, -20, 20), v(60, -20, 20), BU); // tunnel along x, radius 4 mm
    const seedP = v(30, -20, 20 + 4 + 1.5 * V); // just outside the tunnel wall
    const nav = createNestNav(grid);
    nav.setTarget('t', { points: [seedP], radius: 1 });
    const before = nav.distanceAt('t', v(30, -20, 20));
    expect(before).toBeLessThan(Infinity); // the fallback seed made the field usable
    grid.carveSphere(seedP, 1.6); // opens the seed point itself (and the samples next to it)
    const fresh = createNestNav(grid);
    fresh.setTarget('t', { points: [seedP], radius: 1 });
    const r = mismatches(grid, nav, fresh, 't');
    expect(r.bad, r.bad.join('\n')).toEqual([]);
  });

  it('descending stepDir from every open sample of the test nest reaches the target with strictly falling distance', () => {
    const s = makeSceneWorld(7);
    const k = createKernel(s.world, emptyCarve(BU));
    carveTestNest(k, s.nest);
    k.nav.setTarget('c3', { points: [s.nest.chambers[2].c], radius: 2 * BU });
    const dir = v(0, 0, 0), q = v(0, 0, 0);
    let walked = 0, unreachable = 0;
    for (const key of k.carve.data.keys) {
      k.carve.forEachOpenSample(key, (i, j, kk) => {
        if ((i + j + kk) % 23 !== 0) return; // a sparse sample keeps the test fast
        let p = v(i * V, j * V, kk * V);
        let d = k.nav.distanceAt('c3', p);
        if (d === Infinity) { unreachable++; return; }
        for (let n = 0; n < 2000 && d > 0; n++) {
          const ret = k.nav.stepDir('c3', p, dir);
          expect(ret).toBe(d);
          k.nav.lookahead('c3', p, 1, q);
          const dn = k.nav.distanceAt('c3', q);
          expect(dn).toBeLessThan(d);
          p = v(q.x, q.y, q.z);
          d = dn;
        }
        expect(d).toBe(0);
        walked++;
      });
    }
    expect(walked).toBeGreaterThan(100);
    // the test nest is one connected network apart from cells cut off by the hard slab
    expect(unreachable).toBeLessThan(walked * 0.05);
  });

  it('distances never leak through a one-voxel solid wall between two parallel tunnels', () => {
    const grid = createCarveGrid(emptyCarve(BU));
    // two tunnels whose walls are 1.2 voxels apart (the iso surfaces), joined only at the far end
    const r = 3;
    const gap = 2 * r + 1.2 * V;
    grid.carveCapsule(v(0, -30, 20), v(80, -30, 20), r);
    grid.carveCapsule(v(0, -30, 20 + gap), v(80, -30, 20 + gap), r);
    grid.carveCapsule(v(80, -30, 20), v(80, -30, 20 + gap), r);
    const nav = createNestNav(grid);
    nav.setTarget('a', { points: [v(0, -30, 20)], radius: 2 });
    const d = nav.distanceAt('a', v(0, -30, 20 + gap));
    // the only route is 80 out, across, 80 back: about 160 + gap mm
    expect(d).toBeGreaterThan(150);
  });
});
