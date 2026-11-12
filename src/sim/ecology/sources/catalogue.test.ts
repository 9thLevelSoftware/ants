// Acceptance 2: every Tier 1 source kind of GDD 05 exists with the chapter's numbers (§0, §1.2), table-driven.

import { describe, expect, it } from 'vitest';
import { FOOD_VARIANTS, type FoodVariant } from '@/sim/types';
import { SOURCE_CATALOGUE, SOURCE_ODOUR_REF_BU } from '@/sim/balance/ecology';
import { availableAtTier, sourceDef } from './def';

interface Row {
  v: FoodVariant; kind: string; form: string; c: number; p: number; bulk: number; units: [number, number];
  poolCap: number; refill: number; slots: number; drink: number; hard: number; odour: number; q: number; life: number;
}
/** GDD 05 §1.2 rows (and §0 T1 rules) transcribed by hand. life = removal age in gd (0 = never). */
const T1_EXPECTED: Row[] = [
  { v: 'flower', kind: 'nectar', form: 'liquid', c: 1.0, p: 0, bulk: 1, units: [1.5, 1.5], poolCap: 1.5, refill: 4, slots: 2, drink: 1, hard: 1, odour: 10, q: 0.8, life: 0 },
  { v: 'honeydew-film', kind: 'honeydew', form: 'liquid', c: 1.0, p: 0, bulk: 1, units: [0.5, 0.5], poolCap: 0.5, refill: 1.0, slots: 8, drink: 0.25, hard: 1, odour: 12, q: 0.6, life: 0 },
  { v: 'insect-small', kind: 'carrion', form: 'pick', c: 0.02, p: 0.5, bulk: 0.5, units: [1, 1], poolCap: 0, refill: 0, slots: 1, drink: 1, hard: 1, odour: 8, q: 0.9, life: 3 },
  { v: 'insect-medium', kind: 'carrion', form: 'tear', c: 0.1, p: 4, bulk: 5, units: [1, 1], poolCap: 0, refill: 0, slots: 3, drink: 1, hard: 1.5, odour: 20, q: 0.9, life: 3 }, // T1 removal age of all stageless carrion (review decision)
  { v: 'crumb-starch', kind: 'crumb', form: 'pick', c: 0.7, p: 0.05, bulk: 0.6, units: [5, 40], poolCap: 0, refill: 0, slots: 8, drink: 1, hard: 1, odour: 15, q: 0.6, life: 0 },
  { v: 'crumb-protein', kind: 'crumb', form: 'pick', c: 0.2, p: 0.6, bulk: 0.6, units: [3, 15], poolCap: 0, refill: 0, slots: 8, drink: 1, hard: 1, odour: 15, q: 0.9, life: 0 },
  { v: 'sugar-granules', kind: 'sugar', form: 'pick', c: 0.5, p: 0, bulk: 0.3, units: [50, 300], poolCap: 0, refill: 0, slots: 8, drink: 1, hard: 1, odour: 10, q: 0.8, life: 0 },
  { v: 'sugary-spill', kind: 'sugar', form: 'liquid', c: 1.0, p: 0, bulk: 1, units: [40, 40], poolCap: 0, refill: 0, slots: 24, drink: 1, hard: 1, odour: 30, q: 0.9, life: 0 },
];

describe('source catalogue: Tier 1 kinds (GDD 05 §0, §1.2)', () => {
  it.each(T1_EXPECTED)('$v has the chapter numbers', (r) => {
    const d = sourceDef(r.v, 1);
    expect(d.tier).toBe(1);
    expect(availableAtTier(r.v, 1)).toBe(true);
    expect([d.kind, d.form]).toEqual([r.kind, r.form]);
    expect([d.c, d.p, d.unitBulk]).toEqual([r.c, r.p, r.bulk]);
    expect(d.units).toEqual(r.units);
    expect([d.poolCap, d.refillPerGd]).toEqual([r.poolCap, r.refill]);
    expect(d.slots).toEqual([r.slots, r.slots]);
    expect([d.drinkRateMult, d.hardness, d.odourBu, d.quality]).toEqual([r.drink, r.hard, r.odour, r.q]);
    expect(d.lifetimeGd).toBe(r.life);
    expect(d.window).toBeNull(); // T1: flowers always open; the others have no window
  });

  it('T1 honeydew sites do not decay; T2 films have a 0.3 gd half-life and no refill (§0, §1.2)', () => {
    expect(sourceDef('honeydew-film', 1).halfLifeGd).toBe(0);
    expect(sourceDef('honeydew-film', 2).halfLifeGd).toBe(0.3);
    expect(sourceDef('honeydew-film', 2).refillPerGd).toBe(0);
  });

  it('flowers are always open in T1 and open on days 3-18 in T2; carrion keeps 3 gd only in T1', () => {
    expect(sourceDef('flower', 1).window).toBeNull();
    expect(sourceDef('flower', 2).window).toEqual([3, 18]);
    expect(sourceDef('insect-small', 2).lifetimeGd).toBe(0); // T2: the stage clock removes it
    expect(sourceDef('insect-medium', 2).lifetimeGd).toBe(0);
    expect(sourceDef('flower', 1).refillDaylightOnly).toBe(true);
  });

  it('crumb clusters smell at 15 BU and single crumbs at 6 BU', () => {
    expect(sourceDef('crumb-starch').odourBu).toBe(15);
    expect(sourceDef('crumb-starch').odourSingleBu).toBe(6);
    expect(SOURCE_ODOUR_REF_BU).toBe(12);
  });
});

describe('source catalogue: later tiers present as data', () => {
  it('has a row for every food variant, with its kind and a tier', () => {
    for (const v of FOOD_VARIANTS) {
      const d = SOURCE_CATALOGUE[v];
      expect(d.variant).toBe(v);
      expect([1, 2, 3]).toContain(d.tier);
    }
  });

  it.each([
    ['extrafloral-nectary', 2, 0.8, 6, 6, 0.9],
    ['berry', 2, 0, 0, 20, 0.7],
    ['windfall', 2, 0, 0, 40, 0.7],
    ['insect-large', 2, 0, 0, 30, 0.8],
    ['large-carcass', 2, 0, 0, 60, 0.9],
    ['elaiosome-seed', 2, 0, 0, 6, 1.0],
    ['crumb-fatty', 2, 0, 0, 15, 0.9],
    ['crust', 2, 0, 0, 25, 0.6],
    ['kibble', 2, 0, 0, 40, 0.8],
    ['wet-pet-food', 2, 0, 0, 50, 0.9],
    ['bait-gel', 2, 0, 0, 60, 1.2],
    ['dew', 2, 0, 0, 4, 0.5],
    ['water', 2, 1000, 1000, 10, 0.5],
    ['scale-herd', 3, 2, 0, 6, 0.9],
    ['grass-seed', 3, 0, 0, 0, 0],
  ] as const)('%s: tier %d, pool %d, refill %d, odour %d BU, quality %d', (v, tier, pool, refill, odour, q) => {
    const d = sourceDef(v, 2);
    expect(d.tier).toBe(tier);
    expect(d.poolCap).toBe(pool);
    expect(d.refillPerGd).toBe(refill);
    expect(d.odourBu).toBe(odour);
    expect(d.quality).toBe(q);
    expect(availableAtTier(v, 1)).toBe(false);
  });

  it('nutrients of the later-tier solids match §1.2', () => {
    expect([sourceDef('insect-large').c, sourceDef('insect-large').p, sourceDef('insect-large').unitBulk]).toEqual([0.5, 15, 40]);
    expect([sourceDef('crust').c, sourceDef('crust').p, sourceDef('crust').unitBulk]).toEqual([20, 1.5, 30]);
    expect([sourceDef('kibble').c, sourceDef('kibble').p, sourceDef('kibble').hardness]).toEqual([2.5, 4, 2]);
    expect([sourceDef('bait-gel').c, sourceDef('bait-gel').toxin, sourceDef('bait-gel').units[0]]).toEqual([1, 1, 40]);
    expect([sourceDef('elaiosome-seed').c, sourceDef('elaiosome-seed').p, sourceDef('elaiosome-seed').units]).toEqual([0.2, 0.3, [10, 30]]);
  });
});
