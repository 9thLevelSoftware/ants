// Lifecycle shells of bite, bite-hold, spray-acid, release-alarm, tend-aphid: reach, cooldowns, charges, events;
// damage / locks delegated to the combat module (fakes here).
import { afterEach, describe, expect, it } from 'vitest';
import { spawnAnt } from '@/sim/entities';
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

function stranger(sim: ReturnType<typeof makeAntSim>, at: { x: number; y: number; z: number }) {
  const col = sim.state.colonies[0];
  const a = spawnAnt(sim, { colony: col.id, caste: 'worker', pos: at, lengthBu: 1 });
  a.colony = 4242; // a rival colony id (no colony record needed for the shells)
  return a;
}

describe('bite', () => {
  it('0.5 s strike, damage through combat.applyDamage, 1 s cycle cooldown, nestmates refused', () => {
    const { sim, fake } = setup();
    const w = worker(sim, 50, 50);
    const foe = stranger(sim, ahead(sim, w, 0.9));
    const t = { kind: 'ant' as const, id: foe.id, pos: foe.pos };
    expect(begin(sim, w, 'bite', t)).toBe(true);
    expect(w.action?.durationTicks).toBe(5);
    step(sim, 5);
    expect(fake.damage).toEqual([{ kind: 'ant', id: foe.id, dmg: 1 }]);
    expect(canDo(sim, w, 'bite', t).reason).toBe('cooldown');
    step(sim, 5);
    expect(canDo(sim, w, 'bite', t).ok).toBe(true);
    const mate = worker(sim, 50.9, 50);
    expect(canDo(sim, w, 'bite', { kind: 'ant', id: mate.id, pos: mate.pos }).reason).toBe('not-allowed-here');
  });
});

describe('bite-hold', () => {
  it('locks through combat.beginGrapple, ignores damage, releases on stop; blocked when no lock is possible', () => {
    const { sim, fake } = setup();
    const w = worker(sim, 50, 50);
    const foe = stranger(sim, ahead(sim, w, 0.9));
    const t = { kind: 'ant' as const, id: foe.id, pos: foe.pos };
    begin(sim, w, 'bite-hold', t);
    step(sim, 3);
    expect(w.combat?.lock?.targetId).toBe(foe.id);
    w.hp -= 2;
    step(sim, 2);
    expect(w.action?.id).toBe('bite-hold');
    stopAction(sim, w);
    expect(w.combat?.lock).toBeNull();
    fake.grapple = false;
    const ev = capture(sim, ['action-failed'], () => { begin(sim, w, 'bite-hold', t); step(sim, 1); });
    expect(ev[0]).toMatchObject({ reason: 'blocked' });
  });
});

describe('spray-acid', () => {
  it('1.1 s, one charge, alarm 1.0 at the ant, hits hostiles in the 60° / 1.5 L cone only, 3 s cooldown, regen', () => {
    const { sim, fake } = setup();
    const w = worker(sim, 50, 50);
    const near = stranger(sim, ahead(sim, w, 1.2));
    const far = stranger(sim, ahead(sim, w, 2.6));
    sim.index.refresh();
    const alarms: number[] = [];
    ports.deposit = (_s, _c, ch, _p, a) => { if (ch === 'alarm') alarms.push(a); };
    expect(w.acid).toBe(5);
    expect(begin(sim, w, 'spray-acid', null)).toBe(true);
    expect(w.action?.durationTicks).toBe(11);
    step(sim, 11);
    expect(w.acid).toBe(4);
    expect(alarms).toEqual([1]);
    expect(fake.damage.map((d) => d.id)).toEqual([near.id]);
    expect(fake.damage[0].dmg).toBeCloseTo(2.5, 9);
    expect(far.alive).toBe(true);
    expect(canDo(sim, w, 'spray-acid', null).reason).toBe('cooldown');
    step(sim, 1200);
    expect(w.acid).toBe(5);
    w.acid = 0;
    expect(canDo(sim, w, 'spray-acid', null).reason).toBe('no-reserve');
  });
});

describe('release-alarm and tend-aphid', () => {
  it('release-alarm: 0.5 s, alarm puff 4 ph, 5 s cooldown; males cannot', () => {
    const { sim } = setup();
    const w = worker(sim, 50, 50);
    const alarms: number[] = [];
    ports.deposit = (_s, _c, ch, _p, a) => { if (ch === 'alarm') alarms.push(a); };
    begin(sim, w, 'release-alarm', null);
    step(sim, 5);
    expect(alarms).toEqual([4]);
    expect(canDo(sim, w, 'release-alarm', null).reason).toBe('cooldown');
    step(sim, 50);
    expect(canDo(sim, w, 'release-alarm', null).ok).toBe(true);
    expect(canDo(sim, worker(sim, 70, 70, 'male'), 'release-alarm', null).reason).toBe('caste');
  });

  it('tend-aphid: herd sources only, 3 s stroke, crop-full; records tending', () => {
    const { sim } = setup();
    const w = worker(sim, 50, 50);
    const herd = source(sim, ahead(sim, w, 0.8), 'honeydew', 1, { herdId: 7 });
    const t = { kind: 'source' as const, id: herd.id, pos: herd.pos };
    begin(sim, w, 'tend-aphid', t);
    expect(w.action?.durationTicks).toBe(30);
    step(sim, 30);
    expect(herd.tendedBy).toBe(w.colony);
    w.cropC = 1;
    expect(canDo(sim, w, 'tend-aphid', t).reason).toBe('crop-full');
    const plain = source(sim, ahead(sim, w, 0.8), 'honeydew', 1);
    w.cropC = 0;
    expect(canDo(sim, w, 'tend-aphid', { kind: 'source', id: plain.id, pos: plain.pos }).reason).toBe('no-target');
  });
});
