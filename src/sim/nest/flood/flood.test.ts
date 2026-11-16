// Nest flooding (GDD 03 §11, App. E22-E23): inflow rule, spill order, rim factor, drainage and recession,
// submersion of workers and larvae, events, chamber flooded shares, reference-storm risk.

import { describe, expect, it } from 'vitest';
import type { Sim } from '@/sim/types';
import { spawnAnt, spawnBrood, spawnItem } from '@/sim/entities';
import { FLOOD_ANT_SUB_KEY, WX_PUDDLE_UNIT_MM } from '@/sim/balance/weather';
import { drownStep } from './drown';
import { makeTestSim } from '@/sim/testing';
import { createSim } from '@/sim/sim';
import { restore, snapshot } from '@/sim/save/snapshot';
import { forceWeather } from '@/sim/environment/weather';
import { commandsSystem } from '@/sim/systems';
import { placeWorker, playerNest } from '../nestTestKit';
import { floodCheats } from './cheats';
import { addRim } from './floodTestKit';
import { floodSystem } from './index';
import { entranceInflow } from './inflow';
import { refreshFloodRisk } from './predict';
import { spillFor, spillPeek } from './runtime';
import { chamberFloodedShare, floodedAt, floodedCount } from './spill';
import { drainageOf } from './step';

function floodSim(): Sim {
  const sim = makeTestSim({ nest: 'small', systems: [commandsSystem, floodSystem] });
  return sim;
}

const run = (sim: Sim, n: number): void => { for (let i = 0; i < n; i++) sim.tick(); };

describe('GDD 03 E22: inflow and spill order', () => {
  it('rain intensity 1.0 for 250 ticks on a bare flat entrance gives W = 30 BU^3; flooded = lowest spill heights', () => {
    const sim = floodSim();
    const nest = playerNest(sim);
    floodCheats(sim.state).rainI = 1;
    floodCheats(sim.state).drainScale = 0;
    run(sim, 250);
    expect(nest.flood.water).toBeCloseTo(30, 1);
    const cache = spillFor(sim, nest);
    const n = floodedCount(cache, nest.flood.water);
    // the flooded set is a prefix of the H* order whose volume is W (within one voxel)
    expect(cache.cumVol[n]).toBeGreaterThanOrEqual(30 - 0.5);
    expect(cache.cumVol[n]).toBeLessThanOrEqual(30 + 0.5);
    for (let s = 1; s < n; s++) expect(cache.level[s]).toBeGreaterThanOrEqual(cache.level[s - 1]);
    // the deepest chamber (royal) floods first, the shallow food chamber stays dry
    const [food, , royal] = nest.chambers;
    // all 30 BU^3 stand in the royal chamber (about 148 BU^3): its share is about 30 / 148
    expect(chamberFloodedShare(cache, royal.id, n)).toBeGreaterThan(0.15);
    expect(chamberFloodedShare(cache, food.id, n)).toBe(0);
    expect(chamberFloodedShare(cache, nest.chambers[1].id, n)).toBe(0);
    expect(royal.flooded).toBeCloseTo(chamberFloodedShare(cache, royal.id, n), 9);
    expect(royal.wetUntilTick).toBeGreaterThan(sim.state.tick);
  });

  it('a side pocket lower than the water but behind a higher sill stays dry while the sump fills (minimax order)', () => {
    const sim = floodSim();
    const nest = playerNest(sim);
    const bu = sim.world.bu, v = sim.carve.voxel;
    const royal = nest.chambers[2], c = royal.center, r = royal.radii;
    // a pocket beside the royal chamber, its floor at the royal chamber's mid-height, reached over a 2 BU-high hump
    const pocket = { x: c.x + r.x + 4 * bu, y: c.y - 0.7 * r.y, z: c.z };
    const apex = { x: c.x + r.x + 2 * bu, y: c.y + r.y + 1.5 * bu, z: c.z };
    sim.kernel.carveCapsule({ x: c.x + r.x - 0.8 * bu, y: c.y + 0.5 * r.y, z: c.z }, apex, 0.6 * bu, { force: true });
    sim.kernel.carveCapsule(apex, pocket, 0.6 * bu, { force: true });
    sim.kernel.carveSphere(pocket, 1.2 * bu, { force: true });
    floodCheats(sim.state).rainI = 1;
    floodCheats(sim.state).drainScale = 0;
    run(sim, 250);
    const cache = spillFor(sim, nest);
    const n = floodedCount(cache, nest.flood.water);
    const level = nest.flood.level;
    expect(level).toBeGreaterThan(pocket.y - 1.2 * bu + 2 * v); // part of the pocket lies below the water level
    expect(level).toBeLessThan(apex.y - 0.6 * bu);
    // pocket samples below the water level: present in the cavity, all dry
    let below = 0;
    for (let k = -3; k <= 3; k++) for (let i = -3; i <= 3; i++) for (let j = 0; j >= -9; j--) {
      const x = pocket.x + i * v, y = pocket.y + j * v, z = pocket.z + k * v;
      if (y >= level - v || cache.index.get(Math.round(x / v), Math.round(y / v), Math.round(z / v)) < 0) continue;
      below++;
      expect(floodedAt(cache, v, x, y, z, n)).toBe(false);
    }
    expect(below).toBeGreaterThan(20);
    // while the royal chamber at the same height holds water
    expect(floodedAt(cache, v, c.x, level - v, c.z, n)).toBe(true);
  });

  it('a 3 BU crater rim cuts the same rain to W = 3.0 BU^3 (rim factor 0.1)', () => {
    const sim = floodSim();
    const nest = playerNest(sim);
    const e = nest.entrances[0];
    addRim(sim, nest, e, 3);
    expect(entranceInflow(sim, e, 1).rim).toBeCloseTo(0.1, 6);
    floodCheats(sim.state).rainI = 1;
    floodCheats(sim.state).drainScale = 0;
    run(sim, 250);
    expect(nest.flood.water).toBeCloseTo(3.0, 1);
  });

  it('sealed and sealing entrances let in 0.1 and 0.5 of the inflow', () => {
    const sim = floodSim();
    const e = playerNest(sim).entrances[0];
    const open = entranceInflow(sim, e, 1).q;
    e.status = 'sealing';
    expect(entranceInflow(sim, e, 1).q).toBeCloseTo(open * 0.5, 9);
    e.status = 'sealed';
    expect(entranceInflow(sim, e, 1).q).toBeCloseTo(open * 0.1, 9);
  });
});

describe('recession, events and risk', () => {
  it('water recedes at Q_out = K_DRAIN A_wet (1 - 0.7 m) once the rain stops, then flood-ended', () => {
    const sim = floodSim();
    const nest = playerNest(sim);
    floodCheats(sim.state).rainI = 1;
    const types: string[] = [];
    sim.events.onAny(((t: string) => { if (t.startsWith('flood-')) types.push(t); }) as never);
    run(sim, 250);
    expect(types[0]).toBe('flood-started');
    floodCheats(sim.state).rainI = 0;
    const cache = spillFor(sim, nest);
    const w0 = nest.flood.water;
    const expected = drainageOf(sim, nest, cache, floodedCount(cache, w0));
    expect(expected).toBeGreaterThan(0);
    run(sim, 10);
    expect(w0 - nest.flood.water).toBeCloseTo(expected, 3);
    // loam at moisture 0.4 drains a 30 BU^3 flood in a few game hours (the flood recedes, the event follows)
    run(sim, 40000);
    expect(nest.flood.water).toBe(0);
    expect(types).toContain('flood-ended');
    expect(nest.chambers.every((c) => c.flooded === 0)).toBe(true);
  });

  it('the reference storm predicts the bottom chamber at risk on an unraised entrance', () => {
    const sim = floodSim();
    const nest = playerNest(sim);
    const p = refreshFloodRisk(sim, nest)!;
    expect(p.peakWater).toBeGreaterThan(30);
    const royal = nest.chambers[2];
    expect(royal.floodRisk).toBeGreaterThan(0.25);
    expect(nest.chambers[0].floodRisk).toBeLessThan(royal.floodRisk);
  });
});

describe('GDD 03 E23: submersion', () => {
  it('a worker held in a flooded voxel keeps its hp for 50 s and drowns by 151 s', () => {
    const sim = floodSim();
    const nest = playerNest(sim);
    const royal = nest.chambers[2];
    const ant = placeWorker(sim, { x: royal.center.x, y: royal.center.y, z: royal.center.z }, { x: 1, y: 0, z: 0 }, nest.id);
    floodCheats(sim.state).drainScale = 0;
    nest.flood.water = 40;
    const hp0 = ant.hp;
    const dead: string[] = [];
    sim.events.on('ant-died', (e) => { if (e.antId === ant.id) dead.push(e.cause); });
    run(sim, 500);
    expect(ant.hp).toBe(hp0);
    run(sim, 1010);
    expect(ant.alive).toBe(false);
    expect(dead).toEqual(['drowning']);
  });

  it('a submerged larva is alive at 740 ticks and dead by 760 (brood-drowned)', () => {
    const sim = floodSim();
    const nest = playerNest(sim);
    const royal = nest.chambers[2];
    const pos = { x: royal.center.x, y: royal.center.y - royal.radii.y + sim.carve.voxel, z: royal.center.z };
    const b = spawnBrood(sim, { colony: sim.state.colonies[0].id, stage: 'larva', destined: 'worker', pos, nestId: nest.id, chamberId: royal.id });
    floodCheats(sim.state).drainScale = 0;
    nest.flood.water = 40;
    const drowned: number[] = [];
    sim.events.on('brood-drowned', (e) => drowned.push(e.id));
    run(sim, 740);
    expect(b.alive).toBe(true);
    run(sim, 20);
    expect(b.alive).toBe(false);
    expect(drowned).toEqual([b.id]);
  });

  it('a puddle 0.6 BU deep submerges an ant on open ground, but not one carrying a leaf fragment (GDD 06 §3.10)', () => {
    const sim = floodSim();
    const bu = sim.world.bu, c = sim.world.size / 2;
    const m = sim.state.env.moisture;
    const pos = { x: c - 30 * bu, y: sim.field.height(c - 30 * bu, c) + 0.2 * bu, z: c };
    const ix = Math.floor(pos.x / m.cell), iz = Math.floor(pos.z / m.cell);
    m.puddle[iz * m.nx + ix] = Math.round((0.6 * bu) / WX_PUDDLE_UNIT_MM);
    const col = sim.state.colonies[0].id;
    const wading = spawnAnt(sim, { colony: col, caste: 'worker', pos: { ...pos }, fwd: { x: 1, y: 0, z: 0 }, ageGd: 5 });
    const rafting = spawnAnt(sim, { colony: col, caste: 'worker', pos: { ...pos, z: pos.z + 0.3 * bu }, fwd: { x: 1, y: 0, z: 0 }, ageGd: 5 });
    const leaf = spawnItem(sim, { kind: 'leaf-fragment', pos: { ...pos } });
    rafting.carry = { kind: 'item', id: leaf.id };
    for (let s = 0; s < 5; s++) drownStep(sim, []);
    expect(wading.bb[FLOOD_ANT_SUB_KEY]).toBeCloseTo(5, 6);
    expect(rafting.bb[FLOOD_ANT_SUB_KEY]).toBeUndefined();
  });

  it('carried brood is never submerged', () => {
    const sim = floodSim();
    const nest = playerNest(sim);
    const royal = nest.chambers[2];
    const b = spawnBrood(sim, { colony: sim.state.colonies[0].id, stage: 'larva', destined: 'worker', pos: { ...royal.center }, nestId: nest.id });
    b.carriedBy = 12345;
    floodCheats(sim.state).drainScale = 0;
    nest.flood.water = 40;
    run(sim, 900);
    expect(b.alive).toBe(true);
    expect(b.submergedS ?? 0).toBe(0);
  });
});

describe('determinism', () => {
  it('two runs give the same water and chamber shares; a rebuilt cache (as after load) agrees', () => {
    const a = floodSim(), b = floodSim();
    for (const s of [a, b]) { floodCheats(s.state).rainI = 0.7; run(s, 600); }
    const na = playerNest(a), nb = playerNest(b);
    expect(na.flood.water).toBe(nb.flood.water);
    expect(na.chambers.map((c) => c.flooded)).toEqual(nb.chambers.map((c) => c.flooded));
    const fresh = spillFor(b, nb);
    expect(floodedCount(fresh, nb.flood.water)).toBe(floodedCount(spillFor(a, na), na.flood.water));
  });

  it('save / load mid-flood continues exactly (water, shares, submersion counters, hp)', () => {
    const a = floodSim();
    const nest = playerNest(a);
    const royal = nest.chambers[2];
    const ant = placeWorker(a, { ...royal.center }, { x: 1, y: 0, z: 0 }, nest.id);
    forceWeather(a, 'storm', null, 'test');
    a.state.env.weather.rainRateMmH = 30;
    run(a, 700);
    const b = createSim(restore(snapshot(a)).state, a.world, { systems: [commandsSystem, floodSystem] });
    run(a, 900);
    run(b, 900);
    const nb = b.stores.nests.get(nest.id)!;
    expect(nb.flood.water).toBe(nest.flood.water);
    expect(nb.chambers.map((c) => c.flooded)).toEqual(nest.chambers.map((c) => c.flooded));
    const ab = b.stores.ants.get(ant.id);
    expect(ab?.alive ?? false).toBe(ant.alive);
    if (ab && ant.alive) { expect(ab.hp).toBe(ant.hp); expect(ab.bb['wx.sub']).toBe(ant.bb['wx.sub']); }
  });

  it('digging during a flood: the spill cache is rebuilt at most once per 5 s and a save / load mid-freeze continues exactly', () => {
    const a = floodSim();
    floodCheats(a.state).rainI = 1;
    run(a, 300);
    const nest = playerNest(a);
    const royal = nest.chambers[2], bu = a.world.bu;
    const bite = (s: Sim, n: number): void => {
      const x = royal.center.x - 2 * bu + (n % 8) * 0.5 * bu;
      s.kernel.carveEllipsoid({ x, y: royal.center.y + 0.5 * royal.radii.y, z: royal.center.z - royal.radii.z }, { x: 0.4 * bu, y: 0.4 * bu, z: 0.4 * bu }, { force: true });
    };
    // a bite every 7 ticks for 100 ticks: at most 3 rebuilds (one per 50 ticks, plus the capture already due)
    let rebuilds = 0, n = 0;
    for (let t = 0; t < 100; t++) {
      if (t % 7 === 0) bite(a, n++);
      const before = spillPeek(a, nest.id);
      a.tick();
      if (spillPeek(a, nest.id) !== before) rebuilds++;
    }
    expect(rebuilds).toBeGreaterThan(0);
    expect(rebuilds).toBeLessThanOrEqual(3);
    // save inside a freeze (a bite just landed), then the same bites in both games
    bite(a, n++);
    a.tick();
    const b = createSim(restore(snapshot(a)).state, a.world, { systems: [commandsSystem, floodSystem] });
    floodCheats(b.state).rainI = 1;
    const evA: string[] = [], evB: string[] = [];
    a.events.onAny(((t: string) => { if (t.startsWith('flood-')) evA.push(t); }) as never);
    b.events.onAny(((t: string) => { if (t.startsWith('flood-')) evB.push(t); }) as never);
    for (let t = 0; t < 200; t++) {
      if (t % 7 === 0) { bite(a, n); bite(b, n); n++; }
      a.tick();
      b.tick();
    }
    const nb = playerNest(b);
    expect(nb.flood).toEqual(nest.flood);
    expect(nb.chambers.map((c) => c.flooded)).toEqual(nest.chambers.map((c) => c.flooded));
    expect(evB).toEqual(evA);
  });
});
