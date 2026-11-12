// Reviewer tests (render-ants): brood/item catalog for every species, stage and item kind; geometry sanity.
import { describe, expect, it } from 'vitest';
import { ITEM_KINDS } from '@/sim/types';
import { buildAntVariant } from '../geometry/buildAnt';
import { resolveMorph, morphCaste, SPECIES_MORPHS } from '../morph/catalog';
import { ItemCatalog, type VariantLookup } from './catalog';
import type { BroodView, ItemView } from '../simAdapter';

const BU: Record<string, number> = { 'lasius-niger': 4, 'camponotus-pennsylvanicus': 9, 'messor-barbarus': 7, 'atta-texana': 7 };
const cache = new Map<string, ReturnType<typeof buildAntVariant>>();
const lookup: VariantLookup = {
  variant(sp, c, sc) {
    const mc = morphCaste(sp, c, sc); const k = `${sp}|${mc}`;
    if (!cache.has(k)) { const v = buildAntVariant(resolveMorph(sp, mc, null)); v.key = k; cache.set(k, v); }
    return cache.get(k)!;
  },
  cocoons: (sp) => SPECIES_MORPHS[sp]?.cocoons ?? false,
  buMm: (sp) => BU[sp] ?? 4,
};
const item = (kind: ItemView['kind'], o: Partial<ItemView> = {}): ItemView => ({
  id: 1, alive: true, kind, pos: { x: 0, y: 0, z: 0 }, carrierIds: [], lengthMm: 0, count: 1, species: null, colony: 0, decay: 0, foodKind: null, variant: null, wasteKind: null, ...o,
});
const brood = (o: Partial<BroodView>): BroodView => ({ id: 1, alive: true, colony: 0, stage: 'egg', destined: 'worker', progress: 0.5, pos: { x: 0, y: 0, z: 0 }, carriedBy: -1, destinedLengthBu: 1, ...o });

function finiteGeometry(g: { getAttribute(n: string): { array: ArrayLike<number> } }): boolean {
  for (const n of ['position', 'normal', 'color']) {
    const a = g.getAttribute(n).array;
    for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i]!)) return false;
  }
  return true;
}

describe('ItemCatalog verify', () => {
  const cat = new ItemCatalog(lookup);

  it('every item kind x species resolves to finite carried + ground geometry with a positive size', () => {
    for (const sp of Object.keys(SPECIES_MORPHS)) for (const k of ITEM_KINDS) {
      const r = cat.item(item(k, { species: sp as ItemView['species'] }), sp);
      expect(r.sizeMm).toBeGreaterThan(0);
      const d = cat.get(r.key);
      expect(d.nominalMm).toBeGreaterThan(0);
      expect(finiteGeometry(d.geometry)).toBe(true);
      expect(finiteGeometry(d.ground)).toBe(true);
    }
  });

  it('every brood stage x destined caste of every species resolves (incl. Atta small media, gynes, males)', () => {
    const castes = ['worker', 'minor', 'media', 'major', 'gyne', 'male'] as const;
    for (const sp of Object.keys(SPECIES_MORPHS)) for (const stage of ['egg', 'larva', 'pupa'] as const) for (const c of castes) {
      for (const carried of [false, true]) {
        const r = cat.brood(brood({ stage, destined: c, destinedLengthBu: c === 'gyne' ? 2.2 : 1 }), sp, carried);
        expect(r.sizeMm).toBeGreaterThan(0);
        const d = cat.get(r.key);
        expect(finiteGeometry(d.geometry)).toBe(true);
      }
    }
  });

  it('pupae of polymorphic species are drawn with the destined caste body (major pupa != minor pupa)', () => {
    const maj = cat.brood(brood({ stage: 'pupa', destined: 'major', destinedLengthBu: 1.55 }), 'messor-barbarus', false);
    const min = cat.brood(brood({ stage: 'pupa', destined: 'minor', destinedLengthBu: 0.7 }), 'messor-barbarus', false);
    expect(maj.key).not.toBe(min.key);
    expect(maj.sizeMm).toBeGreaterThan(min.sizeMm * 2);
  });

  it('a gyne pupa of a formicine is a big cocoon (size follows destinedLengthBu)', () => {
    const g = cat.brood(brood({ stage: 'pupa', destined: 'gyne', destinedLengthBu: 2.1 }), 'lasius-niger', false);
    const w = cat.brood(brood({ stage: 'pupa', destined: 'worker', destinedLengthBu: 1 }), 'lasius-niger', false);
    expect(g.key).toBe('cocoon');
    expect(g.sizeMm).toBeGreaterThan(w.sizeMm * 1.8);
  });

  it('larvae grow monotonically with progress and stay finite for out-of-range progress / zero destined length', () => {
    let prev = 0;
    for (let p = 0; p <= 1.0001; p += 0.1) {
      const s = cat.brood(brood({ stage: 'larva', progress: p }), 'lasius-niger', false).sizeMm;
      expect(s).toBeGreaterThanOrEqual(prev); prev = s;
    }
    for (const p of [-1, 2]) {
      const s = cat.brood(brood({ stage: 'larva', progress: p, destinedLengthBu: 0 }), 'lasius-niger', false).sizeMm;
      expect(Number.isFinite(s) && s > 0).toBe(true);
    }
  });

  it('liquid food in the mandibles is a droplet; a solid food piece is not', () => {
    expect(cat.item(item('food-piece', { foodKind: 'honeydew' }), 'lasius-niger').key).toBe('droplet');
    expect(cat.item(item('food-piece', { foodKind: 'crumb' }), 'lasius-niger').key).toBe('food-piece');
    expect(cat.get('droplet').transparent).toBe(true);
  });

  it('item sizes scale with the species BU when the sim gives no length', () => {
    const l = cat.item(item('soil-pellet'), 'lasius-niger').sizeMm;
    const c = cat.item(item('soil-pellet'), 'camponotus-pennsylvanicus').sizeMm;
    expect(c / l).toBeCloseTo(9 / 4, 5);
  });
});
