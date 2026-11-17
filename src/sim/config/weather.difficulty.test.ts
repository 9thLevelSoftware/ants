// Weather severity by preset and by the custom rule, over many game years of weather alone (no colony; the weather
// state machine of the environment module stepped directly): the expected ordering of rain, storm, heat wave and frost
// events (difficulty-rules AC3, weather part). Default run: 3 seeds x 6 years per setting.

import { describe, expect, it } from 'vitest';
import type { DifficultyId, WeatherSeverity, WeatherState } from '@/sim/types';
import { ticksPerYear } from '@/sim/time';
import { envSim, runWeather } from '@/sim/environment/envTestKit';

const SEEDS = [1, 2, 3];
const YEARS = 6;
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

  it('rain, storms, heat waves and frost are rarer on gentle and more frequent on harsh', () => {
    for (const k of KINDS) {
      expect(g[k], `${k}: gentle < naturalist`).toBeLessThan(n[k]);
      expect(n[k], `${k}: naturalist < harsh`).toBeLessThan(h[k]);
    }
    expect(n.rain).toBeGreaterThan(0);
  });

  it('weather severity scales the same events: none removes them, mild < normal < severe', () => {
    const none = perYear('naturalist', 'none'), mild = perYear('naturalist', 'mild'), severe = perYear('naturalist', 'severe');
    for (const k of KINDS) {
      expect(none[k], `${k} with no weather`).toBe(0);
      expect(mild[k], `${k}: mild < normal`).toBeLessThan(n[k]);
      expect(n[k], `${k}: normal < severe`).toBeLessThan(severe[k]);
    }
  });
});
