// Stage 1B gate (int-1B-sim work item 7): save -> restore -> continue equals an uninterrupted run, taken mid-life:
// foragers on a trail and carrying, a dig plan in progress, brood being fed. Long soak behind FOUNDRESS_LONG.
import { describe, expect, it } from 'vitest';
import type { Sim } from '@/sim/types';
import { restore, snapshot, stateHash } from '@/sim/save';
import { createSim } from '@/sim/sim';
import { forageScenario, announce } from '@/sim/ants/behaviours/outdoor/testkit';
import { trailCellsOf, midLifeReadout } from './midlifeKit';

function midLife(seed: number): Sim {
  const { sim, col, sources } = forageScenario({
    seed, workers: 40, stores: { c: 2, p: 0.5 },
    sources: [{ kind: 'sugar', variant: 'sugary-spill', distBu: 80, bearingDeg: 40, units: 300 }, { kind: 'carrion', variant: 'insect-medium', distBu: 60, bearingDeg: 200, units: 1 }],
  });
  announce(sim, col, sources[0]);
  sim.enqueue({ type: 'cheat.spawnBrood', colonyId: col.id, stage: 'larva', n: 6, chamberId: -1, progress: 0.3, destined: null });
  sim.enqueue({ type: 'cheat.spawnBrood', colonyId: col.id, stage: 'egg', n: 6, chamberId: -1, progress: 0.2, destined: null });
  return sim;
}

describe('mid-life save / restore (gate 1B)', () => {
  it('restore at N with trails, carriers and a plan in progress, then M more ticks, equals the uninterrupted N + M run', () => {
    const N = 3000, M = 1200;
    const straight = midLife(4);
    for (let i = 0; i < N; i++) straight.tick();
    const at = midLifeReadout(straight);
    // the mid-life conditions the task asks for are really present at the save point
    expect(trailCellsOf(straight)).toBeGreaterThan(0);
    expect(at.carrying + at.cropLoaded).toBeGreaterThan(0);
    expect(at.outside).toBeGreaterThan(0);
    expect(at.livePlans).toBeGreaterThan(0); // a dig plan in progress
    expect(at.larvaeFed).toBeGreaterThan(0); // brood being fed
    const resumed = createSim(restore(snapshot(straight)).state, straight.world);
    for (let i = 0; i < M; i++) { straight.tick(); resumed.tick(); }
    expect(stateHash(resumed.state)).toBe(stateHash(straight.state));
  }, 180000);
});
