import { describe, expect, it } from 'vitest';
import type { PheroChannel, PheroRegion } from '@/sim/types';
import { PHERO_EPS } from './balance';
import { rainWashFactors } from './factors';
import type { PheromoneRuntime } from './field';
import { newField, TEST_CELL, testRandom } from './testkit';

type Snapshot = Map<string, number>;

function snapshot(f: PheromoneRuntime, colonies: number[]): Snapshot {
  const m: Snapshot = new Map();
  for (const c of colonies) for (const ch of ['trail', 'home', 'alarm'] as PheroChannel[]) {
    if (ch === 'alarm' && c !== colonies[0]) continue; // one shared alarm layer
    f.forEachActiveCell(c, ch, (x, y, z, v) => m.set(`${c}|${ch}|${x}|${y}|${z}`, v));
  }
  return m;
}

/** Random cells for two colonies, all channels, around a few hundred mm. */
function scatter(f: PheromoneRuntime, seed: number, n = 3000): void {
  const r = testRandom(seed);
  for (let i = 0; i < n; i++) {
    const ch = (['trail', 'home', 'alarm'] as const)[i % 3];
    f.deposit(1 + (i % 2), ch, { x: r() * 800 - 100, y: r() * 120 - 40, z: r() * 800 }, 0.2 + r() * 5);
  }
}

const parse = (k: string) => k.split('|').slice(2).map(Number) as [number, number, number];

describe('washExposed (rain)', () => {
  it('AC4: changes only cells for which isExposed is true', () => {
    const f = newField();
    scatter(f, 7);
    const colonies = [1, 2];
    const before = snapshot(f, colonies);
    const isExposed = (_x: number, y: number, z: number) => y > 0 && z < 400; // open ground in one half
    const changed = f.washExposed({ trail: 0.5, home: 0.8, alarm: 0.9 }, isExposed);
    const after = snapshot(f, colonies);
    let n = 0;
    for (const [k, v] of before) {
      const [x, y, z] = parse(k);
      const ch = k.split('|')[1] as PheroChannel;
      const f0 = { trail: 0.5, home: 0.8, alarm: 0.9 }[ch];
      if (isExposed(x, y, z)) {
        n++;
        const want = Math.fround(v * f0);
        expect(after.get(k) ?? 0).toBe(want >= PHERO_EPS ? want : 0);
      } else {
        expect(after.get(k)).toBe(v);
      }
    }
    expect(changed).toBe(n);
    expect(n).toBeGreaterThan(100);
    expect(f.validate()).toEqual([]);
  });

  it('GDD 06 E10: shower halves an exposed trail cell in 69 +-3 s (decay off), downpour in 17 +-1 s; covered unchanged', () => {
    for (const [rain, halfS, tol] of [['shower', 69, 3], ['downpour', 17, 1]] as const) {
      const f = newField();
      const open = { x: 8, y: 8, z: 8 }, covered = { x: 8, y: 8, z: 200 };
      f.deposit(1, 'trail', open, 1);
      f.deposit(1, 'trail', covered, 1);
      const isExposed = (_x: number, _y: number, z: number) => z < 100;
      const k = { trail: 1, home: 1 };
      let t = 0;
      while (f.sample(1, 'trail', open) > 0.5 && t < 200) {
        f.washExposed(rainWashFactors(rain, 1, 0, k), isExposed);
        t++;
      }
      expect(Math.abs(t - halfS)).toBeLessThanOrEqual(tol);
      expect(f.sample(1, 'trail', covered)).toBe(1);
    }
  });

  it('rain factors: home slower than trail, alarm only by wind', () => {
    const k = rainWashFactors('downpour', 10, 0, { trail: 1, home: 1 });
    expect(k.trail).toBeCloseTo(Math.exp(-0.4), 9);
    expect(k.home).toBeLessThan(1);
    expect(k.home).toBeGreaterThan(k.trail);
    expect(k.alarm).toBe(1);
    const w = rainWashFactors(null, 10, 3, { trail: 1, home: 1 });
    expect(w.home).toBe(1);
    expect(w.trail).toBeLessThan(1);
    expect(w.alarm).toBeLessThan(w.trail);
  });
});

describe('wipeRegion (human events)', () => {
  const regions: [string, PheroRegion][] = [
    ['sphere', { kind: 'sphere', center: { x: 300, y: 10, z: 300 }, radius: 90 }],
    ['cylinder (sole)', { kind: 'cylinder', center: { x: 200, y: 0, z: 500 }, radius: 70, halfHeight: 30 }],
    ['rotated box (broom stroke)', { kind: 'box', center: { x: 350, y: 0, z: 350 }, halfX: 300, halfY: 25, halfZ: 75, yaw: 0.6 }],
    ['huge box (list path)', { kind: 'box', center: { x: 300, y: 0, z: 300 }, halfX: 5000, halfY: 25, halfZ: 5000 }],
  ];
  for (const [name, region] of regions) {
    it(`AC4: scales exactly the cells whose centres lie in a ${name}`, () => {
      const f = newField();
      scatter(f, 11);
      const before = snapshot(f, [1, 2]);
      const inside = insideTest(region);
      const changed = f.wipeRegion(region, { trail: 0.3, home: 0.6 });
      const after = snapshot(f, [1, 2]);
      let n = 0;
      for (const [k, v] of before) {
        const [x, y, z] = parse(k);
        const ch = k.split('|')[1] as PheroChannel;
        if (inside(x, y, z)) {
          n++;
          const want = Math.fround(v * (ch === 'home' ? 0.6 : 0.3)); // alarm takes the trail factor
          expect(after.get(k) ?? 0).toBe(want >= PHERO_EPS ? want : 0);
        } else {
          expect(after.get(k)).toBe(v);
        }
      }
      expect(changed).toBe(n);
      expect(n).toBeGreaterThan(5);
      expect(f.validate()).toEqual([]);
    });
  }

  it('limits to one colony (plus the shared alarm) and honours a filter', () => {
    const f = newField();
    const p = { x: 8, y: 8, z: 8 }, q = { x: 8, y: 24, z: 8 };
    for (const c of [1, 2]) { f.deposit(c, 'trail', p, 4); f.deposit(c, 'trail', q, 4); }
    f.deposit(1, 'alarm', p, 4);
    f.wipeRegion({ kind: 'sphere', center: p, radius: 50 }, 0.5, { colony: 1, filter: (_x, y) => y < TEST_CELL });
    expect(f.sample(1, 'trail', p)).toBe(2);
    expect(f.sampleCell(1, 'trail', q)).toBe(4); // filtered out
    expect(f.sample(2, 'trail', p)).toBe(4); // other colony untouched
    expect(f.sample(2, 'alarm', p)).toBe(2); // shared alarm is everyone's
  });

  it('GDD 04 E15 (pheromone part): vacuum over covered floor -> 0, kick-space cells keep their trail', () => {
    const f = newField();
    const floor = { x: 100, y: 8, z: 100 }, kick = { x: 100, y: 8, z: 260 };
    f.deposit(1, 'trail', floor, 12);
    f.deposit(1, 'trail', kick, 12);
    const strip: PheroRegion = { kind: 'box', center: { x: 100, y: 0, z: 180 }, halfX: 140, halfY: 30, halfZ: 200 };
    f.wipeRegion(strip, { trail: 0, home: 0 }, { filter: (_x, _y, z) => z < 200 }); // kick space under the units
    expect(f.sample(1, 'trail', floor)).toBe(0);
    expect(f.sample(1, 'trail', kick)).toBe(12);
    f.step(1);
    expect(f.activeCellCount(1, 'trail')).toBe(1);
  });

  it('ignores invalid regions and factors', () => {
    const f = newField();
    f.deposit(1, 'trail', { x: 8, y: 8, z: 8 }, 4);
    expect(f.wipeRegion({ kind: 'sphere', center: { x: NaN, y: 0, z: 0 }, radius: 10 }, 0)).toBe(0);
    expect(f.wipeRegion({ kind: 'sphere', center: { x: 8, y: 8, z: 8 }, radius: -1 }, 0)).toBe(0);
    expect(f.wipeRegion({ kind: 'sphere', center: { x: 8, y: 8, z: 8 }, radius: 10 }, NaN)).toBe(0);
    expect(f.sample(1, 'trail', { x: 8, y: 8, z: 8 })).toBe(4);
  });
});

/** Independent containment reference (same definitions as the module docs). */
function insideTest(r: PheroRegion): (x: number, y: number, z: number) => boolean {
  const c = r.center;
  if (r.kind === 'sphere') return (x, y, z) => (x - c.x) ** 2 + (y - c.y) ** 2 + (z - c.z) ** 2 <= r.radius ** 2;
  if (r.kind === 'cylinder') return (x, y, z) => Math.abs(y - c.y) <= r.halfHeight && (x - c.x) ** 2 + (z - c.z) ** 2 <= r.radius ** 2;
  const yaw = r.yaw ?? 0;
  return (x, y, z) => {
    // Rotate the offset by -yaw about +Y.
    const dx = x - c.x, dz = z - c.z;
    const lx = Math.cos(-yaw) * dx + Math.sin(-yaw) * dz;
    const lz = -Math.sin(-yaw) * dx + Math.cos(-yaw) * dz;
    return Math.abs(lx) <= r.halfX && Math.abs(y - c.y) <= r.halfY && Math.abs(lz) <= r.halfZ;
  };
}
