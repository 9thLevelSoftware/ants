// beh-nest review fixes that the reviewer's own tests do not cover: a guard waits out the alarm cooldown in
// `guard.alarm-raise` (no re-entry every tick), loading the crop is a primitive with a pose, a queen sent away by an
// emergency returns to the royal chamber once it is safe, a nurse carried away from brood delivers it first, and a
// nurse stuck upside down above its target lets go.
import { describe, expect, it } from 'vitest';
import type { Ant } from '@/sim/types';
import { POSES } from '@/sim/types';
import { SYSTEMS } from '@/sim/systems';
import { placeOnSurface } from '@/sim/locomotion';
import { begin } from '@/sim/ants/actions';
import { makeNestColony, run } from './testkit';

const NO_ALLOC = SYSTEMS.filter((s) => s.name !== 'allocation' && s.name !== 'task-reeval');

function worker(k: ReturnType<typeof makeNestColony>): Ant {
  return k.sim.stores.ants.list.find((a) => a.caste === 'worker')!;
}

describe('beh-nest review fixes', () => {
  it('a guard whose alarm gland is on cooldown waits in alarm-raise instead of re-entering it every tick', () => {
    const k = makeNestColony({ workers: 1, systems: NO_ALLOC });
    const { sim, entrance } = k;
    const g = worker(k);
    g.task = 'guard';
    run(sim, 300); // walks to the entrance rim
    expect(g.state).toBe('guard.post');
    const p = { x: g.pos.x + 2 * sim.world.bu, y: g.pos.y, z: g.pos.z };
    sim.enqueue({ type: 'cheat.spawnCreature', kind: 'jumping-spider', variant: null, pos: p, state: null });
    sim.applyPendingCommands();
    let entries = 0, prev = g.state;
    for (let t = 0; t < 200; t++) {
      g.bb['cd.alarm'] = sim.state.tick + 1000; // the gland stays on cooldown
      sim.tick();
      if (g.state === 'guard.alarm-raise' && prev !== 'guard.alarm-raise') entries++;
      prev = g.state;
    }
    console.log('[beh-nest guard cooldown]', JSON.stringify({ entries, state: g.state, entrance: entrance.id }));
    expect(entries).toBeLessThanOrEqual(2);
  }, 120_000);

  it('loading the crop is an action primitive with its own pose (sim-fix-ants: care acts became primitives)', () => {
    const k = makeNestColony({ workers: 1, systems: NO_ALLOC });
    const a = worker(k);
    a.task = 'nurse';
    expect(placeOnSurface(k.sim, a, k.food.center, { x: 0, y: -1, z: 0 })).toBe(true);
    a.nestId = k.nest.id; a.chamberId = k.food.id;
    a.thinkTick = 1e9; // no behaviour think in between
    expect(begin(k.sim, a, 'load-crop', null)).toBe(true);
    expect(a.pose).toBe(POSES.indexOf('drink'));
    run(k.sim, 80);
    expect(a.action).toBeNull();
    expect(a.pose).toBe(0);
    expect(a.cropC + a.cropP).toBeGreaterThan(0.5);
  });

  it('a queen sent out of a flooded royal chamber goes back once it is dry', () => {
    const k = makeNestColony({ workers: 2, stores: { c: 50, p: 50 }, systems: NO_ALLOC });
    const { sim, royal, queen, nest } = k;
    royal.flooded = 1;
    const moved = () => queen.state === 'queen.reside' && queen.chamberId >= 0 && queen.chamberId !== royal.id;
    for (let t = 0; t < 3000 && !moved(); t++) { sim.tick(); royal.flooded = 1; }
    const refuge = nest.chambers.find((c) => c.id === queen.chamberId);
    royal.flooded = 0;
    run(sim, 3000);
    console.log('[beh-nest queen return]', JSON.stringify({ refuge: refuge?.type, now: nest.chambers.find((c) => c.id === queen.chamberId)?.type }));
    expect(refuge && refuge.type !== 'food' && refuge.id !== royal.id).toBe(true);
    expect(queen.chamberId).toBe(royal.id);
  }, 300_000);

  it('a worker whose task changes while it carries brood takes the brood to a brood chamber first', () => {
    const k = makeNestColony({ workers: 1, systems: NO_ALLOC, brood: [{ stage: 'pupa', n: 1, chamber: 'nursery', progress: 0.2 }] });
    const { sim, nest, food } = k;
    const a = worker(k);
    const pupa = sim.stores.brood.list[0];
    // hand the pupa to the worker in the food chamber, then make it a hauler
    placeOnSurface(sim, a, { x: food.center.x, y: food.center.y - food.radii.y, z: food.center.z }, { x: 0, y: -1, z: 0 });
    a.carry = { kind: 'brood', id: pupa.id };
    pupa.carriedBy = a.id;
    a.task = 'haul';
    let ticks = 0;
    for (; ticks < 1500 && pupa.carriedBy >= 0; ticks++) sim.tick();
    // where it lies now: the chamber whose ellipsoid holds it
    const inside = nest.chambers.find((c) => ((pupa.pos.x - c.center.x) / c.radii.x) ** 2 + ((pupa.pos.y - c.center.y) / c.radii.y) ** 2
      + ((pupa.pos.z - c.center.z) / c.radii.z) ** 2 <= 1.2);
    console.log('[beh-nest deliver first]', JSON.stringify({ ticks, carried: pupa.carriedBy, chamber: pupa.chamberId, lyingIn: inside?.type }));
    expect(pupa.carriedBy).toBe(-1);
    expect(ticks).toBeGreaterThan(20); // it walked there
    expect(['nursery', 'royal', 'general', 'rest', 'founding']).toContain(inside?.type);
  }, 300_000);
});
