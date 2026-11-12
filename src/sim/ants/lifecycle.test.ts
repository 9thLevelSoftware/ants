// Ant lifecycle helpers: death with corpse and dropped load, removal without a body, the fallback for ants killed
// by other modules, eclosion hook.
import { afterEach, describe, expect, it } from 'vitest';
import { AntFlag } from '@/sim/types';
import { killAnt, spawnBrood } from '@/sim/entities';
import { begin } from './actions/runner';
import { ahead, capture, foodItem, installFakes, larva, makeAntSim, step, worker } from './actions/testkit';
import { onEclosion, processAntDeath, removeAnt } from './lifecycle';

let restore = (): void => {};
afterEach(() => restore());

function setup() {
  const sim = makeAntSim();
  const f = installFakes(sim);
  restore = f.restore;
  return { sim, fake: f.fake };
}

const corpses = (sim: ReturnType<typeof makeAntSim>) => sim.state.items.filter((i) => i.alive && i.kind === 'corpse');

describe('death processing', () => {
  it('killing an ant that carries brood drops the brood intact and creates a corpse item', () => {
    const { sim } = setup();
    const a = worker(sim, 50, 50);
    const l = larva(sim, ahead(sim, a, 0.6));
    begin(sim, a, 'pick-up', { kind: 'brood', id: l.id, pos: l.pos });
    step(sim, 5);
    expect(l.carriedBy).toBe(a.id);
    const ev = capture(sim, ['ant-died', 'brood-died'], () => { processAntDeath(sim, a.id, 'predation'); step(sim, 1); });
    expect(ev.map((e) => e.type)).toEqual(['ant-died']);
    expect(l.alive).toBe(true);
    expect(l.carriedBy).toBe(-1);
    expect(sim.stores.brood.has(l.id)).toBe(true);
    const c = corpses(sim);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ colony: a.colony, species: 'lasius-niger' });
    expect(c[0].bulk).toBeCloseTo(a.massMg / 2, 9);
    expect(c[0].p).toBeCloseTo(0.4 * a.massMg, 9);
    expect(c[0].necroCueTick).toBe(sim.state.tick - 1 + 600);
  });

  it('an egg clump and a carried item are all released; the running action ends', () => {
    const { sim } = setup();
    const a = worker(sim, 50, 50);
    const eggs = Array.from({ length: 4 }, () => spawnBrood(sim, { colony: a.colony, stage: 'egg', destined: 'worker', pos: ahead(sim, a, 0.6) }));
    begin(sim, a, 'pick-up', { kind: 'brood', id: eggs[0].id, pos: eggs[0].pos });
    step(sim, 5);
    begin(sim, a, 'groom', null);
    processAntDeath(sim, a.id, 'starvation');
    expect(eggs.every((e) => e.carriedBy === -1 && e.alive)).toBe(true);
    expect(a.action).toBeNull();
    const b = worker(sim, 60, 60);
    const it = foodItem(sim, ahead(sim, b, 0.6));
    begin(sim, b, 'pick-up', { kind: 'item', id: it.id, pos: it.pos });
    step(sim, 5);
    processAntDeath(sim, b.id, 'combat');
    expect(it.carrierIds).toEqual([]);
  });

  it('ants killed by another module (entities.killAnt) get their corpse and clump mates released in the same tick', () => {
    const { sim } = setup();
    const a = worker(sim, 50, 50);
    const eggs = Array.from({ length: 3 }, () => spawnBrood(sim, { colony: a.colony, stage: 'egg', destined: 'worker', pos: ahead(sim, a, 0.6) }));
    begin(sim, a, 'pick-up', { kind: 'brood', id: eggs[0].id, pos: eggs[0].pos });
    step(sim, 5);
    killAnt(sim, a.id, 'heat');
    step(sim, 1);
    expect(corpses(sim)).toHaveLength(1);
    expect(eggs.every((e) => e.carriedBy === -1)).toBe(true);
    expect(sim.stores.ants.list.includes(a)).toBe(false); // swept
    step(sim, 3);
    expect(corpses(sim)).toHaveLength(1);
  });

  it('removal without a body (lost / dispersed): no corpse; unknown ids are harmless', () => {
    const { sim } = setup();
    const a = worker(sim, 50, 50);
    expect(removeAnt(sim, a.id, 'lost')).toBe(true);
    step(sim, 2);
    expect(corpses(sim)).toHaveLength(0);
    expect(processAntDeath(sim, a.id, 'unknown')).toBe(-1);
  });

  it('eclosion hook: callow flag, staggered first think', () => {
    const { sim } = setup();
    const a = worker(sim, 50, 50);
    onEclosion(sim, a);
    expect(a.flags & AntFlag.CALLOW).toBeTruthy();
    expect(a.thinkTick).toBeGreaterThanOrEqual(sim.state.tick);
    expect(a.bb['run.task']).toBe(-1);
  });
});
