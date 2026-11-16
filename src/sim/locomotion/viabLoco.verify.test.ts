// Reviewer tests for viab-loco (adversarial): the bracketed projection and its jump hop on an analytic field, the
// stall watch's blind spots and bookkeeping, the crowd grid against brute force, the map limit at corners and in a
// fall, the water medium after a puddle dries, and restore-at-N with puddles on the nav grid.
import { describe, expect, it } from 'vitest';
import type { Vec3 } from '@/core/math/vec3';
import { rngFloat, rngSeed } from '@/core/rng';
import type { Ant, Sim } from '@/sim/types';
import type { WorldField } from '@/sim/world/field';
import { killAnt } from '@/sim/entities';
import { WX_PUDDLE_AVOID_BU, WX_PUDDLE_BLOCK_BU, WX_PUDDLE_UNIT_MM } from '@/sim/balance/weather';
import { collectInvariants } from '@/sim/testing/invariants';
import { makeTestSim, makeTestWorld } from '@/sim/testing';
import { createSim } from '@/sim/sim';
import { SYSTEMS } from '@/sim/systems';
import { restore, snapshot, stateHash } from '@/sim/save';
import { navStop, navTo, navWander, placeOnSurface, stalledAnts } from './index';
import { NeighbourGrid } from './neighbours';
import { rt } from './runtime';
import { locoSim, v3, workers } from './testkit';
import { createWalkerKin, walkerLetGo, walkerStep, type WalkStatus } from './walker';
import { walkerParamsForBU } from './walkerParams';

const BU = 4;

/**
 * An analytic field: the plane f = y for x < 0; for x >= 0 a field with a jump at y = a (f = y above, y - J below)
 * and no root of f = foot when a - J < foot < a. Newton is a plain iteration along +Y (it cycles at the jump).
 */
function jumpField(a: number, J: number): WorldField {
  const f = (x: number, y: number) => (x < 0 ? y : y >= a ? y : y - J);
  const field = {
    bu: BU,
    minHeight: -100 * BU,
    params: { traceMinStep: 0.01 },
    sampleXYZ: (x: number, y: number) => f(x, y),
    sample: (p: Vec3) => f(p.x, p.y),
    gradientXYZ: (x: number, y: number, _z: number, out: Vec3) => { out.x = 0; out.y = 1; out.z = 0; return f(x, y); },
    newtonProject(q: Vec3, off: number, maxMove: number, iters: number, stopTol: number, acceptTol: number, g: Vec3): boolean {
      for (let i = 0; i < iters; i++) {
        const v = f(q.x, q.y) - off;
        if (Math.abs(v) < stopTol) break;
        q.y -= Math.max(-maxMove, Math.min(maxMove, v));
      }
      g.x = 0; g.y = 1; g.z = 0;
      return Math.abs(f(q.x, q.y) - off) < acceptTol;
    },
    isNearLevel: (x: number, y: number, _z: number, off: number, tol: number) => Math.abs(f(x, y) - off) <= tol,
    isClear: (x: number, y: number, _z: number, min: number) => f(x, y) > min,
    isInSubstrate: () => false,
  };
  return field as unknown as WorldField;
}

describe('bracketed projection and jump hop (walker.ts, viab-loco root cause 2)', () => {
  const P = walkerParamsForBU(BU), F = P.footOffset;

  function walk(field: WorldField, ticks: number): { x: number; minF: number; statuses: Set<WalkStatus> } {
    const w = createWalkerKin(F);
    w.pos.x = -1 * BU; w.pos.y = F; w.pos.z = 0;
    const statuses = new Set<WalkStatus>();
    let minF = Infinity;
    for (let t = 0; t < ticks; t++) {
      statuses.add(walkerStep(field, w, v3(1, 0, 0), 4 * BU, 0.1, P));
      minF = Math.min(minF, field.sampleXYZ(w.pos.x, w.pos.y, w.pos.z));
    }
    return { x: w.pos.x, minF, statuses };
  }

  it('a walker crosses a small field jump (no root of f = foot, jump < 0.75 foot) and stays clear of solid', () => {
    // below y = 1.2 F the field reads at most 0.8 F, above it at least 1.2 F: the hop stands the walker at 1.2 F
    const r = walk(jumpField(1.2 * F, 0.4 * F), 30);
    expect(r.x).toBeGreaterThan(5 * BU);
    expect(r.minF).toBeGreaterThanOrEqual(0.3 * F);
    expect(r.statuses.has('failed')).toBe(false);
  });

  it('a jump of 0.75 foot or more is not hopped: the walker is blocked at it and never ends inside solid', () => {
    const r = walk(jumpField(1.9 * F, 1.2 * F), 30);
    expect(r.x).toBeLessThan(0.5 * BU);
    expect(r.minF).toBeGreaterThanOrEqual(0.3 * F);
    expect(r.statuses.has('blocked')).toBe(true);
  });
});

describe('stall watch (verify)', () => {
  const stallInv = () => collectInvariants().find((i) => i.name === 'walker-stall')!;
  function violations(sim: Sim): string[] {
    const out: string[] = [];
    stallInv().check(sim, (d) => out.push(d));
    return out;
  }

  // An ant that cannot move (here: a wander at speed x0, a stand-in for a raider wedged in a slit) whose behaviour
  // re-issues the wander every time it fails is 'moving' almost all the time and never leaves its spot. The watch
  // drops the window whenever a sample tick sees status 'failed', so whether it is reported depends on the phase of
  // the fail cycle against the ant's sample tick (id). The spec's stall ("nav moving, < 0.25 BU in 600 ticks") must
  // not be escapable by failing and re-issuing.
  it('an ant stuck in a fail / re-issue loop for 1,500 ticks is reported whatever its id', () => {
    const reported: boolean[] = [];
    for (const phase of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]) {
      const sim = locoSim({ sizeBu: 128 });
      const a = sim.state.ants.find((x) => x.caste === 'queen')!;
      placeOnSurface(sim, a, v3(64 * BU, 0, 64 * BU));
      // shift the fail cycle against the ant's sample tick
      for (let t = 0; t < phase; t++) sim.tick();
      const p0 = { ...a.pos };
      let movingTicks = 0, seen = false;
      for (let t = 0; t < 1500; t++) {
        if (a.nav.status !== 'moving') navWander(sim, a, v3(64 * BU, 0, 64 * BU), 5 * BU, { speedMult: 0 });
        sim.tick();
        if (a.nav.status === 'moving') movingTicks++;
        if (stalledAnts(sim, rt(sim)).length > 0) seen = true;
      }
      expect(Math.hypot(a.pos.x - p0.x, a.pos.z - p0.z)).toBeLessThan(0.25 * BU);
      expect(movingTicks).toBeGreaterThan(0.9 * 1500);
      reported.push(seen);
    }
    expect(reported).toEqual(reported.map(() => true));
  });

  it('records of ants that died while moving do not stay in the watch (no growth over a game without invariant checks)', () => {
    const sim = locoSim({ sizeBu: 200, nest: 'small', workers: 30 });
    const ws = workers(sim);
    for (const a of ws) { a.nav.status = 'moving'; if (a.nav.loco) a.nav.loco.req = 'none'; }
    for (let t = 0; t < 30; t++) sim.tick();
    expect(rt(sim).stalls.size).toBeGreaterThan(0);
    for (const a of ws) killAnt(sim, a.id, 'old-age');
    for (let t = 0; t < 30; t++) sim.tick();
    expect(rt(sim).stalls.size).toBe(0);
  });

  it('reports nothing for a walking ant whose window only just started, and names the stall once it is 600 ticks old', () => {
    const sim = locoSim({ sizeBu: 128 });
    const a = sim.state.ants.find((x) => x.caste === 'queen')!;
    placeOnSurface(sim, a, v3(64 * BU, 0, 64 * BU));
    a.nav.status = 'moving';
    // the watch samples every 10 ticks, so a stall is reported between 600 and 610 ticks after it began
    for (let t = 0; t < 599; t++) sim.tick();
    expect(violations(sim)).toEqual([]);
    for (let t = 0; t < 12; t++) sim.tick();
    expect(violations(sim).length).toBe(1);
  });
});

describe('crowd grid (neighbours.ts) against brute force', () => {
  it('returns only ids within r, never self, at most max, and all of them when there are fewer than max', () => {
    const rng = rngSeed(11);
    const g = new NeighbourGrid(1.1 * BU);
    const pts: Vec3[] = [];
    for (let i = 0; i < 2000; i++) pts.push(v3((rngFloat(rng) - 0.5) * 40 * BU, (rngFloat(rng) - 0.5) * 8 * BU, (rngFloat(rng) - 0.5) * 40 * BU));
    // and a dense crowd (a packed chamber: hundreds within one separation cell), straddling cell borders at x = 0
    for (let i = 0; i < 300; i++) pts.push(v3((rngFloat(rng) - 0.5) * 2 * BU, (rngFloat(rng) - 0.5) * BU, (rngFloat(rng) - 0.5) * 2 * BU));
    g.clear();
    pts.forEach((p, i) => g.insert(i, p.x, p.y, p.z));
    const out: number[] = [];
    let partial = 0, capped = 0;
    for (let q = 0; q < 400; q++) {
      const self = q < 300 ? q * 5 : 2000 + (q - 300) * 3, p = pts[self], r = 1.1 * BU, max = 6;
      const truth = pts.map((o, i) => ({ i, d: Math.hypot(o.x - p.x, o.y - p.y, o.z - p.z) })).filter((e) => e.i !== self && e.d < r).map((e) => e.i);
      const n = g.near(p.x, p.y, p.z, r, self, max, out);
      expect(n).toBe(out.length);
      expect(out.includes(self)).toBe(false);
      for (const id of out) expect(truth.includes(id)).toBe(true);
      expect(new Set(out).size).toBe(out.length);
      if (truth.length <= max) { expect(out.slice().sort((x, y) => x - y)).toEqual(truth.slice().sort((x, y) => x - y)); partial++; }
      else { expect(n).toBe(max); capped++; }
    }
    expect(partial).toBeGreaterThan(10);
    expect(capped).toBeGreaterThan(10);
    // a cleared grid answers nothing (stamps, not stale buckets)
    g.clear();
    expect(g.near(pts[0].x, pts[0].y, pts[0].z, 1.1 * BU, -1, 6, out)).toBe(0);
  });
});

describe('map limit (verify)', () => {
  it('a walker heading out through a corner, and one flung off the edge in a fall, stay inside the limit', () => {
    const sim = locoSim({ sizeBu: 200, terrain: 'noise' });
    const size = sim.world.size, lo = 8 * BU, hi = size - lo;
    const inv = collectInvariants().find((i) => i.name === 'walker-in-bounds')!;
    const bad: string[] = [];
    const a = sim.state.ants.find((x) => x.caste === 'queen')!;
    for (const [cx, cz, ox, oz] of [[lo, lo, -60, -60], [hi, hi, size + 60 * BU, size + 60 * BU], [lo, hi, -60, size + 60 * BU], [hi, lo, size + 60 * BU, -60]]) {
      placeOnSurface(sim, a, v3(cx, 0, cz));
      navTo(sim, a, v3(ox, 0, oz), 2 * BU, { speed: 8 * BU });
      for (let t = 0; t < 100; t++) { sim.tick(); inv.check(sim, (d) => bad.push(d)); }
    }
    // a fall with a strong outward push from just inside the edge
    placeOnSurface(sim, a, v3(lo + 0.5 * BU, 0, 100 * BU));
    navStop(sim, a);
    walkerLetGo(sim.field, a, 0, sim.kernel.walker);
    a.vel.x = -60 * BU; a.vel.y = 20 * BU;
    for (let t = 0; t < 40; t++) { sim.tick(); inv.check(sim, (d) => bad.push(d)); }
    expect(bad).toEqual([]);
  });
});

describe('water medium (verify)', () => {
  it('an idle ant in a deep puddle reads medium water, and surface again on the tick after the puddle dried', () => {
    const sim = locoSim({ sizeBu: 256 });
    const m = sim.state.env.moisture;
    const a = sim.state.ants.find((x) => x.caste === 'queen')!;
    placeOnSurface(sim, a, v3(100 * BU, 0, 128 * BU));
    navStop(sim, a);
    const units = Math.ceil((WX_PUDDLE_AVOID_BU * BU) / WX_PUDDLE_UNIT_MM) + 2;
    m.puddle.fill(units);
    for (let t = 0; t < 3; t++) sim.tick();
    expect(a.medium).toBe('water');
    m.puddle.fill(0);
    // the stand check re-steps a standing walker only every 16 ticks: until then the stale 'water' medium is read
    // by rain hits, heat, dodging and carrying
    let stale = 0;
    for (let t = 0; t < 20; t++) { sim.tick(); if (a.medium === 'water') stale++; }
    expect(stale).toBe(0);
  });
});

describe('restore-at-N with puddles on the nav grid (determinism)', () => {
  it('a game restored at N with avoid and block puddles runs on exactly like the uninterrupted one', () => {
    const N = 120, M = 200;
    const world = makeTestWorld({ seed: 5, terrain: 'noise', prims: 3 });
    const wet = (sim: Sim) => {
      const m = sim.state.env.moisture;
      const avoid = Math.ceil((WX_PUDDLE_AVOID_BU * BU) / WX_PUDDLE_UNIT_MM), block = Math.ceil((WX_PUDDLE_BLOCK_BU * BU) / WX_PUDDLE_UNIT_MM);
      for (let iz = 0; iz < m.nz; iz++) for (let ix = 0; ix < m.nx; ix++) {
        const k = (ix * 7 + iz * 13) % 11;
        m.puddle[iz * m.nx + ix] = k === 0 ? block : k < 4 ? avoid : 0;
      }
    };
    const mk = (): Sim => {
      const s = makeTestSim({ world, seed: 5, systems: SYSTEMS });
      s.enqueue({ type: 'cheat.spawnAnts', colonyId: s.state.colonies[0].id, n: 8, caste: 'worker', ageGd: 2, task: null, pos: null });
      return s;
    };
    const send = (sim: Sim) => {
      const size = sim.world.size;
      sim.state.ants.filter((x: Ant) => x.alive && x.caste === 'worker').forEach((x, i) => {
        placeOnSurface(sim, x, v3(0.3 * size + i * 3 * BU, 0, 0.3 * size));
        navTo(sim, x, v3(0.7 * size, 0, 0.6 * size - i * 4 * BU), 2 * BU);
      });
    };
    const straight = mk();
    for (let t = 0; t < N + M; t++) { if (t === 2) send(straight); if (t === 40) wet(straight); straight.tick(); }
    const first = mk();
    for (let t = 0; t < N; t++) { if (t === 2) send(first); if (t === 40) wet(first); first.tick(); }
    const resumed = createSim(restore(snapshot(first)).state, world, { systems: SYSTEMS });
    for (let t = 0; t < M; t++) resumed.tick();
    expect(resumed.state.tick).toBe(N + M);
    expect(stateHash(resumed.state)).toBe(stateHash(straight.state));
  }, 60_000);
});

describe('possessed sweep by displacement (verify, viab-loco item 2)', () => {
  // The sweep kit counts a run dead when the summed path is under 0.25 BU; an ant that jitters, slides back and forth
  // or drops and re-lands on one spot sums path without getting anywhere. Here: the farthest the ant got from its
  // start pose over the run, on the same test-world poses as possessedSweep.test.ts.
  it('every run with a free probe gets at least 0.25 BU away from its start pose', async () => {
    const { makePrim } = await import('@/sim/kernel.testWorld');
    const { locomotionSystem } = await import('./system');
    const { carveShafts, pileAgainst, possessAnt, samplePoses, sweepRng } = await import('./possessedSweepKit');
    const { rotateTangent, tangentPart } = await import('./mathx');
    const bu = 4, size = 128 * bu;
    const log = makePrim(900, 'capsule', v3(0.62 * size, 2 * bu, 0.62 * size), v3(2.5 * bu, 14 * bu, 0),
      { material: 'wood-decayed', rot: { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 } });
    const board = makePrim(901, 'box', v3(0.8 * size + 1.5 * bu, 12 * bu, 0.5 * size), v3(1.5 * bu, 14 * bu, 12 * bu),
      { material: 'wood-sound', round: 0.25 * bu });
    const sim = makeTestSim({ sizeBu: 128, terrain: 'noise', features: 'all', prims: [log, board], systems: [locomotionSystem] });
    const pile = pileAgainst(sim, 77, 0.8 * size, 0.5 * size, 16 * bu, 4.3 * bu, 0.8);
    for (const c of sim.state.creatures) c.alive = false;
    const ant = sim.state.ants.find((a) => a.caste === 'queen')!;
    for (const a of sim.state.ants) if (a !== ant) a.alive = false;
    possessAnt(sim, ant);
    const rng = sweepRng(3), start = sim.world.queenStart.pos;
    const axes = [...carveShafts(sim, rng, 2, 6, start), ...carveShafts(sim, rng, 3, 8)];
    const poses = samplePoses(sim, rng, { surface: 15, object: 25, shaft: 14, start: 6, mound: 12 }, axes, start, [pile]);
    const t = v3(0, 0, 0), q = v3(0, 0, 0);
    const dead: string[] = [];
    let runs = 0;
    for (const pose of poses) for (let k = 0; k < 8; k++) {
      if (!placeOnSurface(sim, ant, pose.pos, pose.dir)) break;
      const ref = tangentPart(t, v3(0, 1, 0), ant.up) > 0.1 ? { ...t } : tangentPart(t, v3(0, 0, 1), ant.up) > 1e-3 ? { ...t } : v3(1, 0, 0);
      const input = v3(0, 0, 0);
      rotateTangent(input, ref, ant.up, (k * Math.PI) / 4);
      const il = Math.hypot(input.x, input.y, input.z);
      input.x /= il; input.y /= il; input.z /= il;
      ant.fwd.x = input.x; ant.fwd.y = input.y; ant.fwd.z = input.z;
      let free = 0;
      for (let j = 0; j < 8; j++) {
        rotateTangent(t, ant.fwd, ant.up, (j * Math.PI) / 4);
        q.x = ant.pos.x + t.x * 0.5 * bu; q.y = ant.pos.y + t.y * 0.5 * bu; q.z = ant.pos.z + t.z * 0.5 * bu;
        if (sim.field.sample(q) >= 0.5 * ant.footOffset) free++;
      }
      const p0 = { ...ant.pos };
      ant.nav.loco = undefined;
      sim.setPlayerIntent({ dir: input, hurry: false, grip: false, held: [], flight: null });
      let far = 0;
      for (let i = 0; i < 100; i++) { sim.tick(); far = Math.max(far, Math.hypot(ant.pos.x - p0.x, ant.pos.y - p0.y, ant.pos.z - p0.z)); }
      runs++;
      if (far < 0.25 * bu && free > 0) dead.push(`${pose.kind} at (${(p0.x / bu).toFixed(1)}, ${(p0.y / bu).toFixed(1)}, ${(p0.z / bu).toFixed(1)}) input ${k}: ${(far / bu).toFixed(2)} BU`);
    }
    expect(runs).toBeGreaterThan(400);
    expect(dead).toEqual([]);
  }, 120_000);
});
