// Colony-life round 14 (direction 29 Part C item 2): waste that hangs where nothing holds it (under a chamber's
// ceiling) falls to the floor, so the haulers see it and carry it out. cpv #1's royal chamber kept 8 founding-time
// waste items 0.11 mm under its ceiling for a whole year (haul priority 0: "nothing below within reach").
import { describe, expect, it } from 'vitest';
import type { Item, Sim } from '@/sim/types';
import { spawnItem } from '@/sim/entities';
import { haulPriority } from '@/sim/ants/behaviours/nest/haul';
import { onSurface } from '@/sim/ants/behaviours/nest/places';
import { makeNestColony, run } from '@/sim/ants/behaviours/nest/testkit';
import { requestTask } from './index';
import { cycleWaste } from './census';
import { settleHangingWaste } from './wasteFall';
import { BROOD_HAZARD } from '@/sim/balance/colony';
import { TICKS_PER_DAY } from '@/sim/time';

/** n waste items just under the ceiling above the chamber's centre (as the founding left them). */
function hangWaste(sim: Sim, chamber: { id: number; center: { x: number; y: number; z: number } }, nestId: number, colony: number, n: number): Item[] {
  const up = sim.field.sphereTrace(chamber.center, { x: 0, y: 1, z: 0 }, 20 * sim.world.bu, 0);
  const p = { x: chamber.center.x, y: chamber.center.y + up - 0.11, z: chamber.center.z };
  const out: Item[] = [];
  for (let i = 0; i < n; i++) {
    const it = spawnItem(sim, { kind: 'waste', pos: p });
    Object.assign(it, { wasteKind: i % 2 ? 'meconium' : 'cocoon', bulk: 0.05, nestId, chamberId: chamber.id, inNest: true, colony });
    out.push(it);
  }
  return out;
}

describe('waste falls to the floor (round 14)', () => {
  it('waste under a ceiling is out of the haulers\' reach until it falls; then it is a haul job on the floor', () => {
    const k = makeNestColony({ workers: 0 });
    const { sim, nest, royal } = k;
    const col = sim.state.colonies[0];
    const [w] = hangWaste(sim, royal, nest.id, col.id, 1);
    expect(onSurface(sim, w.pos)).toBe(false);
    expect(haulPriority(sim, nest, w)).toBe(0);
    expect(settleHangingWaste(sim, col)).toBe(1);
    expect(onSurface(sim, w.pos)).toBe(true);
    expect(w.pos.y).toBeLessThan(royal.center.y);
    expect(w.chamberId).toBe(royal.id);
    expect(haulPriority(sim, nest, w)).toBeGreaterThan(0);
    expect(settleHangingWaste(sim, col)).toBe(0); // resting: nothing moves again
  });

  it('8 waste items under the royal chamber\'s ceiling, 4 workers: the chamber is under the hygiene tolerance within 0.5 gd', () => {
    const k = makeNestColony({ workers: 4, brood: [{ stage: 'egg', n: 3, chamber: 'royal' }] });
    const { sim, nest, royal } = k;
    const col = sim.state.colonies[0];
    hangWaste(sim, royal, nest.id, col.id, 8);
    for (const a of sim.stores.ants.list.filter((x) => x.alive && x.caste === 'worker')) requestTask(sim, a, 'haul', 'job:test');
    const lying = () => sim.stores.items.list.filter((it) => it.alive && it.kind === 'waste' && it.chamberId === royal.id && it.carrierIds.length === 0).length;
    expect(lying()).toBe(8);
    let t = 0;
    for (; t < 0.5 * TICKS_PER_DAY && lying() > BROOD_HAZARD.wasteTolerance; t += 100) run(sim, 100);
    expect(lying()).toBeLessThanOrEqual(BROOD_HAZARD.wasteTolerance);
    expect(cycleWaste(col, royal.id)).toBeLessThanOrEqual(8);
  }, 120_000);
});
