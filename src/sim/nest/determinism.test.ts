// Acceptance 8 / GDD 03 check 25 (last clause): nest state round-trips through core encode / decode, and two runs
// with the same seed and command log give identical state hashes, also across a save / load in the middle.
import { describe, expect, it } from 'vitest';
import { decode, encode } from '@/core/serialize';
import type { Command, Sim } from '@/sim/types';
import { createSim } from '@/sim/sim';
import { restore, snapshot, stateHash } from '@/sim/save';
import { commandsSystem } from '@/sim/systems';
import { nestSystem } from './system';
import { nestSim } from './nestTestKit';

const BU = 4;
const SYSTEMS = [commandsSystem, nestSystem];

/** The scripted command log, by tick (plan ids are looked up from the state, so the log is replayable). */
function script(sim: Sim): Command[] {
  const t = sim.state.tick, nest = sim.state.nests[0], e = nest.entrances[0];
  const food = nest.chambers.find((c) => c.type === 'food')!;
  switch (t) {
    case 5: return [{ type: 'cheat.spawnPellets', pos: { x: e.pos.x + 3 * BU, y: e.pos.y, z: e.pos.z + 1 * BU }, n: 6, volume: 0.85 }];
    case 8: return [{ type: 'cheat.spawnPellets', pos: { x: food.center.x, y: food.center.y - food.radii.y + 0.2 * BU, z: food.center.z }, n: 3, volume: 0.6 }];
    case 10: return [{
      type: 'planDig', nestId: nest.id, kind: 'tunnel', anchor: { pos: { x: food.center.x, y: food.center.y - 0.5 * BU, z: food.center.z - food.radii.z }, normal: { x: 0, y: 0, z: 1 } },
      length: 8, priority: 'normal', confirmWarnings: true,
    }];
    case 20: {
      const plan = nest.digPlans.find((p) => p.kind === 'tunnel');
      return plan ? [{ type: 'cheat.instantPlan', planId: plan.id }] : [];
    }
    case 30: return [{ type: 'cheat.fillSphere', pos: { x: food.center.x + 2 * BU, y: food.center.y - food.radii.y, z: food.center.z }, r: 0.8 * BU, loose: true }];
    case 40: return [{ type: 'sealEntrance', entranceId: e.id }];
    case 50: return [{ type: 'cheat.carveEllipsoid', center: { x: food.center.x - 14 * BU, y: food.center.y, z: food.center.z }, radii: { x: 4 * BU, y: 1.25 * BU, z: 4 * BU }, yawDeg: 0 }];
    default: return [];
  }
}

function run(sim: Sim, until: number): void {
  while (sim.state.tick < until) {
    for (const c of script(sim)) sim.enqueue(c);
    sim.tick();
  }
}

describe('nest determinism and persistence', () => {
  it('acceptance 8: nests, mounds and voxel flags survive encode / decode exactly', () => {
    const sim = nestSim({ nest: 'small', systems: SYSTEMS });
    run(sim, 3400);
    expect(sim.state.worldDelta.mounds.length).toBeGreaterThan(0);
    expect(sim.state.worldDelta.carveFlags.keys.length).toBeGreaterThan(0);
    const back = decode(encode(sim.state)) as typeof sim.state;
    expect(back.nests).toEqual(sim.state.nests);
    expect(back.worldDelta.mounds).toEqual(sim.state.worldDelta.mounds);
    expect(back.worldDelta.mounds[0].h).toBeInstanceOf(Float32Array);
    expect(back.worldDelta.carveFlags).toEqual(sim.state.worldDelta.carveFlags);
    expect(stateHash(back)).toBe(stateHash(sim.state));
  }, 60_000);

  it('acceptance 8: same seed + same command log -> same state hash, with and without a save / load at tick 1700', () => {
    const a = nestSim({ nest: 'small', systems: SYSTEMS });
    run(a, 3400);
    const b0 = nestSim({ nest: 'small', systems: SYSTEMS });
    run(b0, 1700);
    const { state } = restore(snapshot(b0));
    const b = createSim(state, b0.world, { systems: SYSTEMS });
    run(b, 3400);
    expect(stateHash(b.state)).toBe(stateHash(a.state));
    const c = nestSim({ nest: 'small', systems: SYSTEMS });
    run(c, 3400);
    expect(stateHash(c.state)).toBe(stateHash(a.state));
    // the run did real nest work
    const nest = a.state.nests[0];
    expect(nest.digPlans.some((p) => p.kind === 'tunnel' && p.status === 'complete')).toBe(true);
    expect(a.state.worldDelta.mounds[0].volume).toBeGreaterThan(0);
    expect(nest.chambers.length).toBe(3); // the unconnected cheat room (tick 50) is not part of the nest
  }, 120_000);
});
