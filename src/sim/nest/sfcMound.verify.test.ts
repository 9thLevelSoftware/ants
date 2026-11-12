// Independent verification of sim-fix-colony item 3 (reviewer): the relaxation of a mound batch is spread over
// ticks under one shared work budget (moundRelaxStep). Piles are relaxed one after another in mound order, and a
// sweep is never split, so on big piles every tick runs a whole sweep of one pile. Several big piles whose batches
// start together must still each finish (and be published: field-consistent nav cells, `mound-changed` for the
// renderer) before their next batch restarts them, MOUND_BATCH_TICKS later.
import { describe, expect, it } from 'vitest';
import type { Mound, Sim } from '@/sim/types';
import { BULKING, MOUND_BATCH_TICKS } from '@/sim/balance/nest';
import { commandsSystem } from '@/sim/systems';
import { moundRelaxStep } from './moundBatch';
import { createMound, deposit, relax } from './mounds';
import { nestSim, playerNest } from './nestTestKit';
import { nestSystem } from './system';

const PELLET = 0.85;

/** A settled heap of `pellets` pellets spread over a disc of 30 BU radius around (cx, cz). */
function bigHeap(sim: Sim, cx: number, cz: number, pellets: number): Mound {
  const nest = playerNest(sim);
  const m = createMound(sim, nest, null, cx, cz, 'loam');
  const vol = PELLET * BULKING * sim.world.bu ** 3, bu = sim.world.bu;
  for (let i = 0; i < pellets; i++) {
    const a = (i * 2.399) % (2 * Math.PI), r = (i % 30) + 0.5;
    deposit(sim, m, cx + Math.cos(a) * r * bu, cz + Math.sin(a) * r * bu, vol);
  }
  for (let k = 0; k < 40 && relax(sim, m); k++);
  return m;
}

describe('verify: relaxations of several big piles started together all finish within one batch period', () => {
  it('four settled 6000-pellet heaps (30 BU radius) get a 20-pellet batch at once: each settles and is published before the next batch', () => {
    const sim = nestSim({ nest: 'small', seed: 3, systems: [commandsSystem, nestSystem] });
    const c = sim.world.size / 2, bu = sim.world.bu;
    const piles = [[-80, -80], [80, -80], [-80, 80], [80, 80]].map(([dx, dz]) => bigHeap(sim, c + dx * bu, c + dz * bu, 6000));
    const vol = PELLET * BULKING * bu ** 3;
    for (const m of piles) {
      for (let i = 0; i < 20; i++) deposit(sim, m, m.centerX + (i % 5) * bu, m.centerZ + 10 * bu, vol);
      m.relaxSweep = 0; // what settleBatches does on the batch tick
      m.relaxFlags = 1;
    }
    const doneAt = new Map<number, number>();
    for (let t = 1; t <= MOUND_BATCH_TICKS && doneAt.size < piles.length; t++) {
      moundRelaxStep(sim);
      for (const m of piles) if ((m.relaxSweep ?? -1) < 0 && !doneAt.has(m.id)) doneAt.set(m.id, t);
    }
    const report = piles.map((m) => ({ id: m.id, doneAtTick: doneAt.get(m.id) ?? null, sweep: m.relaxSweep }));
    // every pile finished (published) within one batch period; otherwise its next batch resets relaxSweep to 0
    // and the pile is relaxed forever without ever being published
    expect(report.every((r) => r.doneAtTick !== null), JSON.stringify(report)).toBe(true);
  }, 120_000);
});
