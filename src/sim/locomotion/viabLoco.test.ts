// viab-loco: the stall watch (item 1), the map limit at all four edges for ants and creatures (item 4), the weather
// hooks (item 5) and the surface fixes behind the stall sites (climbing counts as progress, the surface let-go).
import { describe, expect, it } from 'vitest';
import type { Ant, Sim } from '@/sim/types';
import { AntFlag } from '@/sim/types';
import { makePrim } from '@/sim/kernel.testWorld';
import { spawnCreature } from '@/sim/entities/creatures';
import { WX_PUDDLE_AVOID_BU, WX_PUDDLE_BLOCK_BU, WX_PUDDLE_UNIT_MM, WX_STUN_KEY } from '@/sim/balance/weather';
import { collectInvariants } from '@/sim/testing/invariants';
import { isLocoNavGrid } from './grid/navGridImpl';
import { locoStats, navTo, navWander, placeOnSurface, stalledAnts } from './index';
import { rt } from './runtime';
import { deepestChamber, locoSim, placeInChamber, playerNest, v3, workers } from './testkit';
import { pileAgainst } from './possessedSweepKit';

const BU = 4;

function stallViolations(sim: Sim): string[] {
  const inv = collectInvariants().find((i) => i.name === 'walker-stall')!;
  const out: string[] = [];
  inv.check(sim, (d) => out.push(d));
  return out;
}

function queen(sim: Sim): Ant {
  return sim.state.ants.find((a) => a.caste === 'queen')!;
}

/** An ant that is told it is moving but has no request: locomotion stands it (a stalled walker by construction). */
function fakeMoving(ant: Ant): void {
  ant.nav.status = 'moving';
  if (ant.nav.loco) ant.nav.loco.req = 'none';
}

describe('stall watch (viab-loco item 1)', () => {
  it('reports an ant with nav moving that stays within 0.25 BU for 600 ticks, with position, state, target and normal', () => {
    const sim = locoSim({ sizeBu: 128 });
    const a = queen(sim);
    placeOnSurface(sim, a, v3(64 * BU, 0, 64 * BU));
    fakeMoving(a);
    for (let t = 0; t < 590; t++) sim.tick();
    expect(stallViolations(sim)).toEqual([]);
    for (let t = 0; t < 20; t++) sim.tick();
    const v = stallViolations(sim);
    expect(v.length).toBe(1);
    expect(v[0]).toMatch(new RegExp(`ant ${a.id} stalled 6\\d\\d ticks \\(of 6\\d\\d\\) at \\(64\\.0, 0\\.\\d, 64\\.0\\) BU up \\(0\\.00, 1\\.00, 0\\.00\\)`));
    expect(v[0]).toContain('target');
    expect(v[0]).toContain(`${a.task}/${a.state}`);
  });

  it('does not report walking ants, stunned ants, the possessed ant or ants the cold holds still', () => {
    const sim = locoSim({ sizeBu: 256 });
    const a = queen(sim);
    placeOnSurface(sim, a, v3(64 * BU, 0, 64 * BU));
    navWander(sim, a, v3(64 * BU, 0, 64 * BU), 30 * BU);
    for (let t = 0; t < 700; t++) sim.tick();
    expect(stallViolations(sim)).toEqual([]);
    fakeMoving(a);
    a.bb[WX_STUN_KEY] = sim.state.tick + 2000;
    for (let t = 0; t < 700; t++) sim.tick();
    expect(stallViolations(sim)).toEqual([]);
    a.bb[WX_STUN_KEY] = 0;
    a.flags |= AntFlag.POSSESSED;
    sim.state.player.possessedAntId = a.id;
    sim.setPlayerIntent({ dir: v3(0, 0, 0), hurry: false, grip: false, held: [], flight: null });
    for (let t = 0; t < 700; t++) { sim.tick(); a.nav.status = 'moving'; }
    expect(stallViolations(sim)).toEqual([]);
    a.flags &= ~AntFlag.POSSESSED;
    sim.state.player.possessedAntId = -1;
    a.tb = -10;
    fakeMoving(a);
    for (let t = 0; t < 700; t++) sim.tick();
    expect(stalledAnts(sim, rt(sim))).toEqual([]);
  });
});

describe('map limit at all four edges (viab-loco item 4, GDD 04 E20)', () => {
  it('ants and creatures walking and placed beyond every edge stay inside [8 BU, side - 8 BU]', () => {
    const sim = locoSim({ sizeBu: 200, terrain: 'noise' });
    const size = sim.world.size, lo = 8 * BU, hi = size - 8 * BU;
    const inv = collectInvariants().find((i) => i.name === 'walker-in-bounds')!;
    const bad: string[] = [];
    const creatures = [0, 1, 2, 3].map((k) => spawnCreature(sim, { kind: 'springtail', pos: v3(100 * BU, 0, 100 * BU), init: { id: 8005 + k } as never }));
    const ant = queen(sim);
    for (let side = 0; side < 4; side++) {
      const out = side === 0 ? v3(-50 * BU, 0, 100 * BU) : side === 1 ? v3(size + 50 * BU, 0, 100 * BU) : side === 2 ? v3(100 * BU, 0, -50 * BU) : v3(100 * BU, 0, size + 50 * BU);
      // placement beyond the edge (creature jumps, spawns, teleports) lands inside the limit
      expect(placeOnSurface(sim, creatures[side], out)).toBe(true);
      expect(placeOnSurface(sim, ant, out)).toBe(true);
      inv.check(sim, (d) => bad.push(d));
      // and walking at the edge never crosses it (exactly at the limit on a slope: the gate's x = 15968.00003)
      const at = side === 0 ? v3(lo, 0, 100 * BU) : side === 1 ? v3(hi, 0, 100 * BU) : side === 2 ? v3(100 * BU, 0, lo) : v3(100 * BU, 0, hi);
      placeOnSurface(sim, creatures[side], at);
      placeOnSurface(sim, ant, at);
      navTo(sim, creatures[side], out, 2 * BU, { speed: 8 * BU });
      navTo(sim, ant, out, 2 * BU, { speed: 8 * BU });
      for (let t = 0; t < 150; t++) { sim.tick(); inv.check(sim, (d) => bad.push(d)); }
    }
    expect(bad).toEqual([]);
    for (const c of creatures) {
      expect(c.pos.x).toBeGreaterThanOrEqual(lo); expect(c.pos.x).toBeLessThanOrEqual(hi);
      expect(c.pos.z).toBeGreaterThanOrEqual(lo); expect(c.pos.z).toBeLessThanOrEqual(hi);
    }
  });
});

describe('weather hooks (viab-loco item 5, GDD 06 §3.3, §3.10)', () => {
  function walkFor(sim: Sim, a: Ant, ticks: number): number {
    const x0 = a.pos.x;
    for (let t = 0; t < ticks; t++) sim.tick();
    return Math.abs(a.pos.x - x0);
  }

  it('a stunned ant (ant.bb[WX_STUN_KEY]) does not walk, autonomous or possessed, and walks on when the stun ends', () => {
    const sim = locoSim({ sizeBu: 256 });
    const a = queen(sim);
    placeOnSurface(sim, a, v3(60 * BU, 0, 128 * BU));
    navTo(sim, a, v3(160 * BU, 0, 128 * BU), BU, { speed: 6 * BU });
    a.bb[WX_STUN_KEY] = sim.state.tick + 30;
    expect(walkFor(sim, a, 25)).toBeLessThan(0.01 * BU);
    expect(walkFor(sim, a, 30)).toBeGreaterThan(5 * BU);
    expect(a.nav.status).toBe('moving');
    a.flags |= AntFlag.POSSESSED;
    sim.state.player.possessedAntId = a.id;
    sim.setPlayerIntent({ dir: v3(1, 0, 0), hurry: false, grip: false, held: [], flight: null });
    a.bb[WX_STUN_KEY] = sim.state.tick + 20;
    expect(walkFor(sim, a, 15)).toBeLessThan(0.01 * BU);
    expect(walkFor(sim, a, 20)).toBeGreaterThan(2 * BU);
  });

  it('under water (a puddle at least WX_PUDDLE_AVOID_BU deep) the walker has medium water and walks at x0.3', () => {
    const sim = locoSim({ sizeBu: 256 });
    const m = sim.state.env.moisture;
    expect(m.nx).toBeGreaterThan(0);
    const a = queen(sim);
    placeOnSurface(sim, a, v3(40 * BU, 0, 128 * BU));
    navTo(sim, a, v3(200 * BU, 0, 128 * BU), BU, { speed: 6 * BU });
    const dry = walkFor(sim, a, 20);
    // flood the moisture cells under the rest of the way with a puddle deeper than the avoid threshold
    const units = Math.ceil((WX_PUDDLE_AVOID_BU * BU) / WX_PUDDLE_UNIT_MM) + 2;
    for (let iz = 0; iz < m.nz; iz++) for (let ix = 0; ix < m.nx; ix++) m.puddle[iz * m.nx + ix] = units;
    const wet = walkFor(sim, a, 20);
    expect(a.medium).toBe('water');
    expect(wet / dry).toBeGreaterThan(0.25);
    expect(wet / dry).toBeLessThan(0.35);
  });

  it('puddles price nav cells x WX_PUDDLE_AVOID_COST at the avoid depth and block them at the block depth', () => {
    const sim = locoSim({ sizeBu: 256 });
    sim.tick();
    const g = sim.navGrid;
    if (!isLocoNavGrid(g)) throw new Error('loco nav grid expected');
    const m = sim.state.env.moisture, x = 128 * BU, z = 128 * BU;
    const ix = Math.floor(x / m.cell), iz = Math.floor(z / m.cell);
    const c0 = g.costAt(x, z);
    m.puddle[iz * m.nx + ix] = Math.ceil((WX_PUDDLE_AVOID_BU * BU) / WX_PUDDLE_UNIT_MM);
    sim.tick();
    expect(g.costAt(x, z)).toBeCloseTo(5 * c0, 5);
    expect(g.blocked(x, z)).toBe(false);
    // a wall of blocking puddle cells across the map but one: the planner goes through the dry gap
    for (let k = 0; k < m.nz; k++) if (k !== 3) m.puddle[k * m.nx + ix] = Math.ceil((WX_PUDDLE_BLOCK_BU * BU) / WX_PUDDLE_UNIT_MM);
    sim.tick();
    expect(g.blocked(x, z)).toBe(true);
    const path: { x: number; y: number; z: number }[] = [];
    expect(g.findPathEx(v3(x - 40 * BU, 0, z), v3(x + 40 * BU, 0, z), path)).toBe(true);
    const crossing = path.find((p) => Math.floor(p.x / m.cell) === ix || Math.abs(p.x - x) < m.cell);
    expect(path.some((p) => Math.floor(p.z / m.cell) <= 4)).toBe(true);
    expect(crossing === undefined || Math.floor(crossing.z / m.cell) <= 4).toBe(true);
    // dry again: the overlay follows the state
    m.puddle.fill(0);
    sim.tick();
    expect(g.costAt(x, z)).toBeCloseTo(c0, 5);
  });

  it('a wet surface lowers the grip x0.9: an ant under a leaf-grip overhang holds on dry and slips when soaked', () => {
    const run = (wet: number) => {
      const top = makePrim(900, 'box', v3(128 * BU, 10 * BU, 128 * BU), v3(20 * BU, 2 * BU, 20 * BU), { material: 'leaf', round: 0.2 * BU });
      const sim = locoSim({ sizeBu: 256, prims: [top] });
      sim.state.env.moisture.surfaceWet = wet;
      const a = queen(sim);
      placeOnSurface(sim, a, v3(128 * BU, 6 * BU, 128 * BU), v3(0, 1, 0));
      expect(a.up.y).toBeLessThan(-0.9);
      for (let t = 0; t < 20; t++) sim.tick();
      return { fell: a.medium === 'air' || a.up.y > 0.5, slips: locoStats(sim).slips };
    };
    expect(run(0)).toEqual({ fell: false, slips: 0 });
    const soaked = run(1);
    expect(soaked.slips).toBeGreaterThan(0);
  });
});

describe('surface stall fixes (viab-loco item 1, int-1B Addendum 3 item 11)', () => {
  it('playground-park #2 raider (reduced): down a board face onto a steep spoil pile crest, across the field jump', () => {
    // a spoil pile heaped 4.3 BU high against a board, falling 0.8 BU per BU away from it and 60 % into the board: across the crest the terrain
    // pseudo-distance jumps and the walker's projection failed there for game hours (bracketed projection + hop)
    const faceX = 128 * BU;
    const board = makePrim(900, 'box', v3(faceX + 1.5 * BU, 12 * BU, 128 * BU), v3(1.5 * BU, 14 * BU, 12 * BU), { material: 'wood-sound', round: 0.25 * BU });
    const sim = locoSim({ sizeBu: 256, prims: [board] });
    pileAgainst(sim, 77, faceX, 128 * BU, 16 * BU, 4.3 * BU, 0.8);
    const a = queen(sim);
    placeOnSurface(sim, a, v3(faceX - 0.2 * BU, 9 * BU, 128 * BU), v3(1, 0, 0));
    expect(a.up.x).toBeLessThan(-0.9);
    expect(navTo(sim, a, v3(faceX - 8 * BU, 0, 128 * BU), BU, { speed: 5 * BU })).toBe(true);
    const s0 = locoStats(sim);
    for (let t = 0; t < 300 && a.nav.status === 'moving'; t++) sim.tick();
    expect(a.nav.status).toBe('arrived');
    expect(locoStats(sim).relocations - s0.relocations).toBe(0);
  });

  it('climbing a 30 BU board counts as progress: no recovery rung mid-climb, the walker arrives beyond it', () => {
    const board = makePrim(900, 'box', v3(100 * BU, 14 * BU, 128 * BU), v3(1 * BU, 15 * BU, 30 * BU), { material: 'wood-sound', round: 0.2 * BU });
    const sim = locoSim({ sizeBu: 256, prims: [board] });
    const a = queen(sim);
    placeOnSurface(sim, a, v3(92 * BU, 0, 128 * BU));
    expect(navTo(sim, a, v3(110 * BU, 0, 128 * BU), BU, { speed: 4 * BU })).toBe(true);
    const s0 = locoStats(sim);
    let top = 0;
    for (let t = 0; t < 600 && a.nav.status === 'moving'; t++) { sim.tick(); top = Math.max(top, a.pos.y); }
    const s1 = locoStats(sim);
    expect(top).toBeGreaterThan(28 * BU);
    expect(a.nav.status).toBe('arrived');
    expect(s1.sidesteps - s0.sidesteps).toBe(0);
    expect(s1.relocations - s0.relocations).toBe(0);
  });

  it('a walker blocked at the raised edge of a thin sheet with its goal below steps off (surface let-go)', () => {
    // a thin floating sheet (a leaf tip), 0.2 BU thick, 6 BU above the ground: the walker cannot wrap round its edge
    const sheet = makePrim(900, 'box', v3(128 * BU, 6 * BU, 128 * BU), v3(8 * BU, 0.1 * BU, 8 * BU), { material: 'leaf' });
    const sim = locoSim({ sizeBu: 256, prims: [sheet] });
    const a = queen(sim);
    placeOnSurface(sim, a, v3(128 * BU, 8 * BU, 128 * BU));
    expect(a.pos.y).toBeGreaterThan(5 * BU);
    expect(navTo(sim, a, v3(150 * BU, 0, 128 * BU), BU, { speed: 4 * BU })).toBe(true);
    const s0 = locoStats(sim);
    for (let t = 0; t < 400 && a.nav.status === 'moving'; t++) sim.tick();
    expect(a.nav.status).toBe('arrived');
    expect(locoStats(sim).relocations - s0.relocations).toBe(0);
  });
});

describe('crowding cost (viab-loco item 6)', () => {
  it('wanderers in a crowded chamber doze part of the time and still move; a lone wanderer never dozes', () => {
    const sim = locoSim({ sizeBu: 300, nest: 'small', workers: 60 });
    const nest = playerNest(sim), c = deepestChamber(nest);
    const ants = workers(sim);
    placeInChamber(sim, ants, nest, c, 5);
    // crowd them: everybody within 0.6 BU of the chamber floor centre
    const floor = { ...ants[0].pos };
    for (const a of ants) placeOnSurface(sim, a, v3(floor.x + (a.id % 5) * 0.12 * BU, floor.y + BU, floor.z + (a.id % 7) * 0.08 * BU), v3(0, -1, 0));
    for (const a of ants) { a.nestId = nest.id; navWander(sim, a, c.center, 3 * BU); }
    const p0 = ants.map((a) => ({ ...a.pos }));
    const d0 = locoStats(sim).dozed;
    for (let t = 0; t < 200; t++) sim.tick();
    expect(locoStats(sim).dozed - d0).toBeGreaterThan(1000);
    const moved = ants.filter((a, i) => Math.hypot(a.pos.x - p0[i].x, a.pos.y - p0[i].y, a.pos.z - p0[i].z) > 0.5 * BU).length;
    expect(moved).toBeGreaterThan(0.8 * ants.length);
    expect(stallViolations(sim)).toEqual([]);
  });

  it('re-issuing the same wander while it runs keeps the request (its stall ladder is not restarted)', () => {
    const sim = locoSim({ sizeBu: 128 });
    const a = queen(sim);
    placeOnSurface(sim, a, v3(64 * BU, 0, 64 * BU));
    navWander(sim, a, v3(64 * BU, 0, 64 * BU), 10 * BU);
    for (let t = 0; t < 30; t++) sim.tick();
    const req = a.nav.loco!.reqTick, n0 = locoStats(sim).requests;
    navWander(sim, a, v3(64 * BU, 0, 64 * BU), 10 * BU);
    expect(a.nav.loco!.reqTick).toBe(req);
    expect(locoStats(sim).requests).toBe(n0);
    navWander(sim, a, v3(70 * BU, 0, 64 * BU), 10 * BU);
    expect(a.nav.loco!.reqTick).toBe(sim.state.tick);
  });
});
