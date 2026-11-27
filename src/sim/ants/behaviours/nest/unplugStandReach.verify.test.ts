// Reviewer's checks of winter-sugar's A3 release fix (integrator ruling 1, dig.ts unplugStep, bb 'bn.ua'):
// 1. no livelock: when neither the face point nor the axis point is in bite reach, the digger is still barred after a
//    bounded number of thinks (DIG_BITE_FAILS_MAX on the axis walk), not left cycling between the two points;
// 2. the axis mode belongs to one unplug episode: after the bar ends and she comes back through dig.claim, her first
//    walk is to the face point again (claimStep resets 'bn.ua').
// The walk is stubbed as in unplugStandReach.test.ts: it "arrives" where she stands, out of the bite's throat test.
import { describe, expect, it, vi } from 'vitest';
import type { Vec3 } from '@/core/math/vec3';
import type { Ant, Entrance, Sim, TargetRef } from '@/sim/types';

const probe = vi.hoisted(() => ({ face: { x: 0, y: 0, z: 0 }, walks: [] as { id: number; tick: number; pos: Vec3 }[] }));

vi.mock('@/sim/nest', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/sim/nest')>();
  return {
    ...mod,
    behaviours: (mod as { behaviours?: unknown }).behaviours,
    unplugStandPoint: (_sim: unknown, _e: Entrance, _from: Vec3, _reach: number, out: Vec3) => {
      out.x = probe.face.x; out.y = probe.face.y; out.z = probe.face.z;
      return true;
    },
  };
});

vi.mock('./common', async (importOriginal) => {
  const mod = await importOriginal<typeof import('./common')>();
  return {
    ...mod,
    approach: (sim: Sim, ant: Ant, t: TargetRef, ...rest: [number, boolean?, number?]) => {
      if (ant.state !== 'dig.unplug') return mod.approach(sim, ant, t, ...rest);
      probe.walks.push({ id: ant.id, tick: sim.state.tick, pos: { ...t.pos } });
      return 'arrived';
    },
  };
});

const { evaluateEntrance, sealEntranceImpl } = await import('@/sim/nest/entrances');
const { UNPLUG_STAND_BU, UNPLUG_RETRY_S, DIG_BITE_FAILS_MAX } = await import('@/sim/balance/nestwork');
const { secondsToTicks } = await import('@/sim/time');
const { makeNestColony, run } = await import('./testkit');
const { setState } = await import('./fsm');

const near = (p: Vec3, q: Vec3) => Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z) < 1e-6;

function plugged() {
  const k = makeNestColony({ workers: 1, stores: { c: 60, p: 30 } });
  const { sim, nest, entrance: e } = k;
  evaluateEntrance(sim, nest, e);
  for (let i = 0; i < 60 && e.status !== 'sealed'; i++) sealEntranceImpl(sim, e.id, -1);
  expect(e.status).toBe('sealed');
  e.status = 'reopening';
  evaluateEntrance(sim, nest, e);
  const bu = sim.world.bu;
  probe.face = { x: e.pos.x + e.radius, y: e.pos.y - e.radius, z: e.pos.z };
  const inside = e.radius + UNPLUG_STAND_BU * bu;
  const axis = { x: e.pos.x - e.dir.x * inside, y: e.pos.y - e.dir.y * inside, z: e.pos.z - e.dir.z * inside };
  const ant = sim.stores.ants.list.find((a) => a.alive && a.caste === 'worker')!;
  return { sim, e, ant, axis };
}

describe('A3 release fix (reviewer, winter-sugar)', () => {
  it('face and axis both out of reach: barred after a bounded number of walks, never cycling', () => {
    probe.walks.length = 0;
    const { sim, ant, axis } = plugged();
    ant.task = 'dig';
    setState(sim, ant, 'dig.unplug');
    let barredAt = -1;
    for (let t = 1; t <= 2000 && barredAt < 0; t++) {
      run(sim, 1);
      if ((ant.bb['bn.uu'] ?? 0) > sim.state.tick) barredAt = sim.state.tick;
    }
    expect(barredAt, 'barred at last').toBeGreaterThan(0);
    const mine = probe.walks.filter((w) => w.id === ant.id && w.tick <= barredAt);
    const toFace = mine.filter((w) => near(w.pos, probe.face)).length;
    const toAxis = mine.filter((w) => near(w.pos, axis)).length;
    // the face walk is given up after one out-of-reach arrival, then the axis walk counts to the cap
    expect(toFace).toBe(1);
    expect(toAxis).toBeGreaterThanOrEqual(DIG_BITE_FAILS_MAX - 1);
    expect(toAxis).toBeLessThanOrEqual(DIG_BITE_FAILS_MAX + 1);
  }, 60_000);

  it('after the bar ends she comes back through dig.claim and walks to the face point first again', () => {
    probe.walks.length = 0;
    const { sim, ant } = plugged();
    ant.task = 'dig';
    setState(sim, ant, 'dig.unplug');
    for (let t = 1; t <= 2000 && !((ant.bb['bn.uu'] ?? 0) > sim.state.tick); t++) run(sim, 1);
    expect(ant.bb['bn.ua']).toBe(1);
    run(sim, secondsToTicks(UNPLUG_RETRY_S) + 1);
    const from = sim.state.tick;
    ant.task = 'dig';
    setState(sim, ant, 'dig.claim');
    for (let t = 1; t <= 200 && ant.state !== 'dig.unplug'; t++) run(sim, 1);
    expect(ant.state).toBe('dig.unplug');
    expect(ant.bb['bn.ua']).toBe(0);
    for (let t = 1; t <= 100 && !probe.walks.some((w) => w.id === ant.id && w.tick > from); t++) run(sim, 1);
    const first = probe.walks.find((w) => w.id === ant.id && w.tick > from);
    expect(first, 'a walk after re-entry').toBeDefined();
    expect(near(first!.pos, probe.face)).toBe(true);
  }, 60_000);
});
