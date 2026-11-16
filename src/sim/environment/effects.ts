// What weather does (task weather-effects), as ONE environment-phase system that runs every tick and dispatches its
// parts by tick (so the environment index registers a single entry):
//   every 5 ticks          rain hits and wind on exposed ants (effectsRain.ts)
//   every 10 / 50 ticks    washing of exposed pheromone cells in rain / wind only (effectsRain.ts)
//   every tick             one row band of soil moisture and puddles (each cell every ENV_MOISTURE_EVERY: 50 bands
//                          of 5 rows on a standard map, about 0.7 ms each; weather-fix2: 10 bands every 5 ticks cost
//                          3.5 ms in one tick), water bodies and surface wetness with band 0 (moisture.ts)
//   WX_DIAG_EVERY          heat exposure diagnostic (effectsHeat.ts)
// Nest flooding, mound erosion and collapse are nest-phase systems in src/sim/nest/flood and src/sim/nest/collapse.
// The cheat handlers the environment index routes to this module are at the end.

import type { CommandHandlerMap, Sim, System } from '@/sim/types';
import { ENV_MOISTURE_EVERY, ENV_MOISTURE_OFFSET } from '@/sim/balance';
import { WX_DIAG_EVERY, WX_RAIN_HIT_EVERY, WX_WASH_EVERY } from '@/sim/balance/weather';
import { floodCheats } from '@/sim/nest/flood/cheats';
import { TICKS_PER_SECOND } from '@/sim/time';
import { publishHeatDiagnostic } from './effectsHeat';
import { rainClassNow, rainHitStep, washStep } from './effectsRain';
import { moistureInputs, setSoilMoistureRegion, stepMoisture } from './moisture';

/** Dry-weather washing (wind decay only) runs this many times less often, with the matching longer step. */
const WIND_WASH_MULT = 5;
/** Row bands of the moisture grid: one per tick, each cell once per ENV_MOISTURE_EVERY ticks. */
const MOISTURE_SLICES = ENV_MOISTURE_EVERY;
/** Offset of the heat diagnostic inside its period (keeps it off the diagnostics system's tick). */
const DIAG_OFFSET = 115;

const due = (t: number, every: number, offset = 0): boolean => (t + offset) % every === 0;

/** One run of the effects system (every tick). */
export function runEffects(sim: Sim): void {
  const t = sim.state.tick;
  if (due(t, WX_RAIN_HIT_EVERY)) {
    rainHitStep(sim);
    const raining = rainClassNow(sim) !== null;
    if (due(t, WX_WASH_EVERY) && (raining || due(t, WX_WASH_EVERY * WIND_WASH_MULT))) {
      washStep(sim, ((raining ? 1 : WIND_WASH_MULT) * WX_WASH_EVERY) / TICKS_PER_SECOND);
    }
    if (due(t, WX_DIAG_EVERY, DIAG_OFFSET)) publishHeatDiagnostic(sim);
  }
  // the moisture grid in MOISTURE_SLICES row bands, one per tick: each cell once per ENV_MOISTURE_EVERY ticks
  const slice = (t + ENV_MOISTURE_OFFSET) % MOISTURE_SLICES;
  const r = stepMoisture(sim, ENV_MOISTURE_EVERY, moistureInputs(sim, ENV_MOISTURE_EVERY), slice, MOISTURE_SLICES);
  if (r.cellsAdded > 0 || r.cellsRemoved > 0) sim.emit({ type: 'weather.puddle', cellsAdded: r.cellsAdded, cellsRemoved: r.cellsRemoved });
}

/** Soil moisture, puddles, washing, rain hits, wind, heat diagnostic (replaces the env-core stub). */
export const environmentEffectsSystem: System = {
  name: 'environment-effects', phase: 'environment', every: 1, run: runEffects,
};

/** Cheat handlers owned by this module (GDD 03 App. B, GDD 04 `cheat.setWater`). */
export const weatherEffectsHandlers: Partial<CommandHandlerMap> = {
  'cheat.setSoilMoisture': (sim, c) => {
    if (setSoilMoistureRegion(sim, c.center.x, c.center.z, c.radius, c.m) === 0) {
      setSoilMoistureRegion(sim, c.center.x, c.center.z, sim.state.env.moisture.cell, c.m);
    }
  },
  'cheat.setRain': (sim, c) => {
    floodCheats(sim.state).rainI = Number.isFinite(c.intensity) && c.intensity >= 0 ? c.intensity : -1;
  },
  'cheat.setDrainScale': (sim, c) => {
    floodCheats(sim.state).drainScale = Number.isFinite(c.k) && c.k >= 0 ? c.k : 1;
  },
  'cheat.setWater': (sim, c) => {
    const levels = sim.state.worldDelta.waterLevels;
    const i = sim.world.waterBodies.findIndex((b) => b.id === c.bodyId);
    if (i < 0 || !levels || i >= levels.length) {
      sim.emit({ type: 'command-rejected', commandType: c.type, reason: 'unknown-body' });
      return;
    }
    levels[i] = Math.min(sim.world.waterBodies[i].capMm, Math.max(0, c.levelMm));
  },
};
