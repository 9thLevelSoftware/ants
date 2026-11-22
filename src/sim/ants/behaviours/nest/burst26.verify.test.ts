// Independent review of colony-life round 12 (D32, direction 26 item 4b): while brood lies among waste the haul cap is
// 0.4 x workers and idle nurses carry waste out. The round's own burst test (hygiene26.test.ts, 8 meconium items)
// clears in 600 ticks on the round's base tree (c2ed6cb) exactly as on the round's tree, so it does not show the fix.
// Measured (review probe, 10 workers, brood in the royal chamber): 16 items fall to the tolerance in 1050-1100 ticks
// on the round's tree and in 1450-2150 on the base. This test pins the round's gain: 16 items, two seeds, at most
// 1250 ticks. (Fails on the base tree, passes on the round's.)
import { describe, expect, it } from 'vitest';
import { BROOD_HAZARD, WASTE_BULK } from '@/sim/balance';
import { spawnItem } from '@/sim/entities';
import { TICKS_PER_DAY } from '@/sim/time';
import { makeNestColony, run, type NestColony } from './testkit';

function wasteIn(k: NestColony): number {
  return k.sim.stores.items.list.filter((it) => it.alive && it.kind === 'waste' && it.chamberId === k.royal.id && it.carrierIds.length === 0).length;
}

function clearTicks(n: number, seed: number): number {
  const k = makeNestColony({
    workers: 10, seed, stores: { c: 100, p: 100 },
    brood: [{ stage: 'egg', n: 3, chamber: 'royal' }, { stage: 'pupa', n: 4, chamber: 'royal', progress: 0.2 }],
  });
  const { sim } = k;
  run(sim, 200);
  const ch = k.royal, col = sim.state.colonies[0];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 2 * Math.PI;
    spawnItem(sim, {
      kind: 'waste',
      pos: { x: ch.center.x + Math.cos(a) * 0.4 * ch.radii.x, y: ch.center.y - 0.8 * ch.radii.y, z: ch.center.z + Math.sin(a) * 0.4 * ch.radii.z },
      init: { wasteKind: 'meconium', bulk: WASTE_BULK.meconium, nestId: k.nest.id, chamberId: ch.id, inNest: true, colony: col.id },
    });
  }
  let t = 0;
  for (; t < TICKS_PER_DAY && wasteIn(k) > BROOD_HAZARD.wasteTolerance; t += 50) run(sim, 50);
  return t;
}

describe('round 12 review: a pupation burst of 16 meconium items in the brood chamber', () => {
  it('falls to the hygiene tolerance within 1250 ticks (seeds 5 and 6)', () => {
    for (const seed of [5, 6]) expect(clearTicks(16, seed), `seed ${seed}`).toBeLessThanOrEqual(1250);
  }, 600_000);
});
