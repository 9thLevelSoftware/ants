// Task opening-fix (the browser's first play, Nov 23): after the hand-over a colony of 5-7 nanitics gave `dig`
// nobody once a narrow way out existed (nurse, queen-care, the scout floor, forage and store took them all, one more
// possessed by the player), and the throat stayed `reopening` with plug soil in it for 16 game hours. While a nest
// has no `open` entrance and a plug to dig out, UNPLUG_FLOOR_DIGGERS are served right after the brood's care.
import { describe, expect, it } from 'vitest';
import { UNPLUG_FLOOR_DIGGERS } from '@/sim/balance';
import { nestSim, playerNest } from '@/sim/nest/nestTestKit';
import { ti } from '../taskIdx';
import { unplugFloor } from './demand';
import { computeTargets } from './targets';

const T = (t: string) => ti(t as never);

describe('the unplug floor (opening-fix)', () => {
  it('6 workers, busy demand: the floor puts diggers on the plug before scouts and foragers; without it dig gets none', () => {
    const sim = nestSim({ nest: 'small', seed: 1 });
    const col = sim.state.colonies[0];
    const d = col.alloc.demand;
    d.fill(0);
    d[T('nurse')] = 1; d[T('queen-care')] = 1; d[T('scout')] = 2; d[T('forage')] = 6; d[T('store')] = 1; d[T('dig')] = 3;
    computeTargets(col, 6, false, undefined, false, 0, 1.2, 0);
    expect(col.alloc.target[T('dig')]).toBe(0); // GDD 02 §6.3 order: dig comes after forage, store and scout
    computeTargets(col, 6, false, undefined, false, 0, 1.2, UNPLUG_FLOOR_DIGGERS);
    expect(col.alloc.target[T('dig')]).toBe(UNPLUG_FLOOR_DIGGERS);
    expect(col.alloc.target[T('nurse')]).toBe(1); // the brood's care keeps its place
    expect(col.alloc.target[T('queen-care')]).toBe(1);
    // never more than the dig demand
    d[T('dig')] = 1;
    computeTargets(col, 6, false, undefined, false, 0, 1.2, UNPLUG_FLOOR_DIGGERS);
    expect(col.alloc.target[T('dig')]).toBe(1);
  });

  it('the floor holds only while the nest has no open entrance and a reopening throat with plug soil', () => {
    const sim = nestSim({ nest: 'small', seed: 1 });
    const col = sim.state.colonies[0], nest = playerNest(sim), e = nest.entrances[0];
    expect(e.status).toBe('open');
    expect(unplugFloor(sim, col)).toBe(0);
    e.status = 'reopening'; e.plugVoxelCount = 12;
    expect(unplugFloor(sim, col)).toBe(UNPLUG_FLOOR_DIGGERS);
    e.plugVoxelCount = 0; // a passage with no plug soil left: nothing to unplug
    expect(unplugFloor(sim, col)).toBe(0);
    e.plugVoxelCount = 12;
    nest.entrances.push({ ...e, id: e.id + 100000, status: 'open', plugVoxelCount: 0 }); // another way out is open
    expect(unplugFloor(sim, col)).toBe(0);
  });
});
