// Reviewer tests (sim-fix-ants item 3): the care primitives under edge conditions - crop capacity, conservation of
// food between crop, pool and queen gut, partial pools. Passing tests stay as regression tests; a failing one
// documents a defect for the fixer (see the review report).
import { describe, expect, it } from 'vitest';
import type { Vec3 } from '@/core/math/vec3';
import type { Ant, Chamber } from '@/sim/types';
import { SYSTEMS } from '@/sim/systems';
import { placeOnSurface } from '@/sim/locomotion';
import { QUEEN_GUT_CAP } from '@/sim/balance/colony';
import { makeNestColony, type NestColony } from '@/sim/ants/behaviours/nest/testkit';
import { begin, canDo } from './runner';

const QUIET = SYSTEMS.filter((s) => s.name !== 'behaviours' && s.name !== 'allocation' && s.name !== 'task-reeval');

function colony(o: Parameters<typeof makeNestColony>[0] = {}): NestColony & { w: Ant } {
  const k = makeNestColony({ workers: 1, systems: QUIET, ...o });
  const w = k.sim.stores.ants.list.find((a) => a.caste === 'worker')!;
  return { ...k, w };
}

function stand(k: NestColony, ant: Ant, room: Chamber, at?: Vec3): void {
  const p = at ?? room.center;
  expect(placeOnSurface(k.sim, ant, { x: p.x, y: room.center.y, z: p.z }, { x: 0, y: -1, z: 0 })).toBe(true);
  ant.nestId = k.nest.id;
  ant.chamberId = room.id;
}

function besideFacing(k: NestColony, ant: Ant, room: Chamber, target: Vec3, gapBu: number): void {
  const bu = k.sim.world.bu;
  const dx = room.center.x - target.x, dz = room.center.z - target.z, l = Math.hypot(dx, dz) || 1;
  stand(k, ant, room, { x: target.x + (dx / l) * gapBu * bu, y: 0, z: target.z + (dz / l) * gapBu * bu });
  const fx = target.x - ant.pos.x, fz = target.z - ant.pos.z, u = ant.up;
  const dn = fx * u.x + fz * u.z;
  const tx = fx - u.x * dn, ty = -u.y * dn, tz = fz - u.z * dn, tl = Math.hypot(tx, ty, tz);
  ant.fwd = { x: tx / tl, y: ty / tl, z: tz / tl };
}

function finish(k: NestColony, ant: Ant): void {
  for (let i = 0; i < 400 && ant.action; i++) k.sim.tick();
  expect(ant.action).toBeNull();
}

const crop = (a: Ant) => a.cropC + a.cropP;

describe('reviewer: load-crop edge cases', () => {
  it('never fills the crop beyond the ant\'s own crop capacity (small workers, GDD 07 §2.3 cropCap)', () => {
    // a small worker whose crop holds less than NURSE_LOAD (cropCap = min(cropMax, m) for light size classes)
    const k = colony({ stores: { c: 40, p: 20 } });
    const { sim, w } = k;
    w.task = 'nurse';
    w.cropCap = 0.3;
    stand(k, w, k.food);
    expect(begin(sim, w, 'load-crop', null)).toBe(true);
    finish(k, w);
    expect(crop(w)).toBeLessThanOrEqual(w.cropCap + 1e-9);
  });

  // The colony's upkeep also draws on the pool while the 6 s load runs: a control run of the same colony without
  // the load (deterministic, same ticks) isolates what the primitive moved.
  function loadAgainstControl(stores: { c: number; p: number }, task: Ant['task']) {
    const runOne = (doLoad: boolean) => {
      const k = colony({ stores });
      const { sim, w } = k;
      w.task = task;
      stand(k, w, k.food);
      if (doLoad) expect(begin(sim, w, 'load-crop', null)).toBe(true);
      for (let i = 0; i < 200; i++) sim.tick();
      expect(w.action).toBeNull();
      const col = sim.state.colonies[0];
      return { c: col.stores.c, p: col.stores.p, w };
    };
    const ctl = runOne(false), got = runOne(true);
    return { dc: ctl.c - got.c, dp: ctl.p - got.p, w: got.w, pool: got };
  }

  it('conserves food: what the crop gains the pool loses (nurse mix, partial pool)', () => {
    const r = loadAgainstControl({ c: 0.2, p: 0.05 }, 'nurse');
    expect(r.pool.c).toBeGreaterThanOrEqual(0);
    expect(r.pool.p).toBeGreaterThanOrEqual(0);
    expect(r.dc).toBeCloseTo(r.w.cropC, 6);
    expect(r.dp).toBeCloseTo(r.w.cropP, 6);
  });

  it('a forager\'s departure ration never draws protein, even with C nearly exhausted', () => {
    const r = loadAgainstControl({ c: 0.03, p: 5 }, 'forage');
    expect(r.w.cropP).toBe(0);
    expect(r.dp).toBeCloseTo(0, 9);
    expect(r.dc).toBeCloseTo(r.w.cropC, 6);
    expect(r.w.cropC).toBeLessThanOrEqual(0.03 + 1e-9);
  });
});

describe('reviewer: unload-crop and feed-queen conservation', () => {
  it('unload-crop moves the crop into the pool, loss-free, down to the donor minimum', () => {
    const k = colony({ stores: { c: 1, p: 1 } });
    const { sim, w } = k;
    w.task = 'forage';
    stand(k, w, k.food);
    // the pool is closed until the economy's first cycle has counted the colony's workers (colony/stores.ts)
    for (let i = 0; i < 300; i++) sim.tick();
    w.cropC = 0.5; w.cropP = 0.2;
    const col = sim.state.colonies[0];
    const tot0 = col.stores.c + col.stores.p + crop(w);
    expect(begin(sim, w, 'unload-crop', null)).toBe(true);
    finish(k, w);
    const tot1 = col.stores.c + col.stores.p + crop(w);
    // the colony's upkeep runs meanwhile (a few thousandths of a load over the unload)
    expect(Math.abs(tot1 - tot0)).toBeLessThan(0.01);
    expect(crop(w)).toBeLessThan(0.1);
    expect(canDo(sim, w, 'unload-crop', null).ok).toBe(false);
  });

  it('feed-queen into a nearly full gut: the queen never exceeds her gut cap and nothing is lost', () => {
    const k = colony();
    const { sim, w, queen } = k;
    besideFacing(k, w, k.royal, queen.pos, 1.2);
    queen.queen!.gut.c = QUEEN_GUT_CAP - 0.02;
    queen.queen!.gut.p = 0;
    w.cropC = 0.3; w.cropP = 0.1;
    const t = { kind: 'ant' as const, id: queen.id, pos: queen.pos };
    const before = crop(w) + queen.queen!.gut.c + queen.queen!.gut.p;
    expect(begin(sim, w, 'feed-queen', t)).toBe(true);
    // the queen's own upkeep runs on slow ticks: stop it from blurring the balance (finish within one feed)
    for (let i = 0; i < 400 && w.action; i++) sim.tick();
    expect(w.action).toBeNull();
    const gut = queen.queen!.gut.c + queen.queen!.gut.p;
    expect(gut).toBeLessThanOrEqual(QUEEN_GUT_CAP + 1e-9);
    // allow the queen's upkeep for the 4 s of the feed (well below 0.01 load)
    expect(Math.abs(crop(w) + gut - before)).toBeLessThan(0.01);
  });
});
