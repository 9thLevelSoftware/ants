// Shared action lifecycle (GDD 01 §7.1-7.2): phases, durations, effect timing, interrupts, failure codes, repeat.
import { afterEach, describe, expect, it } from 'vitest';
import { availableActions, begin, cancel, canDo, stepAction, stopAction } from './runner';
import { ahead, capture, foodItem, installFakes, larva, makeAntSim, step, worker } from './testkit';
import { emptyCombat } from './testkit';

let restore = (): void => {};
afterEach(() => restore());

function setup() {
  const sim = makeAntSim();
  const f = installFakes(sim);
  restore = f.restore;
  return { sim, fake: f.fake };
}

describe('timed primitive lifecycle', () => {
  it('pick-up: windup 20 %, active 70 %, recovery 10 %, effect at the end of active, 0.5 s', () => {
    const { sim } = setup();
    const ant = worker(sim, 50, 50);
    const it = foodItem(sim, ahead(sim, ant, 0.6));
    sim.index.refresh();
    expect(begin(sim, ant, 'pick-up', { kind: 'item', id: it.id, pos: it.pos })).toBe(true);
    expect(ant.action?.durationTicks).toBe(5);
    const phases: string[] = [];
    const carried: boolean[] = [];
    for (let i = 0; i < 5; i++) {
      stepAction(sim, ant);
      sim.state.tick++;
      phases.push(ant.action?.phase ?? 'none');
      carried.push(ant.carry.kind === 'item');
    }
    // 5 ticks: windup tick 1, active ticks 2-4 (effect at the end of tick 4), recovery tick 5 which ends the action
    // (GDD 01 §7.1: the effect never lands on the last tick of a timed primitive of 2+ ticks)
    expect(phases).toEqual(['windup', 'active', 'active', 'active', 'none']);
    expect(carried).toEqual([false, false, false, true, true]);
  });

  it('an interrupted timed primitive leaves no partial effect', () => {
    const { sim } = setup();
    const ant = worker(sim, 50, 50);
    const it = foodItem(sim, ahead(sim, ant, 0.6));
    sim.index.refresh();
    begin(sim, ant, 'pick-up', { kind: 'item', id: it.id, pos: it.pos });
    stepAction(sim, ant); sim.state.tick++;
    stepAction(sim, ant); sim.state.tick++;
    const ev = capture(sim, ['action-cancelled'], () => cancel(sim, ant, null));
    expect(ev).toHaveLength(1);
    expect(ant.action).toBeNull();
    expect(ant.carry.kind).toBe('none');
    expect(it.carrierIds).toEqual([]);
  });

  it('effective duration = base / workRate (cold ant works slower)', () => {
    const { sim, fake } = setup();
    fake.tempFactor = 0.5;
    const ant = worker(sim, 50, 50);
    expect(begin(sim, ant, 'groom', null)).toBe(true);
    expect(ant.action?.durationTicks).toBe(80); // groom self 4 s / 0.5
  });

  it('too cold to work: timed primitives fail with conditions', () => {
    const { sim, fake } = setup();
    fake.tempFactor = 0;
    const ant = worker(sim, 50, 50);
    expect(canDo(sim, ant, 'groom', null)).toEqual({ ok: false, reason: 'conditions' });
  });
});

describe('interrupts (GDD 01 §7.2)', () => {
  it('taking damage cancels; falling cancels; a vanished target cancels with no-target', () => {
    const { sim } = setup();
    const ant = worker(sim, 50, 50);
    begin(sim, ant, 'groom', null);
    ant.hp -= 1;
    let ev = capture(sim, ['action-cancelled'], () => stepAction(sim, ant));
    expect(ev[0]).toMatchObject({ reason: 'conditions' });

    begin(sim, ant, 'groom', null);
    ant.medium = 'air';
    ev = capture(sim, ['action-cancelled'], () => stepAction(sim, ant));
    expect(ev).toHaveLength(1);
    ant.medium = 'surface';

    const it = foodItem(sim, ahead(sim, ant, 0.6));
    sim.index.refresh();
    begin(sim, ant, 'pick-up', { kind: 'item', id: it.id, pos: it.pos });
    sim.stores.items.markDead(it.id);
    ev = capture(sim, ['action-cancelled'], () => stepAction(sim, ant));
    expect(ev[0]).toMatchObject({ reason: 'no-target' });
  });

  it('grabbed (seized by a creature) cancels with blocked', () => {
    const { sim } = setup();
    const ant = worker(sim, 50, 50);
    begin(sim, ant, 'groom', null);
    ant.combat = emptyCombat();
    ant.combat.seizedBy = 99;
    const ev = capture(sim, ['action-cancelled'], () => stepAction(sim, ant));
    expect(ev[0]).toMatchObject({ reason: 'blocked' });
  });

  it('lay-egg cannot be interrupted after windup (damage ignored)', () => {
    const { sim } = setup();
    const q = sim.stores.ants.get(sim.state.colonies[0].queenId)!;
    q.chamberId = 1;
    sim.state.player.opening!.phase = 'lay'; // founding queen: the colony lets her lay in the opening's lay phase
    expect(begin(sim, q, 'lay-egg', null)).toBe(true);
    step(sim, 20); // past the 12-tick windup
    q.hp -= 1;
    step(sim, 1);
    expect(q.action?.id).toBe('lay-egg');
  });
});

describe('failure codes', () => {
  it('caste, species, no-target, blocked, out-of-reach, hands-full', () => {
    const { sim } = setup();
    const ant = worker(sim, 50, 50);
    expect(canDo(sim, ant, 'lay-egg', null).reason).toBe('caste');
    expect(canDo(sim, ant, 'mill-seed', null).reason).toBe('species');
    expect(canDo(sim, ant, 'pick-up', null).reason).toBe('no-target');
    const far = foodItem(sim, ahead(sim, ant, 5));
    sim.index.refresh();
    expect(canDo(sim, ant, 'pick-up', { kind: 'item', id: far.id, pos: far.pos }).reason).toBe('out-of-reach');
    begin(sim, ant, 'groom', null);
    const near = foodItem(sim, ahead(sim, ant, 0.6));
    expect(canDo(sim, ant, 'pick-up', { kind: 'item', id: near.id, pos: near.pos }).reason).toBe('blocked');
    cancel(sim, ant, null);
    const b = larva(sim, ahead(sim, ant, 0.7));
    begin(sim, ant, 'pick-up', { kind: 'item', id: near.id, pos: near.pos });
    step(sim, 5);
    expect(canDo(sim, ant, 'pick-up', { kind: 'brood', id: b.id, pos: b.pos }).reason).toBe('hands-full');
  });

  it('a target behind the ant is outside the 50° cone', () => {
    const { sim } = setup();
    const ant = worker(sim, 50, 50);
    const it = foodItem(sim, ahead(sim, ant, -0.6));
    expect(canDo(sim, ant, 'pick-up', { kind: 'item', id: it.id, pos: it.pos }).reason).toBe('out-of-reach');
  });

  it('begin emits action-failed with the reason and changes nothing', () => {
    const { sim } = setup();
    const ant = worker(sim, 50, 50);
    const ev = capture(sim, ['action-failed'], () => expect(begin(sim, ant, 'lay-egg', null)).toBe(false));
    expect(ev).toEqual([{ type: 'action-failed', antId: ant.id, action: 'lay-egg', reason: 'caste' }]);
    expect(ant.action).toBeNull();
  });
});

describe('available actions', () => {
  it('lists what the ant could start now with automatic targets', () => {
    const { sim } = setup();
    const ant = worker(sim, 50, 50);
    const ids = availableActions(sim, ant, ['groom', 'lay-egg', 'dig-bite', 'drop', 'sniff']);
    expect(ids).toEqual(['groom', 'dig-bite', 'sniff']);
  });
});

describe('repeat and stop', () => {
  it('a repeating primitive restarts the next tick until stopped, then finishes its cycle', () => {
    const { sim, fake } = setup();
    const ant = worker(sim, 50, 50);
    begin(sim, ant, 'dig-bite', null, { repeat: true });
    step(sim, 30);
    expect(fake.bites).toBe(3);
    expect(ant.action?.startTick).toBe(30); // the 4th bite is already scheduled
    stopAction(sim, ant);
    step(sim, 20);
    expect(fake.bites).toBe(4); // ... finishes its cycle, then no more repeats
    expect(ant.action).toBeNull();
  });
});
