// Independent review of colony-life round 4, fix H4 (haul ranks after queen-care while the brood lies among waste).
// The round's hygiene.test calls computeTargets with the `hygiene` flag set by hand, so it stays green with the
// trigger (allocation/index.ts broodAmongWaste) unwired. This test goes through allocateColony on a real nest: brood
// in the nursery, the colony short of workers (demand above the workers), and waste at the hygiene tolerance either
// in the nursery (among the brood) or in the food chamber (no brood there).
import { describe, expect, it } from 'vitest';
import { spawnItem } from '@/sim/entities';
import { BROOD_HAZARD } from '@/sim/balance';
import { taskIndex } from '@/sim/types';
import { makeNestColony } from '@/sim/ants/behaviours/nest/testkit';
import { storeCycleSnapshot } from '../census';
import { coreOf } from '../core';
import { allocateColony } from './index';

function haulTarget(wasteIn: 'nursery' | 'food'): { haul: number; demand: number; workers: number } {
  const { sim, nest, nursery, food } = makeNestColony({
    workers: 3, stores: { c: 0, p: 0 }, brood: [{ stage: 'egg', n: 6, chamber: 'nursery' }],
  });
  const col = sim.state.colonies[0];
  const room = wasteIn === 'nursery' ? nursery : food;
  for (let i = 0; i < BROOD_HAZARD.wasteTolerance; i++) {
    spawnItem(sim, {
      kind: 'waste', pos: { x: room.center.x + i * 0.3 * sim.world.bu, y: room.center.y - room.radii.y, z: room.center.z },
      init: { wasteKind: 'brood-corpse', bulk: 0.02, colony: col.id, nestId: nest.id, chamberId: room.id, inNest: true },
    });
  }
  storeCycleSnapshot(sim, col, coreOf(col)); // the colony cycle's waste count per chamber (what the trigger reads)
  allocateColony(sim, col, sim.getSpecies(col.species)!, false);
  let demand = 0;
  for (const d of col.alloc.demand) demand += d;
  const workers = sim.stores.ants.list.filter((a) => a.alive && a.colony === col.id && a.caste !== 'queen').length;
  return { haul: col.alloc.target[taskIndex('haul')], demand, workers };
}

describe('H4 review: the waste-among-brood trigger through allocateColony', () => {
  it('a short colony gives haul a worker with waste among the brood, and the GDD order without', () => {
    const among = haulTarget('nursery');
    const apart = haulTarget('food');
    const msg = JSON.stringify({ among, apart });
    expect(among.demand, msg).toBeGreaterThan(among.workers); // the case H4 is for: ΣD > A
    expect(among.haul, msg).toBeGreaterThanOrEqual(1);
    expect(apart.haul, msg).toBeLessThan(among.haul); // the trigger, not the demand, gave the worker
  }, 60_000);
});
