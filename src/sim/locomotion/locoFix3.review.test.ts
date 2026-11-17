// Fixes from the review of loco-fix3 (reduced cases):
//  - a walker partway up a bare stem whose goal is higher up the same stem climbs on; a goal on another object
//    still sends it down first (trip.ts sameObject / planDescent)
//  - edge gates on the entrance flow field (navGridImpl flowNext): entry, then exit, and a walker in the lane keeps
//    to it after the edge
//  - a walker on a steep face whose goal lies straight out from the face steps down off it (steer.ts turnToward)
import { describe, expect, it } from 'vitest';
import type { Primitive } from '@/sim/types';
import { PrimFlag } from '@/sim/types';
import { TICKS_PER_SECOND } from '@/sim/time';
import { isLocoNavGrid } from './grid/navGridImpl';
import { navTo, navToTarget, placeOnSurface } from './index';
import { rt } from './runtime';
import { turnToward } from './steer';
import { scratchOf } from './scratch';
import { aiSpeed, casteSpeeds } from './speed';
import { accrueTravel, pauseStall, travelShort } from './stuck';
import { deepestChamber, locoSim, playerNest, runUntilDone, v3, workers } from './testkit';

const ROT = { x: 0, y: 0, z: 0, w: 1 };
const bu = 4;

function stem(id: number, x: number, z: number, objectId = -1): Primitive {
  return {
    id, shape: 'cylinder', pos: { x: x * bu, y: 100 * bu, z: z * bu }, rot: { ...ROT }, size: { x: 1.5 * bu, y: 100 * bu, z: 0 },
    round: 0.3 * bu, material: 'plant', flags: PrimFlag.CLIMBABLE, objectId,
  };
}

/** Runs a walk on a stem; returns the status, game seconds taken, lowest y (BU) after the start and the largest drop. */
function climb(prims: Primitive[], startY: number, goal: { x: number; y: number; z: number }): { status: string; s: number; minY: number; drop: number } {
  const sim = locoSim({ sizeBu: 200, prims });
  const ant = sim.state.ants[0];
  sim.tick();
  expect(placeOnSurface(sim, ant, v3(103 * bu, startY * bu, 100 * bu), startY > 1 ? { x: -1, y: 0, z: 0 } : undefined)).toBe(true);
  expect(navTo(sim, ant, v3(goal.x * bu, goal.y * bu, goal.z * bu), 2 * bu, { speed: 12 * bu })).toBe(true);
  let minY = ant.pos.y, maxY = ant.pos.y, drop = 0;
  const ticks = runUntilDone(sim, [ant], 300 * TICKS_PER_SECOND, () => {
    minY = Math.min(minY, ant.pos.y); maxY = Math.max(maxY, ant.pos.y); drop = Math.max(drop, maxY - ant.pos.y);
  });
  return { status: ant.nav.status, s: ticks / TICKS_PER_SECOND, minY: minY / bu, drop: drop / bu };
}

describe('a goal up the same stem (no climb route) is climbed to', () => {
  it('from 60 BU up to 180 BU: no descent on the way', () => {
    const r = climb([stem(1, 100, 100)], 60, { x: 101.6, y: 180, z: 100 });
    expect(r.status).toBe('arrived');
    expect(r.drop).toBeLessThan(5);
    expect(r.s).toBeLessThan(40);
  });

  it('from the base to 150 BU: once up, replans do not send it back down', () => {
    const r = climb([stem(1, 100, 100)], 0, { x: 101.6, y: 150, z: 100 });
    expect(r.status).toBe('arrived');
    expect(r.drop).toBeLessThan(5);
  });

  it('a goal on another stem still sends the walker down first, and it gets there', () => {
    const r = climb([stem(1, 100, 100), stem(2, 100, 140)], 60, { x: 101.6, y: 60, z: 140 });
    expect(r.status).toBe('arrived');
    expect(r.minY).toBeLessThan(5);
  });

  it('two prims of one object (objectId) count as the same object', () => {
    const r = climb([stem(1, 100, 100, 7), { ...stem(2, 100, 100, 7), pos: { x: 100 * bu, y: 250 * bu, z: 100 * bu }, size: { x: 1.2 * bu, y: 50 * bu, z: 0 } }],
      60, { x: 101.3, y: 230, z: 100 });
    expect(r.status).toBe('arrived');
    expect(r.drop).toBeLessThan(5);
  });
});

describe('a goal served by a climb route is reached by the route, also from a root of the same tree', () => {
  // suburban-garden #2 (review, 9 relocations at (1982, 12.7, 2784) BU): tenders on a root of the fruit tree aimed in
  // 3D at a herd 280 BU up the trunk (same object, so no descent) and wedged where the root meets the trunk; the
  // tree has climb routes, which they never took
  it('from the top of a root, the walker comes down, walks to the route base and climbs the route', () => {
    const trunk: Primitive = {
      id: 1, shape: 'cylinder', pos: { x: 60 * bu, y: 100 * bu, z: 60 * bu }, rot: { ...ROT }, size: { x: 3 * bu, y: 100 * bu, z: 0 },
      round: 0.3 * bu, material: 'wood-sound', flags: PrimFlag.CLIMBABLE, objectId: 7,
    };
    // a root along +x: a capsule lying on the ground (the capsule axis Y turned onto X), top 5 BU up
    const s = Math.SQRT1_2;
    const root: Primitive = {
      id: 2, shape: 'capsule', pos: { x: 80 * bu, y: 2.5 * bu, z: 60 * bu }, rot: { x: 0, y: 0, z: -s, w: s }, size: { x: 2.5 * bu, y: 17 * bu, z: 0 },
      round: 0, material: 'wood-sound', flags: PrimFlag.CLIMBABLE, objectId: 7,
    };
    const sim = locoSim({ sizeBu: 200, prims: [trunk, root] });
    const pts = [];
    for (let y = 0.5; y <= 190; y += 2) pts.push({ x: 60 * bu, y: y * bu, z: 56.2 * bu });
    sim.world.climbRoutes.push({ id: 900, kind: 'stem', objectId: 7, points: pts, lengthBu: 190 } as (typeof sim.world.climbRoutes)[number]);
    const ant = sim.state.ants[0];
    sim.tick();
    // on the root, 30 BU from the trunk (farther than routeSnap and routeGoal from every route node)
    expect(placeOnSurface(sim, ant, v3(90 * bu, 8 * bu, 60 * bu))).toBe(true);
    expect(ant.pos.y / bu).toBeGreaterThan(4);
    expect(navTo(sim, ant, v3(60 * bu, 180 * bu, 56.9 * bu), 1 * bu)).toBe(true);
    sim.tick();
    // the first leg is not the 3D aim at the herd (the walker walks off the root toward the route's base)
    expect(ant.nav.mode === 'seek' && scratchOf(ant).seekDown === 1).toBe(false);
    let climbed = false;
    runUntilDone(sim, [ant], 300 * TICKS_PER_SECOND, () => { if (ant.nav.mode === 'climb' && ant.nav.routeId === 900) climbed = true; });
    expect(ant.nav.status).toBe('arrived');
    expect(climbed).toBe(true);
    expect(rt(sim).stats.relocations).toBe(0);
  });
});

describe('a climb route whose base is itself up (on a root flare) does not hold a walker at its foot', () => {
  // suburban-garden #2 (review, 3 relocations of returning tenders at (2022, 8.6, 2683) BU, and an idle worker whose
  // walk failed 198 times at (2032, 8, 2720) BU): the fruit tree's route starts 7 BU above the terrain, on the root
  // flare. A walker at its foot still counts as 'up', so planDescent sent it down the route again (node 1 -> 0), the
  // leg ended at once, and so on; a walker on the trunk with no route near sought the terrain under the flare, a point
  // inside a solid
  // the flare is embedded in the ground (top 5 BU up), as a root is
  function flareSim(withRoute: boolean) {
    const flare: Primitive = {
      id: 1, shape: 'box', pos: { x: 60 * bu, y: 1 * bu, z: 60 * bu }, rot: { ...ROT }, size: { x: 7 * bu, y: 4 * bu, z: 7 * bu },
      round: 0.3 * bu, material: 'wood-sound', flags: PrimFlag.CLIMBABLE, objectId: 7,
    };
    const trunk: Primitive = {
      id: 2, shape: 'cylinder', pos: { x: 60 * bu, y: 100 * bu, z: 60 * bu }, rot: { ...ROT }, size: { x: 3 * bu, y: 100 * bu, z: 0 },
      round: 0.3 * bu, material: 'wood-sound', flags: PrimFlag.CLIMBABLE, objectId: 7,
    };
    const sim = locoSim({ sizeBu: 200, prims: [flare, trunk] });
    const pts = [];
    for (let y = 5.3; y <= 150; y += 2) pts.push({ x: 60 * bu, y: y * bu, z: 56.7 * bu });
    if (withRoute) sim.world.climbRoutes.push({ id: 901, kind: 'stem', objectId: 7, points: pts, lengthBu: 145 } as (typeof sim.world.climbRoutes)[number]);
    sim.tick();
    return sim;
  }

  function walkHome(sim: ReturnType<typeof locoSim>, start: { x: number; y: number; z: number }, up?: { x: number; y: number; z: number }) {
    const ant = sim.state.ants[0];
    expect(placeOnSurface(sim, ant, v3(start.x * bu, start.y * bu, start.z * bu), up)).toBe(true);
    expect(ant.pos.y / bu).toBeGreaterThan(4);
    expect(navTo(sim, ant, v3(100 * bu, 0, 60 * bu), 1 * bu)).toBe(true);
    runUntilDone(sim, [ant], 120 * TICKS_PER_SECOND);
    expect(ant.nav.status).toBe('arrived');
    expect(rt(sim).stats.relocations).toBe(0);
    expect(rt(sim).stats.stuckEpisodes).toBe(0);
  }

  it('a walker at the foot of the route walks off the flare to a goal on the ground', () => {
    walkHome(flareSim(true), { x: 60, y: 7, z: 55.5 });
  });

  it('a walker a little way up the trunk next to the route foot gets down too', () => {
    walkHome(flareSim(true), { x: 60, y: 9, z: 56.5 }, { x: 0, y: 0, z: 1 });
  });

  it('with no route, a walker on the trunk seeks the top of the flare below it, not the terrain inside it', () => {
    const sim = flareSim(false), ant = sim.state.ants[0];
    expect(placeOnSurface(sim, ant, v3(63.6 * bu, 12 * bu, 60 * bu), { x: -1, y: 0, z: 0 })).toBe(true);
    expect(navTo(sim, ant, v3(100 * bu, 0, 60 * bu), 1 * bu)).toBe(true);
    sim.tick();
    const s = scratchOf(ant);
    expect(ant.nav.mode === 'seek' && s.seekDown === 1).toBe(true);
    expect(s.seekTarget.y / bu).toBeGreaterThan(4);
    expect(sim.field.sample(s.seekTarget)).toBeGreaterThan(-0.1 * bu);
    runUntilDone(sim, [ant], 120 * TICKS_PER_SECOND);
    expect(ant.nav.status).toBe('arrived');
    expect(rt(sim).stats.relocations).toBe(0);
  });
});

describe('edge gates on the entrance flow field (navGridImpl flowNext)', () => {
  // the world of locoFix3.verify.test.ts: tall blocks leave one way from the west, the shared edge x = 192 BU of the
  // cells W (176..192, 192..208) and E (192..208, 192..208) BU; a fence on it reaches the ground from z = 196 BU on,
  // its board raised 7 BU below that. A flow field seeded east of the fence.
  function slab(id: number, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, flags: number): Primitive {
    return {
      id, shape: 'box', pos: { x: 0.5 * (x0 + x1) * bu, y: 0.5 * (y0 + y1) * bu, z: 0.5 * (z0 + z1) * bu }, rot: { ...ROT },
      size: { x: 0.5 * (x1 - x0) * bu, y: 0.5 * (y1 - y0) * bu, z: 0.5 * (z1 - z0) * bu }, round: 0.25 * bu, material: 'wood-sound', flags, objectId: -1,
    };
  }
  const prims = [
    slab(101, 0, 192, -5, 40, 208, 400, 0), slab(102, 176, 400, -5, 40, 0, 192, 0), slab(105, 192, 208, -5, 40, 208, 224, 0),
    slab(103, 189.25, 194.75, -5, 40, 196, 208, PrimFlag.CLIMBABLE), slab(104, 189.25, 194.75, 7, 40, 191, 196, PrimFlag.CLIMBABLE),
  ];

  it('steers at the gate entry, then from the entry to the exit, and keeps to the lane past the edge', () => {
    const sim = locoSim({ sizeBu: 400, prims });
    sim.tick(); // attaches the world field to the nav grid
    const g = sim.navGrid;
    if (!isLocoNavGrid(g)) throw new Error('loco nav grid expected');
    const flow = g.flowField('test:east', 'v1', [v3(214 * bu, 0, 200 * bu)]);
    const out = v3(0, 0, 0);
    g.flowNext(flow, v3(181 * bu, 0, 202 * bu), 1, out);
    expect(g.stats().flowGates).toBe(1);
    expect(out.x / bu).toBeLessThan(189.25);
    expect(out.z / bu).toBeGreaterThan(192);
    expect(out.z / bu).toBeLessThan(196);
    const entry = { ...out };
    g.flowNext(flow, entry, 2, out);
    expect(out.x / bu).toBeGreaterThan(194.75);
    expect(Math.abs(out.z - entry.z)).toBeLessThan(0.01);
    const exit = { ...out };
    // past the edge, still under the board: keeps to the exit (cell E, the lane of the gate behind it)
    g.flowNext(flow, v3(193 * bu, 0, entry.z), 2, out);
    expect(out).toEqual(exit);
    // a walker hugging the wall beside the strip is in the lane too
    g.flowNext(flow, v3(189 * bu, 0, 192.2 * bu), 1, out);
    expect(out).toEqual(exit);
    // clear of the board: the flow goes on to the cells beyond
    g.flowNext(flow, v3(197 * bu, 0, entry.z), 1, out);
    expect(out.x / bu).toBeGreaterThan(200);
  });
});

describe('a flow-field step from a cell the flow does not reach (navGridImpl flowNext)', () => {
  // suburban-garden #2 (review): trips home from the roots of the fruit tree, inside its blocked footprint, failed
  // with 'leg' thousands of times on the spot: the walker's cell (snapped to an open pocket) had no flow value
  it('heads for the nearest cell the flow reaches instead of failing', () => {
    const sim = locoSim({ sizeBu: 200 });
    const g = sim.navGrid;
    expect(isLocoNavGrid(g)).toBe(true);
    if (!isLocoNavGrid(g)) return;
    const n = Math.round(sim.world.size / g.cell);
    // a flow toward cell (2, 2); the cells around the walker's cell (6, 6) are not reached
    const dist = new Float32Array(n * n);
    for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) dist[z * n + x] = Math.max(Math.abs(x - 2), Math.abs(z - 2));
    for (let z = 5; z <= 7; z++) for (let x = 5; x <= 7; x++) dist[z * n + x] = Infinity;
    const p = v3(6.5 * g.cell, 0, 6.5 * g.cell), out = v3(0, 0, 0);
    const d = g.flowNext(dist, p, 2, out);
    expect(Number.isFinite(d)).toBe(true);
    const cx = Math.floor(out.x / g.cell), cz = Math.floor(out.z / g.cell);
    expect(Math.max(Math.abs(cx - 6), Math.abs(cz - 6))).toBe(2);
    expect(Number.isFinite(dist[cz * n + cx])).toBe(true);
    // nowhere reached within the snap radius: still no step
    dist.fill(Infinity);
    expect(Number.isFinite(g.flowNext(dist, p, 2, out))).toBe(false);
  });
});

describe('a new walk from the lip of an entrance (update.ts mouthHold)', () => {
  // suburban-garden #2 (review): workers on the lip of the entrance, last walk a nest leg, were held 'in the nest' by
  // the mouth hysteresis on their next request; the nest field does not reach the lip, so the walk failed with 'leg'
  // at once, the behaviour asked again on the next tick, thousands of times, and the walker never moved
  it('walks in instead of failing on the spot', () => {
    const sim = locoSim({ nest: 'small', workers: 1, sizeBu: 300 });
    const nest = playerNest(sim), e = nest.entrances[0], c = deepestChamber(nest), ant = workers(sim)[0];
    sim.tick();
    // on the ground just outside the hole, within the mouth's rim
    const off = e.radius + 1.2 * bu;
    expect(placeOnSurface(sim, ant, v3(e.pos.x + off, e.pos.y + 2 * bu, e.pos.z))).toBe(true);
    ant.nestId = -1; ant.chamberId = -1;
    expect(ant.medium).toBe('surface');
    // the last walk was a nest leg of this nest (what a walker that just came out over the lip still carries)
    scratchOf(ant).legNest = nest.id;
    expect(navToTarget(sim, ant, { kind: 'chamber', id: c.id, pos: c.center }, 2 * bu)).toBe(true);
    sim.tick();
    expect(ant.nav.status).toBe('moving');
    runUntilDone(sim, [ant], 120 * TICKS_PER_SECOND);
    expect(ant.nav.status).toBe('arrived');
  });
});

describe('stepping off a wall (steer.ts turnToward)', () => {
  it('on a vertical face, a goal straight out from the face turns the walker down the face, not up it', () => {
    const wall: Primitive = {
      id: 1, shape: 'box', pos: { x: 100 * bu, y: 20 * bu, z: 100 * bu }, rot: { ...ROT }, size: { x: 2 * bu, y: 20 * bu, z: 20 * bu },
      round: 0.25 * bu, material: 'wood-sound', flags: PrimFlag.CLIMBABLE, objectId: -1,
    };
    const sim = locoSim({ sizeBu: 200, prims: [wall] });
    const ant = sim.state.ants[0];
    expect(placeOnSurface(sim, ant, v3(103 * bu, 3 * bu, 100 * bu), { x: -1, y: 0, z: 0 })).toBe(true);
    expect(ant.up.x).toBeGreaterThan(0.9);
    ant.fwd = { x: 0, y: 1, z: 0 };
    const P = rt(sim).P;
    for (let i = 0; i < 20; i++) turnToward(ant, { x: 1, y: 0, z: 0 }, 0.5, P.minSteer, P.pinnedUpY);
    expect(ant.fwd.y).toBeLessThan(-0.9);
    // without the steep limit (the old rule) the heading is kept
    ant.fwd = { x: 0, y: 1, z: 0 };
    turnToward(ant, { x: 1, y: 0, z: 0 }, 0.5, P.minSteer);
    expect(ant.fwd.y).toBeCloseTo(1, 5);
    // pushing into the wall still climbs (heading kept)
    turnToward(ant, { x: -1, y: 0, z: 0 }, 0.5, P.minSteer, P.pinnedUpY);
    expect(ant.fwd.y).toBeCloseTo(1, 5);
  });
});

describe('a walker slowed by the cold is not stuck (stuckTravel; review AC2: 120 of 126 relocations were cold walkers)', () => {
  it('crawling at 0.12 BU/s to a point 12 BU away: no stuck episode, no relocation, it gets there', () => {
    const sim = locoSim({ sizeBu: 128 });
    const ant = sim.state.ants[0];
    expect(placeOnSurface(sim, ant, v3(50 * bu, 0, 64 * bu))).toBe(true);
    // the speed factor a worker has at about 5 degrees C body temperature (suburban-garden #2, late autumn)
    expect(navTo(sim, ant, v3(62 * bu, 0, 64 * bu), 1 * bu, { speedMult: 0.02 })).toBe(true);
    const ticks = runUntilDone(sim, [ant], 200 * TICKS_PER_SECOND);
    const st = rt(sim).stats;
    expect(ant.nav.status).toBe('arrived');
    expect(st.stuckEpisodes).toBe(0);
    expect(st.relocations).toBe(0);
    expect(ticks / TICKS_PER_SECOND).toBeGreaterThan(60);
  });

  it('a walker that cannot move at all (speed 0) waits for its timeout instead of climbing the ladder', () => {
    const sim = locoSim({ sizeBu: 128 });
    const ant = sim.state.ants[0];
    expect(placeOnSurface(sim, ant, v3(50 * bu, 0, 64 * bu))).toBe(true);
    const from = { ...ant.pos };
    expect(navTo(sim, ant, v3(56 * bu, 0, 64 * bu), 1 * bu, { speed: 0 })).toBe(true);
    runUntilDone(sim, [ant], 400 * TICKS_PER_SECOND);
    const st = rt(sim).stats;
    expect(ant.nav.status).toBe('failed');
    expect(ant.nav.failReason).toBe('timeout');
    expect(st.stuckEpisodes).toBe(0);
    expect(st.relocations).toBe(0);
    expect(Math.hypot(ant.pos.x - from.x, ant.pos.z - from.z)).toBeLessThan(0.1 * bu);
  });

  it('at cruise, loaded or not, the walker covers stuckTravel within the window (the window decides, as before); below a crawl nothing counts', () => {
    const sim = locoSim({ sizeBu: 128 });
    const ant = sim.state.ants[0];
    const r = rt(sim), s = scratchOf(ant);
    s.speedKind = 'cruise'; s.speedMult = 1;
    const cs = casteSpeeds(sim.species.id, ant.caste, bu);
    expect(aiSpeed(sim, ant, s, r.P) * r.P.stuckWindowS).toBeGreaterThanOrEqual(r.P.stuckTravel);
    expect(cs.cruise * cs.load * r.P.stuckWindowS).toBeGreaterThanOrEqual(r.P.stuckTravel);
    // and the count restarts with every new bestTick
    s.bestTick = 10; accrueTravel(s, cs.cruise, 0.1, r.P);
    expect(travelShort(s, r.P)).toBe(true);
    for (let k = 0; k < r.P.stuckWindowS * TICKS_PER_SECOND; k++) accrueTravel(s, cs.cruise, 0.1, r.P);
    expect(travelShort(s, r.P)).toBe(false);
    s.bestTick = 40; accrueTravel(s, cs.cruise, 0.1, r.P);
    expect(travelShort(s, r.P)).toBe(true);
    // a pause (stunned, dozing) moves the window on with the step, LOD step included, and keeps the count with it
    s.bestTick = 100; accrueTravel(s, cs.cruise, 0.1, r.P);
    const t0 = s.stallTravel;
    for (let t = 105; t <= 400; t += 5) pauseStall(s, t, 5);
    expect(s.bestTick).toBe(400);
    expect(s.stallFrom).toBe(s.bestTick);
    expect(s.stallTravel).toBe(t0);
    // slower than a crawl (held still by the cold): nothing counts, however long
    s.bestTick = 50;
    for (let k = 0; k < 10_000; k++) accrueTravel(s, 0.9 * r.P.stuckCrawl, 0.1, r.P);
    expect(travelShort(s, r.P)).toBe(true);
  });
});
