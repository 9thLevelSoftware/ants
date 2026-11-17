// Adversarial review tests of the harvester loop (review of task species-harvester): the granary loop at the colony
// size the real founding hands over, the granary events of GDD 07 App. C, and the morning patrol in a busy colony.
// A failing test here demonstrates a defect and stays for the fixer (see the review report).

import { describe, expect, it } from 'vitest';
import type { FoodSource } from '@/sim/types';
import { setClimateOverride } from '@/sim/colony/envAdapter';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '@/sim/time';
import { addAnts, addLarvae, messorKit } from './testkit';
import { newPatchSite, refreshSeedSites } from './seeds';
import { addSeeds } from './cohorts';
import { gateOf, setTrailTempOverride } from './rhythm';
import { colonyStock } from './state';

function seedKit(cls: 'S' | 'M', patches = 4) {
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

describe('the granary loop at hand-over size (task deliverable 1-2; addendum "a viable colony that does nothing species-specific is a failure")', () => {
  it('3 first workers with a provisioned pool, an empty granary and seed patches 15-30 BU away start the granary within 1 GD', () => {
    const { k, sim, col } = seedKit('S');
    // R2 provisioned hand-over: the pool holds several days of need
    col.stores.c = 4;
    col.stores.p = 1.5;
    addAnts(k, 'minor', 3, k.nest.chambers[1], 'idle');
    addLarvae(k, 2, k.nest.chambers[1]);
    for (let t = 0; t < TICKS_PER_DAY; t++) sim.tick();
    expect(colonyStock(col.granary!)).toBeGreaterThan(0);
  }, 60_000);
});

describe('granary events (GDD 07 App. C: granary-state "alerts on transitions"; milestone ms-first-granary listens to it)', () => {
  it('a granary turning damp emits granary-state', () => {
    const k = messorKit({ rh: 0.9, tempC: 20 });
    addSeeds(k.granary, k.g, 'M', 0.4, 50, 0.5, 0);
    let n = 0;
    k.sim.events.on('granary-state', () => { n++; });
    for (let t = 0; t < Math.round(0.4 * TICKS_PER_DAY); t++) k.sim.tick();
    expect(k.granary.cohorts.some((c) => c.state !== 'stored')).toBe(true);
    expect(n).toBeGreaterThan(0);
  }, 60_000);
});

describe('morning patrol (GDD 07 §5.3.7: foragers activate after >= 3 patrollers have returned safely within 60 s)', () => {
  it('in a quiet morning the gate opens on returning patrollers, not on the 2 h fail-safe', () => {
    const { k, sim, col } = seedKit('S');
    col.stores.c = 4;
    col.stores.p = 1;
    addAnts(k, 'media', 18, k.nest.chambers[1], 'idle');
    let patrolOut = 0;
    let openedAt = -1, closedAt = -1;
    for (let t = 0; t < 3 * TICKS_PER_HOUR && openedAt < 0; t++) {
      sim.tick();
      const gate = gateOf(col);
      if (closedAt < 0 && gate.closedTick >= 0) closedAt = gate.closedTick;
      patrolOut = Math.max(patrolOut, gate.out.length);
      if (gate.open && gate.openedTick >= 0) openedAt = gate.openedTick;
    }
    const gate = gateOf(col);
    expect(patrolOut).toBeGreaterThan(0); // patrollers did go out
    expect(openedAt).toBeGreaterThan(closedAt);
    // the fail-safe opens the gate with a hold (x patrolHoldMult for 1 h) starting at the opening tick; nobody died
    const byFailsafe = gate.holdUntilTick > openedAt;
    expect({ byFailsafe, returns: gate.returns.length, waitTicks: openedAt - closedAt }).toEqual(
      expect.objectContaining({ byFailsafe: false }),
    );
  }, 60_000);
});
