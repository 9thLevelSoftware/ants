// Chamber temperature and humidity (GDD 03 §9, the one cavity model; GDD 06 §2.5 supplies its inputs) and the
// thermal inputs of a ground column (`thermalInputs`, D7.2). Depth is physical (mm) so a deeper or larger-species
// chamber is damped more.

import { smoothstep } from '@/core/math/scalar';
import type { Vec3 } from '@/core/math/vec3';
import type { Chamber, Nest, NestFieldTarget, Sim, ThermalInputs } from '@/sim/types';
import { MATERIAL_IDS } from '@/sim/types';
import { materialFromCode } from '@/sim/types';
import {
  CHAMBER_DA_MM, CHAMBER_DD_MM, CHAMBER_DS_MM, CHAMBER_RH_DEPTH_MM, CHAMBER_RH_M_HI, CHAMBER_RH_M_LO, CHAMBER_RH_MIN,
  CHAMBER_RH_SPAN, CHAMBER_VENT_BU, CHAMBER_VENT_MIX, COVER_STONE_R_THERM, COVER_STONE_THICKNESS_MM, DEGRADED_AIR_C, DEGRADED_SOIL_C,
  R_THERM, RTHERM_DEFAULT, SOIL_MEAN_OFFSET_C, WOOD_CAVITY_SOIL_DEPTH_MM, WOOD_CAVITY_SOIL_W,
} from '@/sim/balance';
import { TICKS_PER_DAY } from '@/sim/time';
import { byteAt } from '@/sim/world/terrainSample';
import { isInteriorAt, shadeAt, surfaceSlotAt } from './ground';
import { soilTempAtDepth } from './soil';
import { thermalReady } from './surface';
import { calendarNow } from './calendar';
import { seasonalMean } from './climates';
import { airTemp, climateOf, interiorRh, interiorTemp, relHumidity } from './temperature';

/** A zeroed thermal-inputs record to fill (`thermalInputs(sim, pos, out)`). */
export function newThermalInputs(): ThermalInputs {
  return { T_top: 0, T_dayMean: 0, T_seasonMean: 0, T_annual: 0 };
}

const STONE_SLOT = MATERIAL_IDS.indexOf('stone');

function blend(a: Float32Array, slot: number, shade: number): number {
  const i = slot * 2;
  return a[i] + (a[i + 1] - a[i]) * shade;
}

/**
 * Thermal inputs of the column above (x, z): the lagged surface temperature of the topmost surface (the ground, or a
 * stone when `covered`), its day and season EMAs, and `T_annual = Tann + 1 C`. Heated interiors give constants.
 */
export function thermalInputsAt(sim: Sim, x: number, z: number, covered: boolean, out: ThermalInputs): ThermalInputs {
  const w = sim.world;
  out.T_annual = climateOf(sim).tann + SOIL_MEAN_OFFSET_C;
  if (isInteriorAt(w, x, z)) {
    const ti = interiorTemp(sim);
    out.T_top = ti;
    out.T_dayMean = ti;
    out.T_seasonMean = ti;
    return out;
  }
  if (!thermalReady(sim)) {
    // Before the simulation has started the thermal state (a pure read must not start it): the degraded constant.
    out.T_top = DEGRADED_AIR_C;
    out.T_dayMean = DEGRADED_AIR_C;
    out.T_seasonMean = DEGRADED_AIR_C;
    return out;
  }
  const t = sim.state.env.thermal;
  const slot = covered ? STONE_SLOT : surfaceSlotAt(w, x, z);
  const shade = shadeAt(w, x, z);
  out.T_top = blend(t.tsurf, slot, shade);
  out.T_dayMean = blend(t.tsurfDay as Float32Array, slot, shade);
  out.T_seasonMean = blend(t.tsurfSeason as Float32Array, slot, shade);
  return out;
}

/** Thermal inputs at a point (D7.2 `thermalInputs(pos)`). Pass `out` to avoid the allocation. */
export function thermalInputs(sim: Sim, p: Vec3, out: ThermalInputs = newThermalInputs()): ThermalInputs {
  return thermalInputsAt(sim, p.x, p.z, false, out);
}

/** GDD 03 §9.1: `T = Ta + (Ts - Ta) e^(-d/DA) + (Td - Ts) e^(-d/DS) + (Ttop - Td) e^(-d/DD)` for an effective depth in mm. */
export function chamberColumnTemp(i: ThermalInputs, dEffMm: number): number {
  return i.T_annual
    + (i.T_seasonMean - i.T_annual) * Math.exp(-dEffMm / CHAMBER_DA_MM)
    + (i.T_dayMean - i.T_seasonMean) * Math.exp(-dEffMm / CHAMBER_DS_MM)
    + (i.T_top - i.T_dayMean) * Math.exp(-dEffMm / CHAMBER_DD_MM);
}

function rTherm(code: number): number {
  return R_THERM[materialFromCode(code)] ?? RTHERM_DEFAULT;
}

/**
 * Effective thermal depth d_eff (mm) of a chamber `depthMm` below the ground at (x, z) (GDD 03 §9.1). A cover stone
 * sits on top of the soil and adds its own thermal depth (50 mm x 0.35) to the soil column below it; the crust and
 * the subsoil count their r_therm.
 */
export function effectiveDepthMm(sim: Sim, x: number, z: number, depthMm: number, covered: boolean): number {
  const g = sim.world.ground;
  const d = depthMm < 0 ? 0 : depthMm;
  const crust = Math.min(d, byteAt(g.crustMm, x, z));
  let eff = crust * rTherm(byteAt(g.surface, x, z)) + (d - crust) * rTherm(byteAt(g.subsoil, x, z));
  if (covered) eff += COVER_STONE_THICKNESS_MM * COVER_STONE_R_THERM;
  return eff;
}

/** Where `resolve` leaves its answer (a shared record: no allocation per call). */
const found: { nest: Nest | null; chamber: Chamber | null } = { nest: null, chamber: null };

/** Finds the nest and chamber named by (id) or (nest, chamber); false when there is none. Fills `found`. */
function resolve(sim: Sim, a: number | Nest, chamber?: Chamber): boolean {
  if (typeof a !== 'number') {
    found.nest = a;
    found.chamber = chamber ?? null;
    return chamber !== undefined;
  }
  for (const n of sim.state.nests) {
    for (const c of n.chambers) {
      if (c.id === a) {
        found.nest = n;
        found.chamber = c;
        return true;
      }
    }
  }
  return false;
}

const scratchInputs = newThermalInputs();
/** Nest-navigation target for the distance to the nearest open entrance (a constant: no allocation per call). */
const EXIT_TARGET: NestFieldTarget = { kind: 'exit', id: -1 };

/**
 * Temperature at a chamber's centre, C. Pass the chamber id, or the nest and the chamber. Soil chambers follow the
 * GDD 03 §9.1 column (cover and depth damped); wood nests use `0.7 Tsoil(150 mm) + 0.3 Tair`; interiors the interior
 * temperature. Unknown chambers give the degraded soil constant.
 */
export function chamberTemp(sim: Sim, a: number | Nest, chamber?: Chamber): number {
  if (!resolve(sim, a, chamber)) return DEGRADED_SOIL_C;
  const nest = found.nest as Nest, c = found.chamber as Chamber;
  const x = c.center.x, z = c.center.z;
  if (isInteriorAt(sim.world, x, z)) return interiorTemp(sim);
  if (nest.substrate === 'wood-sound' || nest.substrate === 'wood-decayed') {
    return WOOD_CAVITY_SOIL_W * soilTempAtDepth(sim, WOOD_CAVITY_SOIL_DEPTH_MM) + (1 - WOOD_CAVITY_SOIL_W) * airTemp(sim);
  }
  return columnTempAt(sim, x, z, c.depthMm, c.covered);
}

/**
 * GDD 03 §9.1 temperature of a point `depthMm` below the ground at (x, z), under a cover stone or not. The one
 * cavity model: chambers use it, and so do ants standing underground (`microTemp`).
 */
export function columnTempAt(sim: Sim, x: number, z: number, depthMm: number, covered = false): number {
  const inputs = thermalInputsAt(sim, x, z, covered, scratchInputs);
  return chamberColumnTemp(inputs, effectiveDepthMm(sim, x, z, depthMm, covered));
}

/**
 * Forecast of a chamber's daily-mean temperature at a later time of the year (`yearFracThen`, 0..1 of the year), C,
 * for planning rules (colony-life R29: can an egg laid now finish before the winter?). GDD 03 §9.1 without the day
 * and hour terms (weather and the daily cycle are not forecast; brood development is linear in T above its floor, so
 * the daily mean is what counts): the chamber's slow part now, `T_annual + (T_seasonMean - T_annual) e^(-d/DA)`,
 * moved by the change of the climate's seasonal mean air temperature from now to then, damped by depth as the
 * seasonal term is. Wood nests take the change undamped, interiors none; an unknown chamber gives the degraded constant.
 */
export function chamberTempForecast(sim: Sim, chamberId: number, yearFracThen: number): number {
  if (!resolve(sim, chamberId)) return DEGRADED_SOIL_C;
  const nest = found.nest as Nest, c = found.chamber as Chamber;
  const x = c.center.x, z = c.center.z;
  if (isInteriorAt(sim.world, x, z)) return interiorTemp(sim);
  const clim = climateOf(sim);
  const change = seasonalMean(clim, yearFracThen) - seasonalMean(clim, calendarNow(sim).yearFrac);
  if (nest.substrate === 'wood-sound' || nest.substrate === 'wood-decayed') return chamberTemp(sim, nest, c) + change;
  const inputs = thermalInputsAt(sim, x, z, c.covered, scratchInputs);
  const gain = Math.exp(-effectiveDepthMm(sim, x, z, c.depthMm, c.covered) / CHAMBER_DA_MM);
  return inputs.T_annual + (inputs.T_seasonMean - inputs.T_annual) * gain + change * gain;
}

/** Soil relative humidity from moisture m (GDD 03 §9.2): `0.5 + 0.5 smoothstep(0.05, 0.30, m)`. */
export function soilRelHumidity(m: number): number {
  return CHAMBER_RH_MIN + CHAMBER_RH_SPAN * smoothstep(CHAMBER_RH_M_LO, CHAMBER_RH_M_HI, m);
}

function moistureAt(sim: Sim, layer: Uint8Array, x: number, z: number): number {
  const m = sim.state.env.moisture;
  let ix = Math.floor(x / m.cell), iz = Math.floor(z / m.cell);
  ix = ix < 0 ? 0 : ix >= m.nx ? m.nx - 1 : ix;
  iz = iz < 0 ? 0 : iz >= m.nz ? m.nz - 1 : iz;
  return layer[iz * m.nx + ix] / 255;
}

/**
 * Relative humidity of a chamber, 0..1 (GDD 03 §9.2): soil moisture blended from the surface layer to the deep
 * layer by depth, ventilated toward the air within 8 BU (path) of an open entrance, and held wet for a day after a flood.
 */
export function chamberHumidity(sim: Sim, a: number | Nest, chamber?: Chamber): number {
  if (!resolve(sim, a, chamber)) return interiorRh();
  const nest = found.nest as Nest, c = found.chamber as Chamber;
  const x = c.center.x, z = c.center.z;
  if (isInteriorAt(sim.world, x, z)) return interiorRh();
  const env = sim.state.env;
  const surf = moistureAt(sim, env.moisture.theta0, x, z);
  const deep = moistureAt(sim, env.moisture.theta1, x, z);
  const m = deep + (surf - deep) * Math.exp(-(c.depthMm < 0 ? 0 : c.depthMm) / CHAMBER_RH_DEPTH_MM);
  let rh = soilRelHumidity(m);
  const pathMm = sim.nestNav.distance(nest.id, EXIT_TARGET, c.center);
  if (pathMm >= 0) {
    const pathBu = pathMm / sim.world.bu;
    if (pathBu < CHAMBER_VENT_BU) rh += (relHumidity(sim) - rh) * CHAMBER_VENT_MIX * (1 - pathBu / CHAMBER_VENT_BU);
  }
  const wet = c.wetUntilTick - sim.state.tick;
  if (wet > 0) rh += (1 - rh) * Math.min(1, wet / TICKS_PER_DAY);
  return rh < 0 ? 0 : rh > 1 ? 1 : rh;
}
