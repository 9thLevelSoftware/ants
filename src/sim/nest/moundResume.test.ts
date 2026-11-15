// sim-fix-colony review, item 3: a mound relaxation may stop part-way through a sweep (between rows; the cursor is
// kept on the mound), so no tick pays more than the work budget plus one row, even on a big settled pile where
// every cell still creeps and each sweep evaluates the whole pile. The heights do not depend on how the work is
// cut into ticks; a relaxation the next batch overtakes is published as it stands; piles relaxing together take
// turns.
import { describe, expect, it } from 'vitest';
import type { Mound, Sim } from '@/sim/types';
import { BULKING, MOUND_BATCH_TICKS, MOUND_RELAX_WORK_PER_TICK } from '@/sim/balance/nest';
import { createSim } from '@/sim/sim';
import { restore, snapshot, stateHash } from '@/sim/save';
import { commandsSystem } from '@/sim/systems';
import { moundRelaxStep } from './moundBatch';
import { relaxSweeps } from './moundRelax';
import { createMound, deposit, relax } from './mounds';
import { collect, nestSim, playerNest } from './nestTestKit';
import { nestSystem } from './system';

const PELLET = 0.85;
const SYSTEMS = [commandsSystem, nestSystem];

/** A settled heap of `pellets` pellets over a disc of `radiusBu` around (cx, cz). */
function settledHeap(sim: Sim, cx: number, cz: number, pellets: number, radiusBu: number): Mound {
  const nest = playerNest(sim);
  const m = createMound(sim, nest, null, cx, cz, 'loam');
  const vol = PELLET * BULKING * sim.world.bu ** 3, bu = sim.world.bu;
  for (let i = 0; i < pellets; i++) {
    const a = (i * 2.399) % (2 * Math.PI), r = (i % radiusBu) + 0.5;
    deposit(sim, m, cx + Math.cos(a) * r * bu, cz + Math.sin(a) * r * bu, vol);
  }
  for (let k = 0; k < 40 && relax(sim, m); k++);
  return m;
}

/** 20 pellets dumped on one side of the pile (a hauler's batch). */
function smallBatch(sim: Sim, m: Mound): void {
  const vol = PELLET * BULKING * sim.world.bu ** 3, bu = sim.world.bu;
  for (let i = 0; i < 20; i++) deposit(sim, m, m.centerX + (i % 5) * bu, m.centerZ + 10 * bu, vol);
}

/** Runs a batch's relaxation in slices of `budget` work, as moundRelaxStep does for one pile; returns the slices' work. */
function slices(sim: Sim, m: Mound, budget: number): number[] {
  const work: number[] = [];
  let sweep = 0;
  for (let t = 0; t < 100_000; t++) {
    const run = relaxSweeps(sim, m, sweep, budget);
    work.push(run.work);
    if (run.done) return work;
    sweep += run.sweeps;
  }
  throw new Error('relaxation did not end');
}

describe('mound relaxation split between rows (sim-fix-colony review)', () => {
  it('the same heights whether the batch runs at once, in budget slices or in tiny slices', () => {
    const sim = nestSim({ nest: 'small', seed: 3, systems: SYSTEMS });
    const c = sim.world.size / 2, bu = sim.world.bu;
    const m = settledHeap(sim, c + 40 * bu, c, 1500, 15);
    smallBatch(sim, m);
    const h0 = m.h.slice(), v0 = m.volume;
    const results: number[][] = [];
    for (const budget of [Infinity, MOUND_RELAX_WORK_PER_TICK, 700]) {
      m.h.set(h0); m.volume = v0;
      slices(sim, m, budget);
      expect(m.relaxRow ?? 0).toBe(0); // no cursor left once done
      results.push(Array.from(m.h));
    }
    expect(results[1]).toEqual(results[0]);
    expect(results[2]).toEqual(results[0]);
  }, 60_000);

  it('a 20-pellet batch on a settled mature pile: no slice above the budget plus one row', () => {
    const sim = nestSim({ nest: 'small', seed: 3, systems: SYSTEMS });
    const c = sim.world.size / 2, bu = sim.world.bu;
    const m = settledHeap(sim, c + 40 * bu, c, 6000, 30);
    smallBatch(sim, m);
    const work = slices(sim, m, MOUND_RELAX_WORK_PER_TICK);
    // one sweep of this pile is about 109,000 units (every cell of a mature pile still creeps): before, every tick
    // ran at least one whole sweep; now the budget holds to within a row
    expect(Math.max(...work)).toBeLessThanOrEqual(MOUND_RELAX_WORK_PER_TICK + 9 * m.n);
    expect(work.reduce((s, w) => s + w, 0) / work.length).toBeGreaterThan(0.9 * MOUND_RELAX_WORK_PER_TICK);
    // 64 sweeps of about 109,000 units fit in under MOUND_BATCH_TICKS ticks
    expect(work.length).toBeLessThan(MOUND_BATCH_TICKS);
  }, 60_000);

  it('a save / load in the middle of a sweep continues to the same state', () => {
    const make = () => {
      const sim = nestSim({ nest: 'small', seed: 6, systems: SYSTEMS });
      const c = sim.world.size / 2, bu = sim.world.bu;
      const m = settledHeap(sim, c + 40 * bu, c, 1500, 15);
      smallBatch(sim, m);
      m.relaxSweep = 0; m.relaxFlags = 1;
      return { sim, m };
    };
    const a = make(), b0 = make();
    b0.sim.tick();
    expect(b0.m.relaxRow ?? 0).toBeGreaterThan(0); // saved part-way through a sweep
    const b = createSim(restore(snapshot(b0.sim)).state, b0.sim.world, { systems: SYSTEMS });
    const target = a.sim.state.tick + 40;
    while (a.sim.state.tick < target) a.sim.tick();
    while (b.state.tick < target) b.tick();
    expect(stateHash(b.state)).toBe(stateHash(a.sim.state));
  }, 60_000);

  it('a relaxation the next batch overtakes is published at that batch', () => {
    const sim = nestSim({ nest: 'small', seed: 4, systems: SYSTEMS });
    const c = sim.world.size / 2, bu = sim.world.bu;
    const m = settledHeap(sim, c + 40 * bu, c, 300, 8);
    smallBatch(sim, m);
    m.relaxSweep = 3; // still relaxing, with changes not yet published
    m.relaxFlags = 1;
    while ((sim.state.tick + m.id) % MOUND_BATCH_TICKS !== 0) sim.state.tick++;
    const ev = collect<{ type: string; moundId: number }>(sim, ['mound-changed'], () => sim.tick());
    expect(ev.some((e) => e.moundId === m.id)).toBe(true);
  }, 60_000);

  it('piles relaxing together take turns going first', () => {
    const sim = nestSim({ nest: 'small', seed: 5, systems: SYSTEMS });
    const c = sim.world.size / 2, bu = sim.world.bu;
    const piles = [-40, 40].map((dx) => settledHeap(sim, c + dx * bu, c + 40 * bu, 1500, 15));
    for (const m of piles) { smallBatch(sim, m); m.relaxSweep = 0; m.relaxFlags = 1; }
    const progress = (m: Mound) => (m.relaxSweep! < 0 ? Infinity : m.relaxSweep! * 1000 + (m.relaxRow ?? 0));
    const before = piles.map(progress);
    moundRelaxStep(sim);
    sim.state.tick++;
    moundRelaxStep(sim);
    // over two ticks both piles moved on (each went first once)
    piles.forEach((m, i) => expect(progress(m)).toBeGreaterThan(before[i]));
  }, 60_000);
});
