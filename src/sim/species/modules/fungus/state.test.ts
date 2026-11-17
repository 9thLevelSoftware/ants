// The fungus module's state is plain data (save / restore continues exactly), its invariant holds through a working
// colony, the caste-unlocked event fires in every new sim (no module-level memory), quarantine slows spread, and
// a garden too hot for 0.5 GD sends fungus pieces to a cooler fungus chamber (relocation).

import { describe, expect, it } from 'vitest';
import type { Sim } from '@/sim/types';
import { createSim } from '@/sim/sim';
import { restore, snapshot } from '@/sim/save';
import { setClimateOverride } from '@/sim/colony/envAdapter';
import { TICKS_PER_DAY } from '@/sim/time';
import { addAnts, attaKit, leafSiteNearEntrance, run } from './testkit';
import { invariants } from './index';
import { destineAtta } from './castes';
import { seedGarden, gardenOf } from './state';
import { spreadInfection } from './spread';
import { spawnBrood } from '@/sim/entities';

function working() {
  const k = attaKit({ G: 0.4 });
  leafSiteNearEntrance(k);
  const col = k.sim.state.colonies[0];
  col.stores.c = 4; col.stores.p = 2;
  addAnts(k, 'media', 3, k.nest.chambers[0], 'cut', 1.0);
  addAnts(k, 'media', 2, k.room, 'garden', 0.7);
  addAnts(k, 'minor', 3, k.room, 'garden', 0.35);
  return k;
}

describe('fungus state', () => {
  it('a snapshot of a working leafcutter colony continues exactly like the uninterrupted run', () => {
    const k = working();
    const sim = k.sim;
    run(sim, 1200);
    const b: Sim = createSim(restore(snapshot(sim)).state, sim.world);
    setClimateOverride(b, { chamberTemp: () => 23, rh: () => 0.9, pointTemp: () => 23, surfaceActivity: () => 1, rain: () => 0 });
    for (let t = 0; t < 1200; t++) { sim.tick(); b.tick(); }
    expect(JSON.stringify(b.state.colonies[0].fungus)).toBe(JSON.stringify(sim.state.colonies[0].fungus));
    expect(sim.state.colonies[0].fungus!.chain!.cut + (sim.state.colonies[0].fungus!.chain!.last?.cut ?? 0)).toBeGreaterThan(0);
  }, 90_000);

  it('the garden-finite invariant holds through a working colony', () => {
    const k = working();
    const fails: string[] = [];
    for (let i = 0; i < 6; i++) {
      run(k.sim, 400);
      for (const inv of invariants) inv.check(k.sim, (m) => fails.push(m));
    }
    expect(fails).toEqual([]);
  }, 90_000);

  it('caste-unlocked fires for the first major in each new game (no module-level memory)', () => {
    for (let n = 0; n < 2; n++) {
      const k = attaKit({ G: 20 });
      const col = k.sim.state.colonies[0];
      col.fungus!.staphylae = 50;
      let unlocked = 0;
      k.sim.events.on('caste-unlocked', () => { unlocked++; });
      const def = k.sim.getSpecies(col.species)!;
      for (let i = 0; i < 40; i++) {
        const b = spawnBrood(k.sim, { colony: col.id, stage: 'larva', destined: 'worker', pos: k.room.center, nestId: k.nest.nest.id, chamberId: k.room.id });
        destineAtta(k.sim, col, k.P, def, b, 500);
      }
      k.sim.tick();
      expect(unlocked).toBe(1);
    }
  });

  it('quarantine (an avoid marker on the infected chamber) cuts the spread to a tenth', () => {
    const count = (quarantine: boolean) => {
      let seeded = 0;
      for (let s = 1; s <= 3; s++) {
        const k = attaKit({ G: 2, seed: s });
        const col = k.sim.state.colonies[0];
        const other = k.nest.chambers[2];
        other.type = 'fungus';
        const g2 = seedGarden(k.sim, col.fungus!, k.P, other.id, 2, 1, 0);
        g2.state = 'healthy';
        k.garden.infection = 0.8; k.garden.state = 'infected';
        if (quarantine) {
          k.sim.state.markers.push({
            id: 999, alive: true, kind: 'avoid', pos: { ...k.room.center }, radius: 1, colony: col.id,
            targetChamberId: -1, sourceChamberId: -1, expiresTick: -1, params: {}, placedTick: 0,
          } as never);
        }
        for (let i = 0; i < 200; i++) { g2.infection = 0; spreadInfection(k.sim, col, k.P, 1); if (g2.infection > 0) seeded++; }
      }
      return seeded;
    };
    const open = count(false), shut = count(true);
    expect(open).toBeGreaterThan(40); // p = escSpreadP 0.15 x i 0.8 per GD -> ~72 of 600
    expect(shut).toBeLessThan(open * 0.35);
  });

  it('a garden too hot for 0.5 GD is carried piece by piece to a cooler fungus chamber', () => {
    const k = attaKit({ G: 2 });
    const col = k.sim.state.colonies[0];
    const cool = k.nest.chambers[2];
    cool.type = 'fungus';
    // the garden chamber at 31 °C, the other at 23 °C
    setClimateOverride(k.sim, { chamberTemp: (id) => (id === k.room.id ? 31 : 23), rh: () => 0.9, pointTemp: () => 23, surfaceActivity: () => 0, rain: () => 0 });
    addAnts(k, 'minor', 6, k.room, 'garden', 0.35);
    col.stores.c = 4; col.stores.p = 2;
    run(k.sim, Math.round(1.2 * TICKS_PER_DAY));
    const moved = gardenOf(col.fungus!, cool.id);
    expect(moved && moved.biomass).toBeGreaterThan(0.4);
  }, 120_000);
});
