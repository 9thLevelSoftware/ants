// GDD 05 §1.4 herd model: Appendix E checks 1, 2, 3, 5 and the tables (growth by phase, production, pool cap,
// slots, tenders needed, temperature factor, host decline), on the default year and at season lengths 5 and 10.

import { afterEach, describe, expect, it } from 'vitest';
import type { Herd, Sim } from '@/sim/types';
import {
  APHID_GROWTH_PHASES, EGG_MAX, HERD_K, PARASITOID_RATE, STEM_MOTHERS_MAX, TEND_GROWTH_BONUS,
} from '@/sim/balance/ecology';
import { spawnAnt } from '@/sim/entities';
import { placeOnSurface } from '@/sim/locomotion';
import { DEFAULT_DAYS_PER_YEAR, TICKS_PER_DAY, TICKS_PER_HOUR, ticksPerYear } from '@/sim/time';
import { stepHerd, type HourContext } from './growth';
import { kEff, poolCap, productionPerGd, tendersNeeded, tendSlots } from './herdMath';
import { herdSourceOf } from './links';
import { releaseDroplet } from './droplet';
import { runPlantsHour } from './system';
import { growthRate, tempFactor } from './season';
import { addHerd, fixWeather, plantSim, stepTicks } from './testkit';
import { plantCommandHandlers } from './commands';

let restore: (() => void) | null = null;
afterEach(() => { restore?.(); restore = null; });

function setHerd(sim: Sim, h: Herd, values: Record<string, number>): void {
  plantCommandHandlers['cheat.setHerd']!(sim, { type: 'cheat.setHerd', herdId: h.id, values });
}

/** Puts the calendar at default-year day d28 (0-based fractional) without moving state.tick. */
function setD28(sim: Sim, d28: number): void {
  const cal = Math.round((d28 / DEFAULT_DAYS_PER_YEAR) * ticksPerYear(sim.state.config));
  sim.state.env.calendar.startTick = cal - sim.state.tick;
}

describe('herd tables (GDD 05 §1.4)', () => {
  it('pool cap 1 + 0.02 A, slots 2 + floor(A/25) max 16, tenders ceil(A/50)', () => {
    for (const [a, cap, slots, need] of [[0, 1, 2, 1], [10, 1.2, 2, 1], [50, 2, 4, 1], [100, 3, 6, 2], [400, 9, 16, 8]]) {
      expect(poolCap(a)).toBeCloseTo(cap, 9);
      expect(tendSlots(a)).toBe(slots);
      expect(tendersNeeded(a)).toBe(need);
    }
  });

  it('production A x 0.10 x (0.5 + 0.5 tend) x fT per gd', () => {
    expect(productionPerGd(100, 1, 1)).toBeCloseTo(10, 9);
    expect(productionPerGd(100, 0, 1)).toBeCloseTo(5, 9);
    expect(productionPerGd(100, 0.5, 0.5)).toBeCloseTo(3.75, 9);
  });

  it('temperature factor: 0 at <= 8, linear to 1 at 18, 1 to 28, linear to 0.6 at 34 and above', () => {
    for (const [t, f] of [[0, 0], [8, 0], [13, 0.5], [18, 1], [25, 1], [28, 1], [31, 0.8], [34, 0.6], [40, 0.6]]) {
      expect(tempFactor(t)).toBeCloseTo(f, 9);
    }
  });

  it('growth rate by default-year day (doy a-b holds while a-1 <= d28 < b)', () => {
    const rows: [number, number][] = [[0, 0.9], [6.99, 0.9], [7, 0.6], [9.99, 0.6], [10, 0.2], [13.5, 0.2], [14, -0.2], [17, -0.5], [20.9, -0.5], [21, 0], [27, 0]];
    for (const [d, r] of rows) expect(growthRate(d)).toBe(r);
  });

  it('one hourly step matches the logistic formula of each phase, tended and untended', () => {
    const { sim, plants } = plantSim({ systems: [] });
    for (const p of APHID_GROWTH_PHASES) {
      for (const tend of [0, 1]) {
        const h = addHerd(sim, plants[0], 40);
        h.tend = tend;
        const c: HourContext = { d28: p.from - 0.5, hour: 12, dt: 1 / 24, fT: 1, heavyRain: false };
        const k = HERD_K.herb * (1 + 0.25 * tend);
        expect(kEff(h, sim.state.tick)).toBeCloseTo(k, 9);
        let dA = p.r >= 0 ? p.r * (1 + TEND_GROWTH_BONUS * tend) * 40 * (1 - 40 / k) / 24 : (p.r * 40) / 24;
        if (c.d28 >= 5 && c.d28 < 18) dA -= (PARASITOID_RATE * (1 - 0.6 * tend) * 40) / 24;
        stepHerd(sim, h, plants[0], c);
        expect(h.a).toBeCloseTo(40 + dA, 9);
        h.alive = false; plants[0].herdIds = [];
      }
    }
  });
});

describe('Appendix E (GDD 05) 1-3: production, tend decay, droplet', () => {
  it('E1: A 100, tend 1, pool 0, frozen at 20 °C: pool 2.5 after 150 s, cap 3.0 and film 0.5 after 600 s more', () => {
    restore = fixWeather(20);
    const { sim, plants } = plantSim();
    const h = addHerd(sim, plants[0], 10);
    setHerd(sim, h, { A: 100, tend: 1, pool: 0, frozen: 1 });
    stepTicks(sim, 1500);
    expect(h.pool).toBeCloseTo(2.5, 1);
    expect(Math.abs(h.pool - 2.5)).toBeLessThanOrEqual(0.05);
    stepTicks(sim, 6050); // 600 s, plus 5 s so that an hourly film decay just before is topped up again
    expect(h.pool).toBeCloseTo(3.0, 6);
    const film = sim.stores.sources.get(h.filmSourceId)!;
    expect(film.units).toBeGreaterThan(0.49);
    expect(film.units).toBeLessThanOrEqual(0.5 + 1e-9);
    expect(h.a).toBe(100); // frozen: no growth
  });

  it('E2: tend 1.0 and no tenders: 0.37 +- 0.02 after 60 s', () => {
    restore = fixWeather(20);
    const { sim, plants } = plantSim();
    const h = addHerd(sim, plants[0], 100);
    setHerd(sim, h, { tend: 1 });
    stepTicks(sim, 600);
    expect(Math.abs(h.tend - 0.37)).toBeLessThanOrEqual(0.02);
  });

  it('E3: pool 0.10 releases no droplet; pool 1.0: one stroke adds 0.15 C, pool 0.85 (possessed, real primitive)', () => {
    restore = fixWeather(5); // fT 0: no production meanwhile (the ant's own work rate reads the environment)
    const { sim, plants } = plantSim({ workers: 1 });
    const h = addHerd(sim, plants[0], 100);
    setHerd(sim, h, { frozen: 1 });
    const src = herdSourceOf(sim, h)!;
    const col = sim.state.colonies[0];
    // a worker beside the herd point (on the ground beside a ground-level copy of the herd source)
    const pos = { x: src.pos.x - 6 * sim.world.bu, y: 0, z: src.pos.z };
    const ant = spawnAnt(sim, { colony: col.id, caste: 'worker', pos, fwd: { x: 1, y: 0, z: 0 }, ageGd: 8 });
    placeOnSurface(sim, ant, pos);
    src.pos.x = ant.pos.x + 0.8 * sim.world.bu; src.pos.y = ant.pos.y; src.pos.z = ant.pos.z;
    ant.fwd = { x: 1, y: 0, z: 0 };
    sim.enqueue({ type: 'possess', antId: ant.id, via: 'roster' });
    stepTicks(sim, 1);
    const t = { kind: 'source' as const, id: src.id, pos: src.pos };
    // pool below a droplet
    h.pool = 0.10;
    expect(releaseDroplet(sim, ant.id, t)).toBe(0);
    sim.enqueue({ type: 'action', actionId: 'tend-aphid', target: t, phase: 'start' });
    stepTicks(sim, 40);
    expect(ant.cropC).toBe(0);
    expect(h.pool).toBeCloseTo(0.10, 9);
    // a full pool: one stroke
    sim.enqueue({ type: 'action', actionId: 'tend-aphid', target: t, phase: 'stop' });
    stepTicks(sim, 2);
    h.pool = 1.0;
    const c0 = ant.cropC;
    sim.enqueue({ type: 'action', actionId: 'tend-aphid', target: t, phase: 'start' });
    let done = false;
    sim.events.on('action-completed', (e) => { if (e.antId === ant.id && e.action === 'tend-aphid') done = true; });
    for (let i = 0; i < 60 && !done; i++) stepTicks(sim, 1);
    expect(done).toBe(true);
    expect(ant.cropC - c0).toBeCloseTo(0.15, 9);
    expect(h.pool).toBeCloseTo(0.85, 9);
  });
});

/** Runs the hourly plants step through a span of default-year days (state.tick fixed, the calendar moves). */
function runDays(sim: Sim, fromD28: number, toD28: number, onHour?: (d28: number) => void): void {
  const perD28 = ticksPerYear(sim.state.config) / DEFAULT_DAYS_PER_YEAR;
  const hoursPerD28 = perD28 / TICKS_PER_HOUR;
  for (let d = fromD28; d < toD28; d += 1 / hoursPerD28) {
    setD28(sim, d);
    runPlantsHour(sim, TICKS_PER_HOUR / TICKS_PER_DAY);
    onHour?.(d);
  }
}

describe('seasonal herd cycle (E5) at season lengths 5, 7, 10', () => {
  for (const len of [5, 7, 10] as const) {
    it(`length ${len}: eggs hatch to 8 stem mothers on day 1 at 06:00, grow, crash, eggs = 10 % of the peak on day 22`, () => {
      restore = fixWeather(20);
      const { sim, plants } = plantSim({ systems: [], seasonLengthDays: len });
      const h = addHerd(sim, plants[0], 0, { e: 10 });
      // day 28, 23:00 -> day 1, 07:00
      const hourD = 1 / ((24 * len * 4) / DEFAULT_DAYS_PER_YEAR);
      runDays(sim, 28 - hourD, 28);
      expect(h.alive).toBe(true);
      expect(h.a).toBe(0);
      expect(h.e).toBe(10);
      runDays(sim, 0, 7.5 * hourD); // hourly steps 00:00 .. 07:00
      expect(h.a).toBeGreaterThanOrEqual(STEM_MOTHERS_MAX);
      expect(h.a).toBeLessThan(STEM_MOTHERS_MAX + 0.5);
      let peak = 0, peakD = 0;
      runDays(sim, 7 * hourD, 21, (d) => { if (h.a > peak) { peak = h.a; peakD = d; } });
      expect(peak).toBeGreaterThan(30);
      // at a constant 20 °C the herd fills its K_eff by about day 5; the later phases only lower it
      expect(peakD).toBeGreaterThanOrEqual(3);
      expect(peakD).toBeLessThan(14);
      expect(h.a).toBeLessThan(peak);
      runDays(sim, 21, 21.5);
      expect(h.alive).toBe(true);
      expect(h.a).toBe(0);
      expect(h.e).toBe(Math.min(EGG_MAX, Math.round(0.1 * peak)));
    });
  }

  it('host quality: 1.0 on day 1, -0.08 per gd from day 10, floor 0.5', () => {
    restore = fixWeather(20);
    const { sim, plants } = plantSim({ systems: [] });
    const pl = plants[0];
    runDays(sim, 0, 9);
    expect(pl.hostQuality).toBe(1);
    runDays(sim, 9, 12); // 3 gd at the default length
    expect(pl.hostQuality).toBeCloseTo(1 - 0.08 * 3, 1);
    runDays(sim, 12, 20);
    expect(pl.hostQuality).toBe(0.5);
    runDays(sim, 27.9, 28);
    runDays(sim, 0, 0.1);
    expect(pl.hostQuality).toBe(1);
  });

  it('an untended herd stays below a tended one (K and growth bonuses) and declines when its K drops', () => {
    restore = fixWeather(20);
    const { sim, plants } = plantSim({ systems: [], herbs: [{ dx: -30, dz: -20 }, { dx: 30, dz: -20 }] });
    const untended = addHerd(sim, plants[0], 90);
    const tended = addHerd(sim, plants[1], 90);
    runDays(sim, 3, 6, () => { tended.tend = 1; untended.tend = 0; });
    // dispersal (0.15 A per gd above 0.8 K_eff) holds both below K: tended near 87, untended near 67
    expect(tended.a).toBeGreaterThan(80);
    expect(untended.a).toBeLessThan(75);
    expect(untended.a).toBeLessThan(tended.a);
  });

  it('day numbers are default-year days: the same d28 gives the same rate at every length', () => {
    const d = 9.5;
    expect(growthRate(d)).toBe(0.6);
    for (const len of [5, 7, 10]) expect((d / DEFAULT_DAYS_PER_YEAR) * len * 4 * TICKS_PER_DAY).toBeGreaterThan(0);
  });
});
