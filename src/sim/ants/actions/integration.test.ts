// The primitives against the REAL owning modules where those exist already (sources-core harvesting, colony-core
// ledger, laying and feeding): checks that the contracts line up, not just the fakes. Only temperature is fixed.
import { afterEach, describe, expect, it } from 'vitest';
import { AntFlag } from '@/sim/types';
import { ports } from './ports';
import { begin } from './runner';
import { ahead, larva, makeAntSim, source, step, worker } from './testkit';

const saved = { ...ports };
afterEach(() => { Object.assign(ports, saved); });

function setup() {
  const sim = makeAntSim();
  ports.speedMult = () => 1; // 22 °C: workRate 1
  return sim;
}

describe('with the real ecology and colony modules', () => {
  it('App. E 7: 20 s of drinking from a 5-load spill -> crop 1.00 ± 0.01, source 4.00 ± 0.01', () => {
    const sim = setup();
    const w = worker(sim, 50, 50);
    const s = source(sim, ahead(sim, w, 0.8), 'sugar', 5, { variant: 'sugary-spill', units: 5, capacity: 5 });
    sim.enqueue({ type: 'possess', antId: w.id });
    sim.enqueue({ type: 'action', actionId: 'harvest-liquid', target: { kind: 'source', id: s.id, pos: s.pos }, phase: 'start' });
    step(sim, 200);
    expect(w.cropC + w.cropP).toBeGreaterThan(0.99);
    expect(w.cropC + w.cropP).toBeLessThan(1.01);
    expect(s.units).toBeGreaterThan(3.99);
    expect(s.units).toBeLessThan(4.01);
  });

  it('App. E 9: an established possessed queen lays one egg in 6 s for 0.04 P; then cooldown', () => {
    const sim = setup();
    const q = sim.stores.ants.get(sim.state.colonies[0].queenId)!;
    q.flags = AntFlag.POSSESSED;
    sim.state.player.possessedAntId = q.id;
    q.queen!.founding = null;
    q.queen!.mode = 'established';
    q.queen!.gut.p = 0.2;
    q.queen!.eggBudget = 3;
    q.chamberId = 1;
    const eggs = () => sim.stores.brood.list.filter((b) => b.alive && b.stage === 'egg').length;
    const before = eggs();
    expect(begin(sim, q, 'lay-egg', null)).toBe(true);
    step(sim, 61);
    expect(eggs()).toBe(before + 1);
    expect(q.queen!.gut.p).toBeCloseTo(0.16, 9);
    step(sim, 5);
    expect(begin(sim, q, 'lay-egg', null)).toBe(false);
  });

  it('feed-larva through colony.feedBrood moves 0.1 load from the crop into the larva', () => {
    const sim = setup();
    const w = worker(sim, 50, 50);
    w.cropC = 0.2; w.cropP = 0.2;
    const l = larva(sim, ahead(sim, w, 0.6));
    begin(sim, w, 'feed-larva', { kind: 'brood', id: l.id, pos: l.pos });
    step(sim, 40);
    expect(l.gutC + l.gutP).toBeCloseTo(0.1, 6);
    expect(w.cropC + w.cropP).toBeCloseTo(0.3, 6);
  });
});
