// Independent review tests for env-core (GDD 06 §1-§3, GDD 03 §9.1, App. E). Failing tests here mark real defects
// left in place for the fixer; passing ones stay as regression tests.

import { describe, expect, it } from 'vitest';
import type { Chamber, Nest, WeatherState } from '@/sim/types';
import { WEATHER_STATES } from '@/sim/types';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '@/sim/time';
import { envSim, setClockD, settleWeather, stableJson } from './envTestKit';
import { calendarNow } from './calendar';
import { chamberTemp, effectiveDepthMm, thermalInputs } from './chamber';
import { microTemp } from './microTemp';
import { soilTemp } from './soil';
import { ensureThermal, surfaceTemp } from './surface';
import { stepWeather } from './weatherStep';
import { timeHandlers } from './timeCommands';
import { speedCurve, applyThermalDose, type ThermalBody } from './thermalResponse';
import { requireSpecies } from '@/sim/species';

describe('GDD 03 §9.1 thermal column under a cover stone', () => {
  it('the chapter example: 3 BU (12 mm, Lasius) under a 50 mm stone has d_eff = 50 x 0.35 + 12 = 29.5 mm', () => {
    // Test world: loam everywhere, no crust, so r_therm = 1.0 below the stone.
    const sim = envSim({ zone: 'forest', surface: 'loam' });
    expect(effectiveDepthMm(sim, 1000, 1000, 12, false)).toBeCloseTo(12, 6);
    // The stone sits ON the ground and adds its own thermal depth; it must not replace the soil above the chamber.
    expect(effectiveDepthMm(sim, 1000, 1000, 12, true)).toBeCloseTo(29.5, 1);
  });

  it('a covered chamber is never thermally shallower than the same chamber in open ground', () => {
    const sim = envSim({ zone: 'forest', surface: 'loam' });
    for (const d of [5, 12, 30, 49, 80, 200]) {
      expect(effectiveDepthMm(sim, 1000, 1000, d, true), `depth ${d} mm`).toBeGreaterThanOrEqual(
        effectiveDepthMm(sim, 1000, 1000, d, false),
      );
    }
  });
});

describe('queries are read-only (GDD 06 §2.9 "pure, read-only"; architecture: render never mutates sim state)', () => {
  it('temperature queries on a fresh game leave SimState untouched', () => {
    const sim = envSim();
    const p = { x: 1000, y: 0, z: 1000 };
    const chamber = { id: 7, center: { x: 1000, y: -60, z: 1000 }, depthMm: 60, covered: false, wetUntilTick: -1 } as unknown as Chamber;
    sim.state.nests.push({ id: 0, substrate: 'loam', chambers: [chamber] } as unknown as Nest);
    const snap = () => ({ env: stableJson(sim.state.env), rng: stableJson(sim.state.rngStreams) });
    const before = snap();
    surfaceTemp(sim, 1000, 1000);
    microTemp(sim, p);
    soilTemp(sim, 100, 1000, 1000);
    chamberTemp(sim, 7);
    thermalInputs(sim, p);
    const after = snap();
    // Today the first query draws the opening weather from rng.weather and creates env.thermal arrays.
    expect(after.rng, 'rng.weather advanced by a query').toBe(before.rng);
    expect(after.env === before.env, 'env changed by a query').toBe(true);
  });

  it('a renderer reading surfaceTemp between ticks does not change the simulation (headless vs rendered run)', () => {
    const run = (renderReads: boolean) => {
      const sim = envSim({ seed: 3, withSystems: true });
      for (let i = 0; i < 107; i++) sim.tick();
      // Paused (GDD 06 §4.7): the game applies queued commands without a tick, and rendering keeps reading state.
      sim.enqueue({ type: 'cheat.noLag', on: true });
      sim.applyPendingCommands();
      if (renderReads) surfaceTemp(sim, 1000, 1000); // what a temperature overlay would do each frame
      for (let i = 0; i < 2 * TICKS_PER_HOUR; i++) sim.tick();
      return stableJson(sim.state.env.thermal);
    };
    expect(run(true)).toBe(run(false));
  });
});

describe('one cavity model (00-index E-137 / D7.2: GDD 03 §9.1 is the only cavity temperature; Tsoil for open ground only)', () => {
  it('an ant standing at a chamber centre heads for that chamber\'s temperature (clear midsummer 14:30)', () => {
    const sim = envSim({ zone: 'forest', surface: 'loam' });
    setClockD(sim, 10 + 14.5 / 24);
    settleWeather(sim, 'clear');
    for (const d of [30, 60, 150]) {
      const c = { id: 100 + d, center: { x: 1000, y: -d, z: 1000 }, depthMm: d, covered: false, wetUntilTick: -1 } as unknown as Chamber;
      sim.state.nests.push({ id: 100 + d, substrate: 'loam', chambers: [c] } as unknown as Nest);
      // Today: microTemp uses Tsoil (about 25-28 C here) while chamberTemp gives the column value (about 35-38 C).
      expect(Math.abs(microTemp(sim, c.center) - chamberTemp(sim, c.id)), `chamber at ${d} mm`).toBeLessThan(1);
    }
  });
});

describe('App. E7 measured on time, not on transitions (maritime, Naturalist, 2000 GD, 5 seeds)', () => {
  it('summer heat fraction, winter frost fraction, no heat 12 h into autumn, no frost start 05:00-17:00', () => {
    const heat: number[] = [], frost: number[] = [];
    for (const seed of [1, 2, 3, 4, 5]) {
      const sim = envSim({ seed });
      ensureThermal(sim);
      const w = sim.state.env.weather;
      let summer = 0, summerHeat = 0, winter = 0, winterFrost = 0;
      let prev: WeatherState = w.state;
      const steps = (2000 * TICKS_PER_DAY) / 25;
      for (let i = 0; i < steps; i++) {
        sim.state.tick += 25;
        stepWeather(sim, 25);
        sim.events.flush();
        const cal = calendarNow(sim);
        if (cal.season === 'summer') { summer++; if (w.state === 'heat') summerHeat++; }
        if (cal.season === 'winter') { winter++; if (w.state === 'frost') winterFrost++; }
        if (w.state === 'heat' && cal.season === 'autumn') {
          const sinceH = (cal.dayOfSeason - 1) * 24 + cal.hour;
          expect(sinceH, `seed ${seed}: heat ${sinceH.toFixed(1)} h into autumn`).toBeLessThanOrEqual(12.25);
        }
        if (w.state === 'frost' && prev !== 'frost' && w.startTick === sim.state.tick) {
          expect(cal.hour < 5.1 || cal.hour >= 16.9, `seed ${seed}: frost started at ${cal.hour.toFixed(2)} h`).toBe(true);
        }
        prev = w.state;
      }
      heat.push(summerHeat / summer);
      frost.push(winterFrost / winter);
    }
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    // E7 as written: the 5-seed result. The mean passes; see the review report for the per-seed spread
    // (seed 1 measures about 0.39, above 0.35, which the transition-based E7 test in weather.test.ts cannot see).
    expect(mean(heat)).toBeGreaterThan(0.15);
    expect(mean(heat)).toBeLessThan(0.35);
    expect(mean(frost)).toBeGreaterThan(0.15);
    expect(mean(frost)).toBeLessThan(0.27);
  }, 180000);
});

describe('thermal response edge cases', () => {
  it('speed curve: exact tabulated points, flat 22-28, zero outside and for non-finite input', () => {
    const pts: [number, number][] = [[5, 0], [10, 0.25], [15, 0.55], [20, 0.9], [22, 1], [25, 1], [28, 1], [30, 1.1], [35, 0.9], [40, 0]];
    for (const [t, m] of pts) expect(speedCurve(t), `T ${t}`).toBeCloseTo(m, 9);
    expect(speedCurve(-40)).toBe(0);
    expect(speedCurve(80)).toBe(0);
    expect(speedCurve(Number.NaN)).toBe(0);
  });

  it('heat death in 400 s at Tb 50 regardless of step length (0.1 s, 2.5 s, 10 s)', () => {
    const def = requireSpecies('lasius-niger').thermal;
    for (const dt of [0.1, 2.5, 10]) {
      const b: ThermalBody = { tb: 50, heatLoad: 0, coldLoad: 0, thermalState: 'normal' };
      let t = 0;
      while (applyThermalDose(b, def, def.stressC, dt) === 'ok' && t < 1000) t += dt;
      t += dt;
      expect(Math.abs(t - 400), `dt ${dt}`).toBeLessThanOrEqual(Math.max(20, dt));
    }
  });
});

describe('time and calendar edge cases', () => {
  it('cheat.setTime backwards (calendar tick 0 after the game has run) keeps every query finite', () => {
    const sim = envSim({ withSystems: true });
    for (let i = 0; i < 3000; i++) sim.tick();
    timeHandlers['cheat.setTime']!(sim, { type: 'cheat.setTime', tick: 0 });
    expect(sim.state.env.calendar.startTick).toBeLessThan(0);
    for (let i = 0; i < 500; i++) sim.tick();
    const cal = calendarNow(sim);
    expect(cal.doy).toBe(1);
    expect(Number.isFinite(surfaceTemp(sim, 1000, 1000))).toBe(true);
    expect(Number.isFinite(soilTemp(sim, 50, 1000, 1000))).toBe(true);
  });

  it('season lengths 5 and 10: the default-year d = 10.5 maps to the same sunrise and seasonal state', () => {
    const at = (len: 5 | 7 | 10) => {
      const sim = envSim({ seasonLengthDays: len });
      setClockD(sim, 10.5);
      settleWeather(sim, 'clear');
      const c = calendarNow(sim);
      return { sr: c.sunrise, season: c.season };
    };
    const ref = at(7);
    for (const len of [5, 10] as const) {
      const r = at(len);
      expect(r.season).toBe(ref.season);
      expect(Math.abs(r.sr - ref.sr)).toBeLessThan(0.05);
    }
  });

  it('every weather state has a finite, positive dwell and forecast after a forced change in each season', () => {
    for (const d of [3.5, 10.5, 17.5, 24.5]) {
      for (const st of WEATHER_STATES) {
        const sim = envSim();
        setClockD(sim, d);
        timeHandlers['cheat.setWeather']!(sim, { type: 'cheat.setWeather', state: st, intensityClass: null });
        const w = sim.state.env.weather;
        expect(w.dwellEndTick, `${st} at d ${d}`).toBeGreaterThan(sim.state.tick);
        expect(w.forecast?.startTick).toBe(w.dwellEndTick);
      }
    }
  });
});
