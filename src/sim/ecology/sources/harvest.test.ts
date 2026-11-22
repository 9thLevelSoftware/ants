// Acceptance 4: harvest never takes more than is there or than the ant can hold; liquid goes to the crop with the
// right split; solids become items with the right nutrients and bulk; feed slots limit simultaneous harvesters.
// Also GDD 01 App. E 7 (drink 200 ticks from a 5-load sugar source) and GDD 05 App. E 7 (pieces and conservation).

import { describe, expect, it } from 'vitest';
import type { SimEvent } from '@/sim/types';
import { createSource } from './spawn';
import { takeFromSource, detachWhole } from './harvest';
import { freeSlotsOf, queuePosition } from './slots';
import { cropToxin } from './crop';
import { addWorker, centre, fakeAction, makeSourceSim } from './testkit';
import { harvest, freeSlots } from '@/sim/ecology';
import { CARRION_TEAR_P_PER_BULK_MIN, LARGE_CARCASS_TYPES } from '@/sim/balance/ecology';

function events(sim: ReturnType<typeof makeSourceSim>): SimEvent[] {
  const out: SimEvent[] = [];
  sim.events.onAny((_t, e) => out.push(e as SimEvent));
  return out;
}

describe('harvest-liquid', () => {
  it('drinks 0.05 load/s: 200 ticks from a 5-load sugar source fill the crop to 1.00 and leave 4.00 (GDD 01 E7)', () => {
    const sim = makeSourceSim();
    const p = centre(sim);
    const s = createSource(sim, { variant: 'sugary-spill', pos: p, units: 5, tier: 2 });
    const ant = addWorker(sim, p);
    for (let i = 0; i < 200; i++) harvest(sim, ant, s.id, 0.1);
    expect(ant.cropC).toBeCloseTo(1.0, 6);
    expect(s.units).toBeCloseTo(4.0, 6);
    expect(takeFromSource(sim, ant, s.id, 0.1).status).toBe('crop-full');
    expect(s.units).toBeCloseTo(4.0, 6);
  });

  it('never takes more than the source holds and applies drinkRateMult (honeydew film x0.25)', () => {
    const sim = makeSourceSim();
    const p = centre(sim);
    const film = createSource(sim, { variant: 'honeydew-film', pos: p, tier: 1 });
    expect(film.units).toBeCloseTo(0.5);
    const ant = addWorker(sim, p);
    const r = takeFromSource(sim, ant, film.id, 10); // 10 s x 0.05 x 0.25 = 0.125
    expect(r.taken).toBeCloseTo(0.125, 9);
    const r2 = takeFromSource(sim, ant, film.id, 1000);
    expect(r2.taken).toBeCloseTo(0.375, 9);
    expect(ant.cropC).toBeCloseTo(0.5, 9);
    expect(film.alive).toBe(true); // renewable: stays empty
    expect(takeFromSource(sim, ant, film.id, 1).status).toBe('empty');
  });

  it('splits nutrients per load (aphid honeydew 1.0 C + 0.02 P) and carries bait toxin with the C', () => {
    const sim = makeSourceSim();
    const p = centre(sim);
    const herd = createSource(sim, { variant: 'aphid-herd', pos: p, units: 1, tier: 2 });
    const ant = addWorker(sim, p);
    takeFromSource(sim, ant, herd.id, 4); // 0.2 load
    expect(ant.cropC).toBeCloseTo(0.2, 9);
    expect(ant.cropP).toBeCloseTo(0.004, 9);
    const bait = createSource(sim, { variant: 'bait-gel', pos: p, tier: 2 });
    const r = takeFromSource(sim, ant, bait.id, 2); // 0.1 load
    expect(r.toxin).toBeCloseTo(0.1, 9);
    expect(cropToxin(ant)).toBeCloseTo(0.1, 9);
  });

  it('a full crop of honeydew stops at the crop capacity (C + P <= cropCap)', () => {
    const sim = makeSourceSim();
    const p = centre(sim);
    const herd = createSource(sim, { variant: 'aphid-herd', pos: p, units: 1, tier: 2 });
    herd.capacity = 5; herd.units = 5;
    const ant = addWorker(sim, p);
    takeFromSource(sim, ant, herd.id, 1000);
    expect(ant.cropC + ant.cropP).toBeCloseTo(ant.cropCap, 9);
  });

  it('refuses out of reach', () => {
    const sim = makeSourceSim();
    const p = centre(sim);
    const s = createSource(sim, { variant: 'flower', pos: p });
    const ant = addWorker(sim, { x: p.x + 50 * sim.world.bu, y: 0, z: p.z });
    expect(takeFromSource(sim, ant, s.id, 1).status).toBe('out-of-reach');
  });
});

describe('pick and tear', () => {
  it('picks whole units into one item up to carryCap (sugar granules bulk 0.3 -> 3 per trip)', () => {
    const sim = makeSourceSim();
    const p = centre(sim);
    const s = createSource(sim, { variant: 'sugar-granules', pos: p, units: 10 });
    const ant = addWorker(sim, p);
    const r = takeFromSource(sim, ant, s.id, 99);
    expect(r.status).toBe('ok');
    const it = sim.stores.items.get(r.itemId);
    expect(it).toBeDefined();
    expect(it?.count).toBe(3);
    expect(it?.bulk).toBeCloseTo(0.9, 9);
    expect(it?.bulk).toBeLessThanOrEqual(ant.carryCap);
    expect(it?.c).toBeCloseTo(1.5, 9);
    expect(it?.kind).toBe('food-piece');
    expect(ant.carry).toEqual({ kind: 'item', id: r.itemId });
    expect(s.units).toBe(7);
    expect(takeFromSource(sim, ant, s.id, 1).status).toBe('hands-full');
  });

  it('a small dead insect becomes a carcass item with its nutrients; the node is removed with its events', () => {
    const sim = makeSourceSim();
    const seen = events(sim);
    const p = centre(sim);
    const s = createSource(sim, { variant: 'insect-small', pos: p });
    const ant = addWorker(sim, p);
    const r = takeFromSource(sim, ant, s.id, 1);
    const it = sim.stores.items.get(r.itemId);
    expect([it?.kind, it?.bulk, it?.c, it?.p]).toEqual(['carcass', 0.5, 0.02, 0.5]);
    expect(r.depleted).toBe(true);
    expect(sim.stores.sources.get(s.id)).toBeUndefined();
    sim.events.flush();
    expect(seen.some((e) => e.type === 'food-source-removed' && e.sourceId === s.id && e.cause === 'depleted')).toBe(true);
    expect(seen.some((e) => e.type === 'food-source-exhausted' && e.sourceId === s.id)).toBe(true);
  });

  it('too heavy units cannot be picked', () => {
    const sim = makeSourceSim();
    const p = centre(sim);
    const s = createSource(sim, { variant: 'crumb-starch', pos: p, units: 3 });
    const ant = addWorker(sim, p);
    ant.carryCap = 0.5; // a crumb is 0.6
    expect(takeFromSource(sim, ant, s.id, 1).status).toBe('too-heavy');
  });

  it('tears pieces of carryCap with nutrients pro rata and conserves P (GDD 05 E7: bulk 25, 20 P -> 0.8 P per piece)', () => {
    const sim = makeSourceSim();
    const p = centre(sim);
    const s = createSource(sim, { variant: 'insect-large', pos: p, tier: 2 });
    s.unitBulk = 25; s.p = 20; s.c = 0.5;
    const ant = addWorker(sim, p);
    ant.carryCap = 1; // a standard worker (individual workers vary with body length)
    let totalP = 0, pieces = 0;
    while (sim.stores.sources.get(s.id)) {
      const r = takeFromSource(sim, ant, s.id, 1);
      expect(r.status).toBe('ok');
      const it = sim.stores.items.get(r.itemId);
      expect(it?.bulk).toBeLessThanOrEqual(ant.carryCap + 1e-9);
      if (pieces === 0) {
        expect(it?.bulk).toBeCloseTo(1.0, 9);
        expect(it?.p).toBeCloseTo(0.8, 9);
      }
      totalP += r.p;
      pieces++;
      ant.carry = { kind: 'none', id: -1 }; // delivered
    }
    expect(pieces).toBe(25);
    expect(totalP).toBeCloseTo(20, 6);
  });

  it('R38 item 4: a torn piece of any carrion carries >= 0.75 P per load of carry capacity; P per carcass unchanged', () => {
    const cases = [
      { variant: 'insect-medium' as const, p: 4 }, { variant: 'insect-large' as const, p: 15 },
      ...(['worm', 'slug', 'vertebrate'] as const).map((carcass) => ({ variant: 'large-carcass' as const, carcass, p: LARGE_CARCASS_TYPES[carcass].p })),
    ];
    for (const k of cases) {
      const sim = makeSourceSim();
      const p = centre(sim);
      const s = createSource(sim, { variant: k.variant, pos: p, tier: 2, units: 1, carcass: 'carcass' in k ? k.carcass : undefined });
      expect(s.p * s.units, k.variant).toBeCloseTo(k.p, 9);
      const ant = addWorker(sim, p);
      ant.carryCap = 1;
      const r = takeFromSource(sim, ant, s.id, 1);
      expect(r.status).toBe('ok');
      const it = sim.stores.items.get(r.itemId)!;
      expect(it.p / it.bulk, `${k.variant} ${'carcass' in k ? k.carcass : ''}`).toBeGreaterThanOrEqual(CARRION_TEAR_P_PER_BULK_MIN - 1e-9);
    }
  });

  it('a scrap under 0.5 bulk is left as a final lying piece and the carcass is gone (§1.5 rule 6)', () => {
    const sim = makeSourceSim();
    const p = centre(sim);
    const s = createSource(sim, { variant: 'insect-medium', pos: p });
    s.units = 1.2 / 5; // 1.2 bulk left
    const ant = addWorker(sim, p);
    ant.carryCap = 1;
    const r = takeFromSource(sim, ant, s.id, 1);
    expect(sim.stores.items.get(r.itemId)?.bulk).toBeCloseTo(1.0, 9);
    expect(sim.stores.sources.get(s.id)).toBeUndefined();
    const lying = sim.stores.items.list.filter((i) => i.alive && i.carrierIds.length === 0);
    expect(lying).toHaveLength(1);
    expect(lying[0].bulk).toBeCloseTo(0.2, 9);
    expect(lying[0].p + r.p).toBeCloseTo(1.2 * 4 / 5, 9);
  });

  it('detachWhole turns a carcass into one lying item for dragging', () => {
    const sim = makeSourceSim();
    const s = createSource(sim, { variant: 'insect-medium', pos: centre(sim) });
    const id = detachWhole(sim, s.id);
    const it = sim.stores.items.get(id);
    expect([it?.kind, it?.bulk, it?.p, it?.lengthMm]).toEqual(['carcass', 5, 4, 9]);
    expect(sim.stores.sources.get(s.id)).toBeUndefined();
  });
});

describe('feeding slots', () => {
  it('a 2-slot flower serves the first two harvesters; the third queues until a slot frees', () => {
    const sim = makeSourceSim();
    const p = centre(sim);
    const s = createSource(sim, { variant: 'flower', pos: p });
    const ants = [0, 1, 2].map(() => addWorker(sim, p));
    ants.forEach((a, i) => fakeAction(a, 'harvest-liquid', s.id, p, 10 + i));
    expect(freeSlotsOf(sim, s)).toBe(0);
    expect(freeSlots(sim, s.id)).toBe(0);
    expect(takeFromSource(sim, ants[0], s.id, 1).status).toBe('ok');
    expect(takeFromSource(sim, ants[1], s.id, 1).status).toBe('ok');
    expect(takeFromSource(sim, ants[2], s.id, 1).status).toBe('crowded');
    expect(queuePosition(sim, ants[2], s)).toBe(1);
    ants[0].action = null;
    expect(takeFromSource(sim, ants[2], s.id, 1).status).toBe('ok');
    expect(freeSlotsOf(sim, s)).toBe(0);
    ants[1].action = null;
    expect(freeSlotsOf(sim, s)).toBe(1);
  });
});

// Review decision (finding "liquid crop fill counts C + P + water"): a crop holds 1 load of nutrients (registry C4
// "one load = one full crop", counted as C + P + water like the ants' own crop check). A source load whose
// nutrients sum to less than 1 (wet pet food 0.2 C + 0.6 P) therefore fills the crop with 1.25 source loads.
describe('crop fill of a dilute liquid (recorded decision)', () => {
  it('a full crop of wet pet food holds 0.25 C + 0.75 P and takes 1.25 loads from the bowl', () => {
    const sim = makeSourceSim();
    const p = centre(sim);
    const s = createSource(sim, { variant: 'wet-pet-food', pos: p, tier: 2 });
    const ant = addWorker(sim, p);
    ant.cropCap = 1;
    takeFromSource(sim, ant, s.id, Number.POSITIVE_INFINITY);
    expect(ant.cropC).toBeCloseTo(0.25, 9);
    expect(ant.cropP).toBeCloseTo(0.75, 9);
    expect(s.units).toBeCloseTo(25 - 1.25, 9);
  });
});
