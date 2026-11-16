// Runtime hooks between modules that need a finished Sim (the services are built before the Sim exists, so the
// hooks are installed by createSim right after it). Every hook is a derived runtime cache: nothing here touches
// persisted state, and a Sim built after a load installs the same hooks.
//
//  - pheromones: the environment's decay modifier (temperature, exposure, heat; species trail half-life) and the
//    world field's free-space test for alarm diffusion (GDD 02 §8.2).
//  - locomotion: the nest module's clutter speed factor for walkers in cavities (GDD 03 §10, loose pellets).
//  - nest: its runtime (carve listener) exists from the start, so no carve of a tick is missed by the persisted
//    chamber-detection flag (Nest.detectDue), whichever module carves first after a load.

import type { ColonySpeciesId, PheroChannel, SignalsDef, Sim } from '@/sim/types';
import { PHERO_POROUS_MATERIALS, PHERO_SUNLIT_SHADE_MAX } from '@/sim/balance';
import { microTemp, surfaceTemp } from '@/sim/environment';
import { isInteriorAt, shadeAt } from '@/sim/environment/ground';
import { registerSpeedFactor } from '@/sim/locomotion';
import { clutterSpeedMult } from '@/sim/nest';
import { nestRuntime } from '@/sim/nest/runtime';
import { pheroDecayRateMult, type PheroCellClimate, type PheroExposure } from '@/sim/pheromones';
import { getSpecies } from '@/sim/species';

export function installRuntimeHooks(sim: Sim): void {
  installPheromoneHooks(sim);
  registerSpeedFactor(sim, (s, w) => (w.medium === 'cavity' ? clutterSpeedMult(s, w.pos) : 1));
  nestRuntime(sim);
}

const POROUS: ReadonlySet<string> = new Set(PHERO_POROUS_MATERIALS);

/** Signal data (trail half-life) of a colony's species; undefined for rival species without a SpeciesDef. */
function signalsOf(sim: Sim, colonyId: number): SignalsDef | undefined {
  const col = colonyId >= 0 ? sim.stores.colonies.get(colonyId) : undefined;
  return getSpecies((col?.species ?? sim.species.id) as ColonySpeciesId)?.signals;
}

function installPheromoneHooks(sim: Sim): void {
  const field = sim.field, world = sim.world;
  const p = { x: 0, y: 0, z: 0 };
  const climate: PheroCellClimate = { tempC: 0 };
  const cellMm = sim.state.phero.cell;
  const exposureAt = (underground: boolean): PheroExposure => {
    if (underground || isInteriorAt(world, p.x, p.z)) return 'sheltered';
    // the material under the cell centre: half a cell down, or the ground when that point is in free space
    const top = p.y;
    p.y = top - cellMm * 0.5;
    if (field.sample(p) > 0) p.y = field.height(p.x, p.z) - cellMm * 0.0625;
    const porous = POROUS.has(field.materialAt(p));
    p.y = top;
    return porous && shadeAt(world, p.x, p.z) <= PHERO_SUNLIT_SHADE_MAX ? 'sunlit-porous' : 'normal';
  };
  sim.phero.setHooks?.({
    decayModifier: (channel: PheroChannel, x: number, y: number, z: number, colony?: number) => {
      p.x = x; p.y = y; p.z = z;
      // a 4 BU cell centre more than half a cell below the ground (terrain + piles) belongs to the nest's cavities
      // and walls; one straddling the surface is a surface cell (trail cells of surface walkers can sit just below)
      const underground = field.height(x, z) - y > cellMm * 0.5;
      const tmicro = microTemp(sim, p);
      // "T = surface temperature of the cell": the ground surface outside, the cavity wall (column) underground
      climate.tempC = underground ? tmicro : surfaceTemp(sim, x, z);
      climate.tmicroC = tmicro;
      climate.exposure = channel === 'trail' ? exposureAt(underground) : 'normal';
      const sig = channel === 'trail' && colony !== undefined ? signalsOf(sim, colony) : undefined;
      climate.trailHalfLifeS = sig?.trailHalfLifeS;
      climate.trailRefC = sig?.trailRefC;
      return pheroDecayRateMult(channel, climate);
    },
    isFree: (x: number, y: number, z: number) => field.sampleXYZ(x, y, z) > 0,
  });
}
