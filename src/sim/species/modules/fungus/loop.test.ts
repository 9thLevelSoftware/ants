// The leafcutter loop in a small test nest (task species-leafcutter AC2/AC3): media cutters bring leaf fragments into
// a garden chamber's cache, processors chew them, gardeners plant them and collect staphylae, and the larvae are fed
// from that fungus food; a garden that yields nothing starves the larvae beside a pile of leaves, and the Why view
// names the cause; the processing chain names the stage that is short.

import { describe, expect, it } from 'vitest';
import { TICKS_PER_DAY } from '@/sim/time';
import { addAnts, addLarvae, attaKit, leafSiteNearEntrance, run } from './testkit';
import { lotsLu } from './cache';
import { publishFungusDiagnostics } from './diagnostics';
import { fragmentLu } from './actions';
import { chainOf } from './chain';

describe('the leafcutter loop (small nest)', () => {
  it('media cut and carry leaf home; the garden is planted; staphylae are collected', () => {
    const k = attaKit({ G: 1.5 });
    leafSiteNearEntrance(k);
    const col = k.sim.state.colonies[0];
    col.stores.c = 4; col.stores.p = 2;
    addAnts(k, 'media', 4, k.nest.chambers[0], 'cut', 1.0);
    addAnts(k, 'media', 2, k.room, 'garden', 0.7);
    addAnts(k, 'minor', 4, k.room, 'garden', 0.35);
    run(k.sim, Math.round(0.4 * TICKS_PER_DAY));
    const c = chainOf(col, k.sim.state.tick);
    const total = (x: 'cut' | 'carried' | 'processed' | 'planted' | 'harvested') => c[x] + (c.last?.[x] ?? 0);
    expect(total('cut')).toBeGreaterThan(1);
    expect(total('carried')).toBeGreaterThan(1);
    expect(total('processed')).toBeGreaterThan(0.5);
    expect(total('planted')).toBeGreaterThan(0.3);
    expect(total('harvested')).toBeGreaterThan(0.05);
    expect(k.garden.substrate).toBeGreaterThan(0);
  }, 120_000);

  it('leaf loads are size-matched: time/15 x carryCap (minim < small media < media < major)', () => {
    const k = attaKit();
    const [minim] = addAnts(k, 'minor', 1, k.room, 'idle', 0.35);
    const [small] = addAnts(k, 'media', 1, k.room, 'idle', 0.7);
    const [media] = addAnts(k, 'media', 1, k.room, 'idle', 1.0);
    const [major] = addAnts(k, 'major', 1, k.room, 'idle', 1.8);
    const lu = [minim, small, media, major].map((a) => fragmentLu(k.P, a, 15));
    expect(lu[0]).toBeLessThan(lu[1]);
    expect(lu[1]).toBeLessThan(lu[2]);
    expect(lu[2]).toBeLessThan(lu[3]);
    expect(lu[2]).toBeCloseTo(media.carryCap, 6); // a media carries 1 LU at 15 s (carryCap 1 at m 1)
    expect(fragmentLu(k.P, media, 8)).toBeCloseTo((8 / 15) * media.carryCap, 6);
  });

  it('a dead garden: larvae are not fed though leaves lie in the cache; diag-garden names the loss', () => {
    const k = attaKit({ G: 1.5 });
    const col = k.sim.state.colonies[0];
    col.stores.c = 0; col.stores.p = 0;
    k.garden.cache = [{ lu: 6, q: 0.8, p: 0.12, t: 0, plantId: 7, tick: k.sim.state.tick }];
    k.garden.health = 0.04; k.garden.state = 'collapsing';
    const larvae = addLarvae(k, 6, k.room, 'minor');
    addAnts(k, 'minor', 6, k.room, 'nurse', 0.35);
    addAnts(k, 'minor', 2, k.room, 'garden', 0.35);
    run(k.sim, Math.round(0.6 * TICKS_PER_DAY));
    expect(k.garden.state).toBe('dead');
    expect(lotsLu(k.garden.cache) + k.garden.waste).toBeGreaterThan(1); // the leaves are still there (or waste)
    expect(col.fungus!.gardenLess).toBe(true);
    const fedP = larvae.reduce((a, b) => a + b.fedP, 0);
    expect(fedP).toBeLessThan(0.05);
    const d = publishFungusDiagnostics(k.sim, col, k.P).find((x) => x.id === 'diag-garden')!;
    expect(d.status).toBe('bad');
    expect(d.factors[0]?.cause).toBe('garden-lost');
  }, 120_000);
});
