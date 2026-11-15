// sim-fix-colony item 3: a mound batch's relaxation is spread over ticks within MOUND_RELAX_WORK_PER_TICK, so no
// tick pays a whole batch; the result keeps the pile's volume and the angle-of-repose shape (GDD 03 §1.4, App. E
// check 5), and a save / load in the middle of a relaxation gives the same state as an uninterrupted run.
import { describe, expect, it } from 'vitest';
import type { Mound, Sim } from '@/sim/types';
import { BULKING, MOUND_BATCH_TICKS, MOUND_MAX_SWEEPS, MOUND_RELAX_FINISH_SHARE, MOUND_RELAX_WORK_PER_TICK } from '@/sim/balance/nest';
import { createSim } from '@/sim/sim';
import { restore, snapshot, stateHash } from '@/sim/save';
import { commandsSystem } from '@/sim/systems';
import { createMound, deposit, dumpPoint, moundVolume } from './mounds';
import { relaxSweeps, sweepCostBound } from './moundRelax';
import { nestSim, playerNest } from './nestTestKit';
import { nestSystem } from './system';
import { reposeDeg } from './substrate';

const SYSTEMS = [commandsSystem, nestSystem];
const PELLET = 0.85;

/** A sim with an entrance mound that gets `n` pellets' worth of soil at the next batch tick. */
function busyMound(seed = 3, n = 600): { sim: Sim; m: Mound } {
  const sim = nestSim({ nest: 'small', seed, systems: SYSTEMS });
  const nest = playerNest(sim);
  const e = nest.entrances[0];
  const m = e.moundId >= 0 ? sim.state.worldDelta.mounds.find((x) => x.id === e.moundId)! : createMound(sim, nest, e, e.pos.x, e.pos.z, 'loam');
  const p = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < n; i++) { dumpPoint(sim, e, p); deposit(sim, m, p.x, p.z, PELLET * BULKING * sim.world.bu ** 3); }
  // run until the next tick is the mound's batch
  while ((sim.state.tick + m.id) % MOUND_BATCH_TICKS !== 0) sim.tick();
  return { sim, m };
}

/** Largest top difference between 4-adjacent supported cells with pile on either side, mm. */
function worstAdjacent(m: Mound): number {
  let worst = 0;
  for (let iz = 0; iz < m.n; iz++) for (let ix = 0; ix < m.n; ix++) {
    const i = iz * m.n + ix;
    if (Number.isNaN(m.base[i])) continue;
    for (const j of [ix + 1 < m.n ? i + 1 : -1, iz + 1 < m.n ? i + m.n : -1]) {
      if (j < 0 || Number.isNaN(m.base[j]) || (m.h[i] <= 0 && m.h[j] <= 0)) continue;
      worst = Math.max(worst, Math.abs(m.base[i] + m.h[i] - m.base[j] - m.h[j]));
    }
  }
  return worst;
}

describe('mound relaxation spread over ticks (sim-fix-colony 3)', () => {
  it('the batch settles over several ticks', () => {
    const { sim, m } = busyMound();
    // the whole batch's relaxation at once, for comparison (on a copy of the heights)
    const h0 = m.h.slice(), v0 = m.volume;
    const once = relaxSweeps(sim, m, 0, Infinity);
    m.h.set(h0);
    m.volume = v0;
    sim.tick(); // the batch tick: relaxation starts
    let ticks = 1;
    while ((m.relaxSweep ?? -1) >= 0 && ticks < 200) {
      sim.tick();
      ticks++;
    }
    expect(m.relaxSweep ?? -1).toBe(-1);
    expect(ticks).toBeGreaterThan(1); // it did not all happen in the batch tick
    expect(once.work).toBeGreaterThan(MOUND_RELAX_WORK_PER_TICK); // the scenario is a heavy batch
  });

  it('per-tick work is bounded (measured with the step function itself)', async () => {
    const { sim, m } = busyMound(4);
    const { moundRelaxStep } = await import('./moundBatch');
    sim.tick(); // batch tick: settles and starts the relaxation (first slice included)
    let maxWork = 0, maxBudget = 0;
    while ((m.relaxSweep ?? -1) >= 0) {
      const first = m.relaxSweep!;
      const h = m.h.slice(), vol = m.volume;
      const cursor = { row: m.relaxRow, box: m.relaxBox, maxT: m.relaxMaxT, edge: m.relaxEdge };
      const budget = Math.max(MOUND_RELAX_WORK_PER_TICK, Math.ceil((MOUND_MAX_SWEEPS * sweepCostBound(m)) / (MOUND_BATCH_TICKS * MOUND_RELAX_FINISH_SHARE)));
      maxBudget = Math.max(maxBudget, budget);
      const probe = relaxSweeps(sim, m, first, budget); // what this tick's slice does
      m.h.set(h); m.volume = vol;
      m.relaxRow = cursor.row; m.relaxBox = cursor.box; m.relaxMaxT = cursor.maxT; m.relaxEdge = cursor.edge;
      maxWork = Math.max(maxWork, probe.work);
      moundRelaxStep(sim);
    }
    // a slice stops at the first row boundary past its budget (the shared budget, or the pile's finishing rate if
    // higher): at most that plus one row of the grid
    expect(maxWork).toBeLessThanOrEqual(maxBudget + 9 * m.n);
    expect(maxBudget).toBeLessThan(2 * MOUND_RELAX_WORK_PER_TICK);
  });

  it('the spread relaxation keeps the volume and the angle of repose (GDD 03 App. E check 5)', () => {
    const { sim, m } = busyMound(5);
    const before = moundVolume(sim, m);
    for (let t = 0; t < 2 * MOUND_BATCH_TICKS; t++) sim.tick();
    expect(m.relaxSweep ?? -1).toBe(-1);
    expect(Math.abs(moundVolume(sim, m) - before) / before).toBeLessThan(0.005);
    expect(Math.abs(m.volume - moundVolume(sim, m)) / before).toBeLessThan(1e-6);
    const lim = (0.5 * Math.tan((reposeDeg('loam') * Math.PI) / 180) + 0.01) * sim.world.bu;
    expect(worstAdjacent(m)).toBeLessThanOrEqual(lim);
  });

  it('a save / load in the middle of a relaxation gives the uninterrupted state', () => {
    const a = busyMound(6).sim;
    const b0 = busyMound(6).sim;
    const target = a.state.tick + 60;
    b0.tick(); // batch tick
    const mid = b0.state.worldDelta.mounds.find((x) => (x.relaxSweep ?? -1) >= 0);
    expect(mid).toBeDefined(); // saved while a relaxation is in progress
    const { state } = restore(snapshot(b0));
    const b = createSim(state, b0.world, { systems: SYSTEMS });
    while (a.state.tick < target) a.tick();
    while (b.state.tick < target) b.tick();
    expect(stateHash(b.state)).toBe(stateHash(a.state));
  }, 60_000);
});
