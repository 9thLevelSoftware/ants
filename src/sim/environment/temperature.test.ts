// GDD 06 §2 and App. E 4-6: air temperature by climate/season/hour/weather, surface temperature by material and
// shade, soil temperature by depth, chamber temperature and humidity, interiors, the daily anomaly.

import { describe, expect, it } from 'vitest';
import type { Chamber, Nest, Season } from '@/sim/types';
import { MATERIAL_IDS } from '@/sim/types';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '@/sim/time';
import { airTemp, diurnalShape, interiorTemp, relHumidity, seasonalMeanNow } from './temperature';
import { chamberColumnTemp, chamberHumidity, chamberTemp, effectiveDepthMm, newThermalInputs, soilRelHumidity, thermalInputs } from './chamber';
import { soilTempAtDepth } from './soil';
import { slotTemp, surfaceTemp, updateThermal } from './surface';
import { calendarNow } from './calendar';
import { setNoLag } from './noLag';
import { envSim, setClockD, settleWeather } from './envTestKit';
import { weatherSystem } from './system';
import { stepWeather } from './weatherStep';
import { CLIMATES } from './climates';

/** The chapter's formula for the maritime reference climate, written out independently of the implementation. */
function chapterAir(d: number, hour: number, season: Season, dm: number, sunrise: number): number {
  const ad = { spring: 5, summer: 6, autumn: 4, winter: 2.5 }[season];
  const seasonal = 12 + 8.5 * Math.cos((2 * Math.PI * (d - 9.5)) / 28);
  const shape = hour <= 14.5 && hour >= sunrise
    ? -Math.cos((Math.PI * (hour - sunrise)) / (14.5 - sunrise))
    : Math.cos((Math.PI * ((hour < sunrise ? hour + 24 : hour) - 14.5)) / (sunrise + 24 - 14.5));
  return seasonal + ad * dm * shape;
}

describe('air temperature (E4)', () => {
  it('maritime clear day, d=10.5: 27.5 C at 14:30 and 13.1 C at 04:36', () => {
    const sim = envSim();
    settleWeather(sim, 'clear');
    setClockD(sim, 10 + 14.5 / 24 - 0 / 24);
    settleWeather(sim, 'clear');
    expect(airTemp(sim)).toBeCloseTo(27.49, 1);
    expect(Math.abs(airTemp(sim) - 27.5)).toBeLessThan(0.3);
    setClockD(sim, 10 + 4.6 / 24);
    settleWeather(sim, 'clear');
    expect(Math.abs(airTemp(sim) - 13.1)).toBeLessThan(0.3);
  });

  it('heat wave settled: 32.2 C at 13:00 (d=10.5)', () => {
    const sim = envSim();
    setClockD(sim, 10 + 13 / 24);
    settleWeather(sim, 'heat');
    expect(Math.abs(airTemp(sim) - 32.2)).toBeLessThan(0.5);
  });

  it.each([
    ['spring', 3], ['summer', 10], ['autumn', 17], ['winter', 24],
  ] as const)('%s: midday peak and pre-dawn trough match the chapter formula within 0.5 C', (season, day) => {
    const sim = envSim();
    for (const dm of [['clear', 1.2], ['overcast', 0.6]] as const) {
      setClockD(sim, day + 14.5 / 24);
      settleWeather(sim, dm[0]);
      const cal = calendarNow(sim);
      const off = dm[0] === 'overcast' ? -1 : 0;
      expect(cal.season).toBe(season);
      expect(Math.abs(airTemp(sim) - (chapterAir(day + 14.5 / 24, 14.5, season, dm[1], cal.sunrise) + off))).toBeLessThan(0.5);
      setClockD(sim, day + 5 / 24);
      settleWeather(sim, dm[0]);
      const c2 = calendarNow(sim);
      expect(Math.abs(airTemp(sim) - (chapterAir(day + 5 / 24, 5, season, dm[1], c2.sunrise) + off))).toBeLessThan(0.5);
    }
  });

  it('the daily shape is continuous, -1 at sunrise and +1 at 14:30', () => {
    for (const sr of [4, 6, 7.4]) {
      expect(diurnalShape(sr, sr)).toBeCloseTo(-1, 9);
      expect(diurnalShape(14.5, sr)).toBeCloseTo(1, 9);
      expect(diurnalShape(sr - 1e-9 + 24, sr)).toBeCloseTo(-1, 6);
      expect(diurnalShape(14.5 + 1e-9, sr)).toBeCloseTo(1, 6);
    }
  });

  it('every climate has its own annual mean and swing (seasonal mean at the peak and the trough)', () => {
    for (const c of Object.values(CLIMATES)) {
      const sim = envSim(); // only Lasius is registered so far: switch the climate id
      sim.state.env.climateId = c.id;
      setClockD(sim, 9.5);
      expect(seasonalMeanNow(sim)).toBeCloseTo(c.tann + c.aseas, 6);
      setClockD(sim, 9.5 + 14);
      expect(seasonalMeanNow(sim)).toBeCloseTo(c.tann - c.aseas, 6);
    }
    expect(CLIMATES['temperate-continental'].tann + CLIMATES['temperate-continental'].aseas).toBeCloseTo(24, 6);
    expect(CLIMATES.mediterranean.tann - CLIMATES.mediterranean.aseas).toBeCloseTo(10, 6);
  });

  it('overcast and rain damp the day swing and lower the level', () => {
    const sim = envSim();
    setClockD(sim, 10 + 14.5 / 24);
    settleWeather(sim, 'clear');
    const clear = airTemp(sim);
    settleWeather(sim, 'overcast');
    const overcast = airTemp(sim);
    settleWeather(sim, 'rain');
    const rain = airTemp(sim);
    expect(overcast).toBeLessThan(clear - 3);
    expect(rain).toBeLessThan(overcast);
  });

  it('weather offset and diurnal multiplier lag toward their targets with the 4 h constant', () => {
    const sim = envSim();
    setClockD(sim, 10 + 12 / 24);
    settleWeather(sim, 'clear');
    setNoLag(sim.state, false);
    sim.state.env.weather.state = 'rain';
    const start = sim.state.env.weather.wOff;
    const target = -2.5;
    // 4 h at the fast step (0.1 h per 25 ticks) with the clock frozen: 1 - e^-1 of the way
    for (let i = 0; i < 40; i++) stepWeather(sim, 25);
    const w = sim.state.env.weather;
    expect(w.wOff).toBeCloseTo(start + (target - start) * (1 - Math.exp(-1)), 1);
    expect(w.dmCur).toBeGreaterThan(0.5);
    expect(w.dmCur).toBeLessThan(1.2);
  });

  it('the daily anomaly is AR(1) with sd about 1.7 C, clamped to +-5, and eases in over the day', () => {
    const sim = envSim();
    settleWeather(sim, 'clear');
    setNoLag(sim.state, false);
    const w = sim.state.env.weather;
    const xs: number[] = [];
    for (let day = 0; day < 4000; day++) {
      sim.state.tick += TICKS_PER_DAY;
      stepWeather(sim, TICKS_PER_DAY);
      xs.push(w.anomalyCur);
      w.dwellEndTick = Number.MAX_SAFE_INTEGER;
    }
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
    expect(Math.abs(mean)).toBeLessThan(0.2);
    expect(sd).toBeGreaterThan(1.4);
    expect(sd).toBeLessThan(1.9);
    expect(Math.max(...xs.map(Math.abs))).toBeLessThanOrEqual(5);
    let lag1 = 0;
    for (let i = 1; i < xs.length; i++) lag1 += (xs[i] - mean) * (xs[i - 1] - mean);
    expect(lag1 / (xs.length - 1) / (sd * sd)).toBeGreaterThan(0.55);
  });
});

describe('surface temperature (E5)', () => {
  function summerNoon(opts: Parameters<typeof envSim>[0] = {}) {
    const sim = envSim({ zone: 'asphalt', surface: 'asphalt', ...opts });
    setClockD(sim, 10.5);
    settleWeather(sim, 'clear');
    return sim;
  }

  it('clear midsummer noon, no lag: asphalt 44.9, concrete 37.8, shaded asphalt 27.7', () => {
    const sim = summerNoon();
    const asphalt = MATERIAL_IDS.indexOf('asphalt');
    const concrete = MATERIAL_IDS.indexOf('concrete');
    expect(Math.abs(slotTemp(sim, asphalt, 0) - 44.9)).toBeLessThan(0.4);
    expect(Math.abs(slotTemp(sim, concrete, 0) - 37.8)).toBeLessThan(0.4);
    expect(Math.abs(slotTemp(sim, asphalt, 1) - 27.7)).toBeLessThan(0.4);
    expect(Math.abs(surfaceTemp(sim, 100, 100) - 44.9)).toBeLessThan(0.4);
  });

  it('heat wave settled at 13:00: asphalt 52.3', () => {
    const sim = envSim({ zone: 'asphalt', surface: 'asphalt' });
    setClockD(sim, 10 + 13 / 24);
    settleWeather(sim, 'heat');
    expect(Math.abs(slotTemp(sim, MATERIAL_IDS.indexOf('asphalt'), 0) - 52.3)).toBeLessThan(0.8);
  });

  it('sunlit asphalt versus shaded soil: the chapter amounts at midsummer noon', () => {
    const sun = summerNoon();
    const asphalt = surfaceTemp(sun, 100, 100);
    const shaded = envSim({ zone: 'forest', surface: 'loam', shade: 255 });
    setClockD(shaded, 10.5);
    settleWeather(shaded, 'clear');
    const soil = surfaceTemp(shaded, 100, 100);
    // loam shaded: 25.3 + 18 * 0.89 * 0.12 = 27.2; asphalt in sun 44.9
    expect(Math.abs(soil - 27.2)).toBeLessThan(0.4);
    expect(asphalt - soil).toBeGreaterThan(17);
    expect(asphalt - soil).toBeLessThan(18.5);
  });

  it('shade blends linearly between the sun and shade states', () => {
    const sim = summerNoon({ shade: 128 });
    const asphalt = MATERIAL_IDS.indexOf('asphalt');
    const mid = (slotTemp(sim, asphalt, 0) + slotTemp(sim, asphalt, 1)) / 2;
    expect(Math.abs(surfaceTemp(sim, 5, 5) - mid)).toBeLessThan(0.1);
  });

  it('lawn zones use the grass row, clear nights lose heat, interiors are heated indoor air', () => {
    const lawn = envSim({ zone: 'lawn', surface: 'loam' });
    setClockD(lawn, 10.5);
    settleWeather(lawn, 'clear');
    expect(Math.abs(surfaceTemp(lawn, 10, 10) - (airTemp(lawn) + 6 * 0.89))).toBeLessThan(0.4);
    const night = envSim({ zone: 'asphalt', surface: 'asphalt' });
    setClockD(night, 10 + 1 / 24);
    settleWeather(night, 'clear');
    expect(surfaceTemp(night, 10, 10)).toBeCloseTo(airTemp(night) - 1.5, 1);
    const room = envSim({ zone: 'interior', surface: 'tile' });
    setClockD(room, 10.5);
    settleWeather(room, 'clear');
    expect(surfaceTemp(room, 10, 10)).toBeCloseTo(0.25 * airTemp(room) + 0.75 * 23, 6);
    expect(interiorTemp(room, false)).toBeCloseTo(0.6 * airTemp(room) + 8, 6);
  });

  it('with lag the surface trails its target with the material time constant', () => {
    const sim = summerNoon();
    setNoLag(sim.state, false);
    sim.state.env.weather.dwellEndTick = Number.MAX_SAFE_INTEGER;
    const asphalt = MATERIAL_IDS.indexOf('asphalt');
    const t = sim.state.env.thermal;
    const target = airTemp(sim) + 22 * 0.89;
    slotTemp(sim, asphalt, 0); // make sure the arrays exist before overwriting one
    t.tsurf[asphalt * 2] = 20;
    for (let i = 0; i < 8; i++) updateThermal(sim, 25); // 0.8 h = one asphalt time constant
    const expected = target + (20 - target) * Math.exp(-1);
    expect(Math.abs(t.tsurf[asphalt * 2] - expected)).toBeLessThan(0.3);
  });
});

describe('soil temperature (E6)', () => {
  function winterSim() {
    const sim = envSim();
    setClockD(sim, 24.5 + 0.0);
    settleWeather(sim, 'clear');
    return sim;
  }

  it('maritime January, 14:30, bare soil: 100 mm about 5.0 C, 400 mm about 6.0 C', () => {
    const sim = envSim();
    setClockD(sim, 24 + 14.5 / 24);
    settleWeather(sim, 'overcast');
    expect(Math.abs(soilTempAtDepth(sim, 100) - 5.0)).toBeLessThan(1.5);
    expect(Math.abs(soilTempAtDepth(sim, 400) - 6.0)).toBeLessThan(0.8);
    expect(winterSim()).toBeDefined();
  });

  it('damps with depth: the 2 m layer barely moves over a day, the surface layers swing', () => {
    const sim = envSim();
    setClockD(sim, 10);
    settleWeather(sim, 'clear');
    const w = sim.state.env.weather;
    const series: Record<number, number[]> = { 0: [], 100: [], 400: [], 2000: [] };
    for (let i = 0; i < 24; i++) {
      sim.state.env.calendar.startTick = Math.round((10 + i / 24) * TICKS_PER_DAY);
      sim.state.tick = 0;
      w.dwellEndTick = Number.MAX_SAFE_INTEGER;
      for (const z of [0, 100, 400, 2000]) series[z].push(soilTempAtDepth(sim, z));
    }
    // the daily swing: remove the slow seasonal drift between the first and last sample
    const swing = (xs: number[]) => {
      const detrended = xs.map((x, i) => x - (xs[0] + ((xs[xs.length - 1] - xs[0]) * i) / (xs.length - 1)));
      return Math.max(...detrended) - Math.min(...detrended);
    };
    expect(swing(series[0])).toBeGreaterThan(2 * swing(series[100]));
    expect(swing(series[100])).toBeGreaterThan(2 * swing(series[400]));
    expect(swing(series[2000])).toBeLessThan(0.05);
  });

  it('lags the daily wave by about 3.8 h per 100 mm', () => {
    const sim = envSim();
    setClockD(sim, 10);
    settleWeather(sim, 'clear');
    const peakHour = (z: number): number => {
      let best = -1e9, at = 0;
      for (let q = 0; q < 96; q++) {
        sim.state.env.calendar.startTick = Math.round(10 * TICKS_PER_DAY + (q / 4) * TICKS_PER_HOUR);
        sim.state.tick = 0;
        const v = soilTempAtDepth(sim, z);
        if (v > best) { best = v; at = q / 4; }
      }
      return at;
    };
    expect(peakHour(0)).toBeCloseTo(14.5, 0);
    expect(Math.abs(peakHour(100) - (14.5 + 3.82))).toBeLessThan(1.0);
  });

  it('a 2-GD frost soaks into the soil: 100 mm falls by about 2.4 C', () => {
    const sim = envSim();
    setClockD(sim, 24 + 14.5 / 24);
    settleWeather(sim, 'overcast');
    setNoLag(sim.state, false);
    const before = soilTempAtDepth(sim, 100);
    sim.state.env.weather.state = 'frost';
    sim.state.env.weather.wOff = -5;
    sim.state.env.weather.dmCur = 1.3;
    for (let i = 0; i < 2 * 240; i++) updateThermal(sim, 25); // clock frozen: 2 GD of 0.1 h steps would be 48 h
    const after = soilTempAtDepth(sim, 100);
    // the soak EMA reaches (1 - e^(-2/1.5)) of the offset: -5 * 0.736 * e^(-1/3)
    expect(before - after).toBeGreaterThan(1.6);
    expect(before - after).toBeLessThan(3.4);
  });

  it('cover changes the day swing and the mean: stone and paving warm the soil beneath', () => {
    const sim = envSim();
    setClockD(sim, 24.5);
    settleWeather(sim, 'clear');
    expect(soilTempAtDepth(sim, 100, 'stone') - soilTempAtDepth(sim, 100, 'bare')).toBeGreaterThan(0.5);
    expect(soilTempAtDepth(sim, 100, 'asphalt')).toBeGreaterThan(soilTempAtDepth(sim, 100, 'stone'));
  });
});

describe('chamber temperature and humidity (GDD 03 §9)', () => {
  it('the thermal column formula gives 24.6 C for the chapter example', () => {
    const t = chamberColumnTemp({ T_annual: 10, T_seasonMean: 18, T_dayMean: 20, T_top: 35 }, 80);
    expect(Math.abs(t - 24.6)).toBeLessThan(0.1);
  });

  it('soil moisture 0.1 gives RH 0.552', () => {
    expect(Math.abs(soilRelHumidity(0.1) - 0.552)).toBeLessThan(0.005);
    expect(soilRelHumidity(0)).toBe(0.5);
    expect(soilRelHumidity(0.5)).toBe(1);
  });

  function nestWith(sim: ReturnType<typeof envSim>, depthMm: number, covered: boolean): { nest: Nest; chamber: Chamber } {
    const chamber = { id: 1, center: { x: 1000, y: -depthMm, z: 1000 }, depthMm, covered, wetUntilTick: -1 } as unknown as Chamber;
    const nest = { id: 0, substrate: 'loam', chambers: [chamber] } as unknown as Nest;
    sim.state.nests.push(nest);
    return { nest, chamber };
  }

  it('deeper chambers are damped toward the annual mean and lag the surface', () => {
    const sim = envSim({ zone: 'forest', surface: 'loam' });
    setClockD(sim, 10);
    settleWeather(sim, 'clear');
    setNoLag(sim.state, false);
    const w = sim.state.env.weather;
    const shallow = nestWith(sim, 60, false), deep = nestWith(sim, 600, false);
    const s: number[] = [], d: number[] = [];
    for (let i = 0; i < 2 * 240; i++) {
      sim.state.tick += 25;
      w.dwellEndTick = Number.MAX_SAFE_INTEGER;
      weatherSystem.run(sim);
      if (i >= 240) { s.push(chamberTemp(sim, shallow.nest, shallow.chamber)); d.push(chamberTemp(sim, deep.nest, deep.chamber)); }
    }
    const range = (xs: number[]) => Math.max(...xs) - Math.min(...xs);
    expect(range(s)).toBeGreaterThan(3 * range(d));
    expect(s.every(Number.isFinite) && d.every(Number.isFinite)).toBe(true);
  });

  it('a chamber under a stone follows the sun-warmed stone more than open ground at the same depth', () => {
    const sim = envSim({ zone: 'forest', surface: 'loam' });
    setClockD(sim, 10 + 15 / 24);
    settleWeather(sim, 'clear');
    sim.state.env.thermal.tsurfDay = undefined; // re-seed
    const open = nestWith(sim, 30, false), under = nestWith(sim, 30, true);
    expect(chamberTemp(sim, under.nest, under.chamber)).not.toBeCloseTo(chamberTemp(sim, open.nest, open.chamber), 3);
    expect(effectiveDepthMm(sim, 1000, 1000, 30, true)).toBeLessThan(effectiveDepthMm(sim, 1000, 1000, 30, false));
  });

  it('finds a chamber by id, and unknown ids fall back to the degraded soil constant', () => {
    const sim = envSim();
    setClockD(sim, 10);
    settleWeather(sim, 'clear');
    const { nest, chamber } = nestWith(sim, 100, false);
    expect(chamberTemp(sim, chamber.id)).toBe(chamberTemp(sim, nest, chamber));
    expect(chamberTemp(sim, 999)).toBe(19);
  });

  it('chamber humidity follows depth and soil moisture, and a recent flood holds it high', () => {
    const sim = envSim({ zone: 'forest', surface: 'loam' });
    setClockD(sim, 10);
    settleWeather(sim, 'clear');
    const m = sim.state.env.moisture;
    m.theta0.fill(26);
    m.theta1.fill(26);
    const { nest, chamber } = nestWith(sim, 100, false);
    expect(Math.abs(chamberHumidity(sim, nest, chamber) - 0.552)).toBeLessThan(0.01);
    m.theta1.fill(200);
    const wetDeep = chamberHumidity(sim, nest, chamber);
    expect(wetDeep).toBeGreaterThan(0.552);
    chamber.wetUntilTick = sim.state.tick + TICKS_PER_DAY;
    expect(chamberHumidity(sim, nest, chamber)).toBeCloseTo(1, 6);
    chamber.wetUntilTick = sim.state.tick + TICKS_PER_DAY / 2;
    expect(chamberHumidity(sim, nest, chamber)).toBeCloseTo(wetDeep + (1 - wetDeep) * 0.5, 6);
  });

  it('thermalInputs fills the given record and returns it', () => {
    const sim = envSim();
    setClockD(sim, 10.5);
    settleWeather(sim, 'clear');
    const out = newThermalInputs();
    const r = thermalInputs(sim, { x: 100, y: 0, z: 100 }, out);
    expect(r).toBe(out);
    expect(Object.values(r).every(Number.isFinite)).toBe(true);
    expect(r.T_annual).toBeCloseTo(13, 6);
  });
});

describe('air humidity', () => {
  it('climate base plus the weather delta, clamped', () => {
    const sim = envSim();
    settleWeather(sim, 'clear');
    expect(relHumidity(sim)).toBeCloseTo(0.75, 6);
    settleWeather(sim, 'rain');
    expect(relHumidity(sim)).toBe(1);
    settleWeather(sim, 'heat');
    expect(relHumidity(sim)).toBeCloseTo(0.5, 6);
  });
});
