// Soil temperature by depth (GDD 06 §2.4): annual wave, diurnal wave and weather soak, damped and lagged with depth,
// modified by the ground cover. Depth is in mm (a larger species at equal BU depth has a steadier chamber).

import type { Vec3 } from '@/core/math/vec3';
import type { Sim } from '@/sim/types';
import {
  COVER_PARAMS, AIR_PEAK_HOUR, SOIL_DA_MM, SOIL_DD_MM, SOIL_DIURNAL_FACTOR, SOIL_DW_MM, SOIL_MEAN_OFFSET_C, type CoverClass,
} from '@/sim/balance';
import { calendarNow } from './calendar';
import { SEASONAL_PEAK_FRAC } from './climates';
import { coverSlotKind, surfaceSlotAt } from './ground';
import { dmTarget, climateOf } from './temperature';
import { ensureThermal } from './surface';

/** Soil temperature at a depth below an open-ground surface with the given cover, C. */
export function soilTempAtDepth(sim: Sim, depthMm: number, cover: CoverClass = 'bare'): number {
  ensureThermal(sim);
  const cal = calendarNow(sim);
  const w = sim.state.env.weather;
  const c = climateOf(sim);
  const cv = COVER_PARAMS[cover];
  const z = depthMm < 0 ? 0 : depthMm;
  const annual = c.aseas * Math.exp(-z / SOIL_DA_MM) * Math.cos(2 * Math.PI * (cal.yearFrac - SEASONAL_PEAK_FRAC) - z / SOIL_DA_MM);
  const dm = w.dmCur ?? dmTarget(w.state);
  const adSoil = SOIL_DIURNAL_FACTOR * c.ad[cal.season] * dm;
  const diurnal = adSoil * Math.exp(-z / SOIL_DD_MM) * Math.cos((2 * Math.PI * (cal.hour - AIR_PEAK_HOUR)) / 24 - z / SOIL_DD_MM) * cv.amp;
  const soak = sim.state.env.thermal.wsoil * Math.exp(-z / SOIL_DW_MM);
  return c.tann + SOIL_MEAN_OFFSET_C + annual + diurnal + soak + cv.mean;
}

/**
 * Soil temperature, C. With a point: at its depth below the terrain surface there. With a depth and x, z: that depth
 * under the ground at (x, z). The cover class (bare, grass, litter, paved) comes from the ground at (x, z).
 */
export function soilTemp(sim: Sim, p: Vec3): number;
export function soilTemp(sim: Sim, depthMm: number, x: number, z: number): number;
export function soilTemp(sim: Sim, a: Vec3 | number, x = 0, z = 0): number {
  let depth: number;
  if (typeof a === 'number') {
    depth = a;
  } else {
    x = a.x;
    z = a.z;
    depth = sim.field.height(x, z) - a.y;
  }
  const cover = coverSlotKind(surfaceSlotAt(sim.world, x, z));
  return soilTempAtDepth(sim, depth, cover === 'stone' ? 'stone' : cover);
}
