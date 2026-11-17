// Adversarial review tests of the granary module (review of task species-harvester). Tests that pass are kept as
// regression tests; a failing test here demonstrates a defect and stays for the fixer (see the review report).

import { describe, expect, it } from 'vitest';
import type { FoodSource, Sim } from '@/sim/types';
import { setClimateOverride } from '@/sim/colony/envAdapter';
import { retireSource } from '@/sim/ecology/sources/remove';
import { isInSeason } from '@/sim/ecology/sources/season';
import { createSim } from '@/sim/sim';
import { restore, snapshot } from '@/sim/save';
import { TICKS_PER_DAY } from '@/sim/time';
import { COHORTS_MAX, SEED_RAIN_PER_GD, SEED_SOURCE_STEP_TICKS } from '@/sim/balance/species-harvester';
import { addAnts, messorKit } from './testkit';
import { newPatchSite, refreshSeedSites } from './seeds';
import { addSeeds, gnawLoads, stepCohorts, totalsOf } from './cohorts';
import { decayPaste, releasePaste } from './paste';
import { setTrailTempOverride } from './rhythm';
import { stockOf } from './state';

/** The kit with `patches` seed patches 15-30 BU from the entrance (as forage.test.ts). */
function seedKit(cls: 'S' | 'M' | 'L', patches = 4, seed = 1) {
  const k = messorKit({ tempC: 24, seed });
  const sim = k.sim;
  setClimateOverride(sim, { chamberTemp: () => 24, rh: () => 0.3, pointTemp: () => 24, surfaceActivity: () => 1 });
  setTrailTempOverride(sim, () => 26);
  const col = sim.state.colonies[0];
  const mod = col.granary!;
  const e = k.nest.entrance.pos, bu = sim.world.bu;
  mod.seedSites = [];
  for (let i = 0; i < patches; i++) {
    const a = (i / patches) * Math.PI * 2, r = (15 + 5 * i) * bu;
    const site = newPatchSite(sim, { x: e.x + Math.cos(a) * r, y: 0, z: e.z + Math.sin(a) * r });
    site.pos.y = sim.field.height(site.pos.x, site.pos.z);
    site.seedClass = cls;
    site.hardness = 0.3;
    mod.seedSites.push(site);
  }
  refreshSeedSites(sim, col, k.g);
  const sources = mod.seedSites.map((s) => sim.stores.sources.get(s.sourceId)!).filter((s): s is FoodSource => !!s);
  return { k, sim, col, mod, sources };
}

describe('seed supply (seeds.ts header: "an emptied node is retired ... and set up again the next time the window opens")', () => {
  it('a seed node emptied in season is not set up again within the same window', () => {
    const { k, sim, col, mod, sources } = seedKit('S', 1);
    const site = mod.seedSites![0];
    expect(isInSeason(sim, sources[0])).toBe(true);
    // what the ecology does when a forager takes the last seed of a non-renewable node: retire it
    let created = 0;
    const refreshesPerHalfDay = Math.round((0.5 * TICKS_PER_DAY) / SEED_SOURCE_STEP_TICKS);
    for (let i = 0; i < refreshesPerHalfDay; i++) {
      const s = sim.stores.sources.get(site.sourceId);
      if (s && s.alive) retireSource(sim, s, 'depleted');
      refreshSeedSites(sim, col, k.g);
      const s2 = sim.stores.sources.get(site.sourceId);
      if (s2 && s2.alive) created += s2.units;
    }
    // the seed rain of half a game day is SEED_RAIN_PER_GD x capacity x 0.5; anything far above it is free seed
    const rainHalfDay = SEED_RAIN_PER_GD * site.capacity * 0.5;
    expect(created).toBeLessThanOrEqual(Math.ceil(rainHalfDay));
  });
});

describe('cohorts at the cohort cap (COHORTS_MAX)', () => {
  it('radicle-gnawed seed stays degermed when the granary already holds COHORTS_MAX cohorts', () => {
    const k = messorKit();
    const gr = k.granary;
    // 9 dry class x band cohorts, 2 degermed ones, 1 germinating: 12 = COHORTS_MAX
    for (const cls of ['S', 'M', 'L'] as const) for (const h of [0.1, 0.4, 0.8]) addSeeds(gr, k.g, cls, h, 10, 0.3, 0);
    addSeeds(gr, k.g, 'S', 0.1, 10, 0.3, 0, true);
    addSeeds(gr, k.g, 'M', 0.1, 10, 0.3, 0, true);
    gr.cohorts.push({ seedClass: 'L', state: 'germinating', loads: 10, hardness: 0.8, u: 0.3, g: 0.6, degermed: false, wetGd: 0, sproutedGd: 0 });
    expect(gr.cohorts.length).toBe(COHORTS_MAX);
    const degermed0 = gr.cohorts.filter((c) => c.degermed).reduce((a, c) => a + c.loads, 0);
    const n = gnawLoads(gr, k.g, 1);
    expect(n).toBe(1);
    const degermed1 = gr.cohorts.filter((c) => c.degermed).reduce((a, c) => a + c.loads, 0);
    // the gnawed load must now be degermed (GDD 07 §6.3.4: "load moves to a degermed cohort with g = 0")
    expect(degermed1 - degermed0).toBeCloseTo(1, 6);
  });

  it('fresh seed added at the cap does not become degermed (it would never germinate)', () => {
    const k = messorKit();
    const gr = k.granary;
    for (const cls of ['M', 'L'] as const) for (const h of [0.1, 0.4, 0.8]) addSeeds(gr, k.g, cls, h, 10, 0.3, 0);
    for (const h of [0.4, 0.8]) addSeeds(gr, k.g, 'S', h, 10, 0.3, 0);
    for (const h of [0.1, 0.4, 0.8]) addSeeds(gr, k.g, 'M', h, 10, 0.3, 0, true);
    addSeeds(gr, k.g, 'S', 0.1, 10, 0.3, 0, true);
    expect(gr.cohorts.length).toBe(COHORTS_MAX);
    // fresh S seed of band 0: its only same-class same-band cohort is the degermed one
    addSeeds(gr, k.g, 'S', 0.1, 10, 0.3, 0, false);
    const fresh = gr.cohorts.filter((c) => !c.degermed).reduce((a, c) => a + c.loads, 0);
    expect(fresh).toBeCloseTo(9 * 10, 6);
  });
});

describe('numerical edges', () => {
  it('stepCohorts over a long step (10 GD) keeps u, g in 0..1 and loads >= 0', () => {
    const k = messorKit();
    addSeeds(k.granary, k.g, 'M', 0.4, 100, 0.95, 0.2);
    const r = stepCohorts(k.granary, k.g, 1, 30, 10);
    expect(r.rotten).toBeGreaterThanOrEqual(0);
    for (const c of k.granary.cohorts) {
      expect(c.u).toBeGreaterThanOrEqual(0); expect(c.u).toBeLessThanOrEqual(1);
      expect(c.g).toBeGreaterThanOrEqual(0); expect(c.g).toBeLessThanOrEqual(1);
      expect(c.loads).toBeGreaterThanOrEqual(0);
    }
    expect(totalsOf(k.granary).loads + r.rotten).toBeCloseTo(100, 6);
  });

  it('zero and negative seed loads are ignored; paste decay of 0 GD is a no-op', () => {
    const k = messorKit();
    addSeeds(k.granary, k.g, 'S', 0.2, 0, 0.3, 0);
    addSeeds(k.granary, k.g, 'S', 0.2, -5, 0.3, 0);
    addSeeds(k.granary, k.g, 'S', 0.2, Number.NaN, 0.3, 0);
    expect(k.granary.cohorts.length).toBe(0);
    const mod = k.sim.state.colonies[0].granary!;
    mod.pasteLoads = 100;
    decayPaste(mod, k.g, 0);
    expect(mod.pasteLoads).toBe(100);
    decayPaste(mod, k.g, 3); // App. E 18
    expect(Math.abs(mod.pasteLoads - 50)).toBeLessThan(1);
  });

  it('paste released into a full pool is not lost', () => {
    const k = messorKit();
    const col = k.sim.state.colonies[0];
    const mod = col.granary!;
    col.needs.rateC = 1; col.needs.rateP = 0.5;
    col.stores.c = 1e6; col.stores.p = 0; // C full far beyond any cap, P empty
    mod.pasteLoads = 10;
    const before = mod.pasteLoads * (k.g.pasteC + k.g.pasteP) + col.stores.p;
    releasePaste(col, mod, k.g);
    const after = mod.pasteLoads * (k.g.pasteC + k.g.pasteP) + col.stores.p;
    // only the C the pool could not take may be lost; the P part must arrive
    const pLost = (10 - mod.pasteLoads) * k.g.pasteP - col.stores.p;
    expect(pLost).toBeLessThan(1e-6);
    expect(after).toBeLessThanOrEqual(before + 1e-9);
  });
});

describe('save / restore (state is plain data)', () => {
  it('a snapshot of a foraging Messor colony continues exactly like the uninterrupted run', () => {
    const { k, sim, col } = seedKit('S', 4);
    col.stores.c = 4; col.stores.p = 1;
    addAnts(k, 'media', 8, k.nest.chambers[1], 'idle');
    for (let t = 0; t < 1500; t++) sim.tick();
    const b: Sim = createSim(restore(snapshot(sim)).state, sim.world);
    // runtime-only test overrides are not part of the save: apply them to the copy too
    setClimateOverride(b, { chamberTemp: () => 24, rh: () => 0.3, pointTemp: () => 24, surfaceActivity: () => 1 });
    setTrailTempOverride(b, () => 26);
    for (let t = 0; t < 1500; t++) { sim.tick(); b.tick(); }
    const ga = sim.state.colonies[0].granary!, gb = b.state.colonies[0].granary!;
    expect(JSON.stringify(gb)).toBe(JSON.stringify(ga));
    expect(b.state.tick).toBe(sim.state.tick);
    expect(ga.granaries.reduce((a, gr) => a + stockOf(gr), 0)).toBeGreaterThan(0); // the run did forage
  }, 60_000);
});
