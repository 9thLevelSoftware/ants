// lay-egg, feed-larva, groom, antennate, sniff (GDD 01 §7.3, App. E 9-10; colony effects through fakes).
import { afterEach, describe, expect, it } from 'vitest';
import type { Ant, Sim } from '@/sim/types';
import { AntFlag } from '@/sim/types';
import { begin, cancel, canDo } from './runner';
import { ahead, capture, foodItem, installFakes, larva, makeAntSim, source, step, worker } from './testkit';

let restore = (): void => {};
afterEach(() => restore());

function setup() {
  const sim = makeAntSim();
  const f = installFakes(sim);
  restore = f.restore;
  return { sim, fake: f.fake };
}

/** The game's queen as an established, possessed queen in a chamber with protein and budget. */
function establishedQueen(sim: Sim): Ant {
  const q = sim.stores.ants.get(sim.state.colonies[0].queenId)!;
  q.flags = AntFlag.POSSESSED;
  q.queen!.founding = null;
  q.queen!.mode = 'established';
  q.queen!.gut.p = 0.2;
  q.queen!.eggBudget = 3;
  q.chamberId = 1;
  sim.state.player.possessedAntId = q.id;
  if (sim.state.player.opening) sim.state.player.opening.phase = 'done';
  return q;
}

const eggs = (sim: Sim) => sim.stores.brood.list.filter((b) => b.alive && b.stage === 'egg').length;

describe('lay-egg', () => {
  it('App. E 9: +1 egg after 6 s, P -0.04; again 5 ticks later -> cooldown', () => {
    const { sim } = setup();
    const q = establishedQueen(sim);
    const before = eggs(sim);
    expect(begin(sim, q, 'lay-egg', null)).toBe(true);
    expect(q.action?.durationTicks).toBe(60);
    step(sim, 61);
    expect(eggs(sim)).toBe(before + 1);
    expect(q.queen!.gut.p).toBeCloseTo(0.16, 9);
    step(sim, 5);
    const ev = capture(sim, ['action-failed'], () => begin(sim, q, 'lay-egg', null));
    expect(ev[0]).toMatchObject({ reason: 'cooldown' });
  });

  it('App. E 10: a worker cannot lay (caste) and no egg is created', () => {
    const { sim } = setup();
    const w = worker(sim, 50, 50);
    const before = eggs(sim);
    expect(begin(sim, w, 'lay-egg', null)).toBe(false);
    expect(canDo(sim, w, 'lay-egg', null).reason).toBe('caste');
    step(sim, 70);
    expect(eggs(sim)).toBe(before);
  });

  it('no-reserve, budget, not-allowed-here; the AI queen has no cooldown', () => {
    const { sim } = setup();
    const q = establishedQueen(sim);
    q.queen!.gut.p = 0.01;
    expect(canDo(sim, q, 'lay-egg', null).reason).toBe('no-reserve');
    q.queen!.gut.p = 0.2;
    q.queen!.eggBudget = 0;
    expect(canDo(sim, q, 'lay-egg', null).reason).toBe('budget');
    q.queen!.eggBudget = 3;
    q.chamberId = -1;
    q.nestId = -1;
    expect(canDo(sim, q, 'lay-egg', null).reason).toBe('not-allowed-here');
    q.chamberId = 1;
    q.flags = 0; // AI
    q.layCooldownUntilTick = sim.state.tick + 1000;
    expect(canDo(sim, q, 'lay-egg', null).ok).toBe(true);
  });

  it('opening phase lay: one action is a 4 s batch, never on cooldown', () => {
    const { sim } = setup();
    const q = sim.stores.ants.get(sim.state.colonies[0].queenId)!;
    q.flags |= AntFlag.POSSESSED;
    q.nestId = sim.state.nests[0].id;
    sim.state.player.opening!.phase = 'lay';
    expect(begin(sim, q, 'lay-egg', null)).toBe(true);
    expect(q.action?.durationTicks).toBe(40);
    step(sim, 40);
    expect(canDo(sim, q, 'lay-egg', null).ok).toBe(true);
  });

  it('opening batch (real colony): stops at the clutch cap; cancelled before the effect it lays nothing', () => {
    restore();
    const sim = makeAntSim();
    const q = sim.stores.ants.get(sim.state.colonies[0].queenId)!;
    q.flags |= AntFlag.POSSESSED | AntFlag.FOUNDING;
    sim.state.player.possessedAntId = q.id;
    q.nestId = sim.state.nests[0].id;
    sim.state.player.opening!.phase = 'lay';
    const f = q.queen!.founding!;
    f.reserveLoads = 5;
    const cap = sim.getSpecies(sim.state.colonies[0].species)!.opening.clutchCap;
    f.eggsLaid = cap - 2;
    let before = eggs(sim);
    expect(begin(sim, q, 'lay-egg', null)).toBe(true);
    step(sim, 41);
    expect(eggs(sim) - before).toBe(2);
    f.eggsLaid = 0;
    before = eggs(sim);
    expect(begin(sim, q, 'lay-egg', null)).toBe(true);
    step(sim, 5);
    cancel(sim, q, null);
    step(sim, 40);
    expect(eggs(sim)).toBe(before);
  });
});

describe('feed-larva', () => {
  it('4 s; 0.1 load from the crop in crop proportion; larva receives it', () => {
    const { sim } = setup();
    const w = worker(sim, 50, 50);
    w.cropC = 0.3; w.cropP = 0.1;
    const l = larva(sim, ahead(sim, w, 0.6));
    expect(begin(sim, w, 'feed-larva', { kind: 'brood', id: l.id, pos: l.pos })).toBe(true);
    expect(w.action?.durationTicks).toBe(40);
    step(sim, 40);
    expect(l.gutC).toBeCloseTo(0.075, 9);
    expect(l.gutP).toBeCloseTo(0.025, 9);
    expect(w.cropC + w.cropP).toBeCloseTo(0.3, 9);
  });

  it('a carried protein item feeds when the crop is empty; crop-empty otherwise; only larvae', () => {
    const { sim } = setup();
    const w = worker(sim, 50, 50);
    const l = larva(sim, ahead(sim, w, 0.6));
    const t = { kind: 'brood' as const, id: l.id, pos: l.pos };
    expect(canDo(sim, w, 'feed-larva', t).reason).toBe('crop-empty');
    const it = foodItem(sim, w.pos, 0.3, 0.3, 0);
    it.carrierIds = [w.id];
    w.carry = { kind: 'item', id: it.id };
    begin(sim, w, 'feed-larva', t);
    step(sim, 40);
    expect(l.gutP).toBeCloseTo(0.1, 9);
    expect(it.p).toBeCloseTo(0.2, 9);
    l.stage = 'pupa';
    expect(canDo(sim, w, 'feed-larva', t).reason).toBe('no-target');
  });

  it('the founding queen feeds from her reserves, mix 0.75 P / 0.25 C', () => {
    const { sim } = setup();
    const q = sim.stores.ants.get(sim.state.colonies[0].queenId)!;
    const r0 = q.queen!.founding!.reserveLoads;
    const l = larva(sim, ahead(sim, q, 1.2));
    expect(begin(sim, q, 'feed-larva', { kind: 'brood', id: l.id, pos: l.pos })).toBe(true);
    step(sim, 40);
    expect(l.gutP).toBeCloseTo(0.075, 9);
    expect(q.queen!.founding!.reserveLoads).toBeCloseTo(r0 - 0.1, 9);
    expect(q.cropC + q.cropP).toBeCloseTo(0, 9);
  });
});

describe('groom, antennate, sniff', () => {
  it('groom self 4 s / nestmate 5 s / brood 4 s; halves dirt; males groom only themselves; foreign -> not-allowed-here', () => {
    const { sim } = setup();
    const w = worker(sim, 50, 50);
    const mate = worker(sim, 50.6, 50);
    mate.dirt = 0.8;
    begin(sim, w, 'groom', { kind: 'ant', id: mate.id, pos: mate.pos });
    expect(w.action?.durationTicks).toBe(50);
    step(sim, 50);
    expect(mate.dirt).toBeCloseTo(0.4, 9);
    w.dirt = 0.5;
    begin(sim, w, 'groom', null);
    expect(w.action?.durationTicks).toBe(40);
    step(sim, 40);
    expect(w.dirt).toBeCloseTo(0.25, 9);
    const l = larva(sim, ahead(sim, w, 0.6));
    begin(sim, w, 'groom', { kind: 'brood', id: l.id, pos: l.pos });
    expect(w.action?.durationTicks).toBe(40);
    const male = worker(sim, 60, 60, 'male');
    expect(canDo(sim, male, 'groom', { kind: 'ant', id: mate.id, pos: mate.pos }).reason).toBe('caste');
    mate.colony = 9999;
    w.action = null;
    expect(canDo(sim, w, 'groom', { kind: 'ant', id: mate.id, pos: mate.pos }).reason).toBe('not-allowed-here');
  });

  it('antennate reaches 2 L (beyond contact reach), 0.8 s for the player / 0.5 s AI, discovers a source', () => {
    const { sim } = setup();
    const w = worker(sim, 50, 50);
    const far = foodItem(sim, ahead(sim, w, 1.8), 0.3);
    const ft = { kind: 'item' as const, id: far.id, pos: far.pos };
    expect(canDo(sim, w, 'pick-up', ft).reason).toBe('out-of-reach');
    expect(canDo(sim, w, 'antennate', ft).ok).toBe(true);
    const s = source(sim, ahead(sim, w, 1.0), 'sugar', 3);
    const t = { kind: 'source' as const, id: s.id, pos: s.pos };
    expect(begin(sim, w, 'antennate', t)).toBe(true);
    expect(w.action?.durationTicks).toBe(5);
    step(sim, 5);
    expect(s.discoveredBy & 1).toBe(1);
    w.flags |= AntFlag.POSSESSED;
    begin(sim, w, 'antennate', t);
    expect(w.action?.durationTicks).toBe(8);
  });

  it('sniff: 1.5 s, no state change; gyne cannot (species data)', () => {
    const { sim } = setup();
    const w = worker(sim, 50, 50);
    const ev = capture(sim, ['action-completed'], () => { begin(sim, w, 'sniff', null); step(sim, 15); });
    expect(ev[0]).toMatchObject({ action: 'sniff' });
    const g = worker(sim, 70, 70, 'gyne');
    expect(canDo(sim, g, 'sniff', null).reason).toBe('caste');
  });
});
