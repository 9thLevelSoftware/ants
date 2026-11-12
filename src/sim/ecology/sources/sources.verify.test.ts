// Adversarial checks by the reviewer (sources-core). Tests that pass are regression tests; a failing one marks a
// defect for the fixer (see the review report).

import { describe, expect, it } from 'vitest';
import type { FoodVariant, Sim } from '@/sim/types';
import { makeTestWorld } from '@/sim/testing';
import { TICKS_PER_DAY } from '@/sim/time';
import { calendarNow } from '@/sim/environment';
import { CARRION_MULT } from '@/sim/balance/ecology';
import { createSource } from './spawn';
import { takeFromSource } from './harvest';
import { carrionDropsPerGd, zonePlots } from './drops';
import { addWorker, centre, fakeAction, makeSourceSim, stepTicks } from './testkit';
import { freeSlotsOf, hasSlot } from './slots';
import { sourcesSmelledFrom, nearestSource, sourceQuality } from './discovery';
import { dayOffer } from './budget';
import { placeMarker } from '@/sim/entities';
import { footprintMm } from './def';

function liveCount(sim: Sim, v: FoodVariant): number {
  return sim.stores.sources.list.filter((s) => s.alive && s.variant === v).length;
}

describe('harvest input guards', () => {
  it('a NaN drinking time takes nothing and leaves no NaN in the crop', () => {
    const sim = makeSourceSim();
    const p = centre(sim);
    const s = createSource(sim, { variant: 'sugary-spill', pos: p, units: 5, tier: 2 });
    const ant = addWorker(sim, p);
    takeFromSource(sim, ant, s.id, Number.NaN);
    expect(Number.isFinite(ant.cropC)).toBe(true);
    expect(s.units).toBe(5); // BUG: setAmount(NaN) clamps to 0, the whole spill vanishes
  });

  it('a NaN unit count picks nothing and does not wipe the source', () => {
    const sim = makeSourceSim();
    const p = centre(sim);
    const s = createSource(sim, { variant: 'sugar-granules', pos: p, units: 100 });
    const ant = addWorker(sim, p);
    takeFromSource(sim, ant, s.id, Number.NaN);
    const it = sim.stores.items.list.find((i) => i.alive);
    if (it) expect(Number.isFinite(it.c) && Number.isFinite(it.count)).toBe(true);
    expect(sim.stores.sources.get(s.id)?.units).toBeGreaterThan(90); // BUG: units -> 0, source removed
  });

  it('a negative or zero drinking time takes nothing', () => {
    const sim = makeSourceSim();
    const p = centre(sim);
    const s = createSource(sim, { variant: 'flower', pos: p });
    const ant = addWorker(sim, p);
    for (const t of [-5, 0]) {
      const r = takeFromSource(sim, ant, s.id, t);
      expect(r.taken).toBe(0);
    }
    expect(s.units).toBeCloseTo(1.5, 12);
    expect(ant.cropC).toBe(0);
  });

  it('an infinite drinking time stops at the crop capacity', () => {
    const sim = makeSourceSim();
    const p = centre(sim);
    const s = createSource(sim, { variant: 'sugary-spill', pos: p, units: 40, tier: 2 });
    const ant = addWorker(sim, p);
    takeFromSource(sim, ant, s.id, Number.POSITIVE_INFINITY);
    expect(ant.cropC).toBeCloseTo(ant.cropCap, 9);
    expect(s.units).toBeCloseTo(40 - ant.cropCap, 9);
  });

  it('an ant that cannot carry anything (carryCap 0) gets no empty piece from a tear source', () => {
    const sim = makeSourceSim();
    const p = centre(sim);
    const s = createSource(sim, { variant: 'insect-medium', pos: p });
    const ant = addWorker(sim, p);
    ant.carryCap = 0;
    const r = takeFromSource(sim, ant, s.id, 1);
    expect(r.status).not.toBe('ok'); // BUG: 'ok' with a 0-bulk item in the mandibles, source unchanged
    expect(ant.carry.kind).toBe('none');
  });

  it('a pick source left with a fraction of a unit is not offered forever as an un-pickable source', () => {
    const sim = makeSourceSim();
    const p = centre(sim);
    const s = createSource(sim, { variant: 'crumb-starch', pos: p, units: 2.5 }); // e.g. cheat.spawnFood units 2.5
    const ant = addWorker(sim, p);
    let last = '';
    for (let i = 0; i < 5; i++) {
      last = takeFromSource(sim, ant, s.id, 1).status;
      ant.carry = { kind: 'none', id: -1 };
    }
    // Fixer: units are rounded to whole crumbs at creation and a pick source below one unit counts as empty, so
    // the last take finds the source retired ('no-source') rather than alive and 'empty'.
    expect(['empty', 'no-source']).toContain(last);
    expect(sim.stores.sources.get(s.id)).toBeUndefined();
    expect(nearestSource(sim, sim.state.player.colonyId, p, 1000)).toBe(-1);
  });

  it('tearing a whole carcass conserves C and P exactly (pieces + lying scrap)', () => {
    const sim = makeSourceSim();
    const p = centre(sim);
    const s = createSource(sim, { variant: 'insect-medium', pos: p });
    const ant = addWorker(sim, p);
    ant.carryCap = 0.7; // pieces of 0.7 leave a 0.1 scrap at the end (5 = 7 x 0.7 + 0.1)
    let guard = 0;
    while (sim.stores.sources.get(s.id) && guard++ < 50) {
      expect(takeFromSource(sim, ant, s.id, 1).status).toBe('ok');
      ant.carry = { kind: 'none', id: -1 };
    }
    const items = sim.stores.items.list.filter((i) => i.alive);
    const c = items.reduce((a, i) => a + i.c, 0), pp = items.reduce((a, i) => a + i.p, 0);
    const bulk = items.reduce((a, i) => a + i.bulk, 0);
    expect(c).toBeCloseTo(0.1, 9);
    expect(pp).toBeCloseTo(4, 9);
    expect(bulk).toBeCloseTo(5, 9);
    for (const i of items) expect(i.bulk).toBeLessThanOrEqual(0.7 + 1e-9);
  });
});

describe('slots', () => {
  it('a direct caller without an action is served only while a slot is free; slot holders keep FIFO order', () => {
    const sim = makeSourceSim();
    const p = centre(sim);
    const s = createSource(sim, { variant: 'insect-medium', pos: p }); // 3 slots
    const ants = [0, 1, 2, 3].map(() => addWorker(sim, p));
    // started in reverse id order: ant 3 first
    ants.forEach((a, i) => fakeAction(a, 'harvest-solid', s.id, p, 100 - i));
    expect(freeSlotsOf(sim, s)).toBe(0);
    expect(hasSlot(sim, ants[3], s)).toBe(true);
    expect(hasSlot(sim, ants[1], s)).toBe(true);
    expect(hasSlot(sim, ants[0], s)).toBe(false); // the latest starter queues
    const outsider = addWorker(sim, p);
    expect(hasSlot(sim, outsider, s)).toBe(false);
  });

  it('a finished (done) action frees its slot', () => {
    const sim = makeSourceSim();
    const p = centre(sim);
    const s = createSource(sim, { variant: 'insect-small', pos: p }); // 1 slot
    const a = addWorker(sim, p), b = addWorker(sim, p);
    fakeAction(a, 'pick-up', s.id, p, 1);
    expect(hasSlot(sim, b, s)).toBe(false);
    if (a.action) a.action.phase = 'done';
    expect(hasSlot(sim, b, s)).toBe(true);
  });
});

describe('discovery and choice edge cases', () => {
  it('positions outside the world and huge radii are safe', () => {
    const sim = makeSourceSim();
    const p = centre(sim);
    const s = createSource(sim, { variant: 'flower', pos: p });
    expect(sourcesSmelledFrom(sim, { x: -1e6, y: 0, z: -1e6 })).toEqual([]);
    expect(nearestSource(sim, sim.state.player.colonyId, { x: -50, y: 0, z: -50 }, 1e9)).toBe(s.id);
    expect(nearestSource(sim, sim.state.player.colonyId, p, 0)).toBe(s.id); // standing on it
    expect(sourceQuality(sim, sim.state.player.colonyId, 123456)).toBe(0);
  });
});

describe('avoid markers (GDD 05 §1.8: "any marker overlapping it")', () => {
  it('a marker that overlaps a large spill but not its centre still zeroes its quality', () => {
    const sim = makeSourceSim();
    const c = centre(sim);
    const colony = sim.state.player.colonyId;
    const spill = createSource(sim, { variant: 'sugary-spill', pos: c, tier: 2, spillMm: 200 });
    const r = 10 * sim.world.bu;
    const edge = footprintMm(spill, sim.world.bu); // 100 mm
    placeMarker(sim, { kind: 'avoid', pos: { x: c.x + edge + r * 0.5, y: 0, z: c.z }, radius: r, colony });
    expect(sourceQuality(sim, colony, spill.id)).toBe(0); // BUG: only the centre point is tested
  });
});

describe('long-run bounds (T1, no ants)', () => {
  it('T1 carrion that nobody takes does not pile up without bound (two game years)', () => {
    const world = makeTestWorld({ sizeBu: 1000, seed: 4 });
    const sim = makeSourceSim({ world });
    const perGd = carrionDropsPerGd(1, 'lawn', zonePlots(world).lawn, 'summer', CARRION_MULT.naturalist);
    const year = 4 * sim.state.config.rules.seasonLengthDays;
    const atYearEnd: number[] = [];
    for (let d = 1; d <= 2 * year; d++) {
      stepTicks(sim, TICKS_PER_DAY);
      if (d % year === 0) atYearEnd.push(liveCount(sim, 'insect-medium'));
    }
    console.info(`[verify] insect-medium summer drops/gd ${perGd.toFixed(2)}; live after year 1 / 2: ${atYearEnd.join(' / ')}; insect-small live ${liveCount(sim, 'insect-small')}`);
    // insect-small is bounded by its 3 gd T1 lifetime ...
    expect(liveCount(sim, 'insect-small')).toBeLessThanOrEqual(Math.ceil(4 * perGd * 5 * 3) + 3);
    // ... insect-medium has no T1 removal at all (GDD 05 §1.2 "decay 1.6" is skipped at T1 and only insect-small
    // got the T1 removal age): every drop of every year is still on the map, so the count grows without bound.
    expect(atYearEnd[1]).toBeLessThanOrEqual(1.25 * atYearEnd[0]); // BUG: year 2 ~ 2 x year 1
  }, 60_000);

  it('dayOffer never returns NaN or negative values on an empty world', () => {
    const sim = makeSourceSim();
    const o = dayOffer(sim, { center: centre(sim), radiusMm: 0 });
    expect(Number.isFinite(o.c) && Number.isFinite(o.p)).toBe(true);
    expect(o.c).toBeGreaterThanOrEqual(0);
  });
});
