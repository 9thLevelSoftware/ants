// Cost of the weather effects per tick (task weather-effects, integrator addendum "fit the environment's share of the
// tick"). The quick part times the test world (asserted with load-tolerant limits, reported under heavy load); the
// FOUNDRESS_LONG part times a generated standard world and prints the numbers:
//   FOUNDRESS_LONG=1 npx vitest run src/sim/environment/effects.perf.test.ts
// FOUNDRESS_PERF_STRICT=1 always asserts.

import { describe, expect, it } from 'vitest';
import type { Sim } from '@/sim/types';
import { ENV_MOISTURE_EVERY, STORM_RAIN_MMH } from '@/sim/balance';
import { createNewGame, defaultGameConfig } from '@/sim/createGame';
import { spawnAnt } from '@/sim/entities';
import { floodCheats, runFlood } from '@/sim/nest/flood';
import { createSim } from '@/sim/sim';
import { makeTestSim } from '@/sim/testing';
import { heavyLoad, PERF_STRICT } from '@/sim/testing/perfLoad';
import { generateWorld } from '@/worldgen';
import { rainHitStep, washStep } from './effectsRain';
import { moistureInputs, stepMoisture } from './moisture';
import { forceWeather } from './weather';

const env = (globalThis as unknown as { process?: { env: Record<string, string | undefined>; stderr: { write(s: string): void } } }).process;
const LONG = !!env?.env.FOUNDRESS_LONG;
const log = (...a: unknown[]) => env?.stderr.write(`[weather.perf] ${a.join(' ')}\n`);
const now = (): number => (globalThis as unknown as { performance: { now(): number } }).performance.now();

/** Minimum over `reps` runs of fn, ms. */
function minMs(reps: number, fn: () => void): number {
  let best = Infinity;
  for (let r = 0; r < reps; r++) { const t = now(); fn(); best = Math.min(best, now() - t); }
  return best;
}

function storm(sim: Sim): void {
  forceWeather(sim, 'storm', null, 'test');
  sim.state.env.weather.rainRateMmH = STORM_RAIN_MMH;
}

/** Per-tick share of the environment effects: moisture / 50 + wash / 10 + hits / 5, ms; `band` = one row band (a run). */
function effectsPerTick(sim: Sim, reps: number): { moisture: number; band: number; wash: number; hits: number; perTick: number } {
  const inp = moistureInputs(sim, ENV_MOISTURE_EVERY);
  const moisture = minMs(reps, () => stepMoisture(sim, ENV_MOISTURE_EVERY, inp));
  const band = minMs(reps, () => stepMoisture(sim, ENV_MOISTURE_EVERY, inp, 3, 10));
  const wash = minMs(reps, () => washStep(sim, 1));
  const hits = minMs(reps, () => rainHitStep(sim));
  return { moisture, band, wash, hits, perTick: moisture / ENV_MOISTURE_EVERY + wash / 10 + hits / 5 };
}

describe('weather effects cost', () => {
  it('test world: effects and flooding per tick within a load-tolerant budget', () => {
    const sim = makeTestSim({ nest: 'small', workers: 100, systems: [] });
    storm(sim);
    const bu = sim.world.bu, c = sim.world.size / 2;
    for (let n = 0; n < 200; n++) sim.phero.deposit(0, 'trail', { x: c - 40 * bu + (n % 20) * 4 * bu, y: 0.3 * bu, z: c - 40 * bu + Math.floor(n / 20) * 4 * bu }, 3);
    const e = effectsPerTick(sim, 5);
    floodCheats(sim.state).rainI = 1;
    for (let i = 0; i < 30; i++) runFlood(sim); // a wet nest with a built spill cache
    const flood = minMs(5, () => runFlood(sim)) / 10;
    log(`test world: moisture ${e.moisture.toFixed(3)} ms/step, wash ${e.wash.toFixed(3)} ms, hits ${e.hits.toFixed(3)} ms, effects ${e.perTick.toFixed(4)} ms/tick, flood ${flood.toFixed(4)} ms/tick`);
    if (heavyLoad() && !PERF_STRICT) return;
    expect(e.perTick).toBeLessThan(PERF_STRICT ? 0.2 : 1);
    expect(flood).toBeLessThan(PERF_STRICT ? 0.2 : 1);
  });

  it.skipIf(!LONG)('generated standard world: moisture, washing, 2500 ants in a storm (numbers to stderr)', () => {
    const cfg = { ...defaultGameConfig('lasius-niger', 1), cheats: true };
    const world = generateWorld(cfg.world);
    const sim = createSim(createNewGame(cfg, world).state, world, { systems: [] });
    storm(sim);
    const bu = sim.world.bu, q = sim.world.queenStart.pos;
    for (let i = 0; i < 2500; i++) {
      spawnAnt(sim, { colony: sim.state.colonies[0].id, caste: 'worker', pos: { x: q.x + ((i % 50) - 25) * 3 * bu, y: q.y + 0.3 * bu, z: q.z + (Math.floor(i / 50) - 25) * 3 * bu }, fwd: { x: 1, y: 0, z: 0 }, ageGd: 5 });
    }
    for (let n = 0; n < 2000; n++) sim.phero.deposit(0, 'trail', { x: q.x + ((n % 50) - 25) * 4 * bu, y: q.y + 0.3 * bu, z: q.z + (Math.floor(n / 50) - 20) * 4 * bu }, 3);
    const m = sim.state.env.moisture;
    const e = effectsPerTick(sim, 5);
    // puddles after three storm hours
    for (let s = 0; s < 15; s++) stepMoisture(sim, ENV_MOISTURE_EVERY);
    let puddles = 0;
    for (let i = 0; i < m.puddle.length; i++) if (m.puddle[i] >= 20) puddles++;
    log(`standard world ${m.nx}x${m.nz} cells: moisture ${e.moisture.toFixed(2)} ms/step (one band per 5 ticks ${e.band.toFixed(2)} ms), wash ${e.wash.toFixed(2)} ms, hits ${e.hits.toFixed(2)} ms (2500 ants), effects ${e.perTick.toFixed(3)} ms/tick; puddle cells >= 1 mm after 3 h of storm: ${puddles}`);
    expect(puddles).toBeGreaterThan(0);
  }, 300000);
});
