// colony-life direction 26 item 4 (round 12): brood hygiene.
// (b) While a brood chamber holds more waste than the tolerance, the haul cap is 0.4 x workers and a nurse with no
//     feeding or moving job carries one waste item out of it (round 11: cpv #2's one hauler held outside for 58 of
//     74 dirty hours while nurses groomed beside a pupation burst of meconium).
// (a) The surface hold: an ant outside is held back only from water deep enough to flee from (FLEE_WATER_DEPTH_BU),
//     and never for longer than FLEE_HOLD_MAX_GD over successive holds (round 12's trace: 65 holds in 6 gd for a
//     brood-chamber destination with 0.01-0.17 BU of water on its floor).
import { describe, expect, it } from 'vitest';
import type { Sim } from '@/sim/types';
import { AntFlag, taskIndex } from '@/sim/types';
import { BROOD_HAZARD, WASTE_BULK } from '@/sim/balance';
import { FLEE_HOLD_MAX_GD, FLEE_RETRY_S, FLEE_WATER_DEPTH_BU, FLOOD_STEP_TICKS } from '@/sim/balance/weather';
import { floodCheats } from '@/sim/nest/flood/cheats';
import { spillFor } from '@/sim/nest/flood/runtime';
import { spawnItem } from '@/sim/entities';
import { navTo } from '@/sim/locomotion';
import { computeDemand } from '@/sim/colony/allocation/demand';
import { censusOf } from '@/sim/colony/census';
import { TICKS_PER_DAY } from '@/sim/time';
import { isFleeingWater } from './fleeWater';
import { makeNestColony, run, type NestColony } from './testkit';

function wasteIn(k: NestColony, chamberId: number): number {
  return k.sim.stores.items.list.filter((it) => it.alive && it.kind === 'waste' && it.chamberId === chamberId && it.carrierIds.length === 0).length;
}

function meconium(k: NestColony, n: number): void {
  const ch = k.royal, col = k.sim.state.colonies[0];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 2 * Math.PI;
    spawnItem(k.sim, {
      kind: 'waste',
      pos: { x: ch.center.x + Math.cos(a) * 0.4 * ch.radii.x, y: ch.center.y - 0.8 * ch.radii.y, z: ch.center.z + Math.sin(a) * 0.4 * ch.radii.z },
      init: { wasteKind: 'meconium', bulk: WASTE_BULK.meconium, nestId: k.nest.id, chamberId: ch.id, inNest: true, colony: col.id },
    });
  }
}

describe('direction 26 item 4b: a pupation burst in a brood chamber', () => {
  it('8 meconium items, 10 workers, the one hauler away outside: under tolerance within 0.25 gd', () => {
    const k = makeNestColony({
      workers: 10, seed: 5, stores: { c: 100, p: 100 },
      brood: [{ stage: 'egg', n: 3, chamber: 'royal' }, { stage: 'pupa', n: 4, chamber: 'royal', progress: 0.2 }],
    });
    const { sim } = k;
    run(sim, 200);
    meconium(k, 8);
    // the colony's hauler is away (a stand-in for the held one): possessed and parked outside, no autonomy
    const hauler = sim.stores.ants.list.find((a) => a.alive && a.caste === 'worker')!;
    hauler.task = 'haul'; hauler.flags |= AntFlag.POSSESSED; hauler.nestId = -1;
    let t = 0;
    const limit = Math.round(0.25 * TICKS_PER_DAY);
    for (; t < limit && wasteIn(k, k.royal.id) > BROOD_HAZARD.wasteTolerance; t += 50) run(sim, 50);
    expect(wasteIn(k, k.royal.id), `waste left after ${t} ticks`).toBeLessThanOrEqual(BROOD_HAZARD.wasteTolerance);
  }, 120_000);

  it('the haul cap doubles while brood lies among waste', () => {
    const k = makeNestColony({ workers: 10, seed: 5, brood: [{ stage: 'egg', n: 3, chamber: 'royal' }] });
    const { sim } = k;
    run(sim, 20);
    meconium(k, 30); // demand 30 / 6 = 5, over both caps
    const col = sim.state.colonies[0];
    const haul = (hyg: boolean): number => computeDemand(sim, col, censusOf(sim, col.id), hyg)[taskIndex('haul')];
    const n = censusOf(sim, col.id).workers;
    expect(haul(false)).toBeCloseTo(0.2 * n, 5);
    expect(haul(true)).toBeCloseTo(0.4 * n, 5);
  });
});

describe('direction 26 item 4a: the surface hold', () => {
  function wetRoyal(k: NestColony, depthBu: number): void {
    // water up to `depthBu` over the royal chamber's lowest floor (the nest's lowest point)
    const cache = spillFor(k.sim, k.nest), v = k.sim.carve.voxel, bu = k.sim.world.bu;
    const floorY = (cache.level[0] - 0.5) * v;
    let n = 0;
    while (n < cache.level.length && (cache.level[n] - 0.5) * v < floorY + depthBu * bu) n++;
    k.nest.flood.water = cache.cumVol[n];
  }

  function workerOutsideTo(k: NestColony, sim: Sim) {
    const bu = sim.world.bu;
    const w = sim.stores.ants.list.find((a) => a.alive && a.caste === 'worker' && !isFleeingWater(a))!;
    const x = k.entrance.pos.x + 8 * bu, z = k.entrance.pos.z;
    w.pos = { x, y: sim.field.height(x, z) + w.footOffset, z };
    w.up = { x: 0, y: 1, z: 0 };
    w.nestId = -1; w.chamberId = -1;
    const dest = { x: k.royal.center.x, y: k.royal.center.y - k.royal.radii.y, z: k.royal.center.z };
    expect(navTo(sim, w, dest, bu)).toBe(true);
    return w;
  }

  function colony(): NestColony {
    const k = makeNestColony({ workers: 6, seed: 3, stores: { c: 100, p: 100 } });
    floodCheats(k.sim.state).drainScale = 0;
    floodCheats(k.sim.state).rainI = 0;
    run(k.sim, 50);
    return k;
  }

  it('a film on the brood chamber floor (under the flee depth) does not hold a worker outside', () => {
    const k = colony();
    wetRoyal(k, 0.5 * FLEE_WATER_DEPTH_BU);
    run(k.sim, 2 * FLOOD_STEP_TICKS);
    const w = workerOutsideTo(k, k.sim);
    run(k.sim, 2 * FLOOD_STEP_TICKS);
    expect(isFleeingWater(w)).toBe(false);
  }, 60_000);

  it('deep water holds her, but not for longer than FLEE_HOLD_MAX_GD: then her task is handed back', () => {
    const k = colony();
    const { sim } = k;
    wetRoyal(k, 3);
    run(sim, 2 * FLOOD_STEP_TICKS);
    const w = workerOutsideTo(k, sim);
    w.task = 'haul';
    run(sim, 2 * FLOOD_STEP_TICKS);
    expect(isFleeingWater(w)).toBe(true);
    // keep sending her in after each re-plan (her task's walk), as a hauler would
    let idleAt = -1;
    const limit = Math.round(1.5 * FLEE_HOLD_MAX_GD * TICKS_PER_DAY);
    for (let t = 0; t < limit && idleAt < 0; t += FLOOD_STEP_TICKS) {
      if (!isFleeingWater(w) && w.task === 'haul' && w.nav.status !== 'moving') {
        navTo(sim, w, { x: k.royal.center.x, y: k.royal.center.y - k.royal.radii.y, z: k.royal.center.z }, sim.world.bu);
      }
      run(sim, FLOOD_STEP_TICKS);
      if ((w.task as string) === 'idle') idleAt = t;
    }
    expect(idleAt, 'handed back to the allocator').toBeGreaterThan(0);
    expect(idleAt).toBeLessThanOrEqual(FLEE_HOLD_MAX_GD * TICKS_PER_DAY + 2 * FLEE_RETRY_S * 10 + 2 * FLOOD_STEP_TICKS);
  }, 120_000);
});
