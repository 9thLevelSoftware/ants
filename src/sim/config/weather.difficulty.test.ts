// Weather severity by preset and by the custom rule, over many game years of weather alone (no colony; the weather
// state machine of the environment module stepped directly): the expected ordering of rain, storm, heat wave and frost
// events (difficulty-rules AC3, weather part). Default run: 5 seeds x 12 years per setting.

import { describe, expect, it } from 'vitest';
import type { DifficultyId, WeatherSeverity, WeatherState } from '@/sim/types';
import { ticksPerYear } from '@/sim/time';
import { envSim, runWeather } from '@/sim/environment/envTestKit';

const SEEDS = [1, 2, 3, 4, 5];
// default run about 10 s; FOUNDRESS_LONG=1 (200 years per setting) also holds rain, heat and frost to a strict ordering
const LONG = !!(globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.FOUNDRESS_LONG;
const YEARS = LONG ? 40 : 12;
const KINDS: readonly WeatherState[] = ['rain', 'storm', 'heat', 'frost'];

/** Events of each kind per game year (a transition into the state), summed over the seeds and years. */
function perYear(difficulty: DifficultyId, severity: WeatherSeverity): Record<string, number> {
  const out: Record<string, number> = { rain: 0, storm: 0, heat: 0, frost: 0 };
  for (const seed of SEEDS) {
    const sim = envSim({ difficulty, severity, seed });
    for (const t of runWeather(sim, YEARS * ticksPerYear(sim.state.config))) if (KINDS.includes(t.to)) out[t.to]++;
  }
  for (const k of KINDS) out[k] /= SEEDS.length * YEARS;
  return out;
}

describe('weather by difficulty (events per year)', () => {
  const g = perYear('gentle', 'normal'), n = perYear('naturalist', 'normal'), h = perYear('harsh', 'normal');

  it('storms and the total of weather events are rarer on gentle and more frequent on harsh', () => {
    for (const k of KINDS) {
      const strict = k === 'storm' || LONG; // rain, heat and frost events are rate-limited by their seasons: a short run cannot separate them
      if (strict) {
        expect(g[k], `${k}: gentle < naturalist`).toBeLessThan(n[k]);
        expect(n[k], `${k}: naturalist < harsh`).toBeLessThan(h[k]);
      } else {
        expect(g[k], `${k}: gentle <= naturalist`).toBeLessThanOrEqual(n[k] * 1.15);
        expect(h[k], `${k}: harsh >= naturalist`).toBeGreaterThanOrEqual(n[k] * 0.85);
      }
    }
    expect(KINDS.reduce((a, k) => a + g[k], 0)).toBeLessThan(KINDS.reduce((a, k) => a + n[k], 0));
    expect(KINDS.reduce((a, k) => a + n[k], 0)).toBeLessThan(KINDS.reduce((a, k) => a + h[k], 0));
    expect(n.rain).toBeGreaterThan(0);
  });

  it('weather severity scales the same events: none removes them, mild < normal < severe', () => {
    const none = perYear('naturalist', 'none'), mild = perYear('naturalist', 'mild'), severe = perYear('naturalist', 'severe');
    for (const k of KINDS) {
      expect(none[k], `${k} with no weather`).toBe(0);
      expect(mild[k], `${k}: mild < normal`).toBeLessThan(n[k]);
      // heat waves saturate (about one per summer whatever the weight), so severity is checked on the total there
      if (k !== 'heat') expect(n[k], `${k}: normal < severe`).toBeLessThan(severe[k]);
    }
    const total = (e: Record<string, number>): number => KINDS.reduce((a, k) => a + e[k], 0);
    expect(total(mild)).toBeLessThan(total(n));
    expect(total(n)).toBeLessThan(total(severe));
  });
});
