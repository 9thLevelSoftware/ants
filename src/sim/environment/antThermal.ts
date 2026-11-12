// Ant body temperature, heat and cold dose, stupor and coma (GDD 06 §2.6-2.7). Each ant is stepped once every
// ANT_THERMAL_EVERY ticks (staggered by id) with the matching time step; the model is exact for any step length.
// Lethal doses kill through the shared `killAnt`; stupor and coma start/stop emit the env.* events.

import type { Ant, Sim, System, ThermalDef } from '@/sim/types';
import { ANT_THERMAL_EVERY } from '@/sim/balance';
import { killAnt } from '@/sim/entities';
import { TICKS_PER_SECOND } from '@/sim/time';
import { microTemp } from './microTemp';
import { applyThermalDose, relaxBodyTemp, thermalDefOf } from './thermalResponse';

/** Heat stress threshold of an ant, C: species `stressC` + difficulty offset + colony acclimation (GDD 06 §2.7). */
export function stressCOf(sim: Sim, def: ThermalDef): number {
  return def.stressC + sim.state.config.difficulty.params.heatToleranceOffsetC + sim.state.env.thermal.heatAccl;
}

/** Steps one ant's body temperature and loads by `dtS` seconds; returns false if the ant died of it. */
export function stepAntThermal(sim: Sim, ant: Ant, def: ThermalDef, dtS: number): boolean {
  const target = microTemp(sim, ant.pos, ant.medium);
  ant.tb = relaxBodyTemp(ant.tb, target, dtS);
  const before = ant.thermalState;
  const outcome = applyThermalDose(ant, def, stressCOf(sim, def), dtS);
  if (outcome !== 'ok') {
    killAnt(sim, ant.id, outcome === 'heat-death' ? 'heat' : 'cold');
    return false;
  }
  if (ant.thermalState !== before) {
    if (ant.thermalState === 'heat-stupor') sim.emit({ type: 'env.heat-stupor', antId: ant.id });
    else if (ant.thermalState === 'cold-coma') sim.emit({ type: 'env.cold-coma', antId: ant.id });
  }
  return true;
}

/** Every ANT_THERMAL_EVERY ticks per ant: relax Tb toward the micro temperature and apply the dose. */
export const antThermalSystem: System = {
  name: 'ant-thermal',
  phase: 'environment',
  run(sim) {
    const tick = sim.state.tick;
    const dtS = ANT_THERMAL_EVERY / TICKS_PER_SECOND;
    let colonyId = -2;
    let def: ThermalDef = sim.species.thermal;
    for (const ant of sim.stores.ants.list) {
      if (!ant.alive || (ant.id + tick) % ANT_THERMAL_EVERY !== 0) continue;
      if (ant.colony !== colonyId) {
        colonyId = ant.colony;
        const col = sim.stores.colonies.get(colonyId);
        def = col ? thermalDefOf(sim, col.species) : sim.species.thermal;
      }
      stepAntThermal(sim, ant, def, dtS);
    }
  },
};
