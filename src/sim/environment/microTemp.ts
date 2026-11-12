// Temperature an entity feels where it stands (GDD 06 §2.5): underground cavity column (GDD 03 §9.1), surface micro temperature, plant and
// object surfaces above ground, heated interiors. Allocation-free.

import type { Vec3 } from '@/core/math/vec3';
import type { MaterialId, Sim, WalkerMedium } from '@/sim/types';
import { MATERIAL_IDS } from '@/sim/types';
import { ELEVATED_BU, MICRO_SURF_W, STEM_COUPLING, UNDERGROUND_MM } from '@/sim/balance';
import { columnTempAt } from './chamber';
import { isInteriorAt, shadeAt, surfaceSlotAt } from './ground';
import { slotTemp } from './surface';
import { airTemp, interiorTemp } from './temperature';

const PLANT_SLOT = MATERIAL_IDS.indexOf('plant');
const PLANT_LIKE: ReadonlySet<MaterialId> = new Set<MaterialId>(['plant', 'leaf', 'bark']);

/** Micro temperature of a surface-walking ant: `0.6 Tsurf + 0.4 Tair` (GDD 06 §2.5). */
export function surfaceMicroTemp(tsurf: number, tair: number): number {
  return MICRO_SURF_W * tsurf + (1 - MICRO_SURF_W) * tair;
}

/**
 * The temperature (C) an ant or creature at `pos` is heading for. Underground: the GDD 03 §9.1 cavity column at its
 * depth (the same model as `chamberTemp`, E-137; Tsoil is for open ground only);
 * in the air or in water: the air; on a plant or leaf above the ground: air plus 0.2 of the plant surface's offset;
 * on other objects and on the ground: `0.6 Tsurf + 0.4 Tair`; on heated interior floors: the interior temperature.
 */
export function microTemp(sim: Sim, pos: Vec3, medium: WalkerMedium = 'surface'): number {
  const w = sim.world;
  const tair = airTemp(sim);
  if (isInteriorAt(w, pos.x, pos.z)) return interiorTemp(sim);
  if (medium === 'air' || medium === 'water') return tair;
  const ground = sim.field.height(pos.x, pos.z);
  const depth = ground - pos.y;
  if (depth > UNDERGROUND_MM) return columnTempAt(sim, pos.x, pos.z, depth);
  const shade = shadeAt(w, pos.x, pos.z);
  if (-depth > ELEVATED_BU * w.bu) {
    const m = sim.field.materialAt(pos);
    if (PLANT_LIKE.has(m)) return tair + STEM_COUPLING * (slotTemp(sim, PLANT_SLOT, shade) - tair);
    return surfaceMicroTemp(slotTemp(sim, MATERIAL_IDS.indexOf(m), shade), tair);
  }
  return surfaceMicroTemp(slotTemp(sim, surfaceSlotAt(w, pos.x, pos.z), shade), tair);
}
