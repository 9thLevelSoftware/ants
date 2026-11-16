// Task acceptance 3 (headless scenario): a thunderstorm over a 100-worker colony washes the outdoor trails, floods
// the lowest chamber of a badly sited nest (a hollow with a large catchment, unraised entrance) but not that of a
// well sited one (the same nest on a low knoll), and reports the flood through diagnostics and the alert list.

import { describe, expect, it } from 'vitest';
import type { Sim } from '@/sim/types';
import { STORM_RAIN_MMH } from '@/sim/balance';
import { environmentEffectsSystem } from '@/sim/environment/effects';
import { forceWeather } from '@/sim/environment/weather';
import { pheromoneSystem } from '@/sim/pheromones';
import { getDiagnostic } from '@/sim/progression';
import { makeTestSim, makeTestWorld } from '@/sim/testing';
import { commandsSystem } from '@/sim/systems';
import { playerNest } from '../nestTestKit';
import { floodSystem } from './index';
import { addRim } from './floodTestKit';

/** The small test nest with 100 workers; `site` shapes the ground around its entrance before the nest is carved. */
function colony(site: 'hollow' | 'knoll' | 'flat'): Sim {
  const world = makeTestWorld({});
  const bu = world.bu, ex = world.queenStart.pos.x + 14 * bu, ez = world.queenStart.pos.z;
  const t = world.terrain;
  for (let iz = 0; iz < t.nz; iz++) for (let ix = 0; ix < t.nx; ix++) {
    const d = Math.hypot(ix * t.cell - ex, iz * t.cell - ez) / bu;
    // knoll: the entrance stands 2.4 BU above its 8 BU ring (c clamps to 0.25); hollow: flat ground in a basin
    // worldgen rates at flood risk 0.8 (c = 1 + 3 x (0.8 - 1/3) / (2/3) = 3.1)
    if (site === 'knoll') t.data[iz * t.nx + ix] = Math.max(0, 3 * bu * (1 - d / 10));
  }
  if (site === 'hollow') world.maps.floodRisk.data.fill(Math.round(0.8 * 255));
  const sim = makeTestSim({ world, nest: 'small', workers: 100, systems: [commandsSystem, environmentEffectsSystem, floodSystem, pheromoneSystem] });
  return sim;
}

function storm(sim: Sim, on: boolean): void {
  forceWeather(sim, on ? 'storm' : 'overcast', null, 'test');
  sim.state.env.weather.rainRateMmH = on ? STORM_RAIN_MMH : 0;
  sim.state.env.weather.wind2m = 2;
}

const run = (sim: Sim, n: number): void => { for (let i = 0; i < n; i++) sim.tick(); };

describe('acceptance 3: a storm over a 100-worker colony', () => {
  it('washes outdoor trails, floods the badly sited nest\'s lowest chamber only, and reports it', () => {
    const bad = colony('hollow'), good = colony('knoll');
    for (const sim of [bad, good]) {
      expect(sim.stores.ants.list.filter((a) => a.alive && a.caste === 'worker').length).toBe(100);
      const bu = sim.world.bu, c = sim.world.size / 2;
      for (let n = 0; n < 10; n++) sim.phero.deposit(0, 'trail', { x: c - 30 * bu + n * 4 * bu, y: 0.3 * bu, z: c - 20 * bu }, 5);
    }
    const trail = (sim: Sim): number => {
      let s = 0;
      sim.phero.forEachActiveCell!(0, 'trail', (_x, _y, _z, v) => { s += v; });
      return s;
    };
    const before = trail(bad);
    // a three-hour thunderstorm (75 game s), then 25 s of overcast
    for (const sim of [bad, good]) { storm(sim, true); run(sim, 750); storm(sim, false); run(sim, 250); }
    expect(trail(bad)).toBeLessThan(before * 0.01);

    const royalOf = (sim: Sim) => playerNest(sim).chambers[2];
    const nursery = (sim: Sim) => playerNest(sim).chambers[1];
    expect(royalOf(bad).flooded).toBeGreaterThan(0.25);
    expect(royalOf(good).flooded).toBeLessThan(0.25);
    expect(nursery(good).flooded).toBe(0);

    const id = (sim: Sim) => `diag-nest-flood:${playerNest(sim).id}`;
    expect(getDiagnostic(bad, id(bad))?.status).toBe('bad');
    expect(bad.state.progression.alerts.some((a) => a.kind === 'nest-flooding')).toBe(true);
    expect(getDiagnostic(good, id(good))?.status).not.toBe('bad');
    expect(good.state.progression.alerts.some((a) => a.kind === 'nest-flooding' && a.level === 'critical' && royalOf(good).flooded >= 0.25)).toBe(false);
  });

  it('ordinary rain (a 5 h shower) on a flood-safe site with the usual crater rim floods no chamber past 25 %', () => {
    const sim = colony('flat');
    const nest = playerNest(sim);
    addRim(sim, nest, nest.entrances[0], 1.5);
    forceWeather(sim, 'rain', 'shower', 'test');
    sim.state.env.weather.rainRateMmH = 5;
    run(sim, 1250);
    expect(Math.max(...nest.chambers.map((c) => c.flooded))).toBeLessThan(0.25);
    expect(getDiagnostic(sim, `diag-nest-flood:${nest.id}`)?.status).not.toBe('bad');
    expect(sim.state.progression.alerts.some((a) => a.kind === 'nest-flooding')).toBe(false);
  });
});

