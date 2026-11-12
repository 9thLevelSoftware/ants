// harvest-liquid, harvest-solid, trophallaxis give / receive, lay-trail (GDD 01 §7.3, App. E 7-8, GDD 02 §5.4).
import { afterEach, describe, expect, it } from 'vitest';
import { AntFlag } from '@/sim/types';
import { ports } from './ports';
import { begin, canDo, stopAction } from './runner';
import { ahead, capture, installFakes, makeAntSim, source, step, worker } from './testkit';

let restore = (): void => {};
afterEach(() => restore());

function setup() {
  const sim = makeAntSim();
  const f = installFakes(sim);
  restore = f.restore;
  return { sim, fake: f.fake };
}

describe('harvest-liquid', () => {
  it('App. E 7: 20 game s on a 5-load sugar source -> crop 1.00, source 4.00 (exactly rate x time)', () => {
    const { sim } = setup();
    const w = worker(sim, 50, 50);
    const s = source(sim, ahead(sim, w, 0.8), 'sugar', 5, { variant: 'sugary-spill' });
    sim.enqueue({ type: 'possess', antId: w.id });
    sim.enqueue({ type: 'action', actionId: 'harvest-liquid', target: { kind: 'source', id: s.id, pos: s.pos }, phase: 'start' });
    step(sim, 100);
    expect(w.cropC).toBeCloseTo(0.5, 9); // half-way: 100 ticks x 0.005
    step(sim, 100);
    expect(w.cropC + w.cropP).toBeCloseTo(1.0, 9);
    expect(s.units).toBeCloseTo(4.0, 9);
    expect(w.action).toBeNull(); // full: done
  });

  it('cancelled half-way keeps exactly what was drunk; x drinkRateMult; crop-full and not-allowed-here', () => {
    const { sim } = setup();
    const w = worker(sim, 50, 50);
    const s = source(sim, ahead(sim, w, 0.8), 'nectar', 5, { drinkRateMult: 2 });
    const t = { kind: 'source' as const, id: s.id, pos: s.pos };
    begin(sim, w, 'harvest-liquid', t);
    step(sim, 37);
    stopAction(sim, w);
    expect(w.cropC).toBeCloseTo(37 * 0.01, 9);
    expect(5 - s.units).toBeCloseTo(37 * 0.01, 9);
    w.cropC = 1;
    expect(canDo(sim, w, 'harvest-liquid', t).reason).toBe('crop-full');
    const meat = source(sim, ahead(sim, w, 0.8), 'carrion', 5);
    expect(canDo(sim, w, 'harvest-liquid', { kind: 'source', id: meat.id, pos: meat.pos }).reason).toBe('not-allowed-here');
  });
});

describe('harvest-solid', () => {
  it('TEAR_S x hardness; a carryCap piece in the mandibles of the source profile; hands-full', () => {
    const { sim } = setup();
    const w = worker(sim, 50, 50);
    const s = source(sim, ahead(sim, w, 0.8), 'carrion', 5, { variant: 'insect-medium', hardness: 1.5, c: 0.1, p: 0.9, unitBulk: 1 });
    const t = { kind: 'source' as const, id: s.id, pos: s.pos };
    expect(begin(sim, w, 'harvest-solid', t)).toBe(true);
    expect(w.action?.durationTicks).toBe(60);
    step(sim, 60);
    const piece = sim.stores.items.get(w.carry.id)!;
    expect(piece.kind).toBe('food-piece');
    expect(piece.p).toBeCloseTo(0.9, 9);
    expect(piece.bulk).toBeCloseTo(1, 9);
    expect(s.units).toBeCloseTo(4, 9);
    expect(w.mem.knownSourceId).toBe(s.id);
    expect(canDo(sim, w, 'harvest-solid', t).reason).toBe('hands-full');
  });
});

describe('trophallaxis', () => {
  it('App. E 8: donor 1.0 C gives for 5 s outside -> 0.50 / 0.50', () => {
    const { sim } = setup();
    const d = worker(sim, 50, 50);
    const r = worker(sim, 50.9, 50);
    r.fwd = { x: -1, y: 0, z: 0 };
    d.cropC = 1;
    sim.enqueue({ type: 'possess', antId: d.id });
    sim.enqueue({ type: 'action', actionId: 'trophallaxis-give', target: { kind: 'ant', id: r.id, pos: r.pos }, phase: 'start' });
    const ev = capture(sim, ['trophallaxis'], () => {
      step(sim, 50);
      sim.enqueue({ type: 'action', actionId: 'trophallaxis-give', phase: 'stop' });
      step(sim, 1);
    });
    expect(d.cropC).toBeCloseTo(0.5, 2);
    expect(r.cropC).toBeCloseTo(0.5, 2);
    expect(ev[0]).toMatchObject({ donorId: d.id, receiverId: r.id });
  });

  it('stops at the donor floor 0.05; inside the nest the food enters the pool; crop-empty / crop-full', () => {
    const { sim } = setup();
    const d = worker(sim, 50, 50);
    const r = worker(sim, 50.9, 50);
    d.cropC = 0.2;
    const t = { kind: 'ant' as const, id: r.id, pos: r.pos };
    begin(sim, d, 'trophallaxis-give', t);
    step(sim, 100);
    expect(d.cropC).toBeCloseTo(0.05, 9);
    expect(d.action).toBeNull();
    expect(canDo(sim, d, 'trophallaxis-give', t).reason).toBe('crop-empty');
    d.cropC = 0.5; d.nestId = r.nestId = sim.state.nests[0].id;
    const col = sim.state.colonies[0];
    const c0 = col.stores.c;
    begin(sim, d, 'trophallaxis-give', t);
    step(sim, 10);
    expect(col.stores.c - c0).toBeCloseTo(0.1, 9);
    expect(r.cropC).toBeCloseTo(0.15, 9);
    d.nestId = r.nestId = -1;
    d.action = null;
    r.cropC = 1;
    expect(canDo(sim, d, 'trophallaxis-give', t).reason).toBe('crop-full');
  });

  it('beg: an AI donor accepts above 0.3 of its crop (or for the queen); a possessed donor never auto-accepts', () => {
    const { sim } = setup();
    const b = worker(sim, 50, 50);
    const d = worker(sim, 50.9, 50);
    d.fwd = { x: -1, y: 0, z: 0 };
    const t = { kind: 'ant' as const, id: d.id, pos: d.pos };
    d.cropC = 0.25;
    expect(canDo(sim, b, 'trophallaxis-receive', t).reason).toBe('blocked');
    d.cropC = 0.8;
    expect(begin(sim, b, 'trophallaxis-receive', t)).toBe(true);
    step(sim, 20);
    expect(b.cropC).toBeCloseTo(0.2, 9);
    expect(d.cropC).toBeCloseTo(0.6, 9);
    stopAction(sim, b);
    d.flags |= AntFlag.POSSESSED;
    expect(canDo(sim, b, 'trophallaxis-receive', t).reason).toBe('blocked');
    d.flags = 0;
    d.colony = 9999;
    expect(canDo(sim, b, 'trophallaxis-receive', t).reason).toBe('not-allowed-here');
  });
});

describe('lay-trail', () => {
  it('toggle on/off emits trail-toggled; deposits TRAIL_DAB x 0.6 every 1.5 BU walked when unladen, x1.0 laden', () => {
    const { sim } = setup();
    const w = worker(sim, 50, 50);
    let ev = capture(sim, ['trail-toggled'], () => begin(sim, w, 'lay-trail', null));
    expect(ev[0]).toMatchObject({ on: true });
    expect(w.flags & AntFlag.TRAIL_ON).toBeTruthy();
    const dabs: number[] = [];
    ports.deposit = (_s, _c, channel, _p, amount) => { if (channel === 'trail') dabs.push(amount); };
    const walk = (n: number): void => {
      for (let i = 0; i < n; i++) { // 0.1 BU per tick along +X
        w.prevPos = { ...w.pos };
        w.pos = { x: w.pos.x + 0.1 * sim.world.bu, y: w.pos.y, z: w.pos.z };
        step(sim, 1);
      }
    };
    walk(30);
    expect(dabs).toHaveLength(2);
    expect(dabs[0]).toBeCloseTo(0.25 * 0.6, 9);
    w.cropC = 0.6;
    walk(15);
    expect(dabs[2]).toBeCloseTo(0.25, 9);
    w.nestId = 3; // inside the nest: no trail
    walk(30);
    expect(dabs).toHaveLength(3);
    ev = capture(sim, ['trail-toggled'], () => begin(sim, w, 'lay-trail', null));
    expect(ev[0]).toMatchObject({ on: false });
  });

  it('setTrail command: castes that cannot lay trail get action-failed', () => {
    const { sim } = setup();
    const q = sim.stores.ants.get(sim.state.colonies[0].queenId)!;
    sim.enqueue({ type: 'possess', antId: q.id });
    const ev = capture(sim, ['action-failed', 'trail-toggled'], () => {
      sim.enqueue({ type: 'setTrail', on: true });
      step(sim, 2);
    });
    expect(ev.map((e) => e.type)).toEqual(['action-failed']);
    expect(q.flags & AntFlag.TRAIL_ON).toBe(0);
  });
});
