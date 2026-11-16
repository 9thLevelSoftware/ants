// Weather renderer logic without a GPU: what it reads from the sim, how many drops / impacts it shows, that impact
// placement is deterministic, and that flooded cavities produce a water sheet at the nest's level.

import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
// the sim composition root first (module order: environment and nest modules close a cycle through it)
import { commandsSystem } from '@/sim/systems';
import { makeTestSim } from '@/sim/testing';
import { forceWeather } from '@/sim/environment/weather';
import { floodCheats, floodSystem } from '@/sim/nest/flood';
import { FloodWater } from './floodWater';
import { ImpactLayer } from './impacts';
import { flashDuration, flashStrength } from './lightning';
import { RainField } from './rainField';
import { DROP_LOOK, LIGHTNING_INTENSITY, LIGHTNING_REDUCED } from './tuning';
import { readWeather, waterSpots } from './WeatherRenderer';

describe('readWeather', () => {
  it('maps the sim weather to the rain class, intensity, wetness and frost', () => {
    const sim = makeTestSim({ systems: [] });
    forceWeather(sim, 'storm', null, 'test');
    sim.state.env.weather.rainRateMmH = 15;
    let v = readWeather(sim);
    expect(v.rain).toBe('storm');
    expect(v.intensity).toBeCloseTo(0.5, 6);
    expect(v.wet).toBeGreaterThan(0.4);
    forceWeather(sim, 'frost', null, 'test');
    sim.state.env.weather.rainRateMmH = 0;
    sim.state.env.weather.precip = 0;
    sim.state.env.moisture.surfaceWet = 0.3;
    v = readWeather(sim);
    expect(v.rain).toBeNull();
    expect(v.frost).toBe(true);
    expect(v.wet).toBeCloseTo(0.3, 6);
  });
});

describe('rain field and impacts', () => {
  it('the drop count follows intensity and class density', () => {
    const r = new RainField(1000);
    const c = new Vector3();
    expect(r.set(DROP_LOOK.downpour, 1, 0, 1, 0, [1, 1, 1], c, 0, 4)).toBe(1000);
    expect(r.set(DROP_LOOK.drizzle, 1, 0, 1, 0, [1, 1, 1], c, 0, 4)).toBe(450);
    expect(r.set(DROP_LOOK.shower, 0, 0, 1, 0, [1, 1, 1], c, 0, 4)).toBe(0);
    expect(r.mesh.visible).toBe(false);
    r.dispose();
  });

  it('impact placement is a pure function of slot, cycle and clock (reproducible frames)', () => {
    const place = (u: number, v: number, out: { x: number; y: number; z: number; r: number }) => { out.x = u * 100; out.y = 0; out.z = v * 100; out.r = 2; return true; };
    const a = new ImpactLayer('splash', 50, [1, 1, 1], 1), b = new ImpactLayer('splash', 50, [1, 1, 1], 1);
    a.update(3.7, 50, 0.25, 1, place);
    b.update(1.0, 50, 0.25, 1, place);
    b.update(3.7, 50, 0.25, 1, place);
    const pa = a.mesh.geometry.getAttribute('aPos').array, pb = b.mesh.geometry.getAttribute('aPos').array;
    expect(Array.from(pa)).toEqual(Array.from(pb));
    expect(a.active).toBe(50);
    a.update(3.7, 10, 0.25, 1, place);
    expect(a.active).toBe(10);
  });
});

describe('standing water and flooded cavities', () => {
  it('puddle cells and water bodies near the focus are ripple spots', () => {
    const sim = makeTestSim({ systems: [] });
    const m = sim.state.env.moisture, c = sim.world.size / 2;
    const i = Math.floor(c / m.cell), k = Math.floor(c / m.cell);
    expect(waterSpots(sim, c, c, 50 * sim.world.bu)).toEqual([]);
    m.puddle[k * m.nx + i] = 100; // 5 mm
    const s = waterSpots(sim, c, c, 50 * sim.world.bu);
    expect(s.length).toBe(4);
    expect(s[1]).toBeCloseTo(sim.field.height(s[0], s[2]) + 5, 0);
  });

  it('a flooded nest gets a water sheet at its level; it goes when the nest drains', () => {
    const sim = makeTestSim({ nest: 'small', systems: [commandsSystem, floodSystem] });
    floodCheats(sim.state).rainI = 1;
    for (let t = 0; t < 300; t++) sim.tick();
    const w = new FloodWater();
    w.update(sim, 0);
    expect(w.cells).toBeGreaterThan(0);
    const nest = sim.stores.nests.get(sim.state.colonies[0].nestIds[0])!;
    const mesh = w.group.children[0] as unknown as { geometry: { getAttribute(n: string): { getY(i: number): number } } };
    expect(mesh.geometry.getAttribute('position').getY(0)).toBeCloseTo(nest.flood.level, 3); // float32 positions
    nest.flood.water = 0;
    w.update(sim, 0);
    expect(w.cells).toBe(0);
    expect(w.group.children.length).toBe(0);
    w.dispose();
  });
});

describe('lightning (GDD 06 §3.11: pulse <= 120 ms; reduced motion: no flash, a soft sky brightening)', () => {
  it('the pulse lasts at most 120 ms and starts at full strength', () => {
    expect(flashDuration(false)).toBeLessThanOrEqual(0.12);
    expect(flashStrength(flashDuration(false), false)).toBeCloseTo(LIGHTNING_INTENSITY, 9);
    expect(flashStrength(0, false)).toBe(0);
  });

  it('reduced motion: no step at the start, a slow rise and fall far below the pulse', () => {
    const d = flashDuration(true);
    expect(d).toBeGreaterThanOrEqual(1);
    expect(flashStrength(d, true)).toBeCloseTo(0, 9); // starts at zero: no pulse
    let peak = 0, prev = 0, maxStep = 0;
    for (let t = 0; t <= d; t += 1 / 60) {
      const k = flashStrength(d - t, true);
      peak = Math.max(peak, k);
      maxStep = Math.max(maxStep, Math.abs(k - prev));
      prev = k;
    }
    expect(peak).toBeCloseTo(LIGHTNING_REDUCED, 2);
    expect(peak).toBeLessThan(LIGHTNING_INTENSITY / 4);
    expect(maxStep).toBeLessThan(0.01); // no visible frame-to-frame jump at 60 fps
  });
});
