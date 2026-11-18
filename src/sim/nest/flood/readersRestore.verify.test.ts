// Independent review after colony-life round 7 (direction 12: "a save and load continues the same game"). Round 7
// fixed the mound-mask cache; this checks the other derived cache that a wet nest's ants read between flood steps.
//
// `runtime.ts spillForReaders` (drowning, flee water, water speed, dryPlace) answers the spill cache *as last built*
// in a running game, but in a loaded game that has built none yet it builds the *current* geometry. After a carve in
// a wet nest the flood model is frozen until the nest's next rebuild slot (throttle, FLOOD_REBUILD_TICKS /
// FLOOD_REBUILD_SLOTS), so during that window the running game reads the old geometry and the loaded game the new
// one. Seen in the sweep after round 7: playground-park #1's hand-over, split at tick 30024 (a carve at 30013 in the
// wet player nest), cached 710 samples vs fresh 714, the state hashes part 37 ticks after the load (chamber flooded
// share 0.2048 vs 0.2038); clearing the running game's flood caches at the split removes the difference
// (`test-output/colony-life/round-7/sweep-review/probe-restore-diff3-pp1.txt`, `probe-spill3-pp1.txt`).
//
// Rule checked: right after a carve in a wet nest, a game saved and loaded reads the same water geometry as the
// running one. RED = the defect (kept for the owner).

import { describe, expect, it } from 'vitest';
import type { Sim } from '@/sim/types';
import { makeTestSim } from '@/sim/testing';
import { createSim } from '@/sim/sim';
import { restore, snapshot } from '@/sim/save/snapshot';
import { commandsSystem } from '@/sim/systems';
import { carveCapsule } from '../carveOps';
import { playerNest } from '../nestTestKit';
import { floodCheats } from './cheats';
import { neutralSite } from './floodTestKit';
import { floodSystem } from './index';
import { spillForReaders } from './runtime';

const SYSTEMS = [commandsSystem, floodSystem];

describe('review colony-life round 7: flood readers after a save / load', () => {
  it('a carve in a wet nest, then save / load: the loaded game reads the same spill geometry as the running one', () => {
    const a = makeTestSim({ nest: 'small', systems: SYSTEMS });
    neutralSite(a);
    floodCheats(a.state).rainI = 1;
    floodCheats(a.state).drainScale = 0;
    for (let i = 0; i < 400; i++) a.tick();
    const nest = playerNest(a);
    expect(nest.flood.water).toBeGreaterThan(0);
    spillForReaders(a, nest); // the running game has its cache (as after any flood step)
    // a side pocket dug out of the lowest chamber, under the water
    const low = [...nest.chambers].sort((p, q) => p.center.y - q.center.y)[0];
    const bu = a.world.bu;
    carveCapsule(a, { ...low.center }, { x: low.center.x + low.radii.x + 3 * bu, y: low.center.y, z: low.center.z }, 1.2 * bu);
    a.tick(); // the flood step after the carve (frozen until the nest's rebuild slot)
    const b = createSim(restore(snapshot(a)).state, a.world, { systems: SYSTEMS });
    const nb = b.stores.nests.get(nest.id)!;
    const live = spillForReaders(a, nest), loaded = spillForReaders(b, nb);
    const msg = `tick ${a.state.tick}, spillTick ${nest.flood.spillTick}: running game ${live.si.length} samples, loaded game ${loaded.si.length}`;
    expect(loaded.si.length, msg).toBe(live.si.length);
  });
});
