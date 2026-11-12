// sim-fix-ants item 4, GDD 02 §10.0 "carried item and task change: deliver first": a worker whose task changes
// while it carries soil or food finishes the delivery before it starts the new task (before the fix only carried
// brood was covered: the new behaviour put any other load down where the ant stood).
import { describe, expect, it } from 'vitest';
import type { Ant, Item } from '@/sim/types';
import { SYSTEMS } from '@/sim/systems';
import { spawnItem } from '@/sim/entities';
import { enteredTask } from '@/sim/ants/behaviourRunner';
import { makeNestColony, type NestColony } from './testkit';

const NO_ALLOC = SYSTEMS.filter((s) => s.name !== 'allocation' && s.name !== 'task-reeval');

function worker(k: NestColony, task: Ant['task']): Ant {
  const a = k.sim.stores.ants.list.find((x) => x.caste === 'worker')!;
  a.task = task;
  return a;
}

/** Runs until cond() or maxTicks; returns the ticks run. */
function until(k: NestColony, cond: () => boolean, maxTicks: number): number {
  let t = 0;
  for (; t < maxTicks && !cond(); t++) k.sim.tick();
  return t;
}

describe('deliver first (GDD 02 §10.0)', () => {
  it('a hauler carrying a soil pellet out when it is made a nurse still takes it out of the nest', () => {
    const k = makeNestColony({ workers: 1, systems: NO_ALLOC });
    const { sim, nest, food } = k;
    const floor = { x: food.center.x, y: food.center.y - food.radii.y, z: food.center.z };
    const pellet: Item = spawnItem(sim, { kind: 'soil-pellet', pos: floor, init: { inNest: true, nestId: nest.id, chamberId: food.id } });
    const a = worker(k, 'haul');
    expect(until(k, () => a.carry.kind === 'item', 3000)).toBeLessThan(3000);
    a.task = 'nurse';
    expect(until(k, () => a.carry.kind === 'none', 4000)).toBeLessThan(4000);
    const p = sim.stores.items.get(pellet.id)!.pos;
    // out of the nest: on the ground surface (not below it), outside
    expect(sim.field.substrateXYZ(p.x, p.y, p.z)).toBeGreaterThan(-0.25 * sim.world.bu);
    expect(until(k, () => enteredTask(a) === 'nurse', 200)).toBeLessThan(200);
  }, 120_000);

  it('a store ant shifting a food item when it is made a nurse still puts it on the food pile', () => {
    const k = makeNestColony({ workers: 1, systems: NO_ALLOC, stores: { c: 1, p: 0.2 } });
    const { sim, entrance, food } = k;
    const bu = sim.world.bu;
    const x = entrance.pos.x + 3 * bu, z = entrance.pos.z;
    const crumb = spawnItem(sim, { kind: 'food-piece', pos: { x, y: sim.field.height(x, z), z }, init: { bulk: 0.5, c: 0.2, p: 0.3, foodKind: 'crumb' } });
    const a = worker(k, 'store');
    expect(until(k, () => a.carry.kind === 'item', 3000)).toBeLessThan(3000);
    a.task = 'nurse';
    expect(until(k, () => a.carry.kind === 'none', 3000)).toBeLessThan(3000);
    const it = sim.stores.items.get(crumb.id);
    // booked by the put-down on the food pile (the item may be absorbed into the stores) or lying in the food chamber
    expect(!it || it.chamberId === food.id, JSON.stringify(it && { chamber: it.chamberId, food: food.id })).toBe(true);
    expect(until(k, () => enteredTask(a) === 'nurse', 200)).toBeLessThan(200);
  }, 120_000);
});
