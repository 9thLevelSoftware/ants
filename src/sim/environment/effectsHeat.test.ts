// Task acceptance 4: ants crossing sun-heated asphalt at midday in summer accumulate heat load at the chapter's rate
// (GDD 06 §2.7: dHeat/dt = (Tb - stressC) / 6000 per s once Tb has followed Tmicro); shaded asphalt does not harm
// them; the heat diagnostic warns.

import { describe, expect, it } from 'vitest';
import type { Sim } from '@/sim/types';
import { spawnAnt } from '@/sim/entities';
import { getDiagnostic } from '@/sim/progression/diagnostics';
import { stepAntThermal, stressCOf } from './antThermal';
import { publishHeatDiagnostic } from './effectsHeat';
import { envSim, setClockD, settleWeather } from './envTestKit';
import { microTemp } from './microTemp';
import { thermalDefOf } from './thermalResponse';

const HEAT_DOSE_K = 6000;

/** Lasius on an asphalt world at summer noon (default-year day 10.5), clear sky; full shade when asked. */
function noonOnAsphalt(shaded: boolean): Sim {
  const sim = envSim({ surface: 'asphalt', zone: 'asphalt', shade: shaded ? 255 : 0 });
  setClockD(sim, 10.5);
  settleWeather(sim, 'clear');
  return sim;
}

function worker(sim: Sim, dx = 0) {
  const bu = sim.world.bu, c = sim.world.size / 2;
  const ant = spawnAnt(sim, { colony: sim.state.colonies[0].id, caste: 'worker', pos: { x: c + dx * bu, y: 0.3 * bu, z: c }, fwd: { x: 1, y: 0, z: 0 }, ageGd: 5 });
  ant.tb = 25;
  return ant;
}

describe('acceptance 4: heat on sun-heated asphalt', () => {
  it('sunlit asphalt at summer noon: heat load grows at (Tmicro - stressC) / 6000 per s once Tb has caught up', () => {
    const sim = noonOnAsphalt(false);
    const ant = worker(sim);
    const def = thermalDefOf(sim, sim.state.colonies[0].species);
    const tmicro = microTemp(sim, ant.pos, 'surface');
    const stress = stressCOf(sim, def);
    expect(tmicro).toBeGreaterThan(stress); // about 0.6 x 44.9 + 0.4 x 25.3 = 37 C
    for (let s = 0; s < 120; s++) stepAntThermal(sim, ant, def, 0.5); // 60 s: Tb settles (tau 6 s)
    expect(Math.abs(ant.tb - tmicro)).toBeLessThan(0.01);
    const h0 = ant.heatLoad;
    for (let s = 0; s < 120; s++) stepAntThermal(sim, ant, def, 0.5); // 60 s more
    const rate = (ant.heatLoad - h0) / 60;
    expect(rate / ((tmicro - stress) / HEAT_DOSE_K)).toBeCloseTo(1, 2);
    expect(ant.alive).toBe(true);
  });

  it('shaded asphalt at the same hour does not harm them', () => {
    const sim = noonOnAsphalt(true);
    const ant = worker(sim);
    const def = thermalDefOf(sim, sim.state.colonies[0].species);
    expect(microTemp(sim, ant.pos, 'surface')).toBeLessThan(stressCOf(sim, def));
    for (let s = 0; s < 400; s++) stepAntThermal(sim, ant, def, 0.5);
    expect(ant.heatLoad).toBe(0);
  });

  it('the heat exposure diagnostic warns while foragers run hot on the asphalt', () => {
    const sim = noonOnAsphalt(false);
    const ants = Array.from({ length: 8 }, (_, i) => worker(sim, i * 2));
    const def = thermalDefOf(sim, sim.state.colonies[0].species);
    for (let s = 0; s < 60; s++) for (const a of ants) stepAntThermal(sim, a, def, 0.5);
    const h = publishHeatDiagnostic(sim);
    expect(h.hottestSurface).toBe('asphalt');
    expect(getDiagnostic(sim, 'diag-heat-exposure')?.status).toBe('warn');
  });
});
