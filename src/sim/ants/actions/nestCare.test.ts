// The care primitives that replaced beh-nest's local adapter (sim-fix-ants item 3): load-crop, unload-crop,
// feed-queen, assist-eclosion, cannibalise. Each has the shared lifecycle, a timing and a pose; the possessed ant
// reaches them through the `action` command exactly like the AI through begin().
import { describe, expect, it } from 'vitest';
import type { Vec3 } from '@/core/math/vec3';
import type { Ant, Chamber, Sim } from '@/sim/types';
import { BroodFlag, POSES } from '@/sim/types';
import { SYSTEMS } from '@/sim/systems';
import { placeOnSurface } from '@/sim/locomotion';
import { LARVA_P_REQ, LARVA_C_REQ } from '@/sim/balance/colony';
import { NURSE_LOAD, QUEEN_FEED_LOADS } from '@/sim/balance/nestwork';
import { makeNestColony, run, type NestColony } from '@/sim/ants/behaviours/nest/testkit';
import { begin, canDo } from './runner';
import { workRate } from './workRate';
import { TICKS_PER_SECOND } from '@/sim/time';
import { ASSIST_S, CANNIBALISE_S, LOAD_S, QUEEN_FEED_S } from '@/sim/balance/nestwork';

/** No behaviours, no allocation: only the primitive acts. */
const QUIET = SYSTEMS.filter((s) => s.name !== 'behaviours' && s.name !== 'allocation' && s.name !== 'task-reeval');

function colony(o: Parameters<typeof makeNestColony>[0] = {}): NestColony & { w: Ant } {
  const k = makeNestColony({ workers: 1, systems: QUIET, ...o });
  const w = k.sim.stores.ants.list.find((a) => a.caste === 'worker')!;
  return { ...k, w };
}

/** Puts the ant on the floor of a chamber at `at` (or the centre), inside the nest. */
function stand(k: NestColony, ant: Ant, room: Chamber, at?: Vec3): void {
  const p = at ?? room.center;
  expect(placeOnSurface(k.sim, ant, { x: p.x, y: room.center.y, z: p.z }, { x: 0, y: -1, z: 0 })).toBe(true);
  ant.nestId = k.nest.id;
  ant.chamberId = room.id;
}

/** Puts the ant beside a target on the chamber floor, facing it. */
function besideFacing(k: NestColony, ant: Ant, room: Chamber, target: Vec3, gapBu: number): void {
  const bu = k.sim.world.bu;
  const dx = room.center.x - target.x, dz = room.center.z - target.z, l = Math.hypot(dx, dz) || 1;
  stand(k, ant, room, { x: target.x + (dx / l) * gapBu * bu, y: 0, z: target.z + (dz / l) * gapBu * bu });
  const fx = target.x - ant.pos.x, fz = target.z - ant.pos.z, u = ant.up;
  const dn = fx * u.x + fz * u.z;
  const tx = fx - u.x * dn, ty = -u.y * dn, tz = fz - u.z * dn, tl = Math.hypot(tx, ty, tz);
  ant.fwd = { x: tx / tl, y: ty / tl, z: tz / tl };
}

function possess(sim: Sim, ant: Ant): void {
  sim.enqueue({ type: 'possess', antId: ant.id });
  sim.tick();
  expect(sim.state.player.possessedAntId).toBe(ant.id);
}

const crop = (a: Ant) => a.cropC + a.cropP;

/** The timed primitive runs base / workRate (GDD 01 §7.1); then runs the sim until it ended (at most 2x that). */
function expectTimed(sim: Sim, ant: Ant, baseS: number): void {
  const want = Math.ceil((baseS * TICKS_PER_SECOND) / workRate(sim, ant) - 1e-9);
  expect(ant.action?.durationTicks).toBe(want);
  for (let i = 0; i < 2 * want && ant.action; i++) sim.tick();
  expect(ant.action).toBeNull();
}
const pose = (id: (typeof POSES)[number]) => POSES.indexOf(id);

describe('load-crop (GDD 02 §5.4.1-5.4.2)', () => {
  it('a nurse loads NURSE_LOAD with the nurse mix in the food chamber, in 6 s, with the drink pose', () => {
    const k = colony({ stores: { c: 40, p: 20 } });
    const { sim, w } = k;
    w.task = 'nurse';
    stand(k, w, k.food);
    expect(begin(sim, w, 'load-crop', null)).toBe(true);
    expect(w.pose).toBe(pose('drink'));
    expectTimed(sim, w, LOAD_S);
    expect(w.pose).toBe(0);
    expect(crop(w)).toBeCloseTo(NURSE_LOAD, 6);
    expect(w.cropP / crop(w)).toBeCloseTo(LARVA_P_REQ / (LARVA_P_REQ + LARVA_C_REQ), 6);
  });

  it('refusals: outside a food chamber, crop full, empty pool', () => {
    const k = colony({ stores: { c: 40, p: 20 } });
    const { sim, w } = k;
    w.task = 'nurse';
    stand(k, w, k.nursery);
    expect(canDo(sim, w, 'load-crop', null).reason).toBe('not-allowed-here');
    stand(k, w, k.food);
    w.cropC = NURSE_LOAD;
    expect(canDo(sim, w, 'load-crop', null).reason).toBe('crop-full');
    w.cropC = 0;
    const col = sim.state.colonies[0];
    col.stores.c = 0; col.stores.p = 0.05;
    expect(canDo(sim, w, 'load-crop', null).reason).toBe('no-reserve');
  });

  it('a forager takes its departure ration (C only) booked under the ledger key `ration`', () => {
    const k = colony({ stores: { c: 40, p: 20 } });
    const { sim, w } = k;
    w.task = 'forage';
    stand(k, w, k.food);
    const col = sim.state.colonies[0];
    const r0 = col.ledger.outRationC;
    expect(begin(sim, w, 'load-crop', null)).toBe(true);
    expectTimed(sim, w, LOAD_S);
    expect(w.cropC).toBeGreaterThan(0);
    expect(w.cropP).toBe(0);
    expect(col.ledger.outRationC - r0).toBeCloseTo(w.cropC, 9);
  });

  it('the possessed ant loads its crop through the `action` command', () => {
    const k = colony({ stores: { c: 40, p: 20 } });
    const { sim, w } = k;
    w.task = 'nurse';
    stand(k, w, k.food);
    possess(sim, w);
    sim.enqueue({ type: 'action', actionId: 'load-crop', phase: 'start' });
    run(sim, 3);
    expect(w.action?.id).toBe('load-crop');
    expect(w.pose).toBe(pose('drink'));
    for (let i = 0; i < 200 && w.action; i++) sim.tick();
    expect(w.action).toBeNull();
    expect(crop(w)).toBeCloseTo(NURSE_LOAD, 6);
  });
});

describe('feed-queen (GDD 02 §5.4.1 carer -> queen, §5.7 S2)', () => {
  it('a carer gives one feed of 0.1 load from her crop in 4 s; refused when the crop is empty', () => {
    const k = colony();
    const { sim, w, queen } = k;
    besideFacing(k, w, k.royal, queen.pos, 1.2);
    const t = { kind: 'ant' as const, id: queen.id, pos: queen.pos };
    expect(canDo(sim, w, 'feed-queen', t).reason).toBe('crop-empty');
    w.cropC = 0.3; w.cropP = 0.1;
    queen.queen!.gut.c = 0; queen.queen!.gut.p = 0;
    expect(canDo(sim, w, 'feed-queen', t)).toEqual({ ok: true, reason: null });
    expect(begin(sim, w, 'feed-queen', t)).toBe(true);
    expect(w.pose).toBe(pose('troph-give'));
    expectTimed(sim, w, QUEEN_FEED_S);
    expect(crop(w)).toBeCloseTo(0.4 - QUEEN_FEED_LOADS, 6);
    expect(queen.queen!.gut.c + queen.queen!.gut.p).toBeGreaterThan(0.05);
  });

  it('secondary: from the own reserve of the carer, refused at the reserve floor', () => {
    const k = colony();
    const { sim, w, queen } = k;
    besideFacing(k, w, k.royal, queen.pos, 1.2);
    const t = { kind: 'ant' as const, id: queen.id, pos: queen.pos };
    queen.queen!.gut.c = 0; queen.queen!.gut.p = 0;
    w.energy = 0.2;
    expect(canDo(sim, w, 'feed-queen', t, { secondary: true }).reason).toBe('no-reserve');
    w.energy = 0.6;
    expect(begin(sim, w, 'feed-queen', t, { secondary: true })).toBe(true);
    expectTimed(sim, w, QUEEN_FEED_S);
    expect(w.energy).toBeLessThan(0.6);
    expect(queen.queen!.gut.c).toBeGreaterThan(0);
  });

  it('the possessed ant feeds the queen through the `action` command', () => {
    const k = colony();
    const { sim, w, queen } = k;
    besideFacing(k, w, k.royal, queen.pos, 1.2);
    w.cropC = 0.4;
    queen.queen!.gut.c = 0; queen.queen!.gut.p = 0;
    possess(sim, w);
    sim.enqueue({ type: 'action', actionId: 'feed-queen', target: { kind: 'ant', id: queen.id, pos: queen.pos }, phase: 'start' });
    run(sim, 3);
    expect(w.action?.id).toBe('feed-queen');
    for (let i = 0; i < 200 && w.action; i++) sim.tick();
    expect(w.action).toBeNull();
    expect(w.cropC).toBeCloseTo(0.4 - QUEEN_FEED_LOADS, 6);
    expect(queen.queen!.gut.c).toBeGreaterThan(0.05);
  });
});

describe('assist-eclosion and cannibalise (GDD 02 §2.9, §5.7)', () => {
  it('assist-eclosion opens a ready pupa: an adult ecloses after 10 s', () => {
    const k = colony({ brood: [{ stage: 'pupa', n: 1, chamber: 'nursery', progress: 0.999 }] });
    const { sim, w } = k;
    const b = sim.stores.brood.list[0];
    b.flags |= BroodFlag.READY;
    besideFacing(k, w, k.nursery, b.pos, 0.5);
    const t = { kind: 'brood' as const, id: b.id, pos: b.pos };
    expect(canDo(sim, w, 'assist-eclosion', t)).toEqual({ ok: true, reason: null });
    const ants0 = sim.stores.ants.list.length;
    expect(begin(sim, w, 'assist-eclosion', t)).toBe(true);
    expect(w.pose).toBe(pose('tear'));
    expectTimed(sim, w, ASSIST_S);
    expect(sim.stores.brood.get(b.id)).toBeUndefined();
    expect(sim.stores.ants.list.length).toBe(ants0 + 1);
  });

  it('cannibalise is refused before starvation S3 and eats an egg in S3', () => {
    const k = colony({ brood: [{ stage: 'egg', n: 1, chamber: 'nursery' }] });
    const { sim, w } = k;
    const b = sim.stores.brood.list[0];
    besideFacing(k, w, k.nursery, b.pos, 0.5);
    const t = { kind: 'brood' as const, id: b.id, pos: b.pos };
    expect(canDo(sim, w, 'cannibalise', t).reason).toBe('conditions');
    const col = sim.state.colonies[0];
    col.starvationStage = 'brood-sacrifice';
    expect(begin(sim, w, 'cannibalise', t)).toBe(true);
    const want = Math.ceil((CANNIBALISE_S * TICKS_PER_SECOND) / workRate(sim, w) - 1e-9);
    for (let i = 0; i < 2 * want && w.action; i++) { col.starvationStage = 'brood-sacrifice'; sim.tick(); }
    expect(w.action).toBeNull();
    expect(sim.stores.brood.get(b.id)).toBeUndefined();
  });
});

describe('unload-crop (GDD 02 §5.3: no receiver, straight into the food chamber at half rate)', () => {
  it('moves the crop into the pool at 0.05 load/s x workRate down to TROPH_DONOR_MIN', () => {
    const k = colony({ stores: { c: 0.5, p: 0.2 } });
    const { sim, w } = k;
    run(sim, 30); // the colony counts its workers (a colony without workers keeps its pool closed)
    w.task = 'forage';
    stand(k, w, k.food);
    w.cropC = 0.8;
    const rate = 0.05 * workRate(sim, w);
    expect(begin(sim, w, 'unload-crop', null)).toBe(true);
    expect(w.pose).toBe(pose('troph-give'));
    run(sim, 50);
    expect(0.8 - w.cropC).toBeCloseTo(5 * rate, 2);
    for (let i = 0; i < 400 && w.action; i++) sim.tick();
    expect(w.action).toBeNull();
    expect(w.cropC).toBeCloseTo(0.05, 6);
  });
});
