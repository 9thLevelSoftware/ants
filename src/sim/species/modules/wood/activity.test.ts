// Night shift (GDD 07 §5.2.7, App. E 8): the carpenter's surface activity follows its light preference (night 1.0,
// midday 0.2) through the colony's own activity gate, so at the same air temperature the 22:00 activity is at least
// 3 x the 12:00 activity; the reference species shows no such night bias.

import { describe, expect, it } from 'vitest';
import { envSim } from '@/sim/environment/envTestKit';
import { timeHandlers } from '@/sim/environment/timeCommands';
import { airTemp } from '@/sim/environment/temperature';
import { surfaceActivityOf } from '@/sim/colony/envAdapter';
import { calendarTickAt } from '@/sim/time';
import type { Sim } from '@/sim/types';
import { CP } from './testkit';

/** Clock to summer day 2 at `hour`, clear sky, the air held at `tempC` through the weather offset. */
function at(sim: Sim, hour: number, tempC: number): number {
  timeHandlers['cheat.setTime']!(sim, { type: 'cheat.setTime', tick: calendarTickAt('summer', 2, hour, sim.state.config) });
  timeHandlers['cheat.setWeather']!(sim, { type: 'cheat.setWeather', state: 'clear', intensityClass: null });
  sim.state.env.weather.wOff = 0;
  sim.state.env.weather.wOff = tempC - airTemp(sim);
  return surfaceActivityOf(sim, sim.state.colonies[0].species);
}

describe('night shift (GDD 07 §5.2.7, App. E 8 activity gate)', () => {
  it('at 20 °C the carpenter is at least 3 x as active outside at 22:00 as at 12:00', () => {
    const sim = envSim({ species: CP });
    const noon = at(sim, 12, 20);
    expect(airTemp(sim)).toBeCloseTo(20, 6);
    const night = at(sim, 22, 20);
    expect(airTemp(sim)).toBeCloseTo(20, 6);
    expect(night).toBeGreaterThan(0);
    expect(night).toBeGreaterThanOrEqual(3 * noon);
  });

  it('the forage temperature gate still closes the night shift in the cold (5 °C)', () => {
    const sim = envSim({ species: CP });
    expect(at(sim, 22, 5)).toBe(0);
  });

  it('the reference species is not nocturnal: its noon activity is not below its night activity', () => {
    const sim = envSim({ species: 'lasius-niger' });
    const noon = at(sim, 12, 20);
    const night = at(sim, 22, 20);
    expect(noon).toBeGreaterThanOrEqual(night);
  });
});
