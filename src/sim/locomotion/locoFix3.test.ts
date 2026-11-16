// loco-fix3 reduced cases: relocation is a last resort that terminates (a walker stuck again where it was relocated
// lets go, then fails with reason 'stuck-repeat' instead of being relocated again), failed walks say why
// (nav.failReason), a walker high on a stem with no climb route comes down to a goal on the ground (the tenders
// lost on a shrub at suburban-garden #2), and the gate finder finds the strip of a cell edge open under a raised
// board at a fence end (suburban-garden #4).
import { describe, expect, it } from 'vitest';
import type { Ant, Primitive } from '@/sim/types';
import { PrimFlag } from '@/sim/types';
import { TICKS_PER_SECOND } from '@/sim/time';
import { findGate } from './grid/gates';
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

/** Runs one stuck window: the walker made no progress since bestTick, so the ladder climbs one rung. */
function stall(sim: ReturnType<typeof locoSim>, ant: Ant, target: { x: number; y: number; z: number }): string {
  const r = rt(sim), s = scratchOf(ant);
  sim.state.tick += Math.ceil(r.P.stuckWindowS * TICKS_PER_SECOND) + 1;
  s.ladderUntil = 0;
  return checkStuck(sim, ant, s, r, ant.id, target);
}

/** A fresh request on the scratch (what navTo's begin() resets). */
function freshRequest(sim: ReturnType<typeof locoSim>, ant: Ant): void {
  const s = scratchOf(ant);
  s.req = 'goto'; s.ladder = 0; s.ladderUntil = 0; s.episodes = 0; s.relocations = 0; s.bestTick = sim.state.tick; s.reqTick = sim.state.tick;
}

describe('relocation terminates (loco-fix3 item 2)', () => {
  it('a walker stuck again where it was relocated lets go, then fails with stuck-repeat; no second relocation', () => {
    const sim = locoSim({ sizeBu: 128 });
    const bu = sim.world.bu, ant = sim.state.ants[0];
    const spot = v3(64 * bu, 0, 64 * bu);
    expect(placeOnSurface(sim, ant, spot)).toBe(true);
    const home = { ...ant.pos };
    const target = v3(66 * bu, 0, 64 * bu);
    const relocs = () => rt(sim).stats.relocations;
    freshRequest(sim, ant);
    // first request: rungs 1-4, then rung 5 relocates (once)
    const first = [1, 2, 3, 4, 5].map(() => stall(sim, ant, target));
    expect(first[4]).toBe('replan');
    expect(relocs()).toBe(1);
    // the walker slides back into the same spot; a new request gets stuck there again
    placeOnSurface(sim, ant, home);
    freshRequest(sim, ant);
    const second = [1, 2, 3, 4, 5].map(() => stall(sim, ant, target));
    expect(second[4]).toBe('replan'); // the different recovery: it let go, nothing teleported
    expect(ant.medium).toBe('air');
    expect(rt(sim).stats.relocRepeatDrops).toBe(1);
    placeOnSurface(sim, ant, home);
    freshRequest(sim, ant);
    const third = [1, 2, 3, 4, 5].map(() => stall(sim, ant, target));
    expect(third[4]).toBe('fail-repeat');
    // a later request stuck at the same place runs the rungs that move nobody, then fails instead of relocating
    freshRequest(sim, ant);
    const fourth = [1, 2, 3, 4, 5].map(() => stall(sim, ant, target));
    expect(fourth.slice(0, 4)).not.toContain('fail-repeat');
    expect(fourth[4]).toBe('fail-repeat');
    expect(relocs()).toBe(1);
  });

  it('after the let-go window the walker lets go again, but is never relocated from that place again', () => {
    const sim = locoSim({ sizeBu: 128 });
    const bu = sim.world.bu, ant = sim.state.ants[0];
    expect(placeOnSurface(sim, ant, v3(64 * bu, 0, 64 * bu))).toBe(true);
    const home = { ...ant.pos }, target = v3(66 * bu, 0, 64 * bu);
    freshRequest(sim, ant);
    for (let i = 0; i < 5; i++) stall(sim, ant, target);
    const s = scratchOf(ant);
    expect(s.relocTick).toBe(sim.state.tick);
    expect(s.relocHist?.length).toBe(6);
    for (let round = 0; round < 3; round++) {
      sim.state.tick += rt(sim).P.relocRepeatTicks + 1;
      placeOnSurface(sim, ant, home);
      freshRequest(sim, ant);
      const acts = [1, 2, 3, 4, 5].map(() => stall(sim, ant, target));
      expect(acts[4]).toBe('replan'); // a let-go, not a relocation
      placeOnSurface(sim, ant, home);
      freshRequest(sim, ant);
      expect([1, 2, 3, 4, 5].map(() => stall(sim, ant, target))[4]).toBe('fail-repeat');
    }
    expect(rt(sim).stats.relocRepeatDrops).toBe(3);
    expect(rt(sim).stats.relocations).toBe(1);
  });

  it('remembers its last relocMemory relocations: an older place counts too, the oldest beyond that is forgotten', () => {
    const sim = locoSim({ sizeBu: 128 });
    const bu = sim.world.bu, ant = sim.state.ants[0], P = rt(sim).P;
    const spots = [0, 1, 2, 3, 4].map((i) => v3((30 + 15 * i) * bu, 0, 64 * bu));
    const relocateAt = (p: ReturnType<typeof v3>) => {
      expect(placeOnSurface(sim, ant, p)).toBe(true);
      freshRequest(sim, ant);
      return [1, 2, 3, 4, 5].map(() => stall(sim, ant, v3(p.x + 2 * bu, 0, p.z)))[4];
    };
    for (const p of spots.slice(0, P.relocMemory)) expect(relocateAt(p)).toBe('replan');
    expect(rt(sim).stats.relocations).toBe(P.relocMemory);
    // the first place is still remembered: no relocation there
    expect(relocateAt(spots[0])).toBe('replan');
    expect(rt(sim).stats.relocations).toBe(P.relocMemory);
    expect(rt(sim).stats.relocRepeatDrops).toBe(1);
    // a fifth place pushes the first out of the memory
    expect(relocateAt(spots[4])).toBe('replan');
    expect(rt(sim).stats.relocations).toBe(P.relocMemory + 1);
    expect(scratchOf(ant).relocHist?.length).toBe(6 * P.relocMemory);
  });

  it('a destination within relocMin leaves nothing to relocate toward: the rung fails the walk, nothing is emitted', () => {
    const sim = locoSim({ sizeBu: 128 });
    const bu = sim.world.bu, ant = sim.state.ants[0];
    expect(placeOnSurface(sim, ant, v3(64 * bu, 0, 64 * bu))).toBe(true);
    ant.nav.dest = { x: ant.pos.x + 0.3 * bu, y: ant.pos.y, z: ant.pos.z };
    let unstuck = 0;
    sim.events.on('ant-unstuck', () => { unstuck++; });
    freshRequest(sim, ant);
    const acts = [1, 2, 3, 4, 5].map(() => stall(sim, ant, { ...ant.pos }));
    expect(acts[4]).toBe('fail');
    expect(rt(sim).stats.relocations).toBe(0);
    sim.events.flush();
    expect(unstuck).toBe(0);
  });

  it('a relocation target where the walker stands moves it toward its destination instead', () => {
    const sim = locoSim({ sizeBu: 128 });
    const bu = sim.world.bu, ant = sim.state.ants[0];
    expect(placeOnSurface(sim, ant, v3(64 * bu, 0, 64 * bu))).toBe(true);
    const x0 = ant.pos.x;
    ant.nav.dest = v3(80 * bu, 0, 64 * bu);
    freshRequest(sim, ant);
    for (let i = 0; i < 5; i++) stall(sim, ant, { ...ant.pos });
    expect(ant.pos.x - x0).toBeGreaterThan(0.9 * rt(sim).P.relocMin);
  });
});

describe('a trip asked for again while it runs keeps its stuck window (loco-fix3: re-issue loops never escalated)', () => {
  it('the same point carries the ladder over; another point starts a new one', () => {
    const sim = locoSim({ sizeBu: 128 });
    const bu = sim.world.bu, ant = sim.state.ants[0];
    expect(placeOnSurface(sim, ant, v3(40 * bu, 0, 64 * bu))).toBe(true);
    const goal = v3(100 * bu, 0, 64 * bu);
    expect(navTo(sim, ant, goal, 2 * bu)).toBe(true);
    const s = scratchOf(ant);
    s.bestTick = sim.state.tick - 20; s.ladder = 2; s.episodes = 3;
    for (let t = 0; t < 5; t++) sim.tick();
    const bestTick = s.bestTick, ladder = s.ladder, episodes = s.episodes;
    expect(navTo(sim, ant, v3(goal.x + 0.2 * bu, 0, goal.z), 2 * bu)).toBe(true);
    expect([s.bestTick, s.ladder, s.episodes]).toEqual([bestTick, ladder, episodes]);
    expect(navTo(sim, ant, v3(goal.x, 0, goal.z + 10 * bu), 2 * bu)).toBe(true);
    expect([s.bestTick, s.ladder, s.episodes]).toEqual([sim.state.tick, 0, 0]);
  });
});

describe('failed walks say why (loco-fix3: an answer the behaviour can read)', () => {
  it('a nest goal with its only exit filled fails with no-route; a gone target is rejected', () => {
    const sim = locoSim({ nest: 'small', workers: 2, sizeBu: 300 });
    const bu = sim.world.bu;
    const nest = playerNest(sim), deep = deepestChamber(nest), e = nest.entrances[0];
    const ants = workers(sim);
    placeInChamber(sim, ants, nest, deep);
    sim.kernel.fillSphere(v3(e.pos.x + 0.75 * bu, e.pos.y - 1.5 * bu, e.pos.z + 0.25 * bu), 2.5 * bu, {});
    navTo(sim, ants[0], v3(e.pos.x - 50 * bu, 0, e.pos.z), 2 * bu);
    runUntilDone(sim, [ants[0]], 6000);
    expect(ants[0].nav.status).toBe('failed');
    expect(['no-route', 'stuck', 'stuck-repeat', 'leg']).toContain(ants[0].nav.failReason);
    expect(navToTarget(sim, ants[1], { kind: 'ant', id: 999999, pos: v3(0, 0, 0) })).toBe(false);
    expect(ants[1].nav.failReason).toBe('rejected');
  });
});

describe('down from a stem with no climb route (loco-fix3 item 4)', () => {
  it('a walker high on a vertical stem walks down and reaches a goal on the ground', () => {
    const bu = 4;
    const stem: Primitive = {
      id: 1, shape: 'cylinder', pos: { x: 100 * bu, y: 100 * bu, z: 100 * bu }, rot: { ...ROT }, size: { x: 1.5 * bu, y: 100 * bu, z: 0 },
      round: 0.3 * bu, material: 'plant', flags: PrimFlag.CLIMBABLE, objectId: -1,
    };
    const sim = locoSim({ sizeBu: 200, prims: [stem] });
    const ant = sim.state.ants[0];
    sim.tick();
    expect(placeOnSurface(sim, ant, v3(103 * bu, 150 * bu, 100 * bu), { x: -1, y: 0, z: 0 })).toBe(true);
    expect(ant.pos.y).toBeGreaterThan(140 * bu);
    expect(Math.abs(ant.up.y)).toBeLessThan(0.3);
    const goal = v3(100 * bu, 0, 140 * bu);
    expect(navTo(sim, ant, goal, 2 * bu, { speed: 12 * bu })).toBe(true);
    let maxY = ant.pos.y;
    runUntilDone(sim, [ant], 120 * TICKS_PER_SECOND, () => { maxY = Math.max(maxY, ant.pos.y); });
    expect(ant.nav.status).toBe('arrived');
    expect(maxY).toBeLessThan(155 * bu);
  });
});

describe('edge gates (loco-fix3 item 3)', () => {
  // a 5.5 BU thick fence on the cell edge x = 192 BU (cells 16 BU): from z = 196 BU on it reaches the ground, below
  // that its board is raised 7 BU (the opening under a gravel board at a fence end)
  const bu = 4;
  const fence = [box(1, 192, 60, 250, 2.75, 60, 54, bu), box(2, 192, 67, 148, 2.75, 60, 48, bu)];

  it('finds the strip under the raised board when the straight crossing meets the fence', () => {
    const sim = locoSim({ sizeBu: 400, prims: fence });
    const g = findGate(sim.field, 184 * bu, 200 * bu, 200 * bu, 200 * bu, 16 * bu, bu);
    expect(g).not.toBeNull();
    expect(g!.entry.z / bu).toBeGreaterThan(192);
    expect(g!.entry.z / bu).toBeLessThan(196);
    expect(g!.entry.x / bu).toBeLessThan(189.25);
    expect(g!.exit.x / bu).toBeGreaterThan(194.75);
    // the opening is real: a body passes straight through the gate
    expect(sim.field.segmentFree({ ...g!.entry, y: g!.entry.y + bu }, { ...g!.exit, y: g!.exit.y + bu }, 0.45 * bu)).toBe(true);
  });

  it('no gate where the edge is open (nothing to find) or closed all along (the walker climbs, as before)', () => {
    const sim = locoSim({ sizeBu: 400, prims: fence });
    expect(findGate(sim.field, 184 * bu, 120 * bu, 200 * bu, 120 * bu, 16 * bu, bu)).toBeNull(); // under the raised board
    expect(findGate(sim.field, 184 * bu, 260 * bu, 200 * bu, 260 * bu, 16 * bu, bu)).toBeNull(); // fence to the ground
    expect(findGate(sim.field, 184 * bu, 200 * bu, 200 * bu, 216 * bu, 16 * bu, bu)).toBeNull(); // diagonal: no shared edge
  });

  // With this fence A* routes round through the cells under the raised board and inserts no gate; the gate insertion
  // itself is covered by locoFix3.verify.test.ts and the flow-field gates by locoFix3.review.test.ts.
  it('the planner gets a walk across the fence without climbing it', () => {
    const sim = locoSim({ sizeBu: 400, prims: fence });
    const ant = sim.state.ants[0];
    sim.tick();
    expect(placeOnSurface(sim, ant, v3(150 * bu, 0, 204 * bu))).toBe(true);
    expect(navTo(sim, ant, v3(240 * bu, 0, 204 * bu), 2 * bu, { speed: 12 * bu })).toBe(true);
    let maxY = -Infinity;
    runUntilDone(sim, [ant], 120 * TICKS_PER_SECOND, () => { maxY = Math.max(maxY, ant.pos.y); });
    expect(ant.nav.status).toBe('arrived');
    expect(maxY).toBeLessThan(sim.field.height(ant.pos.x, ant.pos.z) + 6 * bu);
  });
});
