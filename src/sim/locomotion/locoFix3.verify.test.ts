// Independent review of loco-fix3 (verify). Each case tries to break one claim of the implementation:
//  - nav.failReason is "cleared by the next request" (src/sim/types/walker.ts NavState.failReason)
//  - edge gates make the nav grid true for the game's walker (item 3), also on a homeward trip, which follows the
//    nest's entrance flow field rather than an A* path
//  - relocation terminates: "none repeated for the same walker at the same place" (AC2), also across the repeat window
//  - the gate finder on degenerate input (zero-size cell, a non-finite `near`)
//  - the let-go escalation for a walker inside a nest chamber
//  - planDescent does not send a walker climbing to an elevated goal back to the ground
// Failing cases here demonstrate real gaps and are left in place for the fixer.
import { describe, expect, it } from 'vitest';
import type { Ant, Primitive } from '@/sim/types';
import { PrimFlag } from '@/sim/types';
import { TICKS_PER_SECOND } from '@/sim/time';
import { findGate } from './grid/gates';
import { isLocoNavGrid } from './grid/navGridImpl';
import { navTo, navToTarget, placeOnSurface } from './index';
import { rt } from './runtime';
import { scratchOf } from './scratch';
import { checkStuck } from './stuck';
import { deepestChamber, locoSim, placeInChamber, playerNest, runUntilDone, v3, workers } from './testkit';

const ROT = { x: 0, y: 0, z: 0, w: 1 };

function box(id: number, x: number, y: number, z: number, hx: number, hy: number, hz: number, bu: number): Primitive {
  return {
    id, shape: 'box', pos: { x: x * bu, y: y * bu, z: z * bu }, rot: { ...ROT }, size: { x: hx * bu, y: hy * bu, z: hz * bu },
    round: 0.25 * bu, material: 'wood-sound', flags: PrimFlag.CLIMBABLE, objectId: -1,
  };
}

function stall(sim: ReturnType<typeof locoSim>, ant: Ant, target: { x: number; y: number; z: number }, extraTicks = 0): string {
  const r = rt(sim), s = scratchOf(ant);
  sim.state.tick += Math.ceil(r.P.stuckWindowS * TICKS_PER_SECOND) + 1 + extraTicks;
  s.ladderUntil = 0;
  return checkStuck(sim, ant, s, r, ant.id, target);
}

function freshRequest(sim: ReturnType<typeof locoSim>, ant: Ant): void {
  const s = scratchOf(ant);
  s.req = 'goto'; s.ladder = 0; s.ladderUntil = 0; s.episodes = 0; s.relocations = 0; s.bestTick = sim.state.tick; s.reqTick = sim.state.tick;
}

describe('nav.failReason contract', () => {
  it('is cleared by the next request, as NavState.failReason documents', () => {
    const sim = locoSim({ nest: 'small', workers: 1, sizeBu: 300 });
    const ant = workers(sim)[0];
    expect(navToTarget(sim, ant, { kind: 'ant', id: 999999, pos: v3(0, 0, 0) })).toBe(false);
    expect(ant.nav.failReason).toBe('rejected');
    const nest = playerNest(sim);
    const c = deepestChamber(nest);
    expect(navToTarget(sim, ant, { kind: 'chamber', id: c.id, pos: c.center }, 2 * sim.world.bu)).toBe(true);
    expect(ant.nav.status).toBe('moving');
    // a 'moving' (later 'arrived') request still reports why the previous one failed
    expect(ant.nav.failReason).toBeUndefined();
  });
});

describe('edge gates on a homeward trip (entrance flow field)', () => {
  // Two tall blocks leave one way from the south-west quarter to the north-east one, where the test nest's entrance
  // lies ((214, 0, 200) BU): the side-by-side cells W (176..192, 192..208) and E (192..208, 192..208) BU (cells 16
  // BU). A fence on their shared edge x = 192 BU reaches the ground from z = 196 BU on; below that its board is
  // raised 7 BU (the suburban-garden #4 opening). The A* planner inserts the gate (guard); a trip home follows the
  // nest's entrance flow field, which steers at cell centres and has no gate.
  const bu = 4;
  function slab(id: number, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, flags: number): Primitive {
    return {
      id, shape: 'box', pos: { x: 0.5 * (x0 + x1) * bu, y: 0.5 * (y0 + y1) * bu, z: 0.5 * (z0 + z1) * bu }, rot: { ...ROT },
      size: { x: 0.5 * (x1 - x0) * bu, y: 0.5 * (y1 - y0) * bu, z: 0.5 * (z1 - z0) * bu }, round: 0.25 * bu, material: 'wood-sound', flags, objectId: -1,
    };
  }
  const prims = [
    slab(101, 0, 192, -5, 40, 208, 400, 0),
    slab(102, 176, 400, -5, 40, 0, 192, 0),
    slab(105, 192, 208, -5, 40, 208, 224, 0),
    slab(103, 189.25, 194.75, -5, 40, 196, 208, PrimFlag.CLIMBABLE),
    slab(104, 189.25, 194.75, 7, 40, 191, 196, PrimFlag.CLIMBABLE),
  ];

  function runHome(kind: 'point' | 'nest'): { status: string; climbBu: number; gates: number } {
    const sim = locoSim({ nest: 'small', workers: 1, sizeBu: 400, prims });
    const ant = workers(sim)[0];
    sim.tick();
    expect(placeOnSurface(sim, ant, v3(120 * bu, 0, 120 * bu))).toBe(true);
    ant.nestId = -1; ant.chamberId = -1;
    const nest = playerNest(sim), e = nest.entrances[0];
    const ok = kind === 'point'
      ? navTo(sim, ant, v3(e.pos.x - 6 * bu, 0, e.pos.z), 2 * bu, { speed: 12 * bu })
      : navToTarget(sim, ant, { kind: 'nest', id: nest.id, pos: e.pos }, 2 * bu, { speed: 12 * bu });
    expect(ok).toBe(true);
    let climb = 0;
    runUntilDone(sim, [ant], 180 * TICKS_PER_SECOND, () => {
      if (ant.medium === 'surface') climb = Math.max(climb, ant.pos.y - sim.field.height(ant.pos.x, ant.pos.z));
    });
    const g = sim.navGrid;
    return { status: ant.nav.status, climbBu: climb / bu, gates: isLocoNavGrid(g) ? g.stats().gates : -1 };
  }

  it('a point trip (A* path) goes through the strip under the raised board (guard: the gate is used)', () => {
    const r = runHome('point');
    expect(r.gates).toBeGreaterThan(0);
    expect(r.status).toBe('arrived');
    expect(r.climbBu).toBeLessThan(6);
  });

  it('a trip home into the nest goes through the same strip, not up the fence', () => {
    const r = runHome('nest');
    expect(r.status).toBe('arrived');
    expect(r.climbBu).toBeLessThan(6);
  });
});

describe('relocation terminates for good (AC2: none repeated for the same walker at the same place)', () => {
  it('a walker wedged at one spot for 20 game minutes is relocated from there once at most', () => {
    const sim = locoSim({ sizeBu: 128 });
    const bu = sim.world.bu, ant = sim.state.ants[0];
    expect(placeOnSurface(sim, ant, v3(64 * bu, 0, 64 * bu))).toBe(true);
    const home = { ...ant.pos }, target = v3(66 * bu, 0, 64 * bu);
    const P = rt(sim).P;
    const start = sim.state.tick;
    // the behaviour re-issues its walk after each failure; the walker slides back to the same spot each time
    while (sim.state.tick - start < 4 * P.relocRepeatTicks) {
      placeOnSurface(sim, ant, home);
      freshRequest(sim, ant);
      for (let i = 0; i < 5; i++) stall(sim, ant, target, 200);
    }
    expect(rt(sim).stats.relocations).toBeLessThanOrEqual(1);
  });
});

describe('findGate on degenerate input', () => {
  const bu = 4;
  const fence = [box(1, 192, 60, 250, 2.75, 60, 54, bu), box(2, 192, 67, 148, 2.75, 60, 48, bu)];

  it('a non-finite near point still gives a finite gate (or none), never NaN points', () => {
    const sim = locoSim({ sizeBu: 400, prims: fence });
    const g = findGate(sim.field, 184 * bu, 200 * bu, 200 * bu, 200 * bu, 16 * bu, bu, v3(NaN, 0, NaN));
    if (g) for (const p of [g.entry, g.exit]) expect(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)).toBe(true);
  });

  it('a zero cell size returns null without looping', () => {
    const sim = locoSim({ sizeBu: 400, prims: fence });
    expect(findGate(sim.field, 184 * bu, 200 * bu, 184 * bu, 200 * bu, 0, bu)).toBeNull();
  });
});

describe('the let-go escalation in a nest cavity', () => {
  it('a walker stuck again in a chamber where it was relocated does not end up in the air outside the nest', () => {
    const sim = locoSim({ nest: 'small', workers: 1, sizeBu: 300 });
    const nest = playerNest(sim), c = deepestChamber(nest), ant = workers(sim)[0];
    placeInChamber(sim, [ant], nest, c);
    const home = { ...ant.pos };
    const target = v3(c.center.x + 0.5 * c.radii.x, c.center.y, c.center.z);
    ant.nav.dest = { ...target };
    freshRequest(sim, ant);
    for (let i = 0; i < 5; i++) stall(sim, ant, target);
    placeOnSurface(sim, ant, home, { x: 0, y: -1, z: 0 });
    freshRequest(sim, ant);
    for (let i = 0; i < 5; i++) stall(sim, ant, target);
    for (let t = 0; t < 50; t++) sim.tick();
    expect(Number.isFinite(ant.pos.x) && Number.isFinite(ant.pos.y)).toBe(true);
    expect(ant.pos.y).toBeLessThan(nest.entrances[0].pos.y);
  });
});

describe('planDescent and an elevated goal on the same stem (no climb route)', () => {
  // trip.ts planLeg -> planDescent: a walker more than `elevated` up a steep face whose goal is farther than
  // routeGoal is sent straight down, even when the goal is higher up the same stem. On the tree before loco-fix3
  // (test-output/loco-fix3/snap-before) the 30 -> 150 BU climb took 18 s with no descent.
  it('a walker 30 BU up a bare stem heading for a goal at 150 BU keeps climbing (does not walk to the ground first)', () => {
    const bu = 4;
    const stem: Primitive = {
      id: 1, shape: 'cylinder', pos: { x: 100 * bu, y: 100 * bu, z: 100 * bu }, rot: { ...ROT }, size: { x: 1.5 * bu, y: 100 * bu, z: 0 },
      round: 0.3 * bu, material: 'plant', flags: PrimFlag.CLIMBABLE, objectId: -1,
    };
    const sim = locoSim({ sizeBu: 200, prims: [stem] });
    const ant = sim.state.ants[0];
    sim.tick();
    expect(placeOnSurface(sim, ant, v3(103 * bu, 30 * bu, 100 * bu), { x: -1, y: 0, z: 0 })).toBe(true);
    expect(navTo(sim, ant, v3(101.6 * bu, 150 * bu, 100 * bu), 2 * bu, { speed: 12 * bu })).toBe(true);
    let minY = ant.pos.y;
    runUntilDone(sim, [ant], 300 * TICKS_PER_SECOND, () => { minY = Math.min(minY, ant.pos.y); });
    expect(ant.nav.status).toBe('arrived');
    expect(minY / bu).toBeGreaterThan(20);
  });
});
