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

  it('a founding of 4 or 3 free workers: the floor never lowers the nurse target, and digs with what the nurses leave', () => {
    // Integrator ruling 1 item 2: four first workers (the browser's seed 1), one of them possessed -> 3 free.
    const sim = nestSim({ nest: 'small', seed: 1 });
    const col = sim.state.colonies[0];
    const d = col.alloc.demand, tg = col.alloc.target;
    const run = (free: number, floor: number) => {
      computeTargets(col, free, false, undefined, false, 0, 0, floor);
      return { nurse: tg[T('nurse')], qc: tg[T('queen-care')], dig: tg[T('dig')], forage: tg[T('forage')] };
    };
    // the seed-4 hand-over: nurse 1, queen-care 2, forage 0.4, store 1, scout 0.6, dig 9
    d.fill(0);
    d[T('nurse')] = 1; d[T('queen-care')] = 2; d[T('forage')] = 0.41; d[T('store')] = 1; d[T('scout')] = 0.6; d[T('dig')] = 9;
    expect(run(3, UNPLUG_FLOOR_DIGGERS)).toEqual({ nurse: 1, qc: 1, dig: 1, forage: 0 });
    expect(run(4, UNPLUG_FLOOR_DIGGERS)).toEqual({ nurse: 1, qc: 1, dig: 2, forage: 0 });
    expect(run(3, 0).dig).toBe(0); // without the floor the plug gets nobody
    // a grid of small-founding demands: the floor never lowers the nurse target
    let cases = 0, dug = 0;
    for (const free of [2, 3, 4]) for (const nurse of [0, 1, 2, 3]) for (const qc of [0, 1, 2]) for (const forage of [0, 1, 4]) for (const dig of [2, 3]) {
      d.fill(0);
      d[T('nurse')] = nurse; d[T('queen-care')] = qc; d[T('forage')] = forage; d[T('store')] = 1; d[T('dig')] = dig;
      const off = run(free, 0), on = run(free, UNPLUG_FLOOR_DIGGERS);
      expect(on.nurse, `free ${free} nurse ${nurse} qc ${qc} forage ${forage} dig ${dig}`).toBeGreaterThanOrEqual(off.nurse);
      expect(on.dig).toBeGreaterThanOrEqual(off.dig);
      expect(on.qc).toBeGreaterThanOrEqual(Math.min(Math.ceil(0.5 * qc), Math.max(0, free - Math.ceil(0.5 * nurse))));
      if (free - nurse - Math.ceil(0.5 * qc) >= 1) { expect(on.dig).toBeGreaterThanOrEqual(1); dug++; }
      cases++;
    }
    expect(cases).toBe(216);
    expect(dug).toBeGreaterThan(40);
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
