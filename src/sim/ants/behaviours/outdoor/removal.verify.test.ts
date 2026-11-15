// Reviewer test (beh-forage review), acceptance 2 second half: after the sugar source is removed, traffic to its spot
// stops within the time the trail half-life implies and nobody keeps walking there. scenario.test.ts counts ants
// within 15 BU of the spill centre, but a 300-load spill has a 100 mm (25 BU) radius and is worked at its rim, so
// that check sees no ant even before removal. Here the spot is the rim zone (footprint + 15 BU) and traffic before
// removal is measured too, so the check is not vacuous.

import { describe, expect, it } from 'vitest';
import { PHERO_HALF_LIFE_S, TRAIL_DETECT } from '@/sim/balance';
import { footprintMm, retireSource } from '@/sim/ecology';
import { announce, countEvents, forageScenario, isOutdoorAnt, run } from './testkit';

describe('review: acceptance 2, traffic after the source is removed', () => {
  it('sugar spill 300 BU (known), trail working; after removal visits stop and nobody keeps going', () => {
    const { sim, col, entrance, sources } = forageScenario({
      seed: 1, pinned: true, holdStores: { c: 2, p: 0.3 },
      sources: [{ kind: 'sugar', variant: 'sugary-spill', distBu: 300, bearingDeg: 0, units: 300 }],
    });
    const sugar = sources[0];
    announce(sim, col, sugar);
    const ev = countEvents(sim, ['trail-established', 'delivery']);
    const bu = sim.world.bu;
    const zone = footprintMm(sugar, bu) + 15 * bu;
    const spot = { ...sugar.pos };
    const visitsIn = (ticks: number) => {
      const visits = new Map<number, number>();
      const inside = new Set<number>();
      let last = -1;
      run(sim, ticks, 20, () => {
        for (const a of sim.state.ants) {
          if (!isOutdoorAnt(a) || a.nestId >= 0) continue;
          const near = Math.hypot(a.pos.x - spot.x, a.pos.z - spot.z) <= zone;
          // GDD 02 §10.2: an exploring scout is sent nowhere, so its random crossings are not "keeps going there";
          // they still count for the stop time (`last`). int-1B-sim ruling (Addendum 3 item 6).
          const exploring = a.task === 'scout' && a.state === 'scout.explore';
          if (near && !inside.has(a.id)) { if (!exploring) visits.set(a.id, (visits.get(a.id) ?? 0) + 1); last = sim.state.tick; }
          if (near) inside.add(a.id); else inside.delete(a.id);
        }
      });
      return { visits, last };
    };
    // until the trail is up, then a measured stretch with the source in place
    for (let i = 0; i < 300 && !ev.kept.some((e) => e.type === 'trail-established'); i++) run(sim, 100);
    const before = visitsIn(5000);
    const midPath = { x: (spot.x + entrance.pos.x) / 2, y: 0, z: (spot.z + entrance.pos.z) / 2 };
    const peak = sim.phero.strongestNear?.(col.id, 'trail', midPath, 20 * bu, { x: 0, y: 0, z: 0 }) ?? sim.phero.sample(col.id, 'trail', midPath);
    retireSource(sim, sugar, 'test-removed');
    const removedAt = sim.state.tick;
    const after = visitsIn(15000);
    const stopS = after.last < 0 ? 0 : (after.last - removedAt) / 10;
    const bound = Math.max(1, Math.log2(Math.max(peak, TRAIL_DETECT * 2) / TRAIL_DETECT)) * PHERO_HALF_LIFE_S.trail;
    const nBefore = [...before.visits.values()].reduce((a, b) => a + b, 0);
    console.log(`review removal: trail ${ev.kept.some((e) => e.type === 'trail-established')}, deliveries ${ev.n['delivery'] ?? 0};`,
      `visits to the rim zone in 500 s before removal ${nBefore} by ${before.visits.size} ants; after removal: last ${stopS.toFixed(0)} s later`,
      `(bound ${bound.toFixed(0)} s), visits per ant ${JSON.stringify([...after.visits.values()])}`);
    expect(nBefore).toBeGreaterThan(0);
    expect(stopS).toBeLessThanOrEqual(bound);
    for (const n of after.visits.values()) expect(n).toBeLessThanOrEqual(2);
  }, 900000);
});
