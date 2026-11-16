// Fixes of the weather-fix2 review (the reviewer's own tests are in weatherFix2.verify.test.ts):
//   1. `queen-in-danger` is shared with combat: the flood module re-raises it while the queen is under water and
//      never clears it while combat holds it;
//   2. a claustral founding cell: its plug takes no rain, a real hole into it takes all, and an open trial pit that
//      does not reach the cell's basin takes none (and does not fill the cell); the spill cache holds the pooled
//      basin only;
//   3. the depth rule reads the water over the column's floor, not the level above the feet: a film in the lowest
//      layer reads 0.5 BU over the feet of an ant beside it, behind a sill, and must not count;
//   4. a dry nest of another colony being dug re-captures its geometry for the reference storm only every 5 game min;
//   5. (not a defect: evidence) a carve that flips a mound's hole probe without a breach record drops the cached mask.

import { describe, expect, it } from 'vitest';
import type { Entrance, Nest, Sim } from '@/sim/types';
import { FLOOD_ANT_SUB_KEY, FLOOD_PREDICT_DRY_REBUILD_TICKS, FLOOD_PREDICT_TICKS, FLOOD_SUBMERGE_DEPTH_BU } from '@/sim/balance/weather';
import { combatAlerts, noteQueenDamaged } from '@/sim/combat/alerts';
import { makeTestSim } from '@/sim/testing';
import { commandsSystem } from '@/sim/systems';
import { TICKS_PER_SECOND } from '@/sim/time';
import { carveCapsule, fillSphere } from '../carveOps';
import { createMound } from '../mounds';
import { moundMask } from '../moundRelax';
import { feetOf, placeWorker, playerNest, setMoisture } from '../nestTestKit';
import { nestRuntime } from '../runtime';
import { floodCheats } from './cheats';
import { neutralSite } from './floodTestKit';
import { floodSystem } from './index';
import { entranceInflow, nestInflow } from './inflow';
import { spillFor } from './runtime';
import { entranceOpensBasin, floodedCount, spillVolume, waterDepthOver, waterLevelMm } from './spill';

const run = (sim: Sim, n: number): void => { for (let i = 0; i < n; i++) sim.tick(); };

function floodSim(): Sim {
  const sim = makeTestSim({ nest: 'small', systems: [commandsSystem, floodSystem] });
  neutralSite(sim);
  return sim;
}

const queenAlertUp = (sim: Sim, id: number): boolean =>
  sim.state.progression.alerts.some((a) => a.kind === 'queen-in-danger' && a.subjectId === id);

/** The player's queen on the royal chamber floor, the water standing about 2 BU deep over it. */
function drowningQueen(sim: Sim) {
  const nest = playerNest(sim);
  const q = placeWorker(sim, { ...nest.chambers[2].center }, { x: 1, y: 0, z: 0 }, nest.id);
  q.caste = 'queen';
  sim.state.colonies[0].queenId = q.id;
  floodCheats(sim.state).drainScale = 0;
  nest.flood.water = 40;
  run(sim, 30);
  expect(q.bb[FLOOD_ANT_SUB_KEY]).toBeGreaterThan(0);
  return { nest, q };
}

describe('review finding 1: queen-in-danger shared with combat', () => {
  it('combat clearing the card while she is under water: raised again at the next flood step', () => {
    const sim = floodSim();
    const { q } = drowningQueen(sim);
    expect(queenAlertUp(sim, q.id)).toBe(true);
    noteQueenDamaged(sim, q);
    q.bb['cb.qdT'] = sim.state.tick - 1000 * TICKS_PER_SECOND;
    combatAlerts(sim);
    expect(queenAlertUp(sim, q.id)).toBe(false);
    run(sim, 10);
    expect(queenAlertUp(sim, q.id)).toBe(true);
    const a = sim.state.progression.alerts.find((x) => x.kind === 'queen-in-danger' && x.subjectId === q.id)!;
    expect(a.tokens?.attacker).toBe('rising water');
  });

  it('she dries while a hostile is still near (combat holds the card): the card stays, combat clears it later', () => {
    const sim = floodSim();
    const { nest, q } = drowningQueen(sim);
    noteQueenDamaged(sim, q); // combat's card is up (its bb flag set), sharing the key
    expect(q.bb['cb.qdOn']).toBe(1);
    const tokensBefore = { ...sim.state.progression.alerts.find((x) => x.kind === 'queen-in-danger')!.tokens };
    run(sim, 20); // still under water: the flood module does not overwrite combat's card
    expect(sim.state.progression.alerts.find((x) => x.kind === 'queen-in-danger')!.tokens).toEqual(tokensBefore);
    nest.flood.water = 0;
    run(sim, 20);
    expect(q.bb[FLOOD_ANT_SUB_KEY] ?? 0).toBe(0);
    expect(queenAlertUp(sim, q.id)).toBe(true); // combat's danger is not over
    q.bb['cb.qdT'] = sim.state.tick - 1000 * TICKS_PER_SECOND;
    combatAlerts(sim);
    expect(queenAlertUp(sim, q.id)).toBe(false);
  });

  it('flood alone: the card goes once she is dry', () => {
    const sim = floodSim();
    const { nest, q } = drowningQueen(sim);
    expect(queenAlertUp(sim, q.id)).toBe(true);
    nest.flood.water = 0;
    run(sim, 20);
    expect(queenAlertUp(sim, q.id)).toBe(false);
  });
});

/** A sealed founding cell in the test nest (its throat stays carved open unless a test plugs it). */
function claustral(sim: Sim): Nest {
  const nest = playerNest(sim);
  nest.founding = { state: 'sealed', readiness: 1, cavitySeed: { ...nest.chambers[2].center }, abandoned: [], readyTick: 0, sealedTick: 0 };
  return nest;
}

/** A 4 BU trial pit 15 BU from the nest, registered as an open entrance of it. */
function trialPit(sim: Sim, nest: Nest): Entrance {
  const bu = sim.world.bu, e0 = nest.entrances[0];
  const x = e0.pos.x - 15 * bu, z = e0.pos.z - 10 * bu, h = sim.field.height(x, z);
  carveCapsule(sim, { x, y: h + 0.5 * bu, z }, { x, y: h - 4 * bu, z }, 1 * bu);
  const e: Entrance = { ...e0, id: 9001, status: 'open', pos: { x, y: h, z }, dir: { x: 0, y: 1, z: 0 }, radius: 1 * bu, moundId: -1, passSeen: false };
  nest.entrances.push(e);
  return e;
}

describe('review finding 2: which openings of a claustral cell take rain', () => {
  it('an open trial pit beside the sealed cell takes no rain, and a downpour leaves the cell dry', () => {
    const sim = floodSim();
    const nest = claustral(sim);
    nest.entrances[0].status = 'sealed';
    const pit = trialPit(sim, nest);
    setMoisture(sim, 0.5);
    const cache = spillFor(sim, nest);
    expect(entranceOpensBasin(sim, cache, nest.entrances[0])).toBe(true); // the plug is only a record here
    expect(entranceOpensBasin(sim, cache, pit)).toBe(false);
    expect(entranceInflow(sim, pit, 1, nest).q).toBe(0);
    expect(nestInflow(sim, nest, undefined, 1)).toBe(0);
    floodCheats(sim.state).rainI = 1;
    run(sim, 1000);
    expect(nest.flood.water).toBe(0);
    expect(nest.chambers.every((c) => c.flooded === 0)).toBe(true);
  });

  it('the cache is the pooled basin only: the unconnected pit adds no volume and no samples', () => {
    const sim = floodSim();
    const nest = playerNest(sim);
    const before = spillFor(sim, nest);
    const vol0 = spillVolume(before), n0 = before.si.length;
    trialPit(sim, nest);
    const after = spillFor(sim, nest);
    expect(after).not.toBe(before);
    expect(after.si.length).toBe(n0);
    expect(spillVolume(after)).toBeCloseTo(vol0, 9);
    for (let s = 1; s < after.level.length; s++) expect(after.level[s]).toBeGreaterThanOrEqual(after.level[s - 1]);
  });

  it('an entrance record still `open` over a throat the queen has plugged takes no rain; the hole open, all of it', () => {
    const sim = floodSim();
    const nest = claustral(sim);
    const e = nest.entrances[0];
    const bu = sim.world.bu;
    const open = entranceInflow(sim, e, 1, nest).q;
    expect(open).toBeGreaterThan(0);
    // a plug 3 BU down the throat (the throat runs straight down from the opening in the test nest)
    fillSphere(sim, { x: e.pos.x, y: e.pos.y - 3 * bu, z: e.pos.z }, e.radius + 0.75 * bu);
    expect(entranceOpensBasin(sim, spillFor(sim, nest), e)).toBe(false);
    expect(entranceInflow(sim, e, 1, nest).q).toBe(0);
    nest.founding = null; // an established nest keeps GDD 03 §4.2 by status
    expect(entranceInflow(sim, e, 1, nest).q).toBeGreaterThan(0);
  });
});

describe('review finding 3: depth over the column floor, not above the feet', () => {
  it('the sweep-4 film reads 0.5 BU over the feet of floor ants behind a sill (old rule), and no depth over their floor', () => {
    const sim = floodSim();
    const nest = playerNest(sim);
    const royal = nest.chambers[2];
    const bu = sim.world.bu, v = sim.carve.voxel;
    const cache = spillFor(sim, nest);
    const level = waterLevelMm(cache, 0.7, v);
    expect(floodedCount(cache, 0.7)).toBeGreaterThan(0);
    let aboveFeet = 0, worst = -Infinity, worstFlagged = -Infinity, ants = 0;
    for (let dx = -2; dx <= 2; dx += 0.5) for (let dz = -2; dz <= 2; dz += 0.5) {
      let a;
      try { a = placeWorker(sim, { x: royal.center.x + dx * bu, y: royal.center.y, z: royal.center.z + dz * bu }, { x: 1, y: 0, z: 0 }, nest.id); } catch { continue; }
      ants++;
      const feet = feetOf(a).y;
      const d = waterDepthOver(cache, v, a.pos.x, a.pos.y, a.pos.z, level, feet);
      if (level - feet >= FLOOD_SUBMERGE_DEPTH_BU * bu) { aboveFeet++; worstFlagged = Math.max(worstFlagged, d); }
      worst = Math.max(worst, d);
      a.alive = false;
    }
    expect(ants).toBeGreaterThan(40);
    expect(aboveFeet, 'the level alone would pass the 0.5 BU rule for some floor ants').toBeGreaterThan(0);
    // those ants stand behind a sill: no water over their floor at all
    expect(worstFlagged / bu).toBeLessThan(0.1);
    // the film fills a small dip of the floor about a layer deep (0.5 BU): wet feet there, nobody under water
    expect(worst / bu).toBeLessThan(FLOOD_SUBMERGE_DEPTH_BU);
  });

  it('the depth grows with the water by the level step for a floor ant, and passes 0.5 BU once the layer is over it', () => {
    const sim = floodSim();
    const nest = playerNest(sim);
    const bu = sim.world.bu, v = sim.carve.voxel;
    const a = placeWorker(sim, { ...nest.chambers[2].center }, { x: 1, y: 0, z: 0 }, nest.id);
    const cache = spillFor(sim, nest);
    const feet = feetOf(a).y;
    let prev = -Infinity, sawShallow = false, sawDeep = false;
    for (let w = 0.5; w <= 40; w *= 1.25) {
      const level = waterLevelMm(cache, w, v);
      const d = waterDepthOver(cache, v, a.pos.x, a.pos.y, a.pos.z, level, feet);
      expect(d).toBeGreaterThanOrEqual(prev - 1e-9);
      expect(d).toBeLessThanOrEqual(level - feet + 1e-9); // never deeper than the level over the feet
      if (d > -Infinity && d < FLOOD_SUBMERGE_DEPTH_BU * bu) sawShallow = true;
      if (d >= FLOOD_SUBMERGE_DEPTH_BU * bu) sawDeep = true;
      prev = d;
    }
    expect(sawShallow && sawDeep).toBe(true);
  });
});

describe('review finding 4: reference-storm geometry of a dry nest of another colony being dug', () => {
  /** Captures (spillTick changes) of a nest over `ticks` while a small hole is dug in its food chamber every 100 ticks. */
  function captures(player: boolean, ticks: number): number {
    const sim = floodSim();
    const nest = playerNest(sim);
    if (!player) nest.colony = 4242; // another colony's nest (the flood system only compares the colony id)
    const c = nest.chambers[0].center, bu = sim.world.bu;
    let n = 0, last = nest.flood.spillTick;
    for (let t = 0; t < ticks; t++) {
      if (t % 100 === 0) carveCapsule(sim, { x: c.x + (t / 100) * 0.3 * bu, y: c.y, z: c.z }, { x: c.x + (t / 100) * 0.3 * bu, y: c.y, z: c.z + 0.3 * bu }, 0.5 * bu);
      sim.tick();
      if (nest.flood.spillTick !== last) { n++; last = nest.flood.spillTick; }
    }
    return n;
  }

  it('captures at most every FLOOD_PREDICT_DRY_REBUILD_TICKS; the player nest at most predictions', () => {
    const ticks = 6000;
    const rival = captures(false, ticks), mine = captures(true, ticks);
    expect(rival).toBeLessThanOrEqual(Math.ceil(ticks / FLOOD_PREDICT_DRY_REBUILD_TICKS) + 1);
    expect(mine, `rival ${rival}, mine ${mine}`).toBeGreaterThanOrEqual(Math.floor(ticks / FLOOD_PREDICT_TICKS) / 2);
  });
});

describe('review finding 5: a carve without a breach record that opens a hole column under a mound grid', () => {
  it('drops the cached mask (nest runtime carve listener), so erosion sees the same mask as a fresh build', () => {
    const sim = makeTestSim({ nest: 'small', systems: [] });
    const nest = playerNest(sim);
    const e = nest.entrances[0];
    const bu = sim.world.bu;
    const m = createMound(sim, nest, e, e.pos.x, e.pos.z, 'loam');
    const cached = moundMask(sim, m);
    const holesBefore = cached.clear.reduce((n, c) => n + (c === 2 ? 1 : 0), 0);
    const breaches = sim.carve.breaches.length;
    // a shaft 5 BU from the entrance, up to just over the ground, recorded as no breach
    const x = e.pos.x + 5 * bu, z = e.pos.z, g = sim.field.height(x, z);
    carveCapsule(sim, { x, y: g - 3 * bu, z }, { x, y: g + 0.5 * bu, z }, 0.8 * bu, { recordBreach: false });
    expect(sim.carve.breaches.length).toBe(breaches);
    const now = moundMask(sim, m);
    nestRuntime(sim).moundMasks.delete(m.id);
    const fresh = moundMask(sim, m);
    expect(fresh.clear.reduce((n, c) => n + (c === 2 ? 1 : 0), 0)).toBeGreaterThan(holesBefore); // the probe flipped
    expect(Array.from(now.clear)).toEqual(Array.from(fresh.clear));
  });
});
