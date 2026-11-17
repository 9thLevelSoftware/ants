// threats-live AC4: same seed, same result; a save -> load in the middle of a hunt (wind-up announced, and with
// the victim held) continues exactly like the uninterrupted run. Real save path (snapshot / restore bytes), the
// director on (colony-range territories, rebalancing), the opening done so the colony range is live.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Sim, System } from '@/sim/types';
import { createSim } from '@/sim/sim';
import { restore, snapshot, stateHash } from '@/sim/save';
import { locomotionSystem } from '@/sim/locomotion';
import { makeTestSim } from '@/sim/testing';
import { creatureDirectorSystem, creatureSystem } from './index';
import { captureEvents, installFakeCombat, placeWorker, possess, setClock, spawnAt, step } from './testkit';

const SYSTEMS: System[] = [creatureDirectorSystem, creatureSystem, locomotionSystem];
let undo: () => void;
beforeEach(() => { undo = installFakeCombat().restore; });
afterEach(() => undo());

function scene(seed: number): Sim {
  // 6 workers: past the nest exclusion of §5 (until 5 workers, 40 BU at Naturalist)
  const sim = makeTestSim({ seed, sizeBu: 160, nest: 'small', workers: 6, systems: SYSTEMS });
  if (sim.state.player.opening) { sim.state.player.opening.done = true; sim.state.player.opening.phase = 'done'; }
  setClock(sim, 'summer', 3, 14);
  const e = sim.state.nests[0]?.entrances[0]?.pos ?? { x: 320, y: 0, z: 320 };
  const ant = placeWorker(sim, e.x + 120, e.z);
  ant.maxHp = ant.hp = 30; // held for a while before dying, so the save lands mid-hold
  possess(sim, ant); // never fleeing: the scripted player stands still
  spawnAt(sim, 'jumping-spider', e.x + 150, e.z, { state: 'scan' });
  return sim;
}

function reload(sim: Sim): Sim {
  return createSim(restore(snapshot(sim)).state, sim.world, { systems: SYSTEMS });
}

describe('hunt determinism and save / load', () => {
  it('same seed -> same hash after the hunt', () => {
    const a = scene(5), b = scene(5);
    step(a, 1500); step(b, 1500);
    expect(stateHash(b.state)).toBe(stateHash(a.state));
  }, 60_000);

  it('a reload during the wind-up and during the hold continues like the uninterrupted run', () => {
    const a = scene(6);
    const tele = captureEvents(a, ['predator-telegraph']);
    step(a, 1200, () => tele.length > 0);
    expect(tele.length).toBe(1);
    const midWindup = reload(a);
    const seized = captureEvents(a, ['ant-seized']);
    step(a, 40, () => seized.length > 0);
    expect(seized.length).toBe(1);
    const midHold = reload(a);
    step(a, 600);
    step(midWindup, a.state.tick - midWindup.state.tick);
    step(midHold, a.state.tick - midHold.state.tick);
    expect(stateHash(midHold.state)).toBe(stateHash(a.state));
    expect(stateHash(midWindup.state)).toBe(stateHash(a.state));
  }, 60_000);
});
