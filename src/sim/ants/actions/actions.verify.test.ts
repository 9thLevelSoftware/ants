// Independent review tests for the action library (GDD 01 §7). Passing tests are regression guards; a failing test
// here demonstrates a real defect and stays in place for the fixer.
import { afterEach, describe, expect, it } from 'vitest';
import type { Ant, Sim } from '@/sim/types';
import { AntFlag } from '@/sim/types';
import { ACTION_ACTIVE_FRAC, ACTION_WINDUP_FRAC } from '@/sim/balance/actions';
import { ports } from './ports';
import { begin, canDo, cancel, stopAction } from './runner';
import { ahead, capture, foodItem, installFakes, larva, makeAntSim, source, step, worker } from './testkit';

const saved = { ...ports };
afterEach(() => { Object.assign(ports, saved); });

function fakeSim(): Sim {
  const sim = makeAntSim();
  installFakes(sim);
  return sim;
}

const eggs = (sim: Sim): number => sim.stores.brood.list.filter((b) => b.alive && b.stage === 'egg').length;

describe('lay-egg opening exception (GDD 01 §7.3, GDD 06 §5.10)', () => {
  it('in the opening phase `lay` one lay-egg lays a batch of OPEN_LAY_BATCH_EGGS = 6 eggs over 4 s (real colony)', () => {
    const sim = makeAntSim();
    ports.speedMult = () => 1;
    const q = sim.stores.ants.get(sim.state.colonies[0].queenId)!;
    q.flags |= AntFlag.POSSESSED | AntFlag.FOUNDING;
    sim.state.player.possessedAntId = q.id;
    q.nestId = sim.state.nests[0].id;
    sim.state.player.opening!.phase = 'lay';
    expect(q.queen?.founding).toBeTruthy();
    q.queen!.founding!.reserveLoads = 5;
    const before = eggs(sim);
    expect(begin(sim, q, 'lay-egg', null)).toBe(true);
    step(sim, 41);
    expect(eggs(sim) - before).toBe(6);
  });
});

describe('lifecycle edge cases', () => {
  it('a cancelled timed primitive leaves no partial effect even when cancelled on the effect tick - 1', () => {
    const sim = fakeSim();
    const w = worker(sim, 50, 50);
    const it = foodItem(sim, ahead(sim, w, 0.6), 0.5);
    expect(begin(sim, w, 'pick-up', { kind: 'item', id: it.id, pos: it.pos })).toBe(true);
    // The effect lands at the end of active (20 % + 70 %, rounded down), not on the last tick: recovery follows.
    const effectAt = Math.floor(w.action!.durationTicks * (ACTION_WINDUP_FRAC + ACTION_ACTIVE_FRAC) + 1e-9);
    step(sim, effectAt - 1);
    expect(w.action).not.toBeNull();
    expect(w.carry.kind).toBe('none');
    cancel(sim, w, null);
    step(sim, 5);
    expect(w.carry.kind).toBe('none');
    expect(it.carrierIds).toHaveLength(0);
  });

  it('a continuous primitive moves exactly rate x time: trophallaxis 0.1 load/s for 3 s outside', () => {
    const sim = fakeSim();
    const a = worker(sim, 50, 50);
    const b = worker(sim, 50.9, 50);
    b.fwd = { x: -1, y: 0, z: 0 };
    a.cropC = 1; b.cropC = 0;
    expect(begin(sim, a, 'trophallaxis-give', { kind: 'ant', id: b.id, pos: b.pos })).toBe(true);
    step(sim, 30);
    stopAction(sim, a);
    expect(b.cropC).toBeCloseTo(0.3, 9);
    expect(a.cropC + b.cropC).toBeCloseTo(1, 12);
  });

  it('stopAction on a timed repeat finishes the current cycle and does not start another', () => {
    const sim = fakeSim();
    const w = worker(sim, 50, 50);
    expect(begin(sim, w, 'dig-bite', null, { repeat: true })).toBe(true);
    step(sim, 3);
    stopAction(sim, w);
    const ev = capture(sim, ['action-completed', 'action-started'], () => step(sim, 30));
    expect(ev.filter((e) => e.type === 'action-completed')).toHaveLength(1);
    expect(ev.filter((e) => e.type === 'action-started')).toHaveLength(0);
    expect(w.action).toBeNull();
  });

  it('a dead ant cannot begin anything and canDo reports a reason', () => {
    const sim = fakeSim();
    const w = worker(sim, 50, 50);
    w.alive = false;
    expect(canDo(sim, w, 'groom', null).ok).toBe(false);
    expect(begin(sim, w, 'groom', null)).toBe(false);
  });

  it('NaN target positions never pass the reach test', () => {
    const sim = fakeSim();
    const w = worker(sim, 50, 50);
    w.cropC = 0.5;
    const nan = { x: Number.NaN, y: 0, z: 0 };
    expect(canDo(sim, w, 'put-down', { kind: 'point', id: -1, pos: nan }).ok).toBe(false);
  });

  it('feed-larva with an empty crop and no item: crop-empty; a pupa is no-target', () => {
    const sim = fakeSim();
    const w = worker(sim, 50, 50);
    const l = larva(sim, ahead(sim, w, 0.6));
    expect(canDo(sim, w, 'feed-larva', { kind: 'brood', id: l.id, pos: l.pos }).reason).toBe('crop-empty');
    l.stage = 'pupa';
    w.cropC = 0.5;
    expect(canDo(sim, w, 'feed-larva', { kind: 'brood', id: l.id, pos: l.pos }).reason).toBe('no-target');
  });

  it('harvest-liquid against an empty source is refused (no-target), and nothing is drunk', () => {
    const sim = fakeSim();
    const w = worker(sim, 50, 50);
    const s = source(sim, ahead(sim, w, 0.8), 'sugar', 0, { variant: 'sugary-spill', capacity: 5 });
    expect(canDo(sim, w, 'harvest-liquid', { kind: 'source', id: s.id, pos: s.pos }).reason).toBe('no-target');
    expect(w.cropC + w.cropP).toBe(0);
  });

  it('the action state is plain data (JSON round trip keeps it)', () => {
    const sim = fakeSim();
    const w = worker(sim, 50, 50);
    begin(sim, w, 'groom', null);
    step(sim, 2);
    const copy = JSON.parse(JSON.stringify(w.action)) as Ant['action'];
    expect(copy).toEqual(w.action);
    for (const v of Object.values(w.bb)) expect(typeof v).toBe('number');
  });
});
