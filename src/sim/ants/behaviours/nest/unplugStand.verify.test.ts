// Reviewer's checks of winter-sugar A3 on the real walker (no stubs): with a wide plugged mouth whose free face is
// reachable (seed 4's case), the ruling-1 release fix stays idle - no digger is switched to the throat-axis point
// (bb 'bn.ua') - and the unplugging is deterministic (two identical runs open at the same tick with the same state).
import { describe, expect, it } from 'vitest';
import type { Sim } from '@/sim/types';
import { evaluateEntrance, sealEntranceImpl } from '@/sim/nest/entrances';
import { stateHash } from '@/sim/save';
import { makeNestColony, run } from './testkit';

function pluggedColony(radiusBu: number, workers: number) {
  const k = makeNestColony({ workers, stores: { c: 60, p: 30 } });
  const { sim, nest, entrance: e } = k;
  e.radius = radiusBu * sim.world.bu;
  evaluateEntrance(sim, nest, e);
  for (let i = 0; i < 60 && e.status !== 'sealed'; i++) sealEntranceImpl(sim, e.id, -1);
  expect(e.status).toBe('sealed');
  e.status = 'reopening';
  evaluateEntrance(sim, nest, e);
  return { ...k, e };
}

function unplug(sim: Sim, colony: number, isOpen: () => boolean, ticks: number) {
  const axis = new Set<number>();
  let openAt = -1;
  for (let t = 1; t <= ticks; t++) {
    run(sim, 1);
    for (const a of sim.stores.ants.list) if (a.alive && a.colony === colony && (a.bb['bn.ua'] ?? 0) === 1) axis.add(a.id);
    if (isOpen()) { openAt = t; break; }
  }
  return { axis, openAt };
}

describe('A3 on the real walker (reviewer, winter-sugar)', () => {
  it('a wide mouth with a reachable face: no digger falls back to the axis point; two runs are identical', () => {
    const runs = [0, 1].map(() => {
      const { sim, nest, e } = pluggedColony(1.9, 6);
      const r = unplug(sim, nest.colony, () => e.status === 'open', 4000);
      return { ...r, hash: stateHash(sim.state) };
    });
    expect(runs[0].openAt).toBeGreaterThan(0);
    expect([...runs[0].axis]).toEqual([]);
    expect(runs[1].openAt).toBe(runs[0].openAt);
    expect(runs[1].hash).toBe(runs[0].hash);
  }, 120_000);
});
