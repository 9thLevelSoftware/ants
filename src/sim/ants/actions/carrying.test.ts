// move, let-go, grip, pick-up, put-down, drop, drag: preconditions, duration, effect, failure codes.
import { afterEach, describe, expect, it } from 'vitest';
import { spawnBrood, spawnItem } from '@/sim/entities';
import { begin, canDo } from './runner';
import { ahead, capture, fakeChamber, foodItem, installFakes, larva, makeAntSim, source, step, worker } from './testkit';

let restore = (): void => {};
afterEach(() => restore());

function setup() {
  const sim = makeAntSim();
  const f = installFakes(sim);
  restore = f.restore;
  return { sim, fake: f.fake };
}
const ref = (kind: 'item' | 'brood' | 'source', e: { id: number; pos: { x: number; y: number; z: number } }) => ({ kind, id: e.id, pos: e.pos });

describe('pick-up', () => {
  it('brood: an egg brings its clump (max 6) along; 0.5 s', () => {
    const { sim } = setup();
    const ant = worker(sim, 50, 50);
    const at = ahead(sim, ant, 0.6);
    const eggs = Array.from({ length: 8 }, () => spawnBrood(sim, { colony: ant.colony, stage: 'egg', destined: 'worker', pos: at }));
    expect(begin(sim, ant, 'pick-up', ref('brood', eggs[0]))).toBe(true);
    expect(ant.action?.durationTicks).toBe(5);
    step(sim, 5);
    expect(ant.carry).toEqual({ kind: 'brood', id: eggs[0].id });
    expect(eggs.filter((e) => e.carriedBy === ant.id)).toHaveLength(6);
  });

  it('item: too heavy above carryCap, hands-full when carrying, blocked when reserved by another ant', () => {
    const { sim } = setup();
    const ant = worker(sim, 50, 50);
    const other = worker(sim, 60, 60);
    const heavy = foodItem(sim, ahead(sim, ant, 0.6), 1.5);
    expect(canDo(sim, ant, 'pick-up', ref('item', heavy)).reason).toBe('too-heavy');
    const light = foodItem(sim, ahead(sim, ant, 0.6), 0.5);
    light.reservedBy = other.id;
    expect(canDo(sim, ant, 'pick-up', ref('item', light)).reason).toBe('blocked');
    light.reservedBy = -1;
    begin(sim, ant, 'pick-up', ref('item', light));
    step(sim, 5);
    expect(light.carrierIds).toEqual([ant.id]);
    const b = larva(sim, ahead(sim, ant, 0.6));
    expect(canDo(sim, ant, 'pick-up', ref('brood', b)).reason).toBe('hands-full');
  });

  it('source of whole units: takes one unit as an item (source loses it); liquids refuse', () => {
    const { sim } = setup();
    const ant = worker(sim, 50, 50);
    const crumbs = source(sim, ahead(sim, ant, 0.6), 'crumb', 5, { unitBulk: 0.4, c: 0.3, p: 0.1 });
    begin(sim, ant, 'pick-up', ref('source', crumbs));
    step(sim, 5);
    const it = sim.stores.items.get(ant.carry.id)!;
    expect(it.kind).toBe('food-piece');
    expect(it.c + it.p).toBeCloseTo(0.4, 9);
    expect(crumbs.units).toBe(4);
    const sugar = source(sim, ahead(sim, worker(sim, 80, 80), 0.6), 'honeydew', 5);
    const w2 = sim.stores.ants.list[sim.stores.ants.list.length - 1];
    expect(canDo(sim, w2, 'pick-up', ref('source', sugar)).reason).toBe('not-allowed-here');
  });

  it('queen: only a founding queen, and only brood and soil pellets', () => {
    const { sim } = setup();
    const q = sim.stores.ants.get(sim.state.colonies[0].queenId)!;
    const crumb = foodItem(sim, ahead(sim, q, 1.2), 0.2);
    const pellet = spawnItem(sim, { kind: 'soil-pellet', pos: ahead(sim, q, 1.2), init: { bulk: 0.5 } });
    expect(canDo(sim, q, 'pick-up', ref('item', crumb)).reason).toBe('caste');
    expect(canDo(sim, q, 'pick-up', ref('item', pellet)).ok).toBe(true);
    q.flags = 0; // established
    expect(canDo(sim, q, 'pick-up', ref('item', pellet)).reason).toBe('caste');
  });
});

describe('put-down and drop', () => {
  it('put-down needs a load (no-target), takes 0.4 s, places brood in the chamber under it', () => {
    const { sim, fake } = setup();
    const ant = worker(sim, 50, 50);
    expect(canDo(sim, ant, 'put-down', null).reason).toBe('no-target');
    const b = larva(sim, ahead(sim, ant, 0.6));
    begin(sim, ant, 'pick-up', ref('brood', b));
    step(sim, 5);
    fake.chambers.push(fakeChamber(77, ahead(sim, ant, 0.5), 3 * sim.world.bu));
    expect(begin(sim, ant, 'put-down', null)).toBe(true);
    expect(ant.action?.durationTicks).toBe(4);
    step(sim, 4);
    expect(ant.carry.kind).toBe('none');
    expect(b.carriedBy).toBe(-1);
    expect(b.chamberId).toBe(77);
  });

  it('a food item put down in a chamber is delivered to the colony store (counted on drop)', () => {
    const { sim, fake } = setup();
    const ant = worker(sim, 50, 50);
    ant.nestId = sim.state.nests[0].id;
    const it = foodItem(sim, ahead(sim, ant, 0.6), 0.5, 0.3, 0.2);
    begin(sim, ant, 'pick-up', ref('item', it));
    step(sim, 5);
    fake.chambers.push(fakeChamber(5, ahead(sim, ant, 0.5), 3 * sim.world.bu, 'food'));
    const col = sim.state.colonies[0];
    const before = { c: col.stores.c, p: col.stores.p };
    begin(sim, ant, 'put-down', null);
    step(sim, 4);
    expect(col.stores.c - before.c).toBeCloseTo(0.2, 9);
    expect(col.stores.p - before.p).toBeCloseTo(0.3, 9);
    expect(sim.stores.items.has(it.id)).toBe(false);
  });

  it('drop is instant, releases brood intact where the ant stands; nothing carried -> no-target', () => {
    const { sim } = setup();
    const ant = worker(sim, 50, 50);
    expect(canDo(sim, ant, 'drop', null).reason).toBe('no-target');
    const b = larva(sim, ahead(sim, ant, 0.6));
    begin(sim, ant, 'pick-up', ref('brood', b));
    step(sim, 5);
    const ev = capture(sim, ['action-completed'], () => begin(sim, ant, 'drop', null));
    expect(ev[0]).toMatchObject({ action: 'drop', result: 1 });
    expect(b.alive && b.carriedBy === -1).toBe(true);
    expect(Math.hypot(b.pos.x - ant.pos.x, b.pos.z - ant.pos.z)).toBeLessThan(1e-6);
  });
});

describe('let-go, grip, move, drag', () => {
  it('let-go only on a wall or ceiling and not while gripping; leaves the surface keeping the load', () => {
    const { sim } = setup();
    const ant = worker(sim, 50, 50);
    expect(canDo(sim, ant, 'let-go', null).reason).toBe('not-allowed-here');
    ant.up = { x: 1, y: 0, z: 0 };
    begin(sim, ant, 'grip', null);
    expect(canDo(sim, ant, 'let-go', null).reason).toBe('blocked');
    ant.action = null;
    expect(begin(sim, ant, 'let-go', null)).toBe(true);
    expect(ant.medium).toBe('air');
    expect(ant.action).toBeNull();
  });

  it('grip runs until stopped, is not interrupted by damage, ends on falling; move is refused during a dig', () => {
    const { sim } = setup();
    const ant = worker(sim, 50, 50);
    begin(sim, ant, 'grip', null);
    step(sim, 10);
    ant.hp -= 1;
    step(sim, 1);
    expect(ant.action?.id).toBe('grip');
    expect(canDo(sim, ant, 'move', null).ok).toBe(true);
    ant.medium = 'air';
    step(sim, 1);
    expect(ant.action).toBeNull();
    ant.medium = 'surface';
    begin(sim, ant, 'dig-bite', null);
    expect(canDo(sim, ant, 'move', null).reason).toBe('blocked');
  });

  it('drag: only items heavier than carryCap, solo up to 2x, cooperative up to 12 ants', () => {
    const { sim } = setup();
    const ant = worker(sim, 50, 50);
    const light = foodItem(sim, ahead(sim, ant, 0.6), 0.5);
    expect(canDo(sim, ant, 'drag', ref('item', light)).reason).toBe('not-allowed-here');
    const huge = foodItem(sim, ahead(sim, ant, 0.6), 2.5);
    expect(canDo(sim, ant, 'drag', ref('item', huge)).reason).toBe('too-heavy');
    huge.carrierIds = [9001];
    expect(canDo(sim, ant, 'drag', ref('item', huge)).ok).toBe(true);
    huge.carrierIds = Array.from({ length: 12 }, (_, i) => 9000 + i);
    expect(canDo(sim, ant, 'drag', ref('item', huge)).reason).toBe('blocked');
    const beetle = foodItem(sim, ahead(sim, ant, 0.6), 1.6);
    begin(sim, ant, 'drag', ref('item', beetle));
    step(sim, 20);
    expect(ant.action?.id).toBe('drag');
    expect(beetle.carrierIds).toContain(ant.id);
  });
});
