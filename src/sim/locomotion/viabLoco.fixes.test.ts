// viab-loco review fixes: the stall watch counts the time an ant tries to move from one spot across failed and
// re-issued walks (and a real arrival ends it), dozing counts nestmates only, and the under-water test measures the
// depth from the feet as the drowning rule does.
import { describe, expect, it } from 'vitest';
import type { Ant, Sim } from '@/sim/types';
import { FLOOD_ANT_SUB_KEY, FLOOD_STEP_TICKS, FLOOD_SUBMERGE_DEPTH_BU } from '@/sim/balance/weather';
import { makeTestSim } from '@/sim/testing';
import { commandsSystem } from '@/sim/systems';
import { floodSystem } from '@/sim/nest/flood';
import { floodCheats } from '@/sim/nest/flood/cheats';
import { neutralSite } from '@/sim/nest/flood/floodTestKit';
import { placeWorker } from '@/sim/nest/nestTestKit';
import { locoStats, navStop, navTo, navWander, placeOnSurface, stalledAnts } from './index';
import { rt } from './runtime';
import { deepestChamber, locoSim, placeInChamber, playerNest, v3, workers } from './testkit';
import { walkerUnderWater } from './weather';
import { NeighbourGrid } from './neighbours';

const BU = 4;

function queen(sim: Sim): Ant {
  return sim.state.ants.find((a) => a.caste === 'queen')!;
}

describe('stall watch windows (review fixes)', () => {
  it('an ant that fails, stands idle a while and tries again from the same spot is reported once its tries add up', () => {
    const sim = locoSim({ sizeBu: 128 });
    const a = queen(sim);
    const at = v3(64 * BU, 0, 64 * BU);
    placeOnSurface(sim, a, at);
    let seen = false, moving = 0;
    // rounds of: 40 ticks trying (a wander at speed x0 stands the walker; it may fail before the 40 are up), then
    // 40 ticks idle; the 600 ticks of trying take more than 1,200 ticks in all
    for (let round = 0; round < 60 && !seen; round++) {
      navWander(sim, a, at, 5 * BU, { speedMult: 0 });
      for (let t = 0; t < 40; t++) { sim.tick(); if (a.nav.status === 'moving') moving++; }
      navStop(sim, a);
      for (let t = 0; t < 40; t++) sim.tick();
      if (stalledAnts(sim, rt(sim)).length > 0) seen = true;
    }
    expect(seen).toBe(true);
    // the watch samples every 10 ticks: each try of about 26 ticks is seen 2 or 3 times here (the rounds keep one
    // phase against the samples), so the count is reached after somewhat more than 600 ticks of trying
    expect(moving).toBeGreaterThanOrEqual(580);
    expect(moving).toBeLessThan(900);
  });

  it('an ant that arrives over and over at the spot it stands on is not stalled (an arrival ends the window)', () => {
    const sim = locoSim({ sizeBu: 128 });
    const a = queen(sim);
    placeOnSurface(sim, a, v3(64 * BU, 0, 64 * BU));
    let arrivals = 0;
    for (let t = 0; t < 1500; t++) {
      if (a.nav.status !== 'moving') { if (a.nav.status === 'arrived') arrivals++; navTo(sim, a, { ...a.pos }, 0.05 * BU); }
      sim.tick();
      expect(stalledAnts(sim, rt(sim))).toEqual([]);
    }
    expect(arrivals).toBeGreaterThan(10);
  });

  it('an ant that walks away from its spot starts a new window (no report for a walker crossing open ground)', () => {
    const sim = locoSim({ sizeBu: 256 });
    const a = queen(sim);
    placeOnSurface(sim, a, v3(64 * BU, 0, 128 * BU));
    navWander(sim, a, v3(128 * BU, 0, 128 * BU), 40 * BU);
    for (let t = 0; t < 1500; t++) sim.tick();
    expect(a.nav.status).toBe('moving');
    expect(stalledAnts(sim, rt(sim))).toEqual([]);
  });
});

describe('dozing counts nestmates only (review fix)', () => {
  it('ants of other colonies crowding a wanderer do not put it to sleep', () => {
    const sim = locoSim({ sizeBu: 300, nest: 'small', workers: 40 });
    const nest = playerNest(sim), c = deepestChamber(nest);
    const ants = workers(sim);
    placeInChamber(sim, ants, nest, c, 5);
    const floor = { ...ants[0].pos };
    for (const a of ants) placeOnSurface(sim, a, v3(floor.x + (a.id % 5) * 0.12 * BU, floor.y + BU, floor.z + (a.id % 7) * 0.08 * BU), v3(0, -1, 0));
    // every ant of its own colony: a crowd of strangers (the raiders-in-a-chamber case)
    ants.forEach((a, i) => { a.colony = 1000 + i; a.nestId = nest.id; navWander(sim, a, c.center, 3 * BU); });
    const d0 = locoStats(sim).dozed;
    for (let t = 0; t < 200; t++) sim.tick();
    expect(locoStats(sim).dozed - d0).toBe(0);
  });
});

describe('crowd grid tags (dozing nestmates)', () => {
  it('a tagged query returns only entries of that tag, in the same order as the untagged hits of that tag', () => {
    const g = new NeighbourGrid(1.1 * BU);
    g.clear();
    for (let i = 0; i < 40; i++) g.insert(i, (i % 7) * 0.2 * BU, 0, (i % 5) * 0.2 * BU, i % 3);
    const all: number[] = [], tagged: number[] = [];
    g.near(0.6 * BU, 0, 0.4 * BU, 1.1 * BU, 4, 100, all);
    g.near(0.6 * BU, 0, 0.4 * BU, 1.1 * BU, 4, 100, tagged, 1);
    expect(tagged.length).toBeGreaterThan(3);
    expect(tagged).toEqual(all.filter((id) => id % 3 === 1));
    expect(g.near(0.6 * BU, 0, 0.4 * BU, 1.1 * BU, 4, 3, tagged, 1)).toBe(3);
    expect(g.near(0.6 * BU, 0, 0.4 * BU, 1.1 * BU, 4, 3, tagged, 9)).toBe(0);
  });
});

describe('under water: depth from the feet (review fix)', () => {
  it('a walker whose feet are 0.5 BU under the flood level but whose centre is not is under water, as for drowning', () => {
    const sim = makeTestSim({ nest: 'small', systems: [commandsSystem, floodSystem] });
    neutralSite(sim);
    const nest = playerNest(sim);
    const royal = nest.chambers[2];
    const ant = placeWorker(sim, { ...royal.center }, { x: 1, y: 0, z: 0 }, nest.id);
    const floorY = ant.pos.y - ant.footOffset;
    floodCheats(sim.state).drainScale = 0;
    nest.flood.water = 40;
    for (let t = 0; t < 2 * FLOOD_STEP_TICKS; t++) sim.tick();
    const level = nest.flood.level, need = FLOOD_SUBMERGE_DEPTH_BU * BU;
    expect(level - floorY).toBeGreaterThan(need + 2 * ant.footOffset);
    ant.up.x = 0; ant.up.y = 1; ant.up.z = 0;
    // centre 0.07 BU short of the submersion depth, feet 0.08 BU beyond it
    ant.pos.y = level - need + 0.07 * BU;
    delete ant.bb[FLOOD_ANT_SUB_KEY];
    for (let t = 0; t < 2 * FLOOD_STEP_TICKS; t++) sim.tick();
    expect(ant.bb[FLOOD_ANT_SUB_KEY] ?? 0).toBeGreaterThan(0);
    expect(walkerUnderWater(sim, ant, rt(sim), nest.id)).toBe(true);
    // and with the feet short of it, neither rule counts the ant as under water
    ant.pos.y = level - need + ant.footOffset + 0.05 * BU;
    for (let t = 0; t < 2 * FLOOD_STEP_TICKS; t++) sim.tick();
    expect(ant.bb[FLOOD_ANT_SUB_KEY]).toBeUndefined();
    expect(walkerUnderWater(sim, ant, rt(sim), nest.id)).toBe(false);
  });
});
