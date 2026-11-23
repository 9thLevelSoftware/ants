// Independent sweep after colony-life round 14: tries to break wasteFall (colony/wasteFall.ts).
// 1. Save -> load -> continue while hanging waste falls and is hauled: the restored game must run as the unsaved one
//    (the fall moves item positions once a colony cycle; nothing derived may remember the old ones).
// 2. Waste the haulers cannot reach is counted as chamber waste all the same: spoiled food spawned by the store's
//    spoilage at the chamber ellipsoid's bottom (stores.ts spawnSpoiledItem: centre.y - radii.y) lies inside the floor.
import { describe, expect, it } from 'vitest';
import type { Item, Sim } from '@/sim/types';
import { createSim } from '@/sim/sim';
import { restore, snapshot, stateHash } from '@/sim/save';
import { spawnItem } from '@/sim/entities';
import { onSurface } from '@/sim/ants/behaviours/nest/places';
import { makeNestColony } from '@/sim/ants/behaviours/nest/testkit';
import { requestTask } from './index';
import { settleHangingWaste } from './wasteFall';
import { SPOILED_ITEM_LOADS } from '@/sim/balance/colony';
import { haulPriority } from '@/sim/ants/behaviours/nest/haul';
import { coreOf } from './core';
import { spoil } from './stores';

const UP = { x: 0, y: 1, z: 0 };

function hangAt(sim: Sim, p: { x: number; y: number; z: number }, nestId: number, chamberId: number, colony: number, n: number): Item[] {
  const up = sim.field.sphereTrace(p, UP, 40 * sim.world.bu, 0);
  const q = { x: p.x, y: p.y + up - 0.11, z: p.z };
  const out: Item[] = [];
  for (let i = 0; i < n; i++) {
    const it = spawnItem(sim, { kind: 'waste', pos: q });
    Object.assign(it, { wasteKind: 'meconium', bulk: 0.05, nestId, chamberId, inNest: true, colony });
    out.push(it);
  }
  return out;
}

describe('wasteFall, independent checks (sweep after round 14)', () => {
  it('save -> load -> continue while hanging waste falls and is hauled: equal state hashes', () => {
    const k = makeNestColony({ workers: 4, seed: 3, brood: [{ stage: 'egg', n: 3, chamber: 'royal' }] });
    const a = k.sim, col = a.state.colonies[0];
    hangAt(a, k.royal.center, k.nest.id, k.royal.id, col.id, 6);
    for (const ant of a.stores.ants.list.filter((x) => x.alive && x.caste === 'worker')) requestTask(a, ant, 'haul', 'job:test');
    for (let t = 0; t < 3; t++) a.tick(); // save before the first colony cycle settles the items
    const b = createSim(restore(snapshot(a)).state, a.world);
    expect(stateHash(b.state)).toBe(stateHash(a.state));
    for (let t = 0; t < 1500; t++) { a.tick(); b.tick(); }
    expect(stateHash(b.state)).toBe(stateHash(a.state));
  }, 300_000);

  it('spoiled food from the store lands where a hauler can reach it (kd #3: 9 buried items counted in the royal chamber)', () => {
    const k = makeNestColony({ workers: 0, stores: { c: 60, p: 30 } });
    const sim = k.sim, col = sim.state.colonies[0], bu = sim.world.bu;
    // The test nest's chambers are carved as exactly their registry ellipsoids. In the game's nests the registry's
    // vertical radius is larger than the cavity's half-height (round-13 year-two caches, through each chamber's
    // centre: kd #3 royal radii.y 1.5 BU, floor to ceiling 2.06 BU; we #2 1.5 / 2.00; sg #2 nursery 1.0 / 2.09 ...,
    // sweep-review/probe-hang14.txt), so centre.y - radii.y lies ~0.45 BU inside the floor. Give the test nest's
    // records that relation.
    for (const c of k.nest.chambers) c.radii = { ...c.radii, y: c.radii.y + 0.45 * bu };
    coreOf(col).spoiledPending = SPOILED_ITEM_LOADS * 0.999;
    spoil(sim, col, 1);
    const spoiled = sim.stores.items.list.filter((it) => it.alive && it.kind === 'waste' && it.wasteKind === 'spoiled-food');
    expect(spoiled.length).toBeGreaterThan(0);
    for (const it of spoiled) {
      // counted in its chamber's waste (census), so it must be a haul job somewhere
      expect(it.chamberId).toBeGreaterThanOrEqual(0);
      expect({ id: it.id, f: +(sim.field.sample(it.pos) / sim.world.bu).toFixed(2), onSurface: onSurface(sim, it.pos) })
        .toEqual({ id: it.id, f: expect.any(Number), onSurface: true });
      expect(haulPriority(sim, k.nest, it)).toBeGreaterThan(0);
    }
  });
});
