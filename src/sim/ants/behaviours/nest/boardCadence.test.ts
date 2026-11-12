// sim-fix-ants item 2: the nursery job board is rebuilt every 2 s on aligned windows (GDD 02 §10.4), not every
// tick, and kept in state, so a game saved in the middle of a window and loaded again runs exactly like the
// uninterrupted game (same state hashes).
import { describe, expect, it } from 'vitest';
import { createSim } from '@/sim/sim';
import { restore, snapshot, stateHash } from '@/sim/save';
import { NURSERY_BOARD_PERIOD_S } from '@/sim/balance/nestwork';
import { secondsToTicks } from '@/sim/time';
import { makeNestColony } from './testkit';

const PERIOD = secondsToTicks(NURSERY_BOARD_PERIOD_S);

function colony() {
  return makeNestColony({
    workers: 30, stores: { c: 150, p: 100 }, seed: 4,
    brood: [{ stage: 'egg', n: 8, chamber: 'nursery' }, { stage: 'larva', n: 10, chamber: 'nursery' }, { stage: 'pupa', n: 6, chamber: 'nursery', progress: 0.9 }],
  });
}

describe('nursery board cadence and save / load (GDD 02 §10.4)', () => {
  it('is rebuilt once per 2 s window, on the first read in the window', () => {
    const { sim } = colony();
    const builds = new Set<number>();
    for (let t = 0; t < 600; t++) {
      sim.tick();
      const b = sim.state.nurseryBoards?.[0];
      if (b) builds.add(b.builtTick);
    }
    const windows = new Set([...builds].map((t) => Math.floor(t / PERIOD)));
    expect(builds.size).toBe(windows.size); // never twice in a window
    expect(builds.size).toBeLessThanOrEqual(Math.ceil(600 / PERIOD) + 1);
    expect(builds.size).toBeGreaterThan(600 / PERIOD / 2);
  });

  it('save in mid-window -> load -> run equals the uninterrupted run', () => {
    const a = colony().sim;
    for (let t = 0; t < 1207; t++) a.tick();
    expect(a.state.tick % PERIOD).not.toBe(0);
    const b = createSim(restore(snapshot(a)).state, a.world);
    expect(stateHash(b.state)).toBe(stateHash(a.state));
    for (let t = 0; t < 900; t++) { a.tick(); b.tick(); }
    const busy = a.stores.ants.list.filter((x) => x.alive && x.task === 'nurse' && x.state !== 'nurse.groom').length;
    expect(busy).toBeGreaterThan(0);
    expect(stateHash(b.state)).toBe(stateHash(a.state));
  }, 300_000);
});
