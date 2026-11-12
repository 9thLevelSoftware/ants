import { describe, expect, it } from 'vitest';
import type { Vec3 } from '@/core/math/vec3';
import { rngRange, rngSeed } from '@/core/rng';
import { createCarveGrid, type CarveGrid } from '@/sim/nest/carve/grid';
import { emptyCarve } from '@/sim/kernel.testWorld';
import { createNestNav, type NestNav } from './nestNav';

const BU = 4;
const V = BU / 2;
const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

/** A small network: two chambers joined by a bent tunnel, plus a side branch. */
function network(): { grid: CarveGrid; entrance: Vec3; chamber: Vec3 } {
  const grid = createCarveGrid(emptyCarve(BU));
  const entrance = v(20, -10, 20), chamber = v(100, -60, 90);
  grid.carveCapsule(entrance, v(50, -30, 40), BU);
  grid.carveCapsule(v(50, -30, 40), v(90, -55, 85), BU);
  grid.carveEllipsoid(chamber, v(16, 5, 16));
  grid.carveCapsule(v(50, -30, 40), v(80, -35, 20), BU * 0.9);
  return { grid, entrance, chamber };
}

/** Every passable sample's distance in both navs must be identical. */
function compareAll(grid: CarveGrid, a: NestNav, b: NestNav, id: string): number {
  let n = 0;
  for (const key of grid.data.keys) {
    grid.forEachOpenSample(key, (i, j, k) => {
      const p = v(i * V, j * V, k * V);
      const da = a.distanceAt(id, p), db = b.distanceAt(id, p);
      if (da !== db) throw new Error(`mismatch at ${i},${j},${k}: ${da} vs ${db}`);
      n++;
    });
  }
  return n;
}

describe('nest nav', () => {
  it('incremental updates after random carving equal a full rebuild', () => {
    const { grid, entrance, chamber } = network();
    const nav = createNestNav(grid);
    nav.setTarget('exit', { points: [entrance], radius: BU });
    nav.setTarget('chamber', { points: [chamber], radius: 2 * BU });
    nav.build('exit');
    nav.build('chamber');
    const rng = rngSeed(42);
    for (let step = 0; step < 40; step++) {
      const c = v(rngRange(rng, 10, 120), rngRange(rng, -70, -5), rngRange(rng, 10, 110));
      if (step % 3 === 0) grid.carveCapsule(c, v(c.x + rngRange(rng, -20, 20), c.y + rngRange(rng, -10, 10), c.z + rngRange(rng, -20, 20)), rngRange(rng, 1.5, 5));
      else grid.carveSphere(c, rngRange(rng, 1.5, 7));
      // query only sometimes, so several changes are applied in one go
      if (step % 4 === 0) nav.distanceAt('exit', entrance);
    }
    const fresh = createNestNav(grid);
    fresh.setTarget('exit', { points: [entrance], radius: BU });
    fresh.setTarget('chamber', { points: [chamber], radius: 2 * BU });
    expect(compareAll(grid, nav, fresh, 'exit')).toBeGreaterThan(1000);
    compareAll(grid, nav, fresh, 'chamber');
    expect(nav.stats().updates).toBeGreaterThan(0);
  });

  it('distance decreases strictly along the descent steps to the target, and stepDir points at them', () => {
    const { grid, entrance, chamber } = network();
    const nav = createNestNav(grid);
    nav.setTarget('exit', { points: [entrance], radius: BU });
    const p = v(chamber.x + 10, chamber.y - 3, chamber.z + 8);
    let d = nav.distanceAt('exit', p);
    expect(d).toBeGreaterThan(80);
    expect(d).toBeLessThan(Infinity);
    const q = v(0, 0, 0), dir = v(0, 0, 0);
    nav.nearestOpen(p, q);
    let cur = v(q.x, q.y, q.z);
    d = nav.distanceAt('exit', cur);
    let steps = 0;
    while (d > 0 && steps < 1000) {
      nav.stepDir('exit', cur, dir);
      nav.lookahead('exit', cur, 1, q);
      const toNext = v(q.x - cur.x, q.y - cur.y, q.z - cur.z);
      const l = Math.hypot(toNext.x, toNext.y, toNext.z);
      expect(Math.abs(dir.x * toNext.x + dir.y * toNext.y + dir.z * toNext.z - l)).toBeLessThan(1e-9);
      const dn = nav.distanceAt('exit', q);
      expect(dn).toBeLessThan(d);
      d = dn;
      cur = v(q.x, q.y, q.z);
      steps++;
    }
    expect(d).toBe(0);
    expect(steps).toBeGreaterThan(30);
    // the end point is inside the seed sphere
    expect(Math.hypot(cur.x - entrance.x, cur.y - entrance.y, cur.z - entrance.z)).toBeLessThanOrEqual(BU + 1e-9);
  });

  it('unreachable regions report unreachable, including cavities touching only diagonally', () => {
    const grid = createCarveGrid(emptyCarve(BU));
    grid.carveSphere(v(20, -20, 20), 6);
    grid.carveSphere(v(80, -20, 20), 6);
    // two single-sample-wide cells that touch only along a voxel edge: (40,-20,20)+(42,-18,20)
    const data = grid.data;
    const nav = createNestNav(grid);
    nav.setTarget('a', { points: [v(20, -20, 20)], radius: 3 });
    expect(nav.distanceAt('a', v(20, -20, 24))).toBeLessThan(Infinity);
    expect(nav.distanceAt('a', v(80, -20, 20))).toBe(Infinity);
    expect(nav.componentAt(v(20, -20, 20))).not.toBe(nav.componentAt(v(80, -20, 20)));
    expect(nav.componentAt(v(200, 200, 200))).toBe(-1);
    expect(nav.distanceAt('a', v(200, 200, 200))).toBe(Infinity);
    expect(data.keys.length).toBeGreaterThan(0);
    // join them: reachable now (incremental), then fill the joint: unreachable again (full rebuild)
    grid.carveCapsule(v(20, -20, 20), v(80, -20, 20), 2.5);
    const joined = nav.distanceAt('a', v(80, -20, 20));
    expect(joined).toBeGreaterThan(50);
    expect(joined).toBeLessThan(75);
    expect(nav.componentAt(v(20, -20, 20))).toBe(nav.componentAt(v(80, -20, 20)));
    grid.fillSphere(v(50, -20, 20), 6);
    expect(nav.distanceAt('a', v(80, -20, 20))).toBe(Infinity);
    expect(nav.stats().rebuilds).toBeGreaterThanOrEqual(2);
  });

  it('does not leak through a wall touching at a voxel edge or corner', () => {
    const grid = createCarveGrid(emptyCarve(BU));
    // open exactly two diagonal samples by hand-sized brushes (radius < half a voxel opens a single sample)
    const s = (i: number, j: number, k: number) => grid.carveSphere(v(i * V, j * V, k * V), 0.6, {});
    s(10, -10, 10); s(11, -9, 10); // edge-diagonal
    s(20, -10, 10); s(21, -9, 11); // corner-diagonal
    s(30, -10, 10); s(31, -10, 10); // face neighbours (connected)
    const nav = createNestNav(grid);
    const comp = (i: number, j: number, k: number) => nav.componentAt(v(i * V, j * V, k * V));
    expect(comp(10, -10, 10)).not.toBe(comp(11, -9, 10));
    expect(comp(20, -10, 10)).not.toBe(comp(21, -9, 11));
    expect(comp(30, -10, 10)).toBe(comp(31, -10, 10));
  });

  it('respects isBlocked (hard group never passable)', () => {
    const grid = createCarveGrid(emptyCarve(BU));
    grid.carveCapsule(v(0, -20, 20), v(100, -20, 20), 4);
    const nav = createNestNav(grid, { isBlocked: (x) => x > 48 && x < 52 });
    nav.setTarget('w', { points: [v(0, -20, 20)], radius: 3 });
    expect(nav.distanceAt('w', v(30, -20, 20))).toBeLessThan(Infinity);
    expect(nav.distanceAt('w', v(80, -20, 20))).toBe(Infinity);
  });

  it('builds lazily, evicts least recently used fields and rebuilds them on demand', () => {
    const { grid, entrance, chamber } = network();
    const nav = createNestNav(grid, { maxFields: 2 });
    nav.setTarget('a', { points: [entrance], radius: BU });
    nav.setTarget('b', { points: [chamber], radius: BU });
    nav.setTarget('c', { points: [v(80, -35, 20)], radius: BU });
    expect(nav.stats().builtFields).toBe(0);
    const da = nav.distanceAt('a', chamber);
    nav.distanceAt('b', entrance);
    nav.distanceAt('c', entrance);
    expect(nav.stats().builtFields).toBe(2);
    expect(nav.stats().evictions).toBe(1);
    expect(nav.distanceAt('a', chamber)).toBe(da);
    expect(nav.stats().builtFields).toBe(2);
    expect(nav.removeTarget('c')).toBe(true);
    expect(nav.distanceAt('c', entrance)).toBe(Infinity);
  });

  it('fallback seeds (target point in solid) follow carving exactly: none -> fallback -> a closer fallback', () => {
    const grid = createCarveGrid(emptyCarve(BU));
    grid.carveCapsule(v(0, -20, 20), v(100, -20, 20), BU);
    const seedP = v(31, -20, 31); // in solid, no sample within 1 mm, nothing open within the 4^3 search block
    const nav = createNestNav(grid);
    nav.setTarget('t', { points: [seedP], radius: 1 });
    expect(nav.distanceAt('t', v(30, -20, 20))).toBe(Infinity); // no seed at all yet
    const check = () => {
      const fresh = createNestNav(grid);
      fresh.setTarget('t', { points: [seedP], radius: 1 });
      return compareAll(grid, nav, fresh, 't');
    };
    // a spur ending 1.5 voxels from the point: its tip becomes the fallback seed (incremental: a new 0 seed)
    grid.carveCapsule(v(30, -20, 20), v(30, -20, 28), 1.5);
    const updates0 = nav.stats().updates, rebuilds0 = nav.stats().rebuilds;
    expect(nav.distanceAt('t', v(30, -20, 20))).toBe(8); // 4 face steps to the spur tip at z = 28
    expect(nav.stats().updates).toBe(updates0 + 1);
    expect(check()).toBeGreaterThan(100);
    // a single sample opened next to the point, still outside its radius: the fallback moves (full rebuild)
    grid.carveSphere(v(30, -20, 30), 0.6);
    expect(nav.distanceAt('t', v(30, -20, 30))).toBe(0);
    expect(nav.stats().rebuilds).toBe(rebuilds0 + 1);
    check();
  });

  it('invalidateBox re-evaluates hard-group blocking (a hard primitive placed, moved, removed)', () => {
    const grid = createCarveGrid(emptyCarve(BU));
    grid.carveCapsule(v(0, -20, 20), v(100, -20, 20), BU);
    let wallX = -1; // a 5 mm thick blocking wall across the tunnel at x = wallX (-1: none)
    const isBlocked = (x: number) => wallX >= 0 && Math.abs(x - wallX) < 2.5;
    const nav = createNestNav(grid, { isBlocked });
    nav.setTarget('w', { points: [v(0, -20, 20)], radius: 3 });
    const wallBox = (x: number) => ({ i0: Math.floor((x - 3) / V), i1: Math.ceil((x + 3) / V), j0: -14, j1: -6, k0: 6, k1: 14 });
    const check = () => {
      const fresh = createNestNav(grid, { isBlocked });
      fresh.setTarget('w', { points: [v(0, -20, 20)], radius: 3 });
      compareAll(grid, nav, fresh, 'w');
      expect(nav.componentAt(v(0, -20, 20))).toBe(fresh.componentAt(v(0, -20, 20)));
    };
    const far = v(80, -20, 20), mid = v(60, -20, 20);
    expect(nav.distanceAt('w', far)).toBeLessThan(Infinity);
    wallX = 50; nav.invalidateBox(wallBox(50));
    expect(nav.distanceAt('w', far)).toBe(Infinity);
    check();
    wallX = 70; nav.invalidateBox(wallBox(50)); nav.invalidateBox(wallBox(70));
    expect(nav.distanceAt('w', mid)).toBeLessThan(Infinity);
    expect(nav.distanceAt('w', far)).toBe(Infinity);
    check();
    const rebuilds = nav.stats().rebuilds, updates = nav.stats().updates;
    wallX = -1; nav.invalidateBox(wallBox(70));
    expect(nav.distanceAt('w', far)).toBeLessThan(Infinity);
    expect(nav.stats().rebuilds).toBe(rebuilds); // only gains: applied incrementally
    expect(nav.stats().updates).toBe(updates + 1);
    check();
  });

  it('a distance across a straight tunnel is close to the Euclidean length', () => {
    const grid = createCarveGrid(emptyCarve(BU));
    grid.carveCapsule(v(0, -20, 20), v(120, -20, 20), BU);
    const nav = createNestNav(grid);
    nav.setTarget('end', { points: [v(0, -20, 20)], radius: 1 });
    const d = nav.distanceAt('end', v(120, -20, 20));
    expect(d).toBeGreaterThan(118);
    expect(d).toBeLessThan(124);
  });
});
