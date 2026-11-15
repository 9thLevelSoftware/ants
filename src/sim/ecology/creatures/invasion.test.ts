// Centipede nest invasion (GDD 05 §2.5): a major threat that eats 1 brood per 40 s inside the nest and leaves at
// dawn; the threat director tracks it.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { spawnBrood } from '@/sim/entities';
import { makeTestSim } from '@/sim/testing';
import { locomotionSystem } from '@/sim/locomotion';
import { THREAT_CENTIPEDE } from '@/sim/balance/creatures';
import { creatureSystem } from './index';
import { commandHandlers } from './index';
import { installFakeCombat, quietHistory, setClock, step } from './testkit';

let restore: () => void;
beforeEach(() => { restore = installFakeCombat().restore; });
afterEach(() => restore());

describe('centipede nest invasion (§2.5)', () => {
  it('enters, eats brood every 40 s, is the active major threat, leaves at dawn', () => {
    const sim = makeTestSim({ seed: 2, nest: 'small', workers: 0, systems: [creatureSystem, locomotionSystem] });
    setClock(sim, 'summer', 3, 23);
    quietHistory(sim, 20);
    const nest = sim.state.nests[0];
    const ch = nest.chambers.find((c) => c.type === 'nursery') ?? nest.chambers[0];
    for (let i = 0; i < 6; i++) {
      spawnBrood(sim, { colony: nest.colony, stage: 'larva', destined: 'worker', nestId: nest.id, chamberId: ch.id,
        pos: { x: ch.center.x + i - 3, y: ch.center.y - ch.radii.y * 0.8, z: ch.center.z } });
    }
    commandHandlers['cheat.triggerNestInvasion']!(sim, { type: 'cheat.triggerNestInvasion', colonyId: nest.colony, force: false });
    expect(sim.state.rivals.threatDirector.activeKind).toBe(THREAT_CENTIPEDE);
    const c = sim.stores.creatures.list.find((x) => x.alive && x.kind === 'centipede')!;
    expect(c.state).toBe('invade');
    const brood0 = sim.stores.brood.list.filter((b) => b.alive).length;
    step(sim, 3000, () => sim.stores.brood.list.filter((b) => b.alive).length <= brood0 - 2);
    expect(c.nestId).toBe(nest.id);
    expect(sim.stores.brood.list.filter((b) => b.alive).length).toBeLessThanOrEqual(brood0 - 2);
    setClock(sim, 'summer', 4, 10);
    step(sim, 3000, () => sim.state.rivals.threatDirector.activeKind === null);
    expect(sim.state.rivals.threatDirector.activeKind).toBe(null);
    expect(c.nestId).toBe(-1);
  }, 60_000);
});
