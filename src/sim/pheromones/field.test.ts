import { describe, expect, it } from 'vitest';
import { PHERO_EPS, PHERO_MAX, PHERO_SHARED_COLONY } from './balance';
import { newField, TEST_CELL } from './testkit';

const P = (x: number, y: number, z: number) => ({ x, y, z });
/** Centre of cell (i, j, k), mm. */
const C = (i: number, j: number, k: number) => P((i + 0.5) * TEST_CELL, (j + 0.5) * TEST_CELL, (k + 0.5) * TEST_CELL);

describe('pheromone field: deposit and sample', () => {
  it('deposits into the containing cell and reads it back exactly', () => {
    const f = newField();
    f.deposit(1, 'trail', P(100.3, 0.6, 200.9), 2);
    expect(f.sample(1, 'trail', P(100.3, 0.6, 200.9))).toBe(2);
    expect(f.sampleCell(1, 'trail', P(100.3, 0.6, 200.9))).toBe(2);
    expect(f.sample(1, 'home', P(100.3, 0.6, 200.9))).toBe(0);
    expect(f.sample(2, 'trail', P(100.3, 0.6, 200.9))).toBe(0); // trail is per colony
    expect(f.validate()).toEqual([]);
  });

  it('works at negative coordinates, on walls and ceilings (any integer cell)', () => {
    const f = newField();
    for (const p of [P(-5, -40, -300), P(10, 900, 3), P(64000, 12, 64000)]) {
      f.deposit(1, 'home', p, 1.5);
      expect(f.sampleCell(1, 'home', p)).toBe(1.5);
    }
    expect(f.activeCellCount(1, 'home')).toBe(3);
  });

  it('saturates per channel', () => {
    const f = newField();
    for (const ch of ['trail', 'home', 'alarm'] as const) {
      for (let i = 0; i < 100; i++) f.deposit(1, ch, C(3, 0, 3), 1);
      expect(f.sampleCell(1, ch, C(3, 0, 3))).toBe(PHERO_MAX[ch]);
    }
  });

  it('ignores bad input and positions outside the key range', () => {
    const f = newField();
    f.deposit(1, 'trail', P(NaN, 0, 0), 1);
    f.deposit(1, 'trail', P(0, 0, 0), -1);
    f.deposit(1, 'trail', P(0, 0, 0), NaN);
    f.deposit(1, 'trail', P(1e12, 0, 0), 1);
    expect(f.activeCellCount()).toBe(0);
    expect(f.sample(1, 'trail', P(1e12, 0, 0))).toBe(0);
    expect(f.sample(1, 'trail', P(NaN, 0, 0))).toBe(0);
  });

  it('blends with the 8 nearest cell centres when the blend is stronger than the own cell', () => {
    const f = newField();
    f.deposit(1, 'trail', C(10, 0, 10), 4);
    // Inside the empty neighbour, 3/4 cell from the deposit's centre (y at a cell-centre height): blend = 4 * 0.25.
    const q = P(11.25 * TEST_CELL, 0.5 * TEST_CELL, 10.5 * TEST_CELL);
    expect(f.sampleCell(1, 'trail', q)).toBe(0);
    expect(f.sample(1, 'trail', q)).toBeCloseTo(4 * 0.25, 6);
    // At a cell centre the blend equals the cell value.
    expect(f.sample(1, 'trail', C(10, 0, 10))).toBe(4);
  });

  it('shares the alarm channel between colonies; trail and home are separate', () => {
    const f = newField();
    f.deposit(3, 'alarm', C(1, 1, 1), 4);
    expect(f.sample(7, 'alarm', C(1, 1, 1))).toBe(4);
    expect(f.data.layers.map((l) => [l.colony, l.channel])).toEqual([[PHERO_SHARED_COLONY, 'alarm']]);
  });

  it('clearColony removes only that colony', () => {
    const f = newField();
    f.deposit(1, 'trail', C(0, 0, 0), 1);
    f.deposit(1, 'home', C(0, 0, 0), 1);
    f.deposit(2, 'trail', C(0, 0, 0), 1);
    f.deposit(1, 'alarm', C(0, 0, 0), 1);
    f.clearColony(1);
    expect(f.sample(1, 'trail', C(0, 0, 0))).toBe(0);
    expect(f.sample(1, 'home', C(0, 0, 0))).toBe(0);
    expect(f.sample(2, 'trail', C(0, 0, 0))).toBe(1);
    expect(f.sample(2, 'alarm', C(0, 0, 0))).toBe(1);
    expect(f.data.layers.length).toBe(2);
    expect(f.validate()).toEqual([]);
    f.deposit(1, 'trail', C(5, 0, 5), 2); // layer recreated after clear
    expect(f.sample(1, 'trail', C(5, 0, 5))).toBe(2);
  });

  it('forEachActiveCell visits every active cell once with its centre and value', () => {
    const f = newField();
    const cells = [[0, 0, 0], [1, 0, 0], [40, 2, -7], [-3, 0, 17]];
    cells.forEach(([i, j, k], n) => f.deposit(1, 'trail', C(i, j, k), n + 1));
    const seen: string[] = [];
    const n = f.forEachActiveCell(1, 'trail', (x, y, z, v) => seen.push(`${x},${y},${z}=${v}`));
    expect(n).toBe(4);
    expect(seen.sort()).toEqual(cells.map(([i, j, k], m) => {
      const c = C(i, j, k);
      return `${c.x},${c.y},${c.z}=${m + 1}`;
    }).sort());
    expect(f.forEachActiveCell(9, 'trail', () => {})).toBe(0);
  });

  it('layerVersion changes when cells change', () => {
    const f = newField();
    f.deposit(1, 'trail', C(0, 0, 0), 1);
    const v0 = f.layerVersion(1, 'trail');
    f.step(1);
    const v1 = f.layerVersion(1, 'trail');
    expect(v1).not.toBe(v0);
    f.deposit(1, 'trail', C(0, 0, 0), 1);
    expect(f.layerVersion(1, 'trail')).not.toBe(v1);
  });
});

describe('pheromone field: strongestNear', () => {
  it('finds the strongest cell within the radius, centre into out', () => {
    const f = newField();
    f.deposit(1, 'trail', C(10, 0, 10), 1);
    f.deposit(1, 'trail', C(13, 0, 10), 3);
    f.deposit(1, 'trail', C(40, 0, 10), 9); // out of range
    const out = P(0, 0, 0);
    const v = f.strongestNear(1, 'trail', C(10, 0, 10), 5 * TEST_CELL, out);
    expect(v).toBe(3);
    expect(out).toEqual(C(13, 0, 10));
    expect(f.strongestNear(1, 'trail', C(10, 0, 10), 5 * TEST_CELL, out, 5)).toBe(0);
    expect(f.strongestNear(1, 'home', C(10, 0, 10), 5 * TEST_CELL, out)).toBe(0);
  });

  it('gives the same answer by box scan and by list scan (canonical tie-break)', () => {
    const few = newField(), many = newField();
    for (const f of [few, many]) for (let i = 0; i < 6; i++) f.deposit(1, 'trail', C(i * 2, 0, 0), 2); // ties
    for (let i = 0; i < 4000; i++) many.deposit(1, 'trail', C(500 + (i % 60), 0, 500 + Math.floor(i / 60)), 1);
    const r = 6 * TEST_CELL; // box of 13^3 cells: list scan for `few`, box scan for `many`
    const a = P(0, 0, 0), b = P(0, 0, 0);
    expect(few.strongestNear(1, 'trail', C(5, 0, 0), r, a)).toBe(2);
    expect(many.strongestNear(1, 'trail', C(5, 0, 0), r, b)).toBe(2);
    expect(b).toEqual(a);
  });

  it('removes cells below the floor at the next decay step', () => {
    const f = newField();
    f.deposit(1, 'trail', C(0, 0, 0), PHERO_EPS * 1.01);
    f.step(60);
    expect(f.activeCellCount()).toBe(0);
    expect(f.stats().chunks).toBe(0);
    expect(f.validate()).toEqual([]);
  });
});
