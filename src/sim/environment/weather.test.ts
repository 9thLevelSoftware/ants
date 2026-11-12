// GDD 06 §3 and App. E 7: the weather state machine. Transition tables, frequencies, dwell bounds, determinism,
// forecast, guards, season-length scaling, severity and difficulty, plus the seeded statistics of E7.

import { describe, expect, it } from 'vitest';
import { WEATHER_STATES } from '@/sim/types';
import type { Season, WeatherState } from '@/sim/types';
import { rngFork } from '@/core/rng';
import { CLIMATES, seasonalMean } from './climates';
import { drawDwellHours, drawNextState, drawRainClass, transitionWeights, type WeatherDrawCtx } from './weatherDraw';
import { TRANSITIONS, DWELL_H, RAIN_CLASS_DWELL_MULT, RAIN_CLASS_WEIGHTS } from '@/sim/balance';
import { runWeather, envSim, type Transition } from './envTestKit';
import { TICKS_PER_DAY } from '@/sim/time';

const YEAR_TICKS = 28 * TICKS_PER_DAY;

/** One 200-year run of the real machine (maritime, Naturalist, seed 21), shared by the statistical tests. */
let longRun: { sim: ReturnType<typeof envSim>; tr: Transition[] } | null = null;
function long200() {
  if (!longRun) {
    const sim = envSim({ seed: 21 });
    longRun = { sim, tr: runWeather(sim, 200 * YEAR_TICKS) };
  }
  return longRun;
}
const SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter'];

function neutral(season: Season, over: Partial<WeatherDrawCtx> = {}): WeatherDrawCtx {
  return {
    season, hour: 22, sunrise: 6, sunset: 18, tSeason: season === 'summer' ? 20 : season === 'winter' ? 4 : 11,
    climate: CLIMATES['temperate-maritime'], rainMult: 1, stormMult: 1, heatMult: 1, frostMult: 1, clearOvercastOnly: false,
    dryspell: false, ...over,
  };
}

describe('transition tables (GDD 06 §3.2)', () => {
  it('every row of the table sums to 1', () => {
    for (const season of SEASONS) {
      for (const [from, row] of Object.entries(TRANSITIONS[season])) {
        const sum = Object.values(row ?? {}).reduce((a, b) => a + (b ?? 0), 0);
        expect(sum, `${season} ${from}`).toBeCloseTo(1, 6);
      }
    }
  });

  it('transcription spot checks against the chapter', () => {
    expect(TRANSITIONS.spring.clear).toEqual({ overcast: 0.55, rain: 0.28, storm: 0.02, heat: 0, frost: 0.15 });
    expect(TRANSITIONS.summer.clear).toEqual({ overcast: 0.5, rain: 0.2, storm: 0.03, heat: 0.27, frost: 0 });
    expect(TRANSITIONS.summer.heat).toMatchObject({ clear: 0.3, overcast: 0.25, rain: 0.05, storm: 0.4 });
    expect(TRANSITIONS.autumn.rain).toMatchObject({ clear: 0.22, overcast: 0.74, storm: 0.04 });
    expect(TRANSITIONS.winter.clear).toMatchObject({ overcast: 0.4, rain: 0.16, storm: 0.01, frost: 0.43 });
    expect(TRANSITIONS.winter.frost).toMatchObject({ clear: 0.35, overcast: 0.65 });
    expect(DWELL_H.winter.frost).toEqual({ min: 10, mean: 28 });
    expect(DWELL_H.summer.heat).toEqual({ min: 24, mean: 54 });
  });

  it('neutral weights equal the normalised table; shoulder-season heat is 0.3 x the summer weight', () => {
    const out = new Float64Array(6);
    for (const season of SEASONS) {
      for (const from of WEATHER_STATES) {
        const sum = transitionWeights(neutral(season), from, out);
        const total = Array.from(out).reduce((a, b) => a + b, 0);
        if (sum > 0) expect(total, `${season} ${from}`).toBeCloseTo(1, 9);
        expect(out[WEATHER_STATES.indexOf(from)]).toBe(0);
      }
    }
    transitionWeights(neutral('spring', { tSeason: 20 }), 'clear', out);
    const heat = out[WEATHER_STATES.indexOf('heat')];
    expect(heat).toBeCloseTo(0.081 / (0.55 + 0.28 + 0.02 + 0.081), 3); // frost is guarded out at 20 C
    transitionWeights(neutral('winter', { tSeason: 20 }), 'clear', out);
    expect(out[WEATHER_STATES.indexOf('heat')]).toBe(0);
  });

  it('guards: heat needs a warm seasonal mean and a clear sky; frost needs a cold seasonal mean and a night hour', () => {
    const out = new Float64Array(6);
    const idx = (s: WeatherState) => WEATHER_STATES.indexOf(s);
    transitionWeights(neutral('summer', { tSeason: 16 }), 'clear', out);
    expect(out[idx('heat')]).toBe(0);
    transitionWeights(neutral('summer', { tSeason: 18 }), 'clear', out);
    expect(out[idx('heat')]).toBeGreaterThan(0.2);
    transitionWeights(neutral('summer', { tSeason: 18 }), 'overcast', out);
    expect(out[idx('heat')]).toBe(0);
    for (const hour of [5.5, 8, 12, 16.5]) {
      transitionWeights(neutral('winter', { hour, sunrise: 8, sunset: 16 }), 'clear', out);
      expect(out[idx('frost')], `hour ${hour}`).toBe(0);
    }
    for (const hour of [17.5, 21, 0, 3, 5]) {
      transitionWeights(neutral('winter', { hour, sunrise: 8, sunset: 16 }), 'clear', out);
      expect(out[idx('frost')], `hour ${hour}`).toBeGreaterThan(0.3);
    }
    transitionWeights(neutral('winter', { tSeason: 10, hour: 22 }), 'clear', out);
    expect(out[idx('frost')]).toBe(0);
  });

  it('climate, difficulty and severity multipliers, dry spells and `none` severity', () => {
    const out = new Float64Array(6);
    const idx = (s: WeatherState) => WEATHER_STATES.indexOf(s);
    transitionWeights(neutral('summer'), 'clear', out);
    const base = { rain: out[idx('rain')], heat: out[idx('heat')] };
    transitionWeights(neutral('summer', { rainMult: 0.5 }), 'clear', out);
    expect(out[idx('rain')]).toBeLessThan(base.rain);
    transitionWeights(neutral('summer', { dryspell: true }), 'clear', out);
    expect(out[idx('rain')]).toBeLessThan(base.rain * 0.3);
    expect(out[idx('heat')]).toBeGreaterThan(base.heat);
    transitionWeights(neutral('summer', { clearOvercastOnly: true }), 'clear', out);
    expect(out[idx('overcast')]).toBe(1);
    transitionWeights(neutral('spring', { frostMult: 0.15, hour: 22, tSeason: 5 }), 'clear', out);
    const low = out[idx('frost')];
    transitionWeights(neutral('spring', { frostMult: 1, hour: 22, tSeason: 5 }), 'clear', out);
    expect(low).toBeLessThan(out[idx('frost')]);
  });

  it('an impossible draw (all guarded out) falls back to overcast, or clear from overcast', () => {
    const rng = rngFork(1, 'x');
    expect(drawNextState(neutral('summer', { clearOvercastOnly: true }), 'overcast', rng)).toBe('clear');
    const ctx = neutral('winter', { tSeason: 20, hour: 12, clearOvercastOnly: true });
    expect(drawNextState(ctx, 'clear', rng)).toBe('overcast');
  });
});

describe('sampling matches the table within sampling error (E5 of the task)', () => {
  it('direct draws: every season and state, 40000 draws each', () => {
    const rng = rngFork(11, 'weather-draw');
    const out = new Float64Array(6);
    const N = 40000;
    for (const season of SEASONS) {
      for (const from of WEATHER_STATES) {
        const ctx = neutral(season, { tSeason: season === 'summer' ? 20 : season === 'winter' ? 4 : 10 });
        const sum = transitionWeights(ctx, from, out);
        if (sum <= 0) continue;
        const expected = Array.from(out);
        const counts = new Array<number>(6).fill(0);
        for (let i = 0; i < N; i++) counts[WEATHER_STATES.indexOf(drawNextState(ctx, from, rng))]++;
        for (let k = 0; k < 6; k++) {
          const p = expected[k];
          const sd = Math.sqrt(N * p * (1 - p));
          expect(Math.abs(counts[k] - N * p), `${season} ${from}->${WEATHER_STATES[k]}`).toBeLessThanOrEqual(5 * sd + 1);
        }
      }
    }
  });

  it('200 simulated years of the real machine: per season, observed transitions match the weights the draws used', () => {
    const { tr } = long200();
    expect(tr.length).toBeGreaterThan(8000);
    for (const season of SEASONS) {
      for (const from of WEATHER_STATES) {
        const rows = tr.filter((t) => t.season === season && t.from === from);
        if (rows.length < 200) continue;
        const exp = new Array<number>(6).fill(0), obs = new Array<number>(6).fill(0);
        for (const r of rows) {
          obs[WEATHER_STATES.indexOf(r.to)]++;
          r.expected.forEach((p, k) => { exp[k] += p; });
        }
        for (let k = 0; k < 6; k++) {
          if (exp[k] < 20) continue;
          const sd = Math.sqrt(exp[k]);
          expect(Math.abs(obs[k] - exp[k]), `${season} ${from}->${WEATHER_STATES[k]} obs ${obs[k]} exp ${exp[k].toFixed(1)}`).toBeLessThanOrEqual(4.5 * sd);
        }
      }
    }
  }, 60000);
});

describe('dwell times respect the stated bounds', () => {
  it('direct draws: min + Exp(mean - min), capped at 3 x mean (heat 96 h), rain scaled by class', () => {
    const rng = rngFork(5, 'dwell');
    for (const season of SEASONS) {
      for (const state of WEATHER_STATES) {
        const d = DWELL_H[season][state];
        const cap = state === 'heat' ? 96 : 3 * d.mean;
        let sum = 0, lo = Infinity, hi = -Infinity;
        const N = 20000;
        for (let i = 0; i < N; i++) {
          const h = drawDwellHours(season, state, null, rng);
          sum += h;
          if (h < lo) lo = h;
          if (h > hi) hi = h;
        }
        expect(lo, `${season} ${state}`).toBeGreaterThanOrEqual(d.min - 1e-9);
        expect(hi, `${season} ${state}`).toBeLessThanOrEqual(cap + 1e-9);
        // the mean stays near the table mean (a little below because of the cap)
        expect(sum / N, `${season} ${state}`).toBeGreaterThan(d.min + 0.6 * (d.mean - d.min));
        expect(sum / N, `${season} ${state}`).toBeLessThanOrEqual(d.mean + 0.5);
      }
    }
    for (const cls of ['drizzle', 'shower', 'downpour'] as const) {
      const h = drawDwellHours('summer', 'rain', cls, rng);
      expect(h).toBeGreaterThanOrEqual(1.5 * RAIN_CLASS_DWELL_MULT[cls] - 1e-9);
      expect(h).toBeLessThanOrEqual(12 * RAIN_CLASS_DWELL_MULT[cls] + 1e-9);
    }
  });

  it('rain classes are drawn with the configured weights', () => {
    const rng = rngFork(6, 'cls');
    const n = { drizzle: 0, shower: 0, downpour: 0 };
    for (let i = 0; i < 30000; i++) n[drawRainClass(rng)]++;
    for (const c of ['drizzle', 'shower', 'downpour'] as const) expect(n[c] / 30000).toBeCloseTo(RAIN_CLASS_WEIGHTS[c], 1);
  });

  it('in a 200-year run every observed dwell is inside its bounds (frost and truncated heat aside)', () => {
    const { sim, tr } = long200();
    const slack = 0.11; // a transition runs on the first 2.5 s step at or after the dwell end
    let checked = 0;
    for (const t of tr) {
      const d = DWELL_H[t.season === t.season ? seasonOfStart(t) : t.season][t.from];
      if (t.from === 'frost') {
        expect(t.dwellH).toBeGreaterThanOrEqual(d.min - slack);
        continue;
      }
      if (t.from === 'heat') {
        expect(t.dwellH).toBeLessThanOrEqual(96 + slack);
        continue;
      }
      const mult = t.from === 'rain' && t.fromClass ? RAIN_CLASS_DWELL_MULT[t.fromClass] : 1;
      expect(t.dwellH).toBeLessThanOrEqual(3 * d.mean * mult + slack);
      expect(t.dwellH).toBeGreaterThanOrEqual(d.min * mult - slack);
      checked++;
    }
    expect(checked).toBeGreaterThan(5000);

    function seasonOfStart(t: Transition): Season {
      // the dwell table of the season the state STARTED in; a state that crosses a season boundary keeps its draw
      const startTick = t.tick - Math.round(t.dwellH * 250);
      const cal = sim.state.env.calendar.startTick + startTick;
      const dayOfYear = Math.floor((cal % YEAR_TICKS) / TICKS_PER_DAY);
      return SEASONS[Math.floor(dayOfYear / 7)];
    }
  }, 60000);
});

describe('determinism', () => {
  it('identical seeds give identical sequences; different seeds differ', () => {
    const seq = (seed: number) => runWeather(envSim({ seed }), 10 * YEAR_TICKS).map((t) => `${t.tick}:${t.to}:${t.cls}`).join(',');
    const a = seq(5), b = seq(5), c = seq(6);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a.length).toBeGreaterThan(500);
  });

  it('the whole weather record is the same after the same steps', () => {
    const a = envSim({ seed: 3 }), b = envSim({ seed: 3 });
    runWeather(a, 5 * YEAR_TICKS);
    runWeather(b, 5 * YEAR_TICKS);
    expect(JSON.stringify(a.state.env.weather)).toBe(JSON.stringify(b.state.env.weather));
    expect(a.state.rngStreams['rng.weather']).toEqual(b.state.rngStreams['rng.weather']);
  });

  it('uses only the weather stream: other streams are untouched', () => {
    const sim = envSim({ seed: 3 });
    const before = JSON.stringify(sim.state.rng);
    runWeather(sim, YEAR_TICKS);
    expect(JSON.stringify(sim.state.rng)).toBe(before);
    expect(Object.keys(sim.state.rngStreams)).toEqual(['rng.weather']);
  });
});

describe('forecast', () => {
  it('the announced next state is the state that follows, at the announced time', () => {
    const { tr } = long200();
    let n = 0;
    for (const t of tr) {
      if (!t.forecast) continue;
      n++;
      expect(t.to, `at ${t.tick}`).toBe(t.forecast.state);
      expect(t.tick - t.forecast.startTick).toBeGreaterThanOrEqual(0);
      expect(t.tick - t.forecast.startTick).toBeLessThanOrEqual(25);
    }
    expect(n).toBeGreaterThan(500);
  });
});

describe('guards seen in a long run', () => {
  it('no frost starts between 05:00 and 17:00; heat only in warm weather and only from clear skies', () => {
    const { tr } = long200();
    const clim = CLIMATES['temperate-maritime'];
    let frost = 0, heat = 0;
    for (const t of tr) {
      if (t.to === 'frost') {
        frost++;
        expect(t.hour < 5.1 || t.hour >= 16.9, `frost at ${t.hour}`).toBe(true);
        expect(seasonalMean(clim, t.yearFrac)).toBeLessThanOrEqual(clim.frostSeasonalMaxC + 0.3);
        expect(['clear', 'overcast', 'rain']).toContain(t.from);
      }
      if (t.to === 'heat') {
        heat++;
        expect(t.from).toBe('clear');
        expect(seasonalMean(clim, t.yearFrac)).toBeGreaterThanOrEqual(clim.heatSeasonalMinC - 0.3);
      }
    }
    expect(frost).toBeGreaterThan(100);
    expect(heat).toBeGreaterThan(100);
  }, 60000);

  it('a heat wave is cut 12 h after its season changes', () => {
    const { tr } = long200();
    let late = 0;
    for (const t of tr) {
      if (t.from !== 'heat') continue;
      if (t.season !== 'summer' && t.season !== 'spring') {
        late++;
        expect(t.sinceSeasonTick).toBeLessThanOrEqual(12 * 250 + 25);
      }
    }
    expect(late).toBeGreaterThan(0);
  }, 60000);
});

describe('season length scales every window by year fraction', () => {
  it.each([5, 10] as const)('length %d: heat and frost happen only in the same part of the year, heat share of summer stays sane', (len) => {
    const sim = envSim({ seed: 30, seasonLengthDays: len });
    const tr = runWeather(sim, 40 * 4 * len * TICKS_PER_DAY);
    const clim = CLIMATES['temperate-maritime'];
    let heat = 0, frost = 0, heatH = 0;
    for (const t of tr) {
      if (t.to === 'heat') { heat++; expect(seasonalMean(clim, t.yearFrac)).toBeGreaterThanOrEqual(clim.heatSeasonalMinC - 0.3); }
      if (t.to === 'frost') { frost++; expect(seasonalMean(clim, t.yearFrac)).toBeLessThanOrEqual(clim.frostSeasonalMaxC + 0.3); }
      if (t.from === 'heat' && t.season === 'summer') heatH += t.dwellH;
    }
    expect(heat).toBeGreaterThan(20);
    expect(frost).toBeGreaterThan(15);
    expect(heatH / (40 * len * 24)).toBeGreaterThan(0.1);
    expect(heatH / (40 * len * 24)).toBeLessThan(0.5);
  }, 60000);
});

describe('E7 statistics (maritime, Naturalist, 2000 GD on 5 seeds)', () => {
  it('summer heat, summer storms, spring rain events, winter frost, no late heat, no daytime frost', () => {
    const years = 2000 / 28;
    const heatFrac: number[] = [], frostFrac: number[] = [];
    for (const seed of [1, 2, 3, 4, 5]) {
      const sim = envSim({ seed });
      const tr = runWeather(sim, 2000 * TICKS_PER_DAY);
      let heat = 0, frost = 0, storm = 0, rain = 0;
      for (const t of tr) {
        if (t.from === 'heat' && t.season === 'summer') heat += t.dwellH;
        if (t.from === 'frost' && t.season === 'winter') frost += t.dwellH;
        if (t.to === 'storm' && t.season === 'summer') storm++;
        if (t.to === 'rain' && t.season === 'spring') rain++;
        if (t.to === 'frost') expect(t.hour < 5.1 || t.hour >= 16.9).toBe(true);
        if (t.from === 'heat' && t.season !== 'summer' && t.season !== 'spring') expect(t.sinceSeasonTick).toBeLessThanOrEqual(12 * 250 + 25);
      }
      heatFrac.push(heat / (years * 7 * 24));
      frostFrac.push(frost / (years * 7 * 24));
      expect(storm / years, `seed ${seed} summer storms`).toBeGreaterThan(0.5);
      expect(storm / years, `seed ${seed} summer storms`).toBeLessThan(2.0);
      expect(rain / years, `seed ${seed} spring rain events`).toBeGreaterThan(3);
      expect(rain / years, `seed ${seed} spring rain events`).toBeLessThan(7);
    }
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean(heatFrac)).toBeGreaterThan(0.15);
    expect(mean(heatFrac)).toBeLessThan(0.35);
    expect(mean(frostFrac)).toBeGreaterThan(0.15);
    expect(mean(frostFrac)).toBeLessThan(0.27);
    for (const f of [...heatFrac, ...frostFrac]) {
      expect(f).toBeGreaterThan(0.12);
      expect(f).toBeLessThan(0.4);
    }
  }, 120000);
});

describe('severity and difficulty', () => {
  it('severity none: only clear and overcast, ever', () => {
    const sim = envSim({ seed: 4, severity: 'none' });
    const tr = runWeather(sim, 30 * YEAR_TICKS);
    expect(tr.length).toBeGreaterThan(300);
    for (const t of tr) expect(['clear', 'overcast']).toContain(t.to);
  });

  it('severe weather brings more storms and heat than mild; harsh more than gentle', () => {
    const count = (o: Parameters<typeof envSim>[0], what: WeatherState) =>
      runWeather(envSim(o), 25 * YEAR_TICKS).filter((t) => t.to === what).length;
    expect(count({ seed: 2, severity: 'severe' }, 'storm')).toBeGreaterThan(count({ seed: 2, severity: 'mild' }, 'storm'));
    expect(count({ seed: 2, severity: 'severe' }, 'heat')).toBeGreaterThan(count({ seed: 2, severity: 'mild' }, 'heat'));
    expect(count({ seed: 2, difficulty: 'harsh' }, 'storm')).toBeGreaterThan(count({ seed: 2, difficulty: 'gentle' }, 'storm'));
  }, 60000);

  it('other climates: mediterranean winters are almost frost free, subtropical heat starts only when warm enough', () => {
    const med = envSim({ seed: 3 });
    med.state.env.climateId = 'mediterranean';
    const tm = runWeather(med, 20 * YEAR_TICKS);
    const frostShare = tm.filter((t) => t.to === 'frost').length / Math.max(1, runWeather(envSim({ seed: 3 }), 20 * YEAR_TICKS).filter((t) => t.to === 'frost').length);
    expect(frostShare).toBeLessThan(0.5);
    const sub = envSim({ seed: 3 });
    sub.state.env.climateId = 'subtropical';
    for (const t of runWeather(sub, 20 * YEAR_TICKS)) {
      if (t.to === 'heat') expect(seasonalMean(CLIMATES.subtropical, t.yearFrac)).toBeGreaterThanOrEqual(CLIMATES.subtropical.heatSeasonalMinC - 0.3);
    }
  }, 60000);
});
