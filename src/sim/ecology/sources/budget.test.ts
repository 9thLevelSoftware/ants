// Acceptance 6: the Tier 1 food set of a standard world offers, over one summer game day, at least the daily C and
// P the economy sanity budget (registry C13) requires for a 300-worker colony. Headless; numbers are printed.
//
// C13 for N = 300: full need 57.1 C / 77.3 P per gd; "T1 supplies about 45-60 C and 25-40 P at 900 BU:
// sustainable, slower growth" (protein-limited by design). Checked: the T1 offer within 900 BU of the start meets
// the C13 T1 figures (>= 45 C, >= 25 P), and the whole map meets the full need.

import { describe, expect, it } from 'vitest';
import { calendarNow } from '@/sim/environment';
import { makeTestSim } from '@/sim/testing';
import { TICKS_PER_DAY } from '@/sim/time';
import { BUDGET_N300_NEED, BUDGET_T1_RADIUS_BU, BUDGET_T1_SUPPLY_MIN } from '@/sim/balance/ecology';
import { dayOffer, sustainedOffer, type FoodOffer } from './budget';
import { makeReferenceWorld } from './referenceWorld';
import { makeSourcesSystem } from './system';

function fmt(o: FoodOffer): string {
  const parts = Object.entries(o.byVariant).map(([v, x]) => `${v} ${x.c.toFixed(1)}C/${x.p.toFixed(1)}P`);
  return `${o.c.toFixed(1)} C, ${o.p.toFixed(1)} P  [${parts.join('; ')}]`;
}

// The game runs Tier 2 (R1): the Tier 1 world is built and run with tier 1 passed explicitly (gate-sim-2 ruling 1).
describe('economy sanity budget (registry C13), Tier 1, standard world, summer', () => {
  for (const seed of [1, 2, 3]) {
    it(`seed ${seed}: offers the 300-worker colony's daily C and P`, () => {
      const world = makeReferenceWorld(seed);
      const sim = makeTestSim({ world, systems: [makeSourcesSystem(1)], ecologyTier: 1 });
      expect(calendarNow(sim).season).toBe('summer');
      const center = world.queenStart.pos;
      const radiusMm = BUDGET_T1_RADIUS_BU * world.bu;
      const near = dayOffer(sim, { center, radiusMm, tier: 1 });
      const map = dayOffer(sim, { tier: 1 });
      const nearSustained = sustainedOffer(sim, { center, radiusMm, tier: 1 });
      const mapSustained = sustainedOffer(sim, { tier: 1 });
      console.info(
        `[budget seed ${seed}] anchors ${world.placements.foodAnchors.length}, sources ${sim.stores.sources.count}\n` +
        `  day offer within 900 BU: ${fmt(near)}\n  sustained within 900 BU: ${fmt(nearSustained)}\n` +
        `  day offer whole map:     ${fmt(map)}\n  sustained whole map:     ${fmt(mapSustained)}`,
      );
      expect(near.c).toBeGreaterThanOrEqual(BUDGET_T1_SUPPLY_MIN.c);
      expect(near.p).toBeGreaterThanOrEqual(BUDGET_T1_SUPPLY_MIN.p);
      expect(map.c).toBeGreaterThanOrEqual(BUDGET_N300_NEED.c);
      expect(map.p).toBeGreaterThanOrEqual(BUDGET_N300_NEED.p);
      // The renewable part alone also carries the colony: refills, drops and the crumb rule.
      expect(nearSustained.c).toBeGreaterThanOrEqual(BUDGET_T1_SUPPLY_MIN.c);
      expect(nearSustained.p).toBeGreaterThanOrEqual(BUDGET_T1_SUPPLY_MIN.p);

      // Run the day: the drops the offer counts on really appear (within 15 % map-wide).
      const expectedDropP = (map.byVariant['insect-small']?.p ?? 0) + (map.byVariant['insect-medium']?.p ?? 0);
      const before = new Set(sim.stores.sources.list.map((s) => s.id));
      for (let i = 0; i < TICKS_PER_DAY; i++) sim.tick();
      let droppedP = 0;
      for (const s of sim.stores.sources.list) if (s.alive && !before.has(s.id) && s.kind === 'carrion') droppedP += s.units * s.p;
      console.info(`[budget seed ${seed}] carrion P dropped in the day: ${droppedP.toFixed(1)} (expected ${expectedDropP.toFixed(1)})`);
      expect(Math.abs(droppedP - expectedDropP)).toBeLessThanOrEqual(0.15 * expectedDropP);
    });
  }
});
