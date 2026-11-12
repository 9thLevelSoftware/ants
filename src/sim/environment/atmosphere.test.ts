// GDD 06 §3.3-3.8: precipitation bell and rates, wind (diurnal, noise, gusts), dew and mist, lightning, history, queries.

import { describe, expect, it } from 'vitest';
import { RAIN_RATE_MMH, STORM_RAIN_MMH } from '@/sim/balance';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '@/sim/time';
import type { Vec3 } from '@/core/math/vec3';
import { precipBell, stepWeather } from './weatherStep';
import { baseWind, windDiurnal } from './wind';
import { collect, envSim, setClockD, settleWeather } from './envTestKit';
import { isRaining, rainIntensityAt, rainRate, windAt, windDirection, windGround } from './queries';
import { setNoLag } from './noLag';
import { weatherForecast } from './weather';

/** Steps the weather `n` fast steps (2.5 s each), advancing the tick but not touching the calendar start. */
function steps(sim: ReturnType<typeof envSim>, n: number, each?: () => void): void {
  for (let i = 0; i < n; i++) {
    sim.state.tick += 25;
    stepWeather(sim, 25);
    sim.events.flush();
    each?.();
  }
}

describe('precipitation', () => {
  it('the bell is 0 at both ends and peaks at 35 % of the dwell', () => {
    expect(precipBell(0)).toBe(0);
    expect(precipBell(1)).toBeCloseTo(0, 9);
    expect(precipBell(0.35)).toBeCloseTo(1, 9);
    let best = 0, at = 0;
    for (let u = 0; u <= 1; u += 0.005) if (precipBell(u) > best) { best = precipBell(u); at = u; }
    expect(at).toBeCloseTo(0.35, 2);
    expect(precipBell(0.1)).toBeLessThan(precipBell(0.35));
    expect(precipBell(0.8)).toBeLessThan(precipBell(0.35));
  });

  it.each([['drizzle', 1], ['shower', 5], ['downpour', 18]] as const)('a %s peaks at %d mm/h and then stops', (cls, rate) => {
    expect(RAIN_RATE_MMH[cls]).toBe(rate);
    const sim = envSim();
    setClockD(sim, 10);
    settleWeather(sim, 'rain', 0, cls);
    const w = sim.state.env.weather;
    w.startTick = sim.state.tick;
    w.dwellEndTick = sim.state.tick + 6 * TICKS_PER_HOUR;
    let peak = 0, peakAt = 0, mm = 0;
    const startTick = sim.state.tick;
    steps(sim, (6 * TICKS_PER_HOUR) / 25 - 1, () => {
      if (w.rainRateMmH > peak) { peak = w.rainRateMmH; peakAt = (sim.state.tick - startTick) / (6 * TICKS_PER_HOUR); }
      mm += (w.rainRateMmH * 25) / TICKS_PER_HOUR;
      expect(isRaining(sim) || w.rainRateMmH < 0.05).toBe(true);
    });
    expect(peak).toBeGreaterThan(0.98 * rate);
    expect(peak).toBeLessThanOrEqual(rate);
    expect(Math.abs(peakAt - 0.35)).toBeLessThan(0.03);
    expect(mm).toBeGreaterThan(rate * 6 * 0.3);
    expect(w.history.cumRain24hMm).toBeGreaterThan(0);
    expect(w.history.rainHoursRing.some((x) => x === 1)).toBe(true);
  });

  it('a storm rains at up to 30 mm/h; clear weather does not rain; indoors it does not either', () => {
    const sim = envSim();
    settleWeather(sim, 'storm');
    const w = sim.state.env.weather;
    w.startTick = sim.state.tick;
    w.dwellEndTick = sim.state.tick + 3 * TICKS_PER_HOUR;
    steps(sim, (3 * TICKS_PER_HOUR * 0.35) / 25);
    expect(w.rainRateMmH).toBeGreaterThan(0.95 * STORM_RAIN_MMH);
    expect(rainRate(sim)).toBe(w.rainRateMmH);
    expect(rainIntensityAt(sim)).toBe(1);
    settleWeather(sim, 'clear');
    steps(sim, 4);
    expect(rainRate(sim)).toBe(0);
    expect(isRaining(sim)).toBe(false);
    expect(rainIntensityAt(sim)).toBe(0);
  });

  it('inflow factor follows the rain class and is zero indoors', () => {
    const sim = envSim({ zone: 'interior', surface: 'tile' });
    const w = sim.state.env.weather;
    for (const [cls, i] of [['drizzle', 0.1], ['shower', 0.4], ['downpour', 0.7]] as const) {
      settleWeather(sim, 'rain', 0, cls);
      w.startTick = sim.state.tick;
      w.dwellEndTick = sim.state.tick + 10 * TICKS_PER_HOUR;
      steps(sim, (10 * TICKS_PER_HOUR * 0.35) / 25);
      expect(rainIntensityAt(sim)).toBe(i);
      expect(rainIntensityAt(sim, { x: 10, y: 0, z: 10 })).toBe(0);
      expect(rainRate(sim, { x: 10, y: 0, z: 10 })).toBe(0);
      expect(isRaining(sim, { x: 10, y: 0, z: 10 })).toBe(false);
    }
  });

  it('leaving rain records when it ended, and a transition emits the outgoing and incoming states', () => {
    const sim = envSim({ seed: 9 });
    const changes = collect<{ from: string; to: string; intensityClass: string | null; reason: string }>(sim, 'weather.changed');
    settleWeather(sim, 'rain', 0, 'shower');
    const w = sim.state.env.weather;
    expect(changes.at(-1)).toMatchObject({ to: 'rain', intensityClass: 'shower', reason: 'cheat' });
    w.dwellEndTick = sim.state.tick + 25;
    steps(sim, 3);
    expect(w.state).not.toBe('rain');
    expect(changes.at(-1)?.from).toBe('rain');
    expect(changes.at(-1)?.reason).toBe('transition');
    expect(w.history.lastRainEndTick).toBeGreaterThan(0);
    expect(weatherForecast(sim)).not.toBeNull();
  });
});

describe('wind', () => {
  it('diurnal factor: 0.65 at night, 1.3 in the afternoon, 1 in the morning, with linear blends', () => {
    for (const h of [22, 0, 2, 4]) expect(windDiurnal(h), `${h}`).toBeCloseTo(0.65, 9);
    for (const h of [12, 14, 17]) expect(windDiurnal(h), `${h}`).toBeCloseTo(1.3, 9);
    expect(windDiurnal(8)).toBeCloseTo(1, 9);
    expect(windDiurnal(19)).toBeCloseTo(1, 9);
    expect(windDiurnal(6)).toBeCloseTo(0.825, 9);
    expect(windDiurnal(11)).toBeCloseTo(1.15, 9);
    let prev = windDiurnal(0);
    for (let h = 0.05; h <= 24; h += 0.05) {
      expect(Math.abs(windDiurnal(h) - prev)).toBeLessThan(0.2);
      prev = windDiurnal(h);
    }
  });

  it('mean wind by state follows the state table (storm 8.5, rain 3.5, overcast 3, clear 2, heat 1.5, frost 1.2 m/s)', () => {
    const means: Record<string, number> = {};
    for (const st of ['clear', 'overcast', 'rain', 'storm', 'heat', 'frost'] as const) {
      const sim = envSim({ seed: 2 });
      settleWeather(sim, st, 0, st === 'rain' ? 'shower' : null);
      const w = sim.state.env.weather;
      let sum = 0, n = 0;
      // Sample every hour of the day many times: move the calendar start, keep the tick moving for the noise.
      for (let i = 0; i < 4000; i++) {
        sim.state.env.calendar.startTick = Math.round(10 * TICKS_PER_DAY + ((i * 97) % TICKS_PER_DAY));
        sim.state.tick += 25;
        w.dwellEndTick = Number.MAX_SAFE_INTEGER;
        w.gustUntilTick = -1;
        stepWeather(sim, 25);
        if (w.gustUntilTick > sim.state.tick) continue; // skip steps that started a gust
        sum += w.wind2m;
        n++;
      }
      means[st] = sum / n;
    }
    // The mean diurnal factor over a day is a little under 1: compare as ratios and loose absolute bounds.
    expect(means.storm / means.clear).toBeGreaterThan(3.5);
    expect(means.storm / means.clear).toBeLessThan(5);
    expect(means.rain).toBeGreaterThan(means.overcast * 0.95);
    expect(means.overcast).toBeGreaterThan(means.clear);
    expect(means.clear).toBeGreaterThan(means.heat);
    expect(means.heat).toBeGreaterThan(means.frost * 0.95);
    expect(means.clear).toBeGreaterThan(1.3);
    expect(means.clear).toBeLessThan(2.8);
  });

  it('noise is Ornstein-Uhlenbeck with sd 0.8 m/s and a one-hour memory', () => {
    const sim = envSim({ seed: 5 });
    settleWeather(sim, 'clear');
    const w = sim.state.env.weather;
    const xs: number[] = [];
    for (let i = 0; i < 40000; i++) {
      sim.state.tick += 25;
      w.dwellEndTick = Number.MAX_SAFE_INTEGER;
      stepWeather(sim, 25);
      if (i % 5 === 0) xs.push(w.windOu ?? 0); // every half hour (5 steps of 0.1 h)
    }
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
    expect(sd).toBeGreaterThan(0.65);
    expect(sd).toBeLessThan(0.95);
    let c = 0;
    for (let i = 1; i < xs.length; i++) c += (xs[i] - mean) * (xs[i - 1] - mean);
    const lag = c / (xs.length - 1) / (sd * sd);
    expect(lag).toBeGreaterThan(0.5); // exp(-0.5 h / 1 h) = 0.61
    expect(lag).toBeLessThan(0.72);
  });

  it('gusts are announced and storms gust far more often (0.5 per hour against 0.012)', () => {
    const count = (state: 'clear' | 'storm') => {
      const sim = envSim({ seed: 6 });
      settleWeather(sim, state);
      const gusts = collect<{ windMs: number }>(sim, 'weather.gust');
      const w = sim.state.env.weather;
      for (let i = 0; i < 60 * 240; i++) {
        sim.state.tick += 25;
        w.dwellEndTick = Number.MAX_SAFE_INTEGER;
        stepWeather(sim, 25);
        sim.events.flush();
      }
      for (const g of gusts) expect(g.windMs).toBeGreaterThanOrEqual(0.2 * 2.2 - 1e-9);
      return gusts.length;
    };
    const clear = count('clear'), storm = count('storm');
    expect(storm).toBeGreaterThan(5 * Math.max(1, clear));
    expect(storm).toBeGreaterThan(0.3 * 0.5 * 1440); // 60 GD = 1440 h
    expect(clear).toBeLessThan(0.012 * 1440 * 3 + 5);
  });

  it('during a gust the wind is 2.2 times its base for 300 ticks', () => {
    const sim = envSim({ seed: 7 });
    settleWeather(sim, 'clear');
    const w = sim.state.env.weather;
    sim.state.tick += 25;
    w.gustUntilTick = sim.state.tick + 100;
    w.dwellEndTick = Number.MAX_SAFE_INTEGER;
    // a step recomputes the wind from the (updated) noise; compare with the base after the same step
    stepWeather(sim, 25);
    const gusting = w.wind2m;
    const base = baseWind(sim);
    expect(gusting).toBeCloseTo(base * 2.2, 6);
    sim.state.tick += 200;
    stepWeather(sim, 25);
    expect(w.wind2m).toBeCloseTo(baseWind(sim), 6);
  });

  it('direction stays a unit vector in the XZ plane and random-walks about 15 degrees per game hour', () => {
    const sim = envSim({ seed: 8 });
    settleWeather(sim, 'clear');
    const w = sim.state.env.weather;
    const d = { x: 0, y: 0, z: 0 } as Vec3;
    const turns: number[] = [];
    let last = Math.atan2(w.windDir.z, w.windDir.x);
    for (let i = 1; i <= 4000; i++) {
      sim.state.tick += 25;
      w.dwellEndTick = Number.MAX_SAFE_INTEGER;
      stepWeather(sim, 25);
      windDirection(sim, d);
      expect(Math.hypot(d.x, d.z)).toBeCloseTo(1, 6);
      expect(d.y).toBe(0);
      if (i % 10 === 0) { // one game hour
        const a = Math.atan2(d.z, d.x);
        turns.push(Math.atan2(Math.sin(a - last), Math.cos(a - last)));
        last = a;
      }
    }
    const sd = Math.sqrt(turns.reduce((acc, t) => acc + t * t, 0) / turns.length);
    expect(sd).toBeGreaterThan((10 * Math.PI) / 180);
    expect(sd).toBeLessThan((20 * Math.PI) / 180);
  });

  it('wind queries: ground wind is 0.2 of the 2 m wind; 0 indoors and underground', () => {
    const sim = envSim();
    settleWeather(sim, 'storm');
    sim.state.env.weather.wind2m = 10;
    expect(windAt(sim)).toBe(10);
    expect(windGround(sim)).toBeCloseTo(2, 9);
    expect(windAt(sim, { x: 10, y: 5, z: 10 })).toBe(10);
    expect(windAt(sim, { x: 10, y: -50, z: 10 })).toBe(0);
    const room = envSim({ zone: 'interior', surface: 'tile' });
    room.state.env.weather.wind2m = 10;
    expect(windAt(room, { x: 10, y: 0, z: 10 })).toBe(0);
  });
});

describe('dew, mist and lightning', () => {
  it('dew rises from an hour after sunset to sunrise, is gone 5 h after sunrise, and is announced once each way', () => {
    // Force a dew night by trying days until one forms.
    const sim = envSim({ seed: 2 });
    setClockD(sim, 10);
    settleWeather(sim, 'clear');
    const w = sim.state.env.weather;
    const events = collect<{ state: string }>(sim, 'weather.dew');
    const levels: [number, number][] = [];
    let found = false;
    for (let day = 10; day < 80 && !found; day++) {
      sim.state.tick = 0;
      for (let q = 0; q < 24 * 10; q++) {
        sim.state.env.calendar.startTick = Math.round(day * TICKS_PER_DAY + (q / 10) * TICKS_PER_HOUR);
        w.dwellEndTick = Number.MAX_SAFE_INTEGER;
        w.wind2m = 1;
        sim.state.tick = 25 * q;
        stepWeather(sim, 25);
        sim.events.flush();
        levels.push([q / 10, w.dew.level]);
      }
      found = levels.some(([, l]) => l > 0.5);
      if (!found) levels.length = 0;
    }
    expect(found).toBe(true);
    const peak = Math.max(...levels.map(([, l]) => l));
    expect(peak).toBeLessThanOrEqual(1.0001);
    const zeroAfterNoon = levels.filter(([h]) => h > 13 && h < 16).every(([, l]) => l === 0);
    expect(zeroAfterNoon).toBe(true);
    expect(events.filter((e) => e.state === 'formed').length).toBeGreaterThanOrEqual(1);
    expect(events.filter((e) => e.state === 'gone').length).toBeGreaterThanOrEqual(1);
  });

  it('no dew in rain, storm or heat, whatever the night decided', () => {
    const sim = envSim();
    setClockD(sim, 10 + 3 / 24);
    for (const st of ['rain', 'storm', 'heat'] as const) {
      settleWeather(sim, st);
      sim.state.env.weather.dew.tonight = true;
      sim.state.tick += 25;
      stepWeather(sim, 25);
      expect(sim.state.env.weather.dew.level).toBe(0);
    }
  });

  it('about half of calm clear nights have dew', () => {
    const sim = envSim({ seed: 4 });
    setClockD(sim, 10);
    settleWeather(sim, 'clear');
    const w = sim.state.env.weather;
    let nights = 0, dew = 0;
    for (let day = 0; day < 600; day++) {
      let sawDew = false;
      for (let q = 0; q < 12; q++) {
        sim.state.env.calendar.startTick = Math.round((10 + day) * TICKS_PER_DAY + (q * 2 + 1) * TICKS_PER_HOUR);
        sim.state.tick = 25 * (day * 12 + q);
        w.dwellEndTick = Number.MAX_SAFE_INTEGER;
        stepWeather(sim, 25);
        if (w.dew.level > 0.4) sawDew = true;
      }
      nights++;
      if (sawDew) dew++;
    }
    expect(dew / nights).toBeGreaterThan(0.15);
    expect(dew / nights).toBeLessThan(0.75);
  });

  it('lightning only in storms, at least 6 s apart, each with a thunder delay of 0.4 to 3 s', () => {
    const sim = envSim({ seed: 10 });
    settleWeather(sim, 'storm');
    const w = sim.state.env.weather;
    w.lightningNextTick = sim.state.tick;
    const ticks: number[] = [];
    const thunder = collect<{ delayS: number }>(sim, 'weather.thunder');
    sim.events.on('weather.lightning', () => ticks.push(sim.state.tick));
    for (let i = 0; i < 4000; i++) {
      sim.state.tick += 25;
      w.dwellEndTick = Number.MAX_SAFE_INTEGER;
      stepWeather(sim, 25);
      sim.events.flush();
    }
    expect(ticks.length).toBeGreaterThan(50);
    for (let i = 1; i < ticks.length; i++) expect(ticks[i] - ticks[i - 1]).toBeGreaterThanOrEqual(60);
    expect(thunder.length).toBe(ticks.length);
    for (const t of thunder) {
      expect(t.delayS).toBeGreaterThanOrEqual(0.4);
      expect(t.delayS).toBeLessThanOrEqual(3);
    }
    settleWeather(sim, 'rain');
    ticks.length = 0;
    for (let i = 0; i < 2000; i++) {
      sim.state.tick += 25;
      w.dwellEndTick = Number.MAX_SAFE_INTEGER;
      stepWeather(sim, 25);
      sim.events.flush();
    }
    expect(ticks.length).toBe(0);
  });
});

describe('cloud follows the state with a one hour constant', () => {
  it('relaxes toward the new target and snaps with noLag', () => {
    const sim = envSim();
    settleWeather(sim, 'clear');
    setNoLag(sim.state, false);
    const w = sim.state.env.weather;
    w.state = 'overcast';
    for (let i = 0; i < 10; i++) { sim.state.tick += 25; w.dwellEndTick = Number.MAX_SAFE_INTEGER; stepWeather(sim, 25); } // 1 h
    expect(w.cloud).toBeCloseTo(0.1 + (0.9 - 0.1) * (1 - Math.exp(-1)), 1);
    setNoLag(sim.state, true);
    sim.state.tick += 25;
    stepWeather(sim, 25);
    expect(w.cloud).toBeCloseTo(0.9, 9);
  });
});
