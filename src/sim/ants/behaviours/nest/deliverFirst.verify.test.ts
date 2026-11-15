// Reviewer tests for sim-fix-ants item 4 (GDD 02 §10.0 deliver first): the hold ends after THIS delivery. With more
// work of the old task lying about, the old behaviour's concluding think must not start a second delivery (the
// runner re-arms the hold whenever `delivering` turns true again, so a chain of loads would never let go).
import { describe, expect, it } from 'vitest';
import type { Ant } from '@/sim/types';
import { SYSTEMS } from '@/sim/systems';
import { spawnItem } from '@/sim/entities';
import { enteredTask } from '@/sim/ants/behaviourRunner';
import { makeNestColony, type NestColony } from './testkit';

const NO_ALLOC = SYSTEMS.filter((s) => s.name !== 'allocation' && s.name !== 'task-reeval');

function until(k: NestColony, cond: () => boolean, maxTicks: number): number {
  let t = 0;
  for (; t < maxTicks && !cond(); t++) k.sim.tick();
  return t;
}

describe('reviewer: deliver first lets go after one delivery', () => {
  it('a hauler with more pellets waiting delivers the one it holds, then becomes a nurse without a second load', () => {
    const k = makeNestColony({ workers: 1, systems: NO_ALLOC });
    const { sim, nest, food } = k;
    const bu = sim.world.bu;
    for (let i = 0; i < 5; i++) {
      const floor = { x: food.center.x + (i - 2) * 0.6 * bu, y: food.center.y - food.radii.y, z: food.center.z };
      spawnItem(sim, { kind: 'soil-pellet', pos: floor, init: { inNest: true, nestId: nest.id, chamberId: food.id } });
    }
    const a: Ant = sim.stores.ants.list.find((x) => x.caste === 'worker')!;
    a.task = 'haul';
    expect(until(k, () => a.carry.kind === 'item', 3000)).toBeLessThan(3000);
    const first = a.carry.kind === 'item' ? a.carry.id : -1;
    a.task = 'nurse';
    let pickedOther = false;
    const t = until(k, () => {
      if (a.carry.kind === 'item' && a.carry.id !== first) pickedOther = true;
      return enteredTask(a) === 'nurse';
    }, 6000);
    expect(t, 'ticks to the switch').toBeLessThan(6000);
    expect(pickedOther, 'took a second pellet before switching').toBe(false);
    expect(a.carry.kind).toBe('none');
  }, 120_000);

  it('a task change back to the old task during the hold clears the hold (no stale deliver-first state)', () => {
    const k = makeNestColony({ workers: 1, systems: NO_ALLOC });
    const { sim, nest, food } = k;
    const floor = { x: food.center.x, y: food.center.y - food.radii.y, z: food.center.z };
    spawnItem(sim, { kind: 'soil-pellet', pos: floor, init: { inNest: true, nestId: nest.id, chamberId: food.id } });
    const a: Ant = sim.stores.ants.list.find((x) => x.caste === 'worker')!;
    a.task = 'haul';
    expect(until(k, () => a.carry.kind === 'item', 3000)).toBeLessThan(3000);
    a.task = 'nurse';
    for (let i = 0; i < 30; i++) sim.tick();
    expect(enteredTask(a)).toBe('haul');
    a.task = 'haul';
    for (let i = 0; i < 30; i++) sim.tick();
    expect(a.bb['run.dlv'] ?? -1).toBe(-1);
    expect(enteredTask(a)).toBe('haul');
  }, 120_000);
});
