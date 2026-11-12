// Acceptance 3: renewable sources refill at the stated rate and cap; decaying sources lose amount with the stated
// half-life or schedule; depleted non-renewable sources are removed and emit the event. GDD 05 App. E 8 (carrion
// stages) at the hourly cadence.

import { describe, expect, it } from 'vitest';
import type { SimEvent } from '@/sim/types';
import { calendarNow, surfaceTemp } from '@/sim/environment';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '@/sim/time';
import { CARRION_REMOVE_GD, T1_CARRION_REMOVE_GD } from '@/sim/balance/ecology';
import { spawnItem } from '@/sim/entities';
import { createSource } from './spawn';
import { advanceCarrion, stageAt, stageClockRate } from './carrion';
import { isDaytime } from './lifecycle';
import { takeFromSource } from './harvest';
import { carrionFromItem } from './runtime';
import { addWorker, anchor, centre, makeSourceSim, stepTicks } from './testkit';

function collect(sim: ReturnType<typeof makeSourceSim>): SimEvent[] {
  const out: SimEvent[] = [];
  sim.events.onAny((_t, e) => out.push(e as SimEvent));
  return out;
}

/** Runs n sim ticks, flushing events every tick like the game does. */
function run(sim: ReturnType<typeof makeSourceSim>, ticks: number): void {
  for (let i = 0; i < ticks; i++) {
    sim.tick();
    sim.events.flush();
  }
}

describe('renewal', () => {
  it('a T1 static honeydew site refills 1.0 C per game day up to its 0.5 load cap', () => {
    const sim = makeSourceSim();
    const s = createSource(sim, { variant: 'honeydew-film', pos: centre(sim), tier: 1, empty: true });
    expect(s.units).toBe(0);
    s.capacity = 10; // measure the rate without the cap
    run(sim, TICKS_PER_DAY);
    expect(s.units).toBeCloseTo(1.0, 9);
    expect(s.pool).toBeCloseTo(1.0, 9);
    s.capacity = 0.5;
    s.units = 0;
    run(sim, TICKS_PER_DAY);
    expect(s.units).toBeCloseTo(0.5, 9);
  });

  it('a flower refills 4 C per game day, only between sunrise and sunset, up to 1.5', () => {
    const sim = makeSourceSim();
    const s = createSource(sim, { variant: 'flower', pos: centre(sim), empty: true });
    s.capacity = 100;
    let nightGain = 0, expected = 0;
    for (let h = 0; h < 24; h++) {
      const before = s.units;
      run(sim, TICKS_PER_HOUR);
      if (isDaytime(sim)) expected += 4 / calendarNow(sim).dayLength; // 4 C spread over the daylight hours
      else nightGain += s.units - before;
    }
    const dayLength = calendarNow(sim).dayLength;
    expect(nightGain).toBe(0);
    expect(s.units).toBeCloseTo(expected, 3); // sampled 5 ticks after the system run
    expect(Math.abs(s.units - 4)).toBeLessThanOrEqual(4 / dayLength + 1e-9); // whole-hour steps
    s.capacity = 1.5;
    s.units = 1.4;
    run(sim, TICKS_PER_DAY);
    expect(s.units).toBe(1.5);
  });

  it('pet bowls are refilled to full at 07:00 and 18:00', () => {
    const sim = makeSourceSim();
    const s = createSource(sim, { variant: 'kibble', pos: centre(sim), units: 30, tier: 2 });
    s.units = 2;
    run(sim, TICKS_PER_DAY);
    expect(s.units).toBe(30);
  });

  it('a refill clears the exhausted flag of a renewable source', () => {
    const sim = makeSourceSim();
    const p = centre(sim);
    const s = createSource(sim, { variant: 'honeydew-film', pos: p, tier: 1 });
    const ant = addWorker(sim, p);
    takeFromSource(sim, ant, s.id, 1000);
    expect(s.exhaustedBy).not.toBe(0);
    run(sim, TICKS_PER_DAY / 2);
    expect(s.exhaustedBy).toBe(0);
  });
});

describe('decay and schedules', () => {
  it('a T2 honeydew film halves every 0.3 gd', () => {
    const sim = makeSourceSim();
    const s = createSource(sim, { variant: 'honeydew-film', pos: centre(sim), tier: 2, units: 0.5 });
    run(sim, TICKS_PER_DAY);
    expect(s.units).toBeCloseTo(0.5 * Math.pow(0.5, 1 / 0.3), 9);
  });

  it('an indoor spill halves every 1 gd, turns to sticky residue below 30 % and is gone 2 gd later', () => {
    const sim = makeSourceSim();
    sim.world.zones[0].type = 'interior';
    const seen = collect(sim);
    const s = createSource(sim, { variant: 'sugary-spill', pos: centre(sim), tier: 2, spillMm: 50 });
    expect(s.units).toBe(40);
    expect(s.slots).toBe(24); // perimeter 157 mm / 6 mm = 26 -> cap 24
    run(sim, TICKS_PER_DAY);
    expect(s.units).toBeCloseTo(20, 6);
    run(sim, TICKS_PER_DAY);
    expect(s.variant).toBe('sticky-residue'); // 10 < 0.3 x 40
    expect(s.drinkRateMult).toBe(0.33);
    run(sim, 2 * TICKS_PER_DAY + TICKS_PER_HOUR);
    expect(sim.stores.sources.get(s.id)).toBeUndefined();
    expect(seen.some((e) => e.type === 'food-source-removed' && e.sourceId === s.id && e.cause === 'expired')).toBe(true);
  });

  it('outdoors a spill uses the sun (>= 30 °C surface: 0.15 gd) or shade (0.4 gd) half-life', () => {
    const sim = makeSourceSim();
    const s = createSource(sim, { variant: 'sugary-spill', pos: centre(sim), tier: 2, spillMm: 200 });
    const before = s.units;
    run(sim, TICKS_PER_HOUR);
    const h = surfaceTemp(sim, s.pos) >= 30 ? 0.15 : 0.4;
    expect(s.units / before).toBeCloseTo(Math.pow(0.5, 1 / 24 / h), 9);
  });

  // GDD 05 §1.2 writes the 3 gd only on insect-small; T1 drops every carrion stage, so all T1 carrion gets it
  // (T1_CARRION_REMOVE_GD, review decision), including a large corpse turned to carrion at T1.
  it('T1 carrion (small, medium, and a corpse made carrion) is removed 3 gd after it appeared, with its event', () => {
    const sim = makeSourceSim();
    const seen = collect(sim);
    const p = centre(sim);
    const corpse = spawnItem(sim, { kind: 'corpse', pos: p, init: { c: 1, p: 10, bulk: 20 } });
    const list = [
      createSource(sim, { variant: 'insect-small', pos: p }),
      createSource(sim, { variant: 'insect-medium', pos: p }),
      sim.stores.sources.get(carrionFromItem(sim, corpse.id))!,
    ];
    expect(list[2].variant).toBe('insect-large');
    expect(T1_CARRION_REMOVE_GD).toBe(3);
    for (const s of list) expect(s.stage).toBeNull();
    run(sim, 3 * TICKS_PER_DAY - TICKS_PER_HOUR);
    for (const s of list) expect(s.alive).toBe(true);
    run(sim, 2 * TICKS_PER_HOUR); // checked hourly
    for (const s of list) {
      expect(s.alive).toBe(false);
      expect(seen.some((e) => e.type === 'food-source-removed' && e.sourceId === s.id && e.cause === 'expired')).toBe(true);
    }
  });

  it('windfall slots and quality follow its stages; it is removed at 6 gd', () => {
    const sim = makeSourceSim();
    const s = createSource(sim, { variant: 'windfall', pos: centre(sim), fruit: 'apple', tier: 2 });
    expect([s.units, s.slots, s.quality]).toEqual([60, 2, 0.7]);
    expect(s.p).toBeCloseTo(0.5 / 60, 12);
    s.units = 1e6; s.capacity = 1e6; // keep it from drying out under the wasp drain
    run(sim, 2 * TICKS_PER_DAY);
    expect([s.slots, s.quality]).toEqual([6, 0.6]);
    run(sim, 2.5 * TICKS_PER_DAY);
    expect([s.slots, s.quality]).toEqual([12, 0.4]);
    run(sim, 1.5 * TICKS_PER_DAY + TICKS_PER_HOUR);
    expect(s.alive).toBe(false);
  });

  it('a crust dries to hardness 2 after 2 gd', () => {
    const sim = makeSourceSim();
    const s = createSource(sim, { variant: 'crust', pos: centre(sim), tier: 2 });
    run(sim, 2 * TICKS_PER_DAY - TICKS_PER_HOUR);
    expect(s.hardness).toBe(1);
    run(sim, 2 * TICKS_PER_HOUR);
    expect(s.hardness).toBe(2);
  });
});

describe('depletion', () => {
  it('a depleted crumb cluster is removed with its event and its anchor recorded as consumed', () => {
    const sim = makeSourceSim({ anchors: [anchor('crumb', 500, 500, 'crumb-starch')] });
    const seen = collect(sim);
    const s = sim.stores.sources.list.find((x) => x.alive && x.variant === 'crumb-starch');
    expect(s).toBeDefined();
    if (!s) return;
    const ant = addWorker(sim, s.pos);
    while (s.alive) {
      expect(takeFromSource(sim, ant, s.id, 1).status).toBe('ok');
      ant.carry = { kind: 'none', id: -1 };
    }
    sim.events.flush();
    expect(sim.state.worldDelta.consumedAnchors).toEqual([s.anchorId]);
    expect(seen.filter((e) => e.type === 'food-source-removed' && e.sourceId === s.id)).toHaveLength(1);
    expect(seen.filter((e) => e.type === 'entity-removed' && e.id === s.id)).toHaveLength(1);
  });
});

describe('carrion stages (T2, GDD 05 §1.6 / App. E 8)', () => {
  it('stage clock rate doubles per 10 °C and stops at 2 °C', () => {
    expect(stageClockRate(20)).toBe(1);
    expect(stageClockRate(30)).toBe(2);
    expect(stageClockRate(10)).toBe(0.5);
    expect(stageClockRate(2)).toBe(0);
  });

  it('stages begin at clock 0.5 / 1.5 / 4 gd (300 / 900 / 2400 s at 20 °C) and the husk goes at 6 gd (3600 s)', () => {
    expect(stageAt(0.4999)).toBe('fresh');
    expect(stageAt(0.5)).toBe('ripe');
    expect(stageAt(1.5)).toBe('putrid');
    expect(stageAt(4)).toBe('husk');
    expect(CARRION_REMOVE_GD).toBe(6);
  });

  it('E8 at a constant 20 °C: ripe at 300 s, putrid at 900 s, husk at 2400 s, removed at 3600 s; 30 °C halves them', () => {
    for (const [temp, scale] of [[20, 1], [30, 0.5]] as const) {
      const sim = makeSourceSim();
      const s = createSource(sim, { variant: 'insect-small', pos: centre(sim), stage: 'fresh', tier: 2 });
      const when: Record<string, number> = {};
      const stepS = 0.1; // one tick per step
      let t = 0;
      while (s.alive && t < 4000) {
        const before = s.stage;
        advanceCarrion(sim, s, stepS / 600, temp);
        t += stepS;
        if (s.stage !== before && s.stage) when[s.stage] = t;
      }
      const tick = 0.1 + 1e-9; // "± 1 tick"
      expect(Math.abs(when.ripe - 300 * scale)).toBeLessThanOrEqual(tick);
      expect(Math.abs(when.putrid - 900 * scale)).toBeLessThanOrEqual(tick);
      expect(Math.abs(when.husk - 2400 * scale)).toBeLessThanOrEqual(tick);
      expect(Math.abs(t - 3600 * scale)).toBeLessThanOrEqual(tick);
    }
  });

  it('in the sim the hourly system advances the clock at the local temperature and emits stage events', () => {
    const sim = makeSourceSim();
    const s = createSource(sim, { variant: 'insect-small', pos: centre(sim), stage: 'fresh', tier: 2 });
    const stages: string[] = [];
    sim.events.on('carrion-stage-changed', (e) => { if (e.sourceId === s.id) stages.push(e.stage); });
    let expected = 0;
    for (let h = 0; h < 24 && s.alive; h++) {
      run(sim, TICKS_PER_HOUR);
      expected += stageClockRate(surfaceTemp(sim, s.pos)) / 24;
      expect(s.stageClock).toBeCloseTo(expected, 9);
      expect(s.stage).toBe(stageAt(s.stageClock));
    }
    expect(stages[0]).toBe('ripe');
  });

  it('putrid carrion loses 40 % of its P per stage-clock gd and quality falls 0.9 -> 0.6 -> 0.3 -> 0', () => {
    const sim = makeSourceSim();
    const s = createSource(sim, { variant: 'insect-medium', pos: centre(sim), stage: 'fresh', tier: 2 });
    const q: number[] = [s.quality];
    const dt = 1 / 24;
    while (s.stageClock < 1.5) { advanceCarrion(sim, s, dt, 20); if (q[q.length - 1] !== s.quality) q.push(s.quality); }
    const p0 = s.p, c0 = s.stageClock;
    for (let i = 0; i < 24; i++) advanceCarrion(sim, s, dt, 20);
    expect(s.p).toBeCloseTo(p0 * Math.pow(0.6, s.stageClock - c0), 9);
    while (s.alive && s.stage !== 'husk') advanceCarrion(sim, s, dt, 20);
    q.push(s.quality);
    expect(q).toEqual([0.9, 0.6, 0.3, 0]);
    expect([s.c, s.p]).toEqual([0, 0]);
  });
});
