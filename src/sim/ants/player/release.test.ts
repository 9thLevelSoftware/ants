// Release-inference table (GDD 01 §3.5): one test per row, plus the in-progress action rules on release.
import { afterEach, describe, expect, it } from 'vitest';
import type { Ant, DigPlan, Sim } from '@/sim/types';
import { AntFlag, REASON_CODES } from '@/sim/types';
import { spawnItem } from '@/sim/entities';
import { begin } from '../actions/runner';
import { ahead, emptyCombat, foodItem, installFakes, larva, makeAntSim, source, step, worker } from '../actions/testkit';
import { inferRelease } from './release';

let restore = (): void => {};
afterEach(() => restore());

function setup() {
  const sim = makeAntSim();
  const f = installFakes(sim);
  restore = f.restore;
  return { sim, fake: f.fake };
}

function carry(sim: Sim, ant: Ant, kind: Parameters<typeof spawnItem>[1]['kind'], init = {}): void {
  const it = spawnItem(sim, { kind, pos: ant.pos, init: { bulk: 0.3, ...init } });
  it.carrierIds = [ant.id];
  ant.carry = { kind: 'item', id: it.id };
}

function activePlan(sim: Sim, at: { x: number; y: number; z: number }): void {
  const plan = { status: 'active', window: [0], spheres: [{ c: at, r: sim.world.bu, done: false, obstructed: false }] } as unknown as DigPlan;
  sim.state.nests[0].digPlans.push(plan);
}

const rule = (sim: Sim, a: Ant) => inferRelease(sim, a);

describe('release inference rows', () => {
  it('1: in a hold-lock or hit in the last 3 s -> fight, or flee when badly hurt', () => {
    const { sim } = setup();
    const a = worker(sim, 50, 50);
    a.combat = emptyCombat();
    a.combat.recentHitters.push({ id: 5, tick: sim.state.tick });
    expect(rule(sim, a)).toMatchObject({ task: 'fight', rule: 1 });
    a.hp = 0.2 * a.maxHp;
    expect(rule(sim, a)).toMatchObject({ task: 'flee', rule: 1 });
    a.combat.recentHitters = [{ id: 5, tick: -100 }];
    a.combat.lock = { targetKind: 'ant', targetId: 5, slot: 0 };
    expect(rule(sim, a).rule).toBe(1);
  });

  it('2: falling -> finish the fall, then re-run the table', () => {
    const { sim } = setup();
    const a = worker(sim, 50, 50, 'worker', 'dig');
    a.suspendedTask = 'dig';
    a.medium = 'air';
    expect(rule(sim, a)).toMatchObject({ rule: 2, reinfer: true });
  });

  it('3: queen -> rest when established, the founding script when founding', () => {
    const { sim } = setup();
    const q = sim.stores.ants.get(sim.state.colonies[0].queenId)!;
    q.suspendedTask = 'idle';
    expect(rule(sim, q)).toMatchObject({ rule: 3, task: 'idle' });
    q.flags = 0; q.queen!.mode = 'established';
    expect(rule(sim, q)).toMatchObject({ rule: 3, task: 'rest' });
  });

  it('4: gyne / male not in flight -> rest', () => {
    const { sim } = setup();
    expect(rule(sim, worker(sim, 50, 50, 'gyne'))).toMatchObject({ rule: 4, task: 'rest' });
    expect(rule(sim, worker(sim, 52, 50, 'male'))).toMatchObject({ rule: 4, task: 'rest' });
  });

  it('5: carrying brood -> nurse', () => {
    const { sim } = setup();
    const a = worker(sim, 50, 50);
    const b = larva(sim, a.pos);
    b.carriedBy = a.id;
    a.carry = { kind: 'brood', id: b.id };
    expect(rule(sim, a)).toMatchObject({ rule: 5, task: 'nurse' });
  });

  it('6: carrying a solid food item -> forage (return leg)', () => {
    const { sim } = setup();
    const a = worker(sim, 50, 50);
    const it = foodItem(sim, a.pos);
    it.carrierIds = [a.id];
    a.carry = { kind: 'item', id: it.id };
    expect(rule(sim, a)).toMatchObject({ rule: 6, task: 'forage' });
  });

  it('7: crop >= 0.8 outside -> forage; partly full with no source near -> forage; inside -> store; near a source -> keeps drinking (14)', () => {
    const { sim } = setup();
    const a = worker(sim, 50, 50);
    a.cropC = 0.8;
    expect(rule(sim, a)).toMatchObject({ rule: 7, task: 'forage' });
    a.cropC = 0.3;
    expect(rule(sim, a)).toMatchObject({ rule: 7, task: 'forage' });
    a.nestId = sim.state.nests[0].id;
    expect(rule(sim, a)).toMatchObject({ rule: 7, task: 'store' });
    a.nestId = -1;
    source(sim, ahead(sim, a, 1), 'sugar', 3);
    expect(rule(sim, a)).toMatchObject({ rule: 14, task: 'forage' });
  });

  it('8: carrying a soil pellet -> haul', () => {
    const { sim } = setup();
    const a = worker(sim, 50, 50);
    carry(sim, a, 'soil-pellet');
    expect(rule(sim, a)).toMatchObject({ rule: 8, task: 'haul' });
  });

  it('9: carrying corpse, waste, chaff or frass -> haul', () => {
    const { sim } = setup();
    for (const [i, kind] of (['corpse', 'waste', 'chaff', 'frass'] as const).entries()) {
      const a = worker(sim, 40 + 3 * i, 50);
      carry(sim, a, kind);
      expect(rule(sim, a)).toMatchObject({ rule: 9, task: 'haul' });
    }
  });

  it('10: carrying an aphid -> tend', () => {
    const { sim } = setup();
    const a = worker(sim, 50, 50);
    carry(sim, a, 'live-aphid');
    expect(rule(sim, a)).toMatchObject({ rule: 10, task: 'tend' });
  });

  it('11: seed or leaf fragment -> forage; garden material -> garden', () => {
    const { sim } = setup();
    const a = worker(sim, 50, 50);
    carry(sim, a, 'seed');
    expect(rule(sim, a)).toMatchObject({ rule: 11, task: 'forage' });
    const b = worker(sim, 55, 50);
    carry(sim, b, 'leaf-pulp');
    expect(rule(sim, b)).toMatchObject({ rule: 11, task: 'garden' });
  });

  it('12: anything else is put down where it stands, then the table continues', () => {
    const { sim } = setup();
    const a = worker(sim, 50, 50);
    carry(sim, a, 'pebble');
    expect(rule(sim, a)).toMatchObject({ rule: 16, putDownFirst: true });
  });

  it('13: within 3 BU of an active dig plan frontier -> dig', () => {
    const { sim } = setup();
    const a = worker(sim, 50, 50);
    activePlan(sim, ahead(sim, a, 3));
    expect(rule(sim, a)).toMatchObject({ rule: 13, task: 'dig' });
  });

  it('14: within 5 BU of a source with food left -> forage; aphids -> tend', () => {
    const { sim } = setup();
    const a = worker(sim, 50, 50);
    const s = source(sim, ahead(sim, a, 4), 'crumb', 2);
    expect(rule(sim, a)).toMatchObject({ rule: 14, task: 'forage' });
    s.herdId = 3;
    expect(rule(sim, a)).toMatchObject({ rule: 14, task: 'tend' });
  });

  it('15: the suspended task when allocation still wants it', () => {
    const { sim, fake } = setup();
    const a = worker(sim, 50, 50);
    a.suspendedTask = 'nurse';
    fake.demand.nurse = 2;
    expect(rule(sim, a)).toMatchObject({ rule: 15, task: 'nurse' });
  });

  it('16: otherwise allocation chooses, with the locality bonus for work within 20 BU', () => {
    const { sim, fake } = setup();
    const a = worker(sim, 50, 50);
    a.suspendedTask = 'scout';
    fake.demand.forage = 0.5;
    fake.demand.dig = 0.4;
    expect(rule(sim, a)).toMatchObject({ rule: 16, task: 'forage' });
    activePlan(sim, ahead(sim, a, 15));
    expect(rule(sim, a)).toMatchObject({ rule: 16, task: 'dig' });
    fake.demand = {};
    expect(rule(sim, a)).toMatchObject({ rule: 16, task: 'scout' });
  });
});

describe('release side effects (GDD 01 §3.5)', () => {
  it('flags cleared, trail off, task set the same tick, decision logged, possession-ended carries the task', () => {
    const { sim } = setup();
    const a = worker(sim, 50, 50, 'worker', 'dig');
    carry(sim, a, 'soil-pellet');
    sim.enqueue({ type: 'possess', antId: a.id });
    sim.enqueue({ type: 'setTrail', on: true });
    step(sim, 1);
    expect(a.flags & AntFlag.TRAIL_ON).toBeTruthy();
    const got: unknown[] = [];
    sim.events.on('possession-ended', (e) => { got.push(e); });
    sim.enqueue({ type: 'release', reason: 'player' });
    step(sim, 1);
    expect(a.flags & (AntFlag.POSSESSED | AntFlag.TRAIL_ON)).toBe(0);
    expect(a.task).toBe('haul');
    expect(a.suspendedTask).toBeNull();
    expect(got).toEqual([{ type: 'possession-ended', antId: a.id, reason: 'player', resumedTask: 'haul' }]);
    expect(a.mem.decisions.some((d) => d.code === REASON_CODES.indexOf('released') && d.detail === 8)).toBe(true);
  });

  it('dig-bite finishes its bite; harvest-liquid keeps drinking under rule 14; anything else is cancelled', () => {
    const { sim, fake } = setup();
    const a = worker(sim, 50, 50);
    sim.enqueue({ type: 'possess', antId: a.id });
    sim.enqueue({ type: 'action', actionId: 'dig-bite', phase: 'start' });
    step(sim, 3);
    sim.enqueue({ type: 'release', reason: 'player' });
    step(sim, 20);
    expect(fake.bites).toBe(1);
    expect(a.action).toBeNull();

    const b = worker(sim, 60, 60);
    const s = source(sim, ahead(sim, b, 0.8), 'sugar', 5, { variant: 'sugary-spill' });
    sim.enqueue({ type: 'possess', antId: b.id });
    sim.enqueue({ type: 'action', actionId: 'harvest-liquid', target: { kind: 'source', id: s.id, pos: s.pos }, phase: 'start' });
    step(sim, 10);
    sim.enqueue({ type: 'release', reason: 'player' });
    step(sim, 10);
    expect(b.task).toBe('forage');
    expect(b.action?.id).toBe('harvest-liquid');

    const c = worker(sim, 70, 70);
    sim.enqueue({ type: 'possess', antId: c.id });
    step(sim, 1);
    begin(sim, c, 'groom', null);
    sim.enqueue({ type: 'release', reason: 'player' });
    step(sim, 1);
    expect(c.action).toBeNull();
  });

  it('rule 2: a released falling ant re-runs the table once it has landed', () => {
    const { sim } = setup();
    const a = worker(sim, 50, 50, 'worker', 'scout');
    carry(sim, a, 'soil-pellet');
    sim.enqueue({ type: 'possess', antId: a.id });
    step(sim, 1);
    a.medium = 'air';
    sim.enqueue({ type: 'release', reason: 'player' });
    step(sim, 3);
    expect(a.task).toBe('scout');
    a.medium = 'surface';
    step(sim, 1);
    expect(a.task).toBe('haul');
  });
});
