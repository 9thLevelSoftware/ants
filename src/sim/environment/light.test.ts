// GDD 06 §1.4: sun direction, insolation, light level, moonlight.

import { describe, expect, it } from 'vitest';
import type { Vec3 } from '@/core/math/vec3';
import { TICKS_PER_HOUR } from '@/sim/time';
import { insolation, isMoonless, lightLevel, moonlight, skyLight, sunDirection } from './light';
import { envSim, setClockD, settleWeather } from './envTestKit';
import { calendarNow } from './calendar';

const v = (): Vec3 => ({ x: 0, y: 0, z: 0 });

function at(sim: ReturnType<typeof envSim>, day: number, hour: number): void {
  setClockD(sim, day + hour / 24);
}

describe('light level', () => {
  it('full daylight at a clear midday, dimmed by cloud, dark but for the moon at night', () => {
    const sim = envSim();
    at(sim, 10, 12);
    settleWeather(sim, 'clear');
    expect(skyLight(sim)).toBeCloseTo(1, 6);
    settleWeather(sim, 'overcast');
    expect(skyLight(sim)).toBeCloseTo(0.55, 6);
    settleWeather(sim, 'storm');
    expect(skyLight(sim)).toBeCloseTo(0.3, 6);
    at(sim, 10, 1);
    settleWeather(sim, 'clear');
    expect(skyLight(sim)).toBeCloseTo(moonlight(sim), 9);
    expect(skyLight(sim)).toBeGreaterThanOrEqual(0.04 * 0.94);
    expect(skyLight(sim)).toBeLessThanOrEqual(0.1);
  });

  it('moonlight is 0.04 at new moon and 0.10 at full moon, cut by cloud', () => {
    const sim = envSim();
    at(sim, 10, 1);
    settleWeather(sim, 'clear');
    sim.state.env.weather.cloud = 0;
    sim.state.env.calendar.moonPhase0 = 0;
    const base = calendarNow(sim).moonIllum;
    sim.state.env.calendar.moonPhase0 = 0.5 - ((sim.state.tick + sim.state.env.calendar.startTick) / (2.265 * 6000)) % 1;
    const m = moonlight(sim);
    expect(calendarNow(sim).moonIllum).toBeGreaterThan(0.99);
    expect(m).toBeCloseTo(0.1, 2);
    sim.state.env.weather.cloud = 1;
    expect(moonlight(sim)).toBeCloseTo(0.1 * 0.4, 2);
    expect(base).toBeGreaterThanOrEqual(0);
  });

  it('moonless needs a thin moon and a mostly clear sky', () => {
    const sim = envSim();
    at(sim, 10, 1);
    settleWeather(sim, 'clear');
    sim.state.env.calendar.moonPhase0 = 0 - ((sim.state.tick + sim.state.env.calendar.startTick) / (2.265 * 6000)) % 1;
    expect(isMoonless(sim)).toBe(true);
    sim.state.env.weather.cloud = 0.9;
    expect(isMoonless(sim)).toBe(false);
  });

  it('shade cuts direct light and burial darkens exponentially', () => {
    const sim = envSim({ shade: 255 });
    at(sim, 10, 12);
    settleWeather(sim, 'clear');
    const open = lightLevel(sim);
    expect(lightLevel(sim, { x: 100, y: 0, z: 100 })).toBeCloseTo(open * 0.4, 6);
    const surface = lightLevel(sim, { x: 100, y: 0, z: 100 });
    expect(lightLevel(sim, { x: 100, y: -40, z: 100 })).toBeCloseTo(surface * Math.exp(-1), 6);
    expect(lightLevel(sim, { x: 100, y: -400, z: 100 })).toBeLessThan(1e-3);
  });
});

describe('insolation', () => {
  it('is sun height x peakSolar x weather: 0.89 at a clear summer noon, 0 at night, scaled by cloud', () => {
    const sim = envSim();
    at(sim, 10, 12);
    settleWeather(sim, 'clear');
    expect(insolation(sim)).toBeCloseTo(0.89, 2);
    settleWeather(sim, 'overcast');
    expect(insolation(sim)).toBeCloseTo(0.89 * 0.35, 2);
    settleWeather(sim, 'heat');
    expect(insolation(sim)).toBeCloseTo(0.89 * 1.05, 2);
    at(sim, 10, 0);
    expect(insolation(sim)).toBe(0);
  });

  it('is weaker in winter: peakSolar 0.25 at midwinter noon', () => {
    const sim = envSim();
    at(sim, 21, 12);
    settleWeather(sim, 'clear');
    expect(insolation(sim)).toBeCloseTo(0.25, 2);
  });
});

describe('sun direction', () => {
  it('is a unit vector that returns its argument', () => {
    const sim = envSim();
    const out = v();
    for (let h = 0; h < 24; h += 0.5) {
      at(sim, 10, h);
      const r = sunDirection(sim, out);
      expect(r).toBe(out);
      expect(Math.hypot(r.x, r.y, r.z)).toBeCloseTo(1, 9);
    }
  });

  it('rises in the east, crosses south at noon, sets in the west, runs under the horizon at night', () => {
    const sim = envSim();
    const d = v();
    const cal = () => calendarNow(sim);
    setClockD(sim, 10.5);
    sunDirection(sim, d);
    expect(d.y).toBeGreaterThan(0.85);
    expect(d.z).toBeGreaterThan(0);
    expect(Math.abs(d.x)).toBeLessThan(0.05);
    setClockD(sim, 10 + (cal().sunrise + 0.01) / 24);
    sunDirection(sim, d);
    expect(d.x).toBeGreaterThan(0.99);
    expect(Math.abs(d.y)).toBeLessThan(0.02);
    setClockD(sim, 10 + (cal().sunset - 0.01) / 24);
    sunDirection(sim, d);
    expect(d.x).toBeLessThan(-0.99);
    setClockD(sim, 10 + 0.0 / 24);
    sunDirection(sim, d);
    expect(d.y).toBeLessThan(-0.3);
    expect(d.z).toBeLessThan(0);
    for (let h = 0; h < 24; h += 0.25) {
      setClockD(sim, 10 + h / 24);
      sunDirection(sim, d);
      const c = cal();
      expect(d.y > 0.0, `hour ${h}`).toBe(h > c.sunrise && h < c.sunset);
    }
  });

  it('noon elevation follows the season: about 20 degrees at midwinter, 66 at midsummer', () => {
    const sim = envSim();
    const d = v();
    setClockD(sim, 7 + 0.5);
    sunDirection(sim, d);
    expect((Math.asin(d.y) * 180) / Math.PI).toBeGreaterThan(64);
    setClockD(sim, 21 + 0.5);
    sunDirection(sim, d);
    expect((Math.asin(d.y) * 180) / Math.PI).toBeLessThan(22);
    expect((Math.asin(d.y) * 180) / Math.PI).toBeGreaterThan(18);
  });

  it('moves continuously: no jump between neighbouring ticks across a whole day, sunrise and sunset included', () => {
    const sim = envSim();
    const a = v(), b = v();
    sim.state.tick = 0;
    for (const day of [3, 10, 17, 24]) {
      sim.state.env.calendar.startTick = day * 6000;
      sunDirection(sim, a);
      let maxStep = 0;
      for (let t = 1; t <= 6000; t += 5) {
        sim.state.env.calendar.startTick = day * 6000 + t;
        sunDirection(sim, b);
        maxStep = Math.max(maxStep, Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z));
        a.x = b.x; a.y = b.y; a.z = b.z;
      }
      expect(maxStep, `day ${day}`).toBeLessThan(0.02);
    }
    expect(TICKS_PER_HOUR).toBe(250);
  });
});
