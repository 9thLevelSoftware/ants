// Ambience matrix (GDD 08 §13.4) and the loop crossfade plan (offline render of a defective loop file).
import { describe, expect, it } from 'vitest';
import { ZONE_TYPES, WEATHER_STATES } from '@/sim/types/ids';
import { computeAmbience, groupWeights, HABITAT_GROUPS, todWeights, type AmbienceInput, type HabitatGroup } from './matrix';
import { LAYER_IDS } from './layers';
import { firstSegment, loopRegion, nextSegment, segmentGainAt, type LoopSegment } from '../loopSchedule';
import { LOOP } from '../tuning';

function only(g: HabitatGroup) {
  const w = Object.fromEntries(HABITAT_GROUPS.map((x) => [x, 0])) as Record<HabitatGroup, number>;
  w[g] = 1;
  return w;
}

const base: AmbienceInput = {
  groups: only('woodland'), hour: 12, sunrise: 6, sunset: 20, weather: 'clear', precip: 0, underground: false, depthBu: 0,
  nearAnts: 0, humidity: null, woodNest: false, colonyAnts: 0, childrenActive: false, voicesAllowed: false,
};

describe('time of day', () => {
  it('weights sum to 1 at every hour and peak in their segment', () => {
    for (let h = 0; h < 24; h += 0.25) {
      const w = todWeights(h, 6, 20);
      expect(w.dawn + w.day + w.dusk + w.night).toBeCloseTo(1, 9);
      for (const v of Object.values(w)) expect(v).toBeGreaterThanOrEqual(-1e-12);
    }
    expect(todWeights(6, 6, 20).dawn).toBe(1);
    expect(todWeights(13, 6, 20).day).toBe(1);
    expect(todWeights(20, 6, 20).dusk).toBe(1);
    expect(todWeights(2, 6, 20).night).toBe(1);
  });
  it('crossfades over one game hour', () => {
    const w = todWeights(7, 6, 20); // dawn -> day boundary at sunrise + 1 h
    expect(w.dawn).toBeCloseTo(0.5, 9);
    expect(w.day).toBeCloseTo(0.5, 9);
  });
});

describe('habitat groups', () => {
  it('every zone type maps to a group; borders blend', () => {
    for (const z of ZONE_TYPES) expect(Object.values(groupWeights([z], null)).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
    const w = groupWeights(['forest', 'forest', 'lawn', 'lawn'], null);
    expect(w.woodland).toBeCloseTo(0.5, 9);
    expect(w['open-green']).toBeCloseTo(0.5, 9);
  });
});

describe('ambience matrix', () => {
  it('every group x time x weather state gives a non-silent, finite, bounded mix', () => {
    for (const g of HABITAT_GROUPS) for (const h of [3, 6, 13, 20]) for (const weather of WEATHER_STATES) {
      const t = computeAmbience({ ...base, groups: only(g), hour: h, weather, precip: 0.5 });
      let sum = 0;
      for (const id of LAYER_IDS) {
        expect(Number.isFinite(t.layers[id])).toBe(true);
        expect(t.layers[id]).toBeGreaterThanOrEqual(0);
        expect(t.layers[id]).toBeLessThanOrEqual(1.5);
        sum += t.layers[id];
      }
      // a frosty night on open ground is beds-silent by design (crickets off): its ice ticks carry the scene
      const grains = t.grains.iceTicks + t.grains.droplets + t.grains.heatTicks;
      expect(sum + grains, `${g} ${h} ${weather}`).toBeGreaterThan(0.1);
    }
  });
  it('table values: woodland day, interior day muffled street, open green night', () => {
    const a = computeAmbience({ ...base, hour: 13 });
    expect(a.layers.birds).toBeCloseTo(0.6, 9);
    expect(a.layers.wind).toBeCloseTo(0.5, 9);
    expect(a.layers['leaf-rustle']).toBeGreaterThan(0);
    const i = computeAmbience({ ...base, groups: only('interior'), hour: 13 });
    expect(i.layers.fridge).toBeCloseTo(0.5, 9);
    expect(i.layers['street-muffled']).toBeCloseTo(0.2, 9);
    expect(computeAmbience({ ...base, groups: only('open-green'), hour: 2 }).layers.crickets).toBeCloseTo(0.8, 9);
  });
  it('weather modifiers', () => {
    const rain = computeAmbience({ ...base, hour: 13, weather: 'rain', precip: 1 });
    expect(rain.layers['rain-light']).toBeCloseTo(0.8, 9);
    expect(rain.layers.birds).toBeCloseTo(0.6 * 0.2, 9);
    expect(rain.grains.droplets).toBe(12);
    const storm = computeAmbience({ ...base, hour: 13, weather: 'storm' });
    expect(storm.layers.birds).toBe(0);
    expect(storm.layers['rain-heavy']).toBe(1);
    expect(storm.layers.wind).toBeCloseTo(0.75, 9);
    const frost = computeAmbience({ ...base, hour: 2, weather: 'frost' });
    expect(frost.layers.crickets).toBe(0);
    expect(frost.grains.iceTicks).toBeGreaterThan(0);
    expect(computeAmbience({ ...base, groups: only('hard'), weather: 'heat' }).grains.heatTicks).toBeGreaterThan(0);
    expect(computeAmbience({ ...base, weather: 'heat' }).grains.heatTicks).toBe(0); // only on hard ground
  });
  it('underground bands: occluded surface, rumble 0.4 then 0.6, nest murmur by ant count, drips when humid', () => {
    const shallow = computeAmbience({ ...base, underground: true, depthBu: 2 });
    expect(shallow.layers.rumble).toBe(0);
    expect(shallow.surface.cutoffHz).toBeLessThan(6000);
    const mid = computeAmbience({ ...base, underground: true, depthBu: 12, nearAnts: 25, humidity: 0.9 });
    expect(mid.layers.rumble).toBeCloseTo(0.4, 9);
    expect(mid.surface.cutoffHz).toBeCloseTo(1500, 6);
    expect(mid.surface.gainDb).toBeCloseTo(-18, 9);
    expect(mid.grains.nestTicks).toBeCloseTo(15, 9);
    expect(mid.grains.drips).toBeGreaterThan(0);
    expect(computeAmbience({ ...base, underground: true, depthBu: 12, nearAnts: 0 }).grains.nestTicks).toBe(0);
    expect(computeAmbience({ ...base, underground: true, depthBu: 30 }).layers.rumble).toBeCloseTo(0.6, 9);
    const wood = computeAmbience({ ...base, underground: true, depthBu: 8, woodNest: true, colonyAnts: 250 });
    expect(wood.grains.woodCreakEveryS).toBeGreaterThan(0);
    expect(wood.grains.crackle).toBeCloseTo(3, 9);
  });
  it('E28: Play ground day uses the synth murmur unless Distant voices is allowed', () => {
    const def = computeAmbience({ ...base, groups: only('play'), hour: 13, childrenActive: true });
    expect(def.playgroundSource).toBe('synth-murmur');
    expect(def.layers.murmur).toBeCloseTo(0.5, 9);
    expect(def.layers['playground-voices']).toBe(0);
    const opt = computeAmbience({ ...base, groups: only('play'), hour: 13, childrenActive: true, voicesAllowed: true });
    expect(opt.playgroundSource).toBe('playground_distant');
    expect(opt.layers.murmur).toBe(0);
  });
});

/** Pure offline render of the loop plan over a file with the delivered defect (silent head and tail). */
function renderLoop(fileS: number, sr: number, seconds: number): Float32Array {
  const n = Math.round(fileS * sr);
  const file = new Float32Array(n);
  const dropout = Math.round(0.005 * sr);
  // band-limited noise-like content (sum of incommensurate sines) with the ~5 ms near-silence at both ends
  for (let i = dropout; i < n - dropout; i++) {
    const t = i / sr;
    file[i] = 0.3 * Math.sin(2 * Math.PI * 211 * t) + 0.2 * Math.sin(2 * Math.PI * 347.3 * t + 1) + 0.15 * Math.sin(2 * Math.PI * 89.1 * t + 2);
  }
  const out = new Float32Array(Math.round(seconds * sr));
  const segs: LoopSegment[] = [firstSegment(fileS, LOOP, 0, 0.3, 0.05)];
  while (segs[segs.length - 1].when < seconds) segs.push(nextSegment(fileS, LOOP, segs[segs.length - 1]));
  for (const s of segs) {
    const i0 = Math.max(0, Math.round(s.when * sr)), i1 = Math.min(out.length, Math.round((s.when + s.duration) * sr));
    for (let i = i0; i < i1; i++) {
      const t = i / sr;
      const src = Math.round((s.offset + t - s.when) * sr);
      if (src >= 0 && src < n) out[i] += file[src] * segmentGainAt(s, t);
    }
  }
  return out;
}

describe('seamless loop plan', () => {
  it('skips the defect region and overlaps consecutive passes', () => {
    const r = loopRegion(45, LOOP);
    expect(r.start).toBeGreaterThan(0.005);
    expect(r.end).toBeLessThan(45 - 0.005);
    const a = firstSegment(45, LOOP, 0, 0, 0.05);
    const b = nextSegment(45, LOOP, a);
    expect(b.when).toBeCloseTo(a.when + a.duration - LOOP.crossfadeS, 9);
    expect(b.offset).toBe(r.start);
  });
  it('offline render over the loop boundaries shows no discontinuity or dropout', () => {
    const sr = 8000, fileS = 4;
    const out = renderLoop(fileS, sr, 12);
    // reference: largest sample step and RMS of the clean content
    let maxStep = 0;
    for (let i = sr; i < out.length; i++) maxStep = Math.max(maxStep, Math.abs(out[i] - out[i - 1]));
    let clean = 0;
    for (let i = 1; i < sr; i++) {
      const t = i / sr, u = (i - 1) / sr;
      const f = (x: number) => 0.3 * Math.sin(2 * Math.PI * 211 * x) + 0.2 * Math.sin(2 * Math.PI * 347.3 * x + 1) + 0.15 * Math.sin(2 * Math.PI * 89.1 * x + 2);
      clean = Math.max(clean, Math.abs(f(t) - f(u)));
    }
    expect(maxStep).toBeLessThan(clean * 1.6); // no click at any boundary
    // no dropout: RMS in every 10 ms window after the fade-in stays within 6 dB of the overall RMS
    const win = Math.round(0.01 * sr);
    let total = 0;
    for (let i = sr; i < out.length; i++) total += out[i] * out[i];
    const rms = Math.sqrt(total / (out.length - sr));
    for (let w = sr; w + win < out.length; w += win) {
      let s = 0;
      for (let i = w; i < w + win; i++) s += out[i] * out[i];
      expect(Math.sqrt(s / win)).toBeGreaterThan(rms * 0.5);
    }
  });
});
