// Independent review of colony-life round 2, fix H1 (hunting): determinism across save -> load.
// The hunt keeps its state in ant.bb (K.patch, K.prey, K.preyX/Z, K.huntFrom), the new phase PHASE.hunt = 14 and the
// patch knowledge PreyPatch.knownBy in state. A game saved while ants hunt and loaded again must continue exactly as
// the uninterrupted game (GDD/design seed: deterministic given seed + commands; derived caches rebuilt on load).
import { describe, expect, it } from 'vitest';
import type { PreyPatch } from '@/sim/types';
import { colonySlotBit } from '@/sim/entities';
import { createSim } from '@/sim/sim';
import { restore, snapshot, stateHash } from '@/sim/save';
import { findNonPlain } from '@/sim/testing';
import { forageScenario, run } from './testkit';
import { K, PHASE } from './keys';

describe('colony-life round 2 review, H1: hunting survives save -> load', () => {
  it('a game saved while ants hunt continues as the uninterrupted one', () => {
    const { sim, col, entrance } = forageScenario({ workers: 24, stores: { c: 4, p: 0 } });
    const bu = sim.world.bu, x = entrance.pos.x + 30 * bu, z = entrance.pos.z;
    const patch: PreyPatch = { id: sim.state.nextId++, center: { x, y: sim.field.height(x, z), z }, radius: 20 * bu, kind: 'springtail', count: 400, k: 400 };
    patch.knownBy = colonySlotBit(sim, col.id);
    sim.state.ecology.preyPatches.push(patch);
    // run until an ant is mid-chase (or at most one game day)
    const hunting = () => sim.stores.ants.list.some((a) => a.alive && a.bb[K.phase] === PHASE.hunt);
    let t = 0;
    for (; t < 6000 && !hunting(); t += 10) run(sim, 10);
    const tripsToPatch = sim.stores.ants.list.filter((a) => a.alive && a.bb[K.patch] === patch.id).length;
    expect(hunting(), JSON.stringify({ t, tripsToPatch })).toBe(true);
    expect(findNonPlain(sim.state)).toEqual([]);
    const loaded = createSim(restore(snapshot(sim)).state, sim.world);
    expect(stateHash(loaded.state)).toBe(stateHash(sim.state));
    run(sim, 1200);
    run(loaded, 1200);
    expect(stateHash(loaded.state)).toBe(stateHash(sim.state));
  }, 180_000);
});
