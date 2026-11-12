// Chamber temperature and humidity (GDD 03 §9, the one cavity model; GDD 06 §2.5 supplies its inputs) and the
// thermal inputs of a ground column (`thermalInputs`, D7.2). Depth is physical (mm) so a deeper or larger-species
// chamber is damped more.

import { smoothstep } from '@/core/math/scalar';
import type { Vec3 } from '@/core/math/vec3';
import type { Chamber, Nest, Sim, ThermalInputs } from '@/sim/types';
import { MATERIAL_IDS } from '@/sim/types';
import { materialFromCode } from '@/sim/types';
import {
  CHAMBER_DA_MM, CHAMBER_DD_MM, CHAMBER_DS_MM, CHAMBER_RH_DEPTH_MM, CHAMBER_RH_M_HI, CHAMBER_RH_M_LO, CHAMBER_RH_MIN,
  CHAMBER_RH_SPAN, CHAMBER_VENT_BU, CHAMBER_VENT_MIX, COVER_STONE_R_THERM, COVER_STONE_THICKNESS_MM, DEGRADED_SOIL_C,
  R_THERM, RTHERM_DEFAULT, SOIL_MEAN_OFFSET_C, WOOD_CAVITY_SOIL_DEPTH_MM, WOOD_CAVITY_SOIL_W,
} from '@/sim/balance';
import { TICKS_PER_DAY } from '@/sim/time';
import { byteAt } from '@/sim/world/terrainSample';
import { isInteriorAt, shadeAt, surfaceSlotAt } from './ground';
import { soilTempAtDepth } from './soil';
import { ensureThermal } from './surface';
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
  ensureThermal(sim);
  const t = sim.state.env.thermal;
  const w = sim.world;
  out.T_annual = climateOf(sim).tann + SOIL_MEAN_OFFSET_C;
  if (isInteriorAt(w, x, z)) {
    const ti = interiorTemp(sim);
    out.T_top = ti;
    out.T_dayMean = ti;
    out.T_seasonMean = ti;
    return out;
  }
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

/** Effective thermal depth d_eff (mm): a stone cover counts 0.35 per mm, the crust and the subsoil their r_therm. */
export function effectiveDepthMm(sim: Sim, x: number, z: number, depthMm: number, covered: boolean): number {
  const g = sim.world.ground;
  let d = depthMm < 0 ? 0 : depthMm;
  let eff = 0;
  if (covered) {
    const cover = Math.min(d, COVER_STONE_THICKNESS_MM);
    eff += cover * COVER_STONE_R_THERM;
    d -= cover;
  }
  const crust = Math.min(d, byteAt(g.crustMm, x, z));
  eff += crust * rTherm(byteAt(g.surface, x, z));
  eff += (d - crust) * rTherm(byteAt(g.subsoil, x, z));
  return eff;
}

function resolve(sim: Sim, a: number | Nest, chamber?: Chamber): { nest: Nest; chamber: Chamber } | null {
  if (typeof a !== 'number') return chamber ? { nest: a, chamber } : null;
  for (const n of sim.state.nests) {
    for (const c of n.chambers) if (c.id === a) return { nest: n, chamber: c };
  }
  return null;
}

const scratchInputs = newThermalInputs();

/**
 * Temperature at a chamber's centre, C. Pass the chamber id, or the nest and the chamber. Soil chambers follow the
 * GDD 03 §9.1 column (cover and depth damped); wood nests use `0.7 Tsoil(150 mm) + 0.3 Tair`; interiors the interior
 * temperature. Unknown chambers give the degraded soil constant.
 */
export function chamberTemp(sim: Sim, a: number | Nest, chamber?: Chamber): number {
  const r = resolve(sim, a, chamber);
  if (!r) return DEGRADED_SOIL_C;
  const { nest, chamber: c } = r;
  const x = c.center.x, z = c.center.z;
  if (isInteriorAt(sim.world, x, z)) return interiorTemp(sim);
  if (nest.substrate === 'wood-sound' || nest.substrate === 'wood-decayed') {
    return WOOD_CAVITY_SOIL_W * soilTempAtDepth(sim, WOOD_CAVITY_SOIL_DEPTH_MM) + (1 - WOOD_CAVITY_SOIL_W) * airTemp(sim);
  }
  const inputs = thermalInputsAt(sim, x, z, c.covered, scratchInputs);
  return chamberColumnTemp(inputs, effectiveDepthMm(sim, x, z, c.depthMm, c.covered));
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
  const r = resolve(sim, a, chamber);
  if (!r) return interiorRh();
  const { nest, chamber: c } = r;
  const x = c.center.x, z = c.center.z;
  if (isInteriorAt(sim.world, x, z)) return interiorRh();
  const env = sim.state.env;
  const surf = moistureAt(sim, env.moisture.theta0, x, z);
  const deep = moistureAt(sim, env.moisture.theta1, x, z);
  const m = deep + (surf - deep) * Math.exp(-(c.depthMm < 0 ? 0 : c.depthMm) / CHAMBER_RH_DEPTH_MM);
  let rh = soilRelHumidity(m);
  const pathMm = sim.nestNav.distance(nest.id, { kind: 'exit', id: -1 }, c.center);
  if (pathMm >= 0) {
    const pathBu = pathMm / sim.world.bu;
    if (pathBu < CHAMBER_VENT_BU) rh += (relHumidity(sim) - rh) * CHAMBER_VENT_MIX * (1 - pathBu / CHAMBER_VENT_BU);
  }
  const wet = c.wetUntilTick - sim.state.tick;
  if (wet > 0) rh += (1 - rh) * Math.min(1, wet / TICKS_PER_DAY);
  return rh < 0 ? 0 : rh > 1 ? 1 : rh;
}
