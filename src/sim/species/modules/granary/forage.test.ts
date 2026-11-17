// Seeds as the staple (task species-harvester deliverable 1, AC2 "a colony with seed sources fills a granary";
// GDD 07 §6.3.1-6.3.2): size-matched acceptance by caste, and media foragers in the small test nest carrying seeds
// from ground patches near the entrance into the granary, where they become a cohort (not colony-pool food).

import { describe, expect, it } from 'vitest';
import type { FoodSource } from '@/sim/types';
import { setClimateOverride } from '@/sim/colony/envAdapter';
import { TICKS_PER_DAY } from '@/sim/time';
import { addAnts, messorKit } from './testkit';
import { newPatchSite, refreshSeedSites } from './seeds';
import { harvesterAccepts, seedAcceptP } from './behaviourForage';
import { augmentDemand, seedForageDemand } from './allocation';
import { addSeeds } from './cohorts';
import { createSource } from '@/sim/ecology/sources/spawn';
import { ti } from '@/sim/colony/taskIdx';
import { setTrailTempOverride } from './rhythm';
import { stockOf } from './state';

/** The kit with seed patches 15-30 BU from the entrance, all of class `cls`. */
function seedKit(cls: 'S' | 'M' | 'L', patches = 4) {
  const k = messorKit({ tempC: 24 });
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

describe('seed selection (GDD 07 §6.3.2)', () => {
  it('size-matched: a minor takes S but never L; a major takes L; acceptance falls with distance', () => {
    const { k, sources } = seedKit('S', 1);
    const [minor] = addAnts(k, 'minor', 1, k.nest.chambers[1]);
    const [major] = addAnts(k, 'major', 1, k.nest.chambers[1], 'idle', 1.55);
    const s = sources[0];
    expect(seedAcceptP(k.sim, minor, s, k.g)).toBeGreaterThan(0);
    const { sources: big } = seedKit('L', 1);
    const kL = big[0];
    expect(seedAcceptP(k.sim, minor, kL, k.g)).toBe(0);
    expect(seedAcceptP(k.sim, major, kL, k.g)).toBeGreaterThan(0);
    const near = seedAcceptP(k.sim, major, kL, k.g);
    const far = { ...kL, pos: { x: kL.pos.x + 300 * k.sim.world.bu, y: kL.pos.y, z: kL.pos.z } };
    expect(seedAcceptP(k.sim, major, far, k.g)).toBeLessThan(near);
  });
});

describe('diet (GDD 07 §5.3.5: a harvester does not tend aphids)', () => {
  it('honeydew is not taken and the colony asks for no tenders', () => {
    const { k, sim, col } = seedKit('S', 1);
    const [media] = addAnts(k, 'media', 1, k.nest.chambers[1]);
    const e = k.nest.entrance.pos;
    const film = createSource(sim, { variant: 'honeydew-film', pos: { x: e.x + 20, y: sim.field.height(e.x + 20, e.z), z: e.z }, up: { x: 0, y: 1, z: 0 } });
    expect(harvesterAccepts(sim, media, film)).toBe(false);
    col.alloc.demand[ti('tend')] = 5;
    augmentDemand(sim, col, k.g);
    expect(col.alloc.demand[ti('tend')]).toBe(0);
  });
});

describe('granary stock target (GDD 07 §6.3.5)', () => {
  it('an empty granary asks for foragers, a full one does not', () => {
    const { k, col } = seedKit('S', 1);
    col.needs.rateC = 1; col.needs.rateP = 0.3;
    expect(seedForageDemand(col, k.g, 20)).toBeGreaterThan(5);
    addSeeds(k.granary, k.g, 'S', 0.3, 2000, 0.3, 0);
    expect(seedForageDemand(col, k.g, 20)).toBe(0);
  });
});

describe('foragers fill the granary (AC2)', () => {
  it('seed patches near the entrance: the granary stock rises, the seed goes in as cohorts', () => {
    const { k, sim, col } = seedKit('S');
    col.stores.c = 4;
    col.stores.p = 1;
    addAnts(k, 'media', 14, k.nest.chambers[1], 'idle');
    let seedIn = 0;
    const p0 = col.stores.p;
    for (let t = 0; t < Math.round(0.5 * TICKS_PER_DAY); t++) {
      sim.tick();
      seedIn = stockOf(k.granary);
    }
    expect(seedIn).toBeGreaterThan(0.5);
    expect(k.granary.cohorts.every((c) => c.seedClass === 'S')).toBe(true);
    // seed is not food until milled: the pool's protein did not jump by the stored seed's share
    expect(col.stores.p).toBeLessThanOrEqual(p0 + 0.35 * seedIn * 0.5);
  }, 60_000);
});
