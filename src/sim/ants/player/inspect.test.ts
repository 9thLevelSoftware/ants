// Inspect read-outs (GDD 01 §10): a plain-data card for every target kind.
import { afterEach, describe, expect, it } from 'vitest';
import { spawnCreature } from '@/sim/entities';
import { findNonPlain } from '@/sim/testing/plainData';
import { fakeChamber, foodItem, installFakes, larva, makeAntSim, source, worker } from '../actions/testkit';
import { inspectTarget } from './inspect';

let restore = (): void => {};
afterEach(() => restore());

describe('inspect cards', () => {
  it('ground, food source, food item, ant (ours / foreign), brood, creature, chamber, entrance', () => {
    const sim = makeAntSim();
    restore = installFakes(sim).restore;
    const bu = sim.world.bu;
    const a = worker(sim, 50, 50);
    const p = { x: 52 * bu, y: 0, z: 50 * bu };
    const ground = inspectTarget(sim, a, { kind: 'surface', id: -1, pos: p })!;
    expect(ground.kind).toBe('ground');
    expect(ground.senses.map((r) => r.key)).toEqual(expect.arrayContaining(['material', 'diggability', 'moisture', 'temperature', 'trail', 'home', 'alarm']));

    const s = source(sim, p, 'sugar', 4, { c: 1, p: 0 });
    const food = inspectTarget(sim, a, { kind: 'source', id: s.id, pos: s.pos })!;
    expect(food.senses.find((r) => r.key === 'taste')?.word).toBe('sweet');
    expect(food.senses.find((r) => r.key === 'amount')?.value).toBe(4);
    expect(food.colony.find((r) => r.key === 'known')?.word).toBe('no');

    const heavy = foodItem(sim, p, 3.4, 1, 0);
    const item = inspectTarget(sim, a, { kind: 'item', id: heavy.id, pos: heavy.pos })!;
    expect(item.senses.find((r) => r.key === 'carry')?.word).toBe('needs about 4');
    expect(item.senses.find((r) => r.key === 'taste')?.word).toBe('protein-rich');

    const mate = worker(sim, 55, 55);
    const ours = inspectTarget(sim, a, { kind: 'ant', id: mate.id, pos: mate.pos })!;
    expect(ours.kind).toBe('ant');
    expect(ours.colony.find((r) => r.key === 'task')?.word).toBe('idle');
    const stranger = worker(sim, 60, 60);
    stranger.colony = 999;
    expect(inspectTarget(sim, a, { kind: 'ant', id: stranger.id, pos: stranger.pos })?.title).toBe('stranger');
    const q = sim.stores.ants.get(sim.state.colonies[0].queenId)!;
    expect(inspectTarget(sim, null, { kind: 'ant', id: q.id, pos: q.pos })?.colony.some((r) => r.key === 'colony-orders')).toBe(true);

    const l = larva(sim, p);
    l.hunger = 0.8;
    expect(inspectTarget(sim, a, { kind: 'brood', id: l.id, pos: l.pos })?.senses.find((r) => r.key === 'hunger')?.word).toBe('starving');

    const spider = spawnCreature(sim, { kind: 'wolf-spider', pos: p });
    expect(inspectTarget(sim, a, { kind: 'creature', id: spider.id, pos: p })?.senses.find((r) => r.key === 'danger')?.word)
      .toBe('dangerous to a lone ant');

    sim.state.nests[0].chambers.push(fakeChamber(4242, p, 3 * bu, 'food'));
    expect(inspectTarget(sim, a, { kind: 'chamber', id: 4242, pos: p })?.colony.find((r) => r.key === 'type')?.word).toBe('food');
    sim.state.nests[0].entrances.push({
      id: 4343, kind: 'dug', status: 'sealed', pos: p, dir: { x: 0, y: 1, z: 0 }, radius: bu, moundId: -1, rimTarget: 0,
      plugVoxelCount: 3, createdTick: 0, trafficIn: 2, trafficOut: 3,
    });
    const ent = inspectTarget(sim, a, { kind: 'entrance', id: 4343, pos: p })!;
    expect(ent.senses.find((r) => r.key === 'status')?.word).toBe('sealed');
    expect(ent.senses.find((r) => r.key === 'traffic')?.value).toBe(5);

    expect(findNonPlain(ent)).toEqual([]);
    expect(inspectTarget(sim, a, { kind: 'ant', id: -1, pos: p })).toBeNull();
  });
});
