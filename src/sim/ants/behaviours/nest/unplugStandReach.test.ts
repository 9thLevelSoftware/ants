// winter-sugar, integrator ruling 1 (A3's release defect): the plug's free face that unplugStandPoint picks can lie
// where no walk reaches - on suburban-garden #1's hand-over a crack beside the plug; the walker stopped at the nearest
// cell it reached, 3 BU lower and outside the bite's throat test, and the digger was barred for UNPLUG_RETRY_S after
// DIG_BITE_FAILS_MAX thinks (open at +559 instead of +270; three diggers barred, none bit). A walk that ends out of bite
// reach of the face point now costs her nothing: she walks to the throat-axis point instead, and only that walk
// counts against her.
// The generated world's crack is not reproduced here: the walk is stubbed for diggers in dig.unplug (it "arrives" where
// she stands, in a chamber out of the bite's reach, as the walker did on sg #1), so the test checks the release rule
// itself. Red before the fix: she never tries the axis point and is barred after DIG_BITE_FAILS_MAX thinks.
import { describe, expect, it, vi } from 'vitest';
import type { Vec3 } from '@/core/math/vec3';
import type { Ant, Entrance, Sim, TargetRef } from '@/sim/types';

const probe = vi.hoisted(() => ({ face: { x: 0, y: 0, z: 0 }, walks: [] as { id: number; tick: number; pos: Vec3 }[] }));

vi.mock('@/sim/nest', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/sim/nest')>();
  return {
    ...mod,
    // the module registry (systems.ts) reads `behaviours` off every module; the nest module has none
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
const { SEAL_THROAT_BU } = await import('@/sim/balance/actions');
const { UNPLUG_STAND_BU } = await import('@/sim/balance/nestwork');
const { makeNestColony, run } = await import('./testkit');
const { setState } = await import('./fsm');

describe('unplug stand point out of reach (winter-sugar ruling 1)', () => {
  it('a walk that ends out of bite reach of the face point sends her to the axis point before she can be barred', () => {
    const { sim, nest, entrance: e } = makeNestColony({ workers: 1, stores: { c: 60, p: 30 } });
    const bu = sim.world.bu;
    evaluateEntrance(sim, nest, e);
    for (let i = 0; i < 60 && e.status !== 'sealed'; i++) sealEntranceImpl(sim, e.id, -1);
    expect(e.status).toBe('sealed');
    e.status = 'reopening';
    evaluateEntrance(sim, nest, e);
    // a face point that is not the axis point (where it is does not matter: the stubbed walk never gets her there)
    probe.face = { x: e.pos.x + e.radius, y: e.pos.y - e.radius, z: e.pos.z };
    const inside = e.radius + UNPLUG_STAND_BU * bu;
    const axis = { x: e.pos.x - e.dir.x * inside, y: e.pos.y - e.dir.y * inside, z: e.pos.z - e.dir.z * inside };
    const ant = sim.stores.ants.list.find((a) => a.alive && a.caste === 'worker')!;
    // she starts in a chamber, out of the bite's throat test
    expect(Math.hypot(ant.pos.x - e.pos.x, ant.pos.y - e.pos.y, ant.pos.z - e.pos.z)).toBeGreaterThan(SEAL_THROAT_BU * bu + e.radius);
    ant.task = 'dig';
    ant.bb['bn.uf'] = 0;
    setState(sim, ant, 'dig.unplug');
    let barredAt = -1;
    for (let t = 1; t <= 600 && barredAt < 0; t++) {
      run(sim, 1);
      if ((ant.bb['bn.uu'] ?? 0) > sim.state.tick) barredAt = sim.state.tick;
    }
    const mine = probe.walks.filter((w) => w.id === ant.id);
    const near = (p: Vec3, q: Vec3) => Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z) < 1e-6;
    expect(mine.length).toBeGreaterThan(0);
    expect(near(mine[0].pos, probe.face)).toBe(true);
    const toAxis = mine.find((w) => near(w.pos, axis));
    expect(toAxis, 'she walks to the axis point').toBeDefined();
    if (barredAt >= 0) expect(toAxis!.tick).toBeLessThan(barredAt);
  }, 60_000);
});
