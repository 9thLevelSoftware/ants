import { describe, expect, it } from 'vitest';
import { ITEM_KINDS } from '@/sim/types';
import { buildAntVariant } from '../geometry/buildAnt';
import { resolveMorph, morphCaste, SPECIES_MORPHS } from '../morph/catalog';
import { ItemCatalog, type VariantLookup } from './catalog';
import type { ItemView } from '../simAdapter';

const cache = new Map<string, ReturnType<typeof buildAntVariant>>();
const lookup: VariantLookup = {
  variant(sp, c, sc) {
    const mc = morphCaste(sp, c, sc); const k = `${sp}|${mc}`;
    if (!cache.has(k)) { const v = buildAntVariant(resolveMorph(sp, mc, null)); v.key = k; cache.set(k, v); }
    return cache.get(k)!;
  },
  cocoons: (sp) => SPECIES_MORPHS[sp]?.cocoons ?? false,
  buMm: (sp) => ({ 'lasius-niger': 4, 'messor-barbarus': 7 } as Record<string, number>)[sp] ?? 4,
};

const item = (kind: ItemView['kind'], o: Partial<ItemView> = {}): ItemView => ({
  id: 1, alive: true, kind, pos: { x: 0, y: 0, z: 0 }, carrierIds: [], lengthMm: 0, count: 1, species: null, colony: 0, decay: 0, foodKind: null, variant: null, wasteKind: null, ...o,
});

describe('ItemCatalog', () => {
  const cat = new ItemCatalog(lookup);
  it('has a mesh for every sim item kind, lying on y = 0', () => {
    for (const k of ITEM_KINDS) {
      const r = cat.item(item(k), 'lasius-niger');
      const d = cat.get(r.key);
      expect(r.sizeMm).toBeGreaterThan(0);
      d.ground.computeBoundingBox();
      expect(d.ground.boundingBox!.min.y).toBeCloseTo(0, 5);
      expect(d.tris).toBeGreaterThan(0);
    }
  });
  it('formicine pupae are cocoons, myrmicine pupae naked; corpses use the species body', () => {
    const b = { id: 1, alive: true, colony: 0, stage: 'pupa' as const, destined: 'worker' as const, progress: 0.5, pos: { x: 0, y: 0, z: 0 }, carriedBy: -1, destinedLengthBu: 1 };
    expect(cat.brood(b, 'lasius-niger', false).key).toBe('cocoon');
    expect(cat.brood({ ...b, destined: 'media' }, 'messor-barbarus', false).key).toBe('pupa:messor-barbarus|media');
    expect(cat.get('pupa:messor-barbarus|media').tris).toBeGreaterThan(1000);
    expect(cat.item(item('corpse'), 'messor-barbarus').key).toBe('corpse:messor-barbarus|media');
  });
  it('larvae grow with progress; eggs are carried as a clump', () => {
    const b = { id: 1, alive: true, colony: 0, stage: 'larva' as const, destined: 'worker' as const, progress: 0, pos: { x: 0, y: 0, z: 0 }, carriedBy: -1, destinedLengthBu: 1 };
    expect(cat.brood({ ...b, progress: 1 }, 'lasius-niger', false).sizeMm).toBeGreaterThan(cat.brood(b, 'lasius-niger', false).sizeMm * 2);
    expect(cat.brood({ ...b, stage: 'egg' }, 'lasius-niger', true).key).toBe('eggs');
  });
});
