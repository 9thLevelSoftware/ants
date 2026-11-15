// Plants module rules around the herd model: claims and takeover, discovery (also through the film), predators
// (herdDamage and GDD 05 App. E 4 first half), culling, mowing, collapse, migrants and dispersal, rain on films,
// cheats, New Game herds (Tier 2), the tend demand and its allocation adapter, diag-herds, and the yearly recovery
// of the herds (invariant I3: >= 35 % of the hosts hold herds on days 7-14) over two years, three seeds.

import { afterEach, describe, expect, it } from 'vitest';
import type { Ant, Sim, SimEvent } from '@/sim/types';
import { createColony, colonySlotBit, spawnAnt } from '@/sim/entities';
import { arriveAtHerd } from '@/sim/ecology';
import { placeOnSurface } from '@/sim/locomotion';
import { DEFAULT_DAYS_PER_YEAR, TICKS_PER_DAY, TICKS_PER_HOUR, ticksPerYear } from '@/sim/time';
import { taskIndex } from '@/sim/types';
import { HERD_INITIAL_OCCUPANCY, MOW_A_MULT } from '@/sim/balance/ecology';
import { cullAphid, destroyHost, herdDamage, mowHerdsInArea, rainOnFilms } from './disturb';
import { applyTendDemand, herdTendDemand, tendersWanted } from './demand';
import { herdDiagInputs, herdDiagnostic } from './diagnostics';
import { HOST_APHID } from './hosts';
import { initPlants, pregrownHerd } from './init';
import { ensureLinks, herdSourceOf } from './links';
import { retireSource } from '../sources/remove';
import { kEff } from './herdMath';
import { plantCommandHandlers } from './commands';
import { runPlantsHour, runTendingStep } from './system';
import { addHerd, fixWeather, herbWorld, plantSim, stepTicks } from './testkit';

let restore: (() => void) | null = null;
afterEach(() => { restore?.(); restore = null; });

function events(sim: Sim, type: string): SimEvent[] {
  const out: SimEvent[] = [];
  sim.events.on(type as never, ((e: SimEvent) => out.push(e)) as never);
  return out;
}

function setD28(sim: Sim, d28: number): void {
  const cal = Math.round((d28 / DEFAULT_DAYS_PER_YEAR) * ticksPerYear(sim.state.config));
  sim.state.env.calendar.startTick = cal - sim.state.tick;
}

/** An ant of a colony standing beside a point (not thinking: it keeps its place and task). */
function standingAnt(sim: Sim, colonyId: number, at: { x: number; y: number; z: number }, task: Ant['task']): Ant {
  const p = { x: at.x - 0.3 * sim.world.bu, y: at.y, z: at.z };
  const a = spawnAnt(sim, { colony: colonyId, caste: 'worker', pos: p, fwd: { x: 0, y: 1, z: 0 }, ageGd: 8 });
  placeOnSurface(sim, a, p, { x: 1, y: 0, z: 0 });
  a.task = task;
  a.thinkTick = Number.MAX_SAFE_INTEGER;
  return a;
}

describe('claims, discovery, tend', () => {
  it('a tending colony claims the herd (herd-claimed); a rival tending more takes it over (herd-lost, takeover)', () => {
    restore = fixWeather(20);
    const { sim, plants } = plantSim({ workers: 1 });
    const h = addHerd(sim, plants[0], 100);
    const src = herdSourceOf(sim, h)!;
    const player = sim.state.colonies[0];
    const rival = createColony(sim, { species: 'lasius-niger', isPlayer: false });
    sim.state.rivals.territory.slotColony[1] = rival.id;
    const claimed = events(sim, 'herd-claimed'), lost = events(sim, 'herd-lost');
    const mine = standingAnt(sim, player.id, src.pos, 'tend');
    stepTicks(sim, 10);
    for (let i = 0; i < 30; i++) runTendingStep(sim, 1);
    sim.events.flush();
    expect(h.tenderColony).toBe(player.id);
    expect(player.honeydew!.herdClaims).toContain(h.id);
    expect(h.tend).toBeGreaterThan(0.15); // one tender of the two needed: tend heads for 0.5 with tau 60 s
    expect(claimed.at(-1)).toMatchObject({ herdId: h.id, colonyId: player.id, cause: 'tended' });
    mine.task = 'idle';
    for (let i = 0; i < 3; i++) standingAnt(sim, rival.id, src.pos, 'tend');
    stepTicks(sim, 1);
    for (let i = 0; i < 60; i++) runTendingStep(sim, 1);
    sim.events.flush();
    expect(h.tenderColony).toBe(rival.id);
    expect(lost.at(-1)).toMatchObject({ herdId: h.id, colonyId: player.id, cause: 'rival-claim' });
    expect(player.honeydew!.herdClaims).not.toContain(h.id);
  });

  it('a claim stays while nobody tends (decision); tend decays toward 0', () => {
    restore = fixWeather(20);
    const { sim, plants } = plantSim();
    const h = addHerd(sim, plants[0], 100, { tenderColony: sim.state.colonies[0].id, tend: 0.8 });
    for (let i = 0; i < 300; i++) runTendingStep(sim, 1);
    expect(h.tenderColony).toBe(sim.state.colonies[0].id);
    expect(h.tend).toBeLessThan(0.01);
    expect(h.tend).toBeGreaterThan(0);
  });

  it('an ant within 6 BU discovers the herd; finding the film discovers the herd above it', () => {
    restore = fixWeather(20);
    const { sim, plants } = plantSim({ workers: 1, herbs: [{ dx: -30, dz: -20 }, { dx: 30, dz: -20 }] });
    const [h1, h2] = plants.map((p) => addHerd(sim, p, 50));
    const col = sim.state.colonies[0], bit = colonySlotBit(sim, col.id);
    const found = events(sim, 'food-source-discovered');
    standingAnt(sim, col.id, herdSourceOf(sim, h1)!.pos, 'forage');
    sim.stores.sources.get(h2.filmSourceId)!.discoveredBy |= bit;
    stepTicks(sim, 1);
    runTendingStep(sim, 1);
    sim.events.flush();
    expect(herdSourceOf(sim, h1)!.discoveredBy & bit).toBe(bit);
    expect(herdSourceOf(sim, h2)!.discoveredBy & bit).toBe(bit);
    expect(found.filter((e) => e.type === 'food-source-discovered' && e.variant === 'aphid-herd')).toHaveLength(2);
  });
});

describe('cheats', () => {
  it('cheat.spawnHerd needs a finite aphid count (command-rejected, no herd); with one it founds a herd', () => {
    const { sim, plants } = plantSim({ systems: [] });
    const rejected = events(sim, 'command-rejected');
    const before = sim.stores.herds.list.filter((h) => h.alive).length;
    const spawn = plantCommandHandlers['cheat.spawnHerd']!;
    spawn(sim, { type: 'cheat.spawnHerd', plantId: plants[0].id } as never);
    spawn(sim, { type: 'cheat.spawnHerd', plantId: plants[0].id, aphids: Number.NaN, k: 0 });
    sim.events.flush();
    expect(rejected).toHaveLength(2);
    expect(sim.stores.herds.list.filter((h) => h.alive)).toHaveLength(before);
    spawn(sim, { type: 'cheat.spawnHerd', plantId: plants[0].id, aphids: 12, k: Number.NaN });
    const made = sim.stores.herds.list.filter((h) => h.alive);
    expect(made).toHaveLength(before + 1);
    const h = made[made.length - 1];
    expect(h.a).toBe(12);
    expect(Number.isFinite(h.kMax)).toBe(true);
  });
});

describe('disturbances, predators, culling', () => {
  it('E4 (first half): a ladybird feeding on a frozen herd of 100 for 120 s leaves A = 80 +- 1', () => {
    restore = fixWeather(20);
    const { sim, plants } = plantSim();
    const h = addHerd(sim, plants[0], 100);
    plantCommandHandlers['cheat.setHerd']!(sim, { type: 'cheat.setHerd', herdId: h.id, values: { frozen: 1 } });
    setD28(sim, 9.5); // summer daytime: ladybirds feed by day
    sim.state.env.calendar.startTick += Math.round(12 * TICKS_PER_HOUR) - (calHour(sim) * TICKS_PER_HOUR | 0);
    const c = arriveAtHerd(sim, h, 'ladybird');
    expect(c).not.toBeNull();
    stepTicks(sim, 30); // fly-in (FLY_PHASE_S)
    const a0 = h.a;
    stepTicks(sim, 1200);
    expect(Math.abs(h.a - (a0 - 20))).toBeLessThanOrEqual(1);
  });

  it('herdDamage removes aphids (never below 0); the herd collapses on the next hour (herd-collapsed, herd-lost)', () => {
    restore = fixWeather(20);
    const { sim, plants } = plantSim({ systems: [] });
    const h = addHerd(sim, plants[0], 10, { tenderColony: sim.state.colonies[0].id });
    expect(herdDamage(sim, h.id, 4)).toBe(4);
    expect(herdDamage(sim, h.id, 100)).toBe(6);
    expect(h.a).toBe(0);
    const collapsed = events(sim, 'herd-collapsed'), lost = events(sim, 'herd-lost');
    setD28(sim, 9);
    runPlantsHour(sim, 1 / 24);
    sim.events.flush();
    expect(h.alive).toBe(false);
    expect(sim.stores.sources.get(h.filmSourceId)).toBeUndefined();
    expect(collapsed).toHaveLength(1);
    expect(lost).toHaveLength(1);
    expect(plants[0].herdIds).toEqual([]);
  });

  it('a removed herd leaves no claim behind (destroyed host as well as a crash)', () => {
    const { sim, plants } = plantSim({ systems: [] });
    const col = sim.state.colonies[0];
    const h = addHerd(sim, plants[0], 10, { tenderColony: col.id });
    col.honeydew!.herdClaims.push(h.id);
    destroyHost(sim, plants[0].id, 'trampled');
    expect(h.alive).toBe(false);
    expect(col.honeydew!.herdClaims).toEqual([]);
  });

  it('a herd source retired by anyone is re-created and found again (the no-source cache is refreshed)', () => {
    const { sim, plants } = plantSim({ systems: [] });
    const h = addHerd(sim, plants[0], 30);
    const src = herdSourceOf(sim, h)!;
    retireSource(sim, src, 'test');
    expect(herdSourceOf(sim, h)).toBeUndefined();
    expect(herdSourceOf(sim, h)).toBeUndefined(); // cached miss
    ensureLinks(sim, h);
    const again = herdSourceOf(sim, h);
    expect(again).toBeDefined();
    expect(again!.id).not.toBe(src.id);
    expect(again!.herdId).toBe(h.id);
  });

  it('cull-aphid: one aphid becomes a food piece of 0.15 bulk, 0.02 C, 0.08 P (aphid-culled)', () => {
    const { sim, plants } = plantSim({ systems: [] });
    const h = addHerd(sim, plants[0], 10);
    const culled = events(sim, 'aphid-culled');
    const id = cullAphid(sim, h.id);
    sim.events.flush();
    const it = sim.stores.items.get(id)!;
    expect(h.a).toBe(9);
    expect(it).toMatchObject({ kind: 'food-piece', bulk: 0.15, c: 0.02, p: 0.08 });
    expect(culled).toHaveLength(1);
  });

  it('mowing: A x 0.2 and K_eff x 0.3 recovering over 3 gd; any rain empties the films', () => {
    const { sim, plants } = plantSim({ systems: [] });
    const h = addHerd(sim, plants[0], 50);
    const p = sim.world.objects.find((o) => o.id === plants[0].objectId)!.pos;
    expect(mowHerdsInArea(sim, p, 10)).toBe(1);
    expect(h.a).toBeCloseTo(50 * MOW_A_MULT, 9);
    const k0 = 80; // herb, quality 1, tend 0
    expect(kEff(h, sim.state.tick)).toBeCloseTo(k0 * 0.3, 6);
    expect(kEff(h, sim.state.tick + 1.5 * TICKS_PER_DAY)).toBeCloseTo(k0 * 0.65, 6);
    expect(kEff(h, sim.state.tick + 3 * TICKS_PER_DAY)).toBeCloseTo(k0, 6);
    const film = sim.stores.sources.get(h.filmSourceId)!;
    film.units = 0.4; film.pool = 0.4;
    rainOnFilms(sim);
    expect(film.units).toBe(0);
  });
});

describe('migrants, dispersal, New Game', () => {
  it('a crowded herd sends batches of 5 to a free host within 400 BU; migrants found herds of 5 on days 3-12', () => {
    restore = fixWeather(20);
    const { sim, plants } = plantSim({ systems: [], herbs: [{ dx: -30, dz: -20 }, { dx: 30, dz: -20 }] });
    const h = addHerd(sim, plants[0], 80);
    const founded = events(sim, 'herd-founded');
    setD28(sim, 15.5); // outside the migrant window
    for (let i = 0; i < 48; i++) runPlantsHour(sim, 1 / 24);
    sim.events.flush();
    expect(h.a).toBeLessThan(80);
    expect(plants[1].herdIds.length).toBe(1);
    expect(sim.stores.herds.get(plants[1].herdIds[0])!.a).toBeGreaterThan(0);
    expect(founded.length).toBeGreaterThanOrEqual(1);
    // migrants: an empty host in the window gets a herd within a few days (p 0.12 per gd)
    const { sim: s2, plants: p2 } = plantSim({ systems: [], herbs: Array.from({ length: 12 }, (_, i) => ({ dx: -60 + 10 * i, dz: 40 })) });
    setD28(s2, 2.5);
    for (let i = 0; i < 24 * 9; i++) runPlantsHour(s2, 1 / 24);
    const occupied = p2.filter((p) => p.herdIds.length > 0).length;
    expect(occupied).toBeGreaterThanOrEqual(3); // expected 12 x (1 - 0.88^9) ~ 8
  });

  it('Tier 2 New Game: a share of the worldgen herd sites starts with herds, pre-grown to the start day', () => {
    const hw = herbWorld(200, Array.from({ length: 20 }, (_, i) => ({ dx: -90 + 9 * i, dz: 0 })));
    for (const [i, oid] of hw.objectIds.entries()) {
      hw.world.placements.foodAnchors.push({
        id: 1000 + i, kind: 'honeydew', pos: hw.sites[i], up: { x: -1, y: 0, z: 0 }, hostObjectId: oid, seasonMask: 15,
        initialState: 'aphid-herd full',
      });
    }
    const { sim } = plantSim({ systems: [] });
    // plant states and herds for the herb world, as createNewGame makes them
    const before = sim.stores.herds.list.length;
    const made = initPlants(sim, hw.world, 2);
    expect(made).toBeGreaterThan(20 * HERD_INITIAL_OCCUPANCY - 7);
    expect(made).toBeLessThan(20 * HERD_INITIAL_OCCUPANCY + 7);
    expect(sim.stores.herds.list.length - before).toBe(made);
    // pre-growth: eggs before day 1 06:00, 8 stem mothers grown untended afterwards, eggs in winter
    expect(pregrownHerd(80, 0.1, 24)).toMatchObject({ a: 0, e: 8 });
    expect(pregrownHerd(80, 0.3, 24).a).toBeGreaterThanOrEqual(8);
    expect(pregrownHerd(80, 6, 24).a).toBeGreaterThan(40);
    expect(pregrownHerd(80, 23, 24)).toMatchObject({ a: 0, e: 8 });
    expect(HOST_APHID).toBe(1);
  });
});

describe('tend demand, allocation adapter, diagnostics', () => {
  it('tenders wanted = GDD 02 tenderSlots (2 + floor(A/25)); x2 under a forage marker, 0 under avoid or unknown', () => {
    restore = fixWeather(20);
    const { sim, plants } = plantSim({ workers: 2 });
    const col = sim.state.colonies[0];
    const h = addHerd(sim, plants[0], 120);
    expect(tendersWanted(sim, col, h)).toBe(0); // not discovered yet
    herdSourceOf(sim, h)!.discoveredBy |= colonySlotBit(sim, col.id);
    expect(tendersWanted(sim, col, h)).toBe(6); // 2 + floor(120/25)
    h.a = 100;
    expect(tendersWanted(sim, col, h)).toBe(6); // 2 + floor(100/25)
    h.a = 400;
    expect(tendersWanted(sim, col, h)).toBe(16); // at most TEND_SLOTS_MAX
    h.a = 120;
    sim.enqueue({ type: 'placeMarker', kind: 'forage', pos: { ...herdSourceOf(sim, h)!.pos }, radius: 20 });
    sim.applyPendingCommands();
    expect(tendersWanted(sim, col, h)).toBe(12);
    expect(herdTendDemand(sim, col.id)).toBe(12);
    sim.enqueue({ type: 'placeMarker', kind: 'avoid', pos: { ...herdSourceOf(sim, h)!.pos }, radius: 8 });
    sim.applyPendingCommands();
    expect(tendersWanted(sim, col, h)).toBe(0);
  });

  it('the adapter raises tend demand and target after an allocation pass, never above idle + actual', () => {
    restore = fixWeather(20);
    const { sim, plants } = plantSim({ workers: 6 });
    const col = sim.state.colonies[0];
    const h = addHerd(sim, plants[0], 120);
    herdSourceOf(sim, h)!.discoveredBy |= colonySlotBit(sim, col.id);
    for (const a of sim.state.ants) if (a.caste === 'worker') a.task = 'idle';
    col.alloc.lastTick = sim.state.tick;
    col.alloc.demand.fill(0); col.alloc.target.fill(0); col.alloc.actual.fill(0);
    applyTendDemand(sim, col);
    const t = taskIndex('tend');
    expect(col.alloc.demand[t]).toBe(6);
    expect(col.alloc.target[t]).toBe(6);
    for (const a of sim.state.ants.slice(0, 4)) if (a.caste === 'worker') a.task = 'nurse';
    col.alloc.target.fill(0);
    applyTendDemand(sim, col);
    expect(col.alloc.target[t]).toBeLessThanOrEqual(6);
  });

  it('diag-herds inputs: claims, aphids, tend, tenders, production; a published record', () => {
    restore = fixWeather(20);
    const { sim, plants } = plantSim({ systems: [] });
    const col = sim.state.colonies[0];
    const h = addHerd(sim, plants[0], 100, { tenderColony: col.id, tend: 0.5 });
    herdSourceOf(sim, h)!.discoveredBy |= colonySlotBit(sim, col.id);
    const i = herdDiagInputs(sim, col, 9, 1);
    expect(i).toMatchObject({ claimed: 1, aphids: 100, meanTend: 0.5, tendersNeeded: 2, tendersPresent: 0, phase: 'summer peak' });
    expect(i.productionPerGd).toBeCloseTo(7.5, 9);
    const d = herdDiagnostic(sim, col, 9, 1);
    expect(d.id).toBe('diag-herds');
    expect(d.status).toBe('ok');
    expect(d.factors[0].cause).toBe('tenders-short');
    expect(d.factors.reduce((s, f) => s + f.weight, 0)).toBeCloseTo(1, 9);
    // GDD 07 §6.1.6: raise the tend slider first, then a forage marker, then possess a tender
    expect(d.remedies).toEqual(['remedy.slider.tend', 'remedy.marker.forage', 'remedy.possess.tend']);
  });
});

/** Fraction of hosts holding a herd, sampled per default-year day. */
function occupancyYears(seed: number, years: number): number[][] {
  const herbs = Array.from({ length: 24 }, (_, i) => ({ dx: -100 + 9 * (i % 12), dz: i < 12 ? -40 : 40 }));
  const { sim, plants } = plantSim({ systems: [], herbs, sizeBu: 260, seed });
  // New Game in spring with the starting share of sites occupied
  plants.forEach((p, i) => { if (i % 5 < 3) addHerd(sim, p, 0, { e: 8 }); });
  const out: number[][] = [];
  const hoursPerD = (24 * 7 * 4) / DEFAULT_DAYS_PER_YEAR;
  for (let y = 0; y < years; y++) {
    const row: number[] = [];
    for (let d = 0; d < 28; d += 1 / hoursPerD) {
      setD28(sim, d);
      runPlantsHour(sim, 1 / 24);
      row[Math.floor(d)] = plants.filter((p) => p.herdIds.length > 0 && sim.stores.herds.get(p.herdIds[0])!.a >= 1).length / plants.length;
      sim.stores.herds.sweep();
    }
    out.push(row);
  }
  return out;
}

describe('yearly recovery (GDD 05 §6 I3)', () => {
  it('>= 35 % of the hosts hold herds on days 7-14, two years, three seeds', () => {
    restore = fixWeather(18);
    for (const seed of [1, 2, 3]) {
      const years = occupancyYears(seed, 2);
      for (const row of years) for (let d = 6; d < 14; d++) expect(row[d], `seed ${seed} day ${d + 1}`).toBeGreaterThanOrEqual(0.35);
    }
  });
});

function calHour(sim: Sim): number {
  return ((sim.state.tick + sim.state.env.calendar.startTick) % TICKS_PER_DAY) / TICKS_PER_HOUR;
}
