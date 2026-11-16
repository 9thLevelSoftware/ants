// The herd branch of `tend` in a headless colony (task ecology-plants AC 3-5): 60 workers beside two herb host
// plants (aphid sites on the stems, reached by their climb routes) establish tending; honeydew comes home within
// the herds' production; an avoided third herd stays untended and follows the untended model exactly; GDD 07 App. E
// 6 (relay) and 9 (avoid marker); determinism and save/load. The 3-game-day stuck check is behind FOUNDRESS_LONG.

import { afterEach, describe, expect, it } from 'vitest';
import type { Ant, Herd, Sim } from '@/sim/types';
import { taskIndex } from '@/sim/types';
import { colonySlotBit, spawnAnt } from '@/sim/entities';
import { createSim } from '@/sim/sim';
import { restore as restoreSave, snapshot, stateHash } from '@/sim/save';
import { findNonPlain } from '@/sim/testing';
import { placeOnSurface } from '@/sim/locomotion';
import { arriveAtHerd, herdSourceOf, productionPerGd } from '@/sim/ecology';
import { hasMilestone } from '@/sim/progression';
import { addHerd, fixWeather, plantSim, stepTicks } from '@/sim/ecology/plants/testkit';
import { TICKS_PER_DAY } from '@/sim/time';
import { TH } from './tendHerdKeys';
import { startTravel } from './tendHerdStates';

/** Large runs only with FOUNDRESS_LONG=1. */
const LONG = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.FOUNDRESS_LONG === '1';

let restore: (() => void) | null = null;

/** After a storm, tenders need this long to walk back out and lift `tend` again (TEND_TAU plus the walk). */
const STORM_RECOVERY_TICKS = 0.1 * TICKS_PER_DAY;
afterEach(() => { restore?.(); restore = null; });

const HERBS = [{ dx: -20, dz: -30 }, { dx: 45, dz: -30 }, { dx: -40, dz: 40 }];

interface Colony60 {
  sim: Sim;
  herds: Herd[];
  /** The avoided herd (third plant). */
  avoided: Herd;
}

/** 60 workers, stores to live on, three herbs with 100 aphids each; the colony knows the herds; the third avoided. */
function colony60(seed = 1): Colony60 {
  const { sim, plants } = plantSim({ workers: 60, sizeBu: 200, herbs: HERBS, seed });
  const col = sim.state.colonies[0];
  sim.enqueue({ type: 'cheat.addFood', colonyId: col.id, c: 30, p: 15, toxin: 0 });
  const herds = plants.map((p) => addHerd(sim, p, 100));
  for (const h of herds) herdSourceOf(sim, h)!.discoveredBy |= colonySlotBit(sim, col.id); // reported by scouts
  const avoided = herds[2];
  sim.enqueue({ type: 'placeMarker', kind: 'avoid', pos: { ...herdSourceOf(sim, avoided)!.pos }, radius: 4 * sim.world.bu });
  sim.applyPendingCommands();
  return { sim, herds: herds.slice(0, 2), avoided };
}

interface Watch {
  honeydewC: number[];
  /** Production of the tended herds per game day (hourly samples), loads. */
  prodC: number[];
  climbs: Set<number>;
  atHerd: Set<number>;
  avoidedTenders: number;
  maxStill: number;
  /** Trips home of each tender (entries into tend.return, 10-tick samples). */
  returns: Map<number, number>;
  /** `tend` of each tended herd, sampled with prodC (every 250 ticks). */
  tendSamples: number[][];
  /** Per sample: a storm was on within the last STORM_RECOVERY_TICKS (its curfew calls every tender home). */
  stormSamples: boolean[];
  /** Ants in task `tend` at the end of the run, and the tick (10-tick samples) since when they have been. */
  tendSince: Map<number, number>;
}

/** Steps n ticks recording honeydew delivered per game day, climbs, arrivals and tenders of the avoided herd. */
function watch(sim: Sim, avoided: Herd, ticks: number, tended: Herd[] = []): Watch {
  const w: Watch = { honeydewC: [], prodC: [], climbs: new Set(), atHerd: new Set(), avoidedTenders: 0, maxStill: 0, tendSince: new Map(), tendSamples: [], stormSamples: [], returns: new Map() };
  let stormTick = -Infinity;
  const day = () => Math.floor(sim.state.tick / TICKS_PER_DAY);
  const d0 = day();
  sim.events.on('delivery', (e) => {
    if (e.kind !== 'honeydew') return;
    const i = day() - d0;
    w.honeydewC[i] = (w.honeydewC[i] ?? 0) + e.c;
  });
  const still = new Map<number, { x: number; z: number; y: number; t: number }>();
  const lastState = new Map<number, string>();
  for (let t = 0; t < ticks; t++) {
    sim.tick();
    if (sim.state.env.weather.state === 'storm') stormTick = sim.state.tick;
    if (t % 250 === 0) {
      w.stormSamples.push(sim.state.tick - stormTick <= STORM_RECOVERY_TICKS);
      const i = day() - d0;
      w.prodC[i] = (w.prodC[i] ?? 0) + tended.reduce((s, h) => s + productionPerGd(h.a, h.tend, 1), 0) / 24;
      w.tendSamples.push(tended.map((h) => h.tend));
    }
    if (t % 10 !== 0) continue;
    for (const a of sim.state.ants) {
      if (!a.alive || a.task !== 'tend') { w.tendSince.delete(a.id); continue; }
      if (!w.tendSince.has(a.id)) w.tendSince.set(a.id, sim.state.tick);
      if (a.state === 'tend.return' && lastState.get(a.id) !== 'tend.return') w.returns.set(a.id, (w.returns.get(a.id) ?? 0) + 1);
      lastState.set(a.id, a.state);
      if (a.nav.mode === 'climb') w.climbs.add(a.id);
      if (a.state === 'tend.solicit') w.atHerd.add(a.id);
      if ((a.bb[TH.herd] ?? -1) === avoided.id) w.avoidedTenders++;
      stillCheck(sim, a, still, w);
    }
  }
  return w;
}

/** Longest time a tender walking (outbound or return) made no 2 BU of progress, s. */
function stillCheck(sim: Sim, a: Ant, still: Map<number, { x: number; y: number; z: number; t: number }>, w: Watch): void {
  const walking = a.state === 'tend.outbound' || a.state === 'tend.return';
  const s = still.get(a.id);
  if (!walking) { still.delete(a.id); return; }
  if (!s || Math.hypot(a.pos.x - s.x, a.pos.y - s.y, a.pos.z - s.z) > 2 * sim.world.bu) {
    still.set(a.id, { x: a.pos.x, y: a.pos.y, z: a.pos.z, t: sim.state.tick });
    return;
  }
  w.maxStill = Math.max(w.maxStill, (sim.state.tick - s.t) / 10);
}

describe('herd tending in a 60-worker colony (AC 3, 4)', () => {
  it('establishes tending: herds claimed, tend high, tenders climb to the stems and bring honeydew home; the avoided herd stays untended', { timeout: 120_000 }, () => {
    restore = fixWeather(20);
    const { sim, herds, avoided } = colony60();
    // the control: the same untended herd in a sim without ants (same days, same model)
    const ctl = plantSim({ sizeBu: 200, herbs: HERBS, systems: undefined });
    const ctlHerd = addHerd(ctl.sim, ctl.plants[2], 100);
    const w = watch(sim, avoided, TICKS_PER_DAY, herds);
    stepTicks(ctl.sim, TICKS_PER_DAY);
    const col = sim.state.colonies[0];
    // tending established: over the second half of the day each herd's `tend` averages above 0.75 and never falls
    // below 0.5 in the last quarter (it dips when a cohort of tenders that arrived together fills up and leaves
    // together; the FOUNDRESS_LONG run shows tend near 1 on later days). A storm is a curfew that calls every tender
    // home (GDD 02 §6.6): seed 1's weather brings one late on day 1, so samples during it and while the tenders walk
    // back out are not held to the floor (L4 of the 1B sim gate: 0.47 there). The colony and the control share it.
    const n = w.tendSamples.length;
    const calm = w.tendSamples.filter((_, k) => !w.stormSamples[k]);
    const secondHalf = w.tendSamples.slice(Math.floor(n / 2));
    const lastQuarter = w.tendSamples.slice(-Math.round(n / 4)).filter((_, k) => !w.stormSamples[n - Math.round(n / 4) + k]);
    expect(calm.length).toBeGreaterThan(n / 2);
    herds.forEach((h, i) => {
      expect(h.tenderColony).toBe(col.id);
      expect(secondHalf.reduce((s, row) => s + row[i], 0) / secondHalf.length).toBeGreaterThan(0.75);
      for (const row of lastQuarter) expect(row[i]).toBeGreaterThan(0.5);
    });
    expect(col.honeydew?.herdClaims.sort()).toEqual(herds.map((h) => h.id).sort());
    const tenders = sim.state.ants.filter((a) => a.alive && a.task === 'tend').length;
    expect(tenders).toBeGreaterThanOrEqual(4);
    expect(w.climbs.size).toBeGreaterThanOrEqual(3); // tenders went up the stems by their climb routes
    expect(w.atHerd.size).toBeGreaterThanOrEqual(4);
    expect(w.honeydewC[0] ?? 0).toBeGreaterThan(3);
    // AC 3 range on the first day (it includes the walk-out and the claim): never more than the herds made, and at
    // least a third of it (the steady 50-105 % band of later days is checked in the FOUNDRESS_LONG run)
    console.log(JSON.stringify({ day0: { honeydewC: w.honeydewC[0], productionC: w.prodC[0] } }));
    expect(w.honeydewC[0] ?? 0).toBeLessThan(1.05 * w.prodC[0] + 1);
    expect(w.honeydewC[0] ?? 0).toBeGreaterThan(w.prodC[0] / 3);
    expect(w.maxStill).toBeLessThan(60);
    // GDD 07 App. E 9: no ant tends the herd under the avoid marker; it follows the untended model exactly
    expect(w.avoidedTenders).toBe(0);
    expect(avoided.tend).toBe(0);
    expect(avoided.a).toBeCloseTo(ctlHerd.a, 6);
    expect(avoided.a).toBeLessThan(100); // declines toward its untended K_eff of 80 (and below, by dispersal)
    for (const h of herds) expect(h.a).toBeGreaterThan(avoided.a);
    // codex / milestone inputs: the first herd tended for 0.5 gd and the first honeydew delivered
    expect(hasMilestone(sim, 'ms-first-aphid-herd')).toBe(true);
    expect(hasMilestone(sim, 'ms-first-honeydew')).toBe(true);
  });

  it('a tender at a herd with a ladybird defends it: alarm, then an attack on the predator', () => {
    restore = fixWeather(20);
    const { sim, plants, sites } = plantSim({ workers: 1, herbs: [{ dx: -30, dz: -20, heightBu: 8 }] });
    const h = addHerd(sim, plants[0], 100);
    const col = sim.state.colonies[0], bu = sim.world.bu;
    const p = { x: sites[0].x - 0.2 * bu, y: sites[0].y, z: sites[0].z };
    const tender = spawnAnt(sim, { colony: col.id, caste: 'worker', pos: p, fwd: { x: 0, y: 1, z: 0 }, ageGd: 8 });
    placeOnSurface(sim, tender, p, { x: 1, y: 0, z: 0 });
    tender.task = 'tend';
    tender.bb['run.task'] = taskIndex('tend');
    startTravel(sim, tender, h);
    const lb = arriveAtHerd(sim, h, 'ladybird');
    expect(lb).not.toBeNull();
    const acts: string[] = [];
    sim.events.on('action-started', (e) => { if (e.antId === tender.id) acts.push(`${e.action}:${e.target?.kind ?? ''}`); });
    stepTicks(sim, 200);
    expect(acts).toContain('release-alarm:none');
    // the tender bites (its guard state) or the alarm pulls it into the combat module's fight first
    expect(acts.some((a) => a === 'bite:creature' || a === 'bite-hold:creature' || a === 'spray-acid:none')).toBe(true);
  });
});

describe('relay and determinism', () => {
  it('GDD 07 App. E 6: a full tender relays to a forager within 3 BU and stays at the herd', () => {
    restore = fixWeather(20);
    const { sim, plants, sites } = plantSim({ workers: 1, herbs: [{ dx: -30, dz: -20, heightBu: 8 }] });
    const h = addHerd(sim, plants[0], 100);
    h.frozen = true;
    h.pool = 3;
    const col = sim.state.colonies[0];
    const site = sites[0], bu = sim.world.bu;
    const mk = (y: number, task: 'tend' | 'forage', crop: number): Ant => {
      const p = { x: site.x - 0.2 * bu, y, z: site.z };
      const a = spawnAnt(sim, { colony: col.id, caste: 'worker', pos: p, fwd: { x: 0, y: 1, z: 0 }, ageGd: 8 });
      placeOnSurface(sim, a, p, { x: 1, y: 0, z: 0 });
      a.task = task;
      a.cropC = crop;
      return a;
    };
    const tender = mk(site.y, 'tend', 0.9);
    const forager = mk(site.y - 2 * bu, 'forage', 0.2);
    forager.thinkTick = Number.MAX_SAFE_INTEGER; // stands where it is
    tender.bb['run.task'] = taskIndex('tend');
    expect(startTravel(sim, tender, h)).toBe(true);
    const relays: { fromAnt: number; toAnt: number; loads: number }[] = [];
    sim.events.on('honeydew-relay', (e) => relays.push(e));
    let gave = false;
    sim.events.on('action-started', (e) => { if (e.antId === tender.id && e.action === 'trophallaxis-give') gave = true; });
    stepTicks(sim, 100);
    // within 10 s the give has begun and the relay is reported (the tender turns round on the stem first)
    expect(gave).toBe(true);
    expect(relays).toHaveLength(1);
    expect(relays[0].fromAnt).toBe(tender.id);
    expect(relays[0].toAnt).toBe(forager.id);
    const f0 = 0.2;
    stepTicks(sim, 100); // the give itself runs at TROPH_RATE (up to TROPH_MAX_S)
    expect(relays).toHaveLength(1); // one report per give
    // the reported loads are what the give moved
    expect(relays[0].loads).toBeCloseTo(forager.cropC + forager.cropP - f0, 2);
    expect(['tend.solicit', 'tend.wait', 'tend.guard-herd', 'tend.full']).toContain(tender.state);
    expect(Math.hypot(tender.pos.x - site.x, tender.pos.y - site.y, tender.pos.z - site.z)).toBeLessThan(3 * bu);
  });

  it('same seed -> same state; save, load and continue equals the uninterrupted run; plain data', () => {
    restore = fixWeather(20);
    const run = () => { const c = colony60(3); stepTicks(c.sim, 1200); return c.sim; };
    const a = run(), b = run();
    expect(stateHash(a.state)).toBe(stateHash(b.state));
    expect(findNonPlain(a.state)).toEqual([]);
    const loaded = createSim(restoreSave(snapshot(a)).state, a.world);
    stepTicks(a, 600);
    stepTicks(loaded, 600);
    expect(stateHash(loaded.state)).toBe(stateHash(a.state));
  });
});

describe.skipIf(!LONG)('3 game days (FOUNDRESS_LONG)', () => {
  it('no stuck tenders, every tender keeps making trips, honeydew per day within the herds production', { timeout: 600_000 }, () => {
    restore = fixWeather(20);
    const { sim, herds, avoided } = colony60(2);
    const trips = new Map<number, number>();
    sim.events.on('delivery', (e) => { if (e.kind === 'honeydew') trips.set(e.antId, (trips.get(e.antId) ?? 0) + 1); });
    const w = watch(sim, avoided, 3 * TICKS_PER_DAY, herds);
    const endTick = sim.state.tick;
    const tenders = sim.state.ants.filter((a) => a.alive && a.task === 'tend');
    const report = { returns: [...w.returns.values()], honeydewC: w.honeydewC, productionC: w.prodC, maxStill: w.maxStill, tenders: tenders.length, climbs: w.climbs.size,
      herds: herds.map((h) => ({ a: h.a, tend: h.tend })), avoided: avoided.a, trips: [...trips.values()] };
    console.log(JSON.stringify(report));
    expect(w.maxStill).toBeLessThan(60);
    for (const a of tenders) expect(Number.isFinite(a.pos.x + a.pos.y + a.pos.z)).toBe(true);
    // every ant that stayed in `tend` for a game day or more kept making trips: home at least once per game day
    // (a tender in a crowd that gets no droplet goes home after TEND_SOLICIT_EMPTY_S + TEND_WAIT_TIMEOUT_S; guard
    // shifts keep it at the herd), and most of them brought honeydew
    const steady = [...w.tendSince].filter(([, t0]) => endTick - t0 >= TICKS_PER_DAY);
    expect(steady.length).toBeGreaterThanOrEqual(4);
    for (const [id, t0] of steady) {
      expect(w.returns.get(id) ?? 0, `ant ${id}`).toBeGreaterThanOrEqual(Math.floor((endTick - t0) / TICKS_PER_DAY));
    }
    expect(steady.filter(([id]) => (trips.get(id) ?? 0) >= 1).length).toBeGreaterThanOrEqual(0.75 * steady.length);
    // honeydew home per day (days 2 and 3, past the start) between half and all of the tended herds' production
    for (const d of [1, 2]) {
      expect(w.honeydewC[d] ?? 0).toBeGreaterThan(0.5 * w.prodC[d]);
      expect(w.honeydewC[d] ?? 0).toBeLessThan(1.05 * w.prodC[d] + 1);
    }
  });
});
