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
import { navTo, placeOnSurface } from './index';
import { rt } from './runtime';
import { turnToward } from './steer';
import { locoSim, runUntilDone, v3 } from './testkit';

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
