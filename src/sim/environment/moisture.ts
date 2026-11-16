// Soil moisture, puddles, static water bodies and surface wetness (GDD 06 §3.9-3.10), stepped every
// ENV_MOISTURE_EVERY ticks by the environment-effects system. The persisted grids are bytes (theta 0..255, puddle
// in 0.05 mm units); a step's change is often below one byte, so values are written with deterministic dithered
// rounding (a hash of cell and tick decides the rounding direction): unbiased on average and a pure function of the
// persisted state, so save/load and replays stay identical.

import type { Sim } from '@/sim/types';
import { WIND_GROUND_FACTOR } from '@/sim/balance';
import {
  WX_BODY_CATCH_MULT, WX_BODY_DRAIN_MULT, WX_BODY_RAIN_KINDS, WX_FROZEN_BELOW_C, WX_FROZEN_DEPTH_MM, WX_PUDDLE_DRAIN_MMH,
  WX_PUDDLE_UNIT_MM, WX_WET_DRY_K, WX_WET_FULL_MMH, WX_WET_RISE_H,
} from '@/sim/balance/weather';
import { TICKS_PER_HOUR } from '@/sim/time';
import { calendarNow } from './calendar';
import { insolation } from './light';
import { evapIndex, evapRateMmH, stepCell, type CellParams, type CellState, type StepInputs } from './moistureCell';
import { moistureStatic, TEX_IDS } from './moistureStatic';
import { soilTempAtDepth } from './soil';
import { relHumidity } from './temperature';

/** Uniform in [0, 1) from a cell index, tick and salt (integer hash; deterministic across platforms). */
function dither(cell: number, tick: number, salt: number): number {
  let h = Math.imul(cell ^ 0x9e3779b1, 0x85ebca6b) ^ Math.imul(tick + salt * 0x27d4eb2f, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

function quant(x: number, scale: number, cell: number, tick: number, salt: number): number {
  const v = Math.floor(x * scale + dither(cell, tick, salt));
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

const params: CellParams = { tex: 'loam', icap: 0, permeable: 0, shade: 0, litter: 0, veg: false, natural: false, puddleCapMm: 0 };
const inputs: StepInputs = { dtH: 0, rainMmH: 0, evapIdx: 0, insolation: 0, dewLevel: 0, growing: false, frozen: false };
const cellState: CellState = { theta0: 0, theta1: 0, puddleMm: 0 };

/** Weather inputs of a step of `dtTicks` (global: one sky; interiors are excluded per cell). */
export function moistureInputs(sim: Sim, dtTicks: number, out: StepInputs = inputs): StepInputs {
  const w = sim.state.env.weather;
  const ins = insolation(sim);
  out.dtH = dtTicks / TICKS_PER_HOUR;
  out.rainMmH = w.rainRateMmH;
  out.insolation = ins;
  out.evapIdx = evapIndex(ins, relHumidity(sim), WIND_GROUND_FACTOR * w.wind2m);
  out.dewLevel = w.dew.level;
  out.growing = calendarNow(sim).season !== 'winter';
  out.frozen = soilTempAtDepth(sim, WX_FROZEN_DEPTH_MM) < WX_FROZEN_BELOW_C;
  return out;
}

/** Result of one grid step (puddle cells that appeared / dried, for the `weather.puddle` event). */
export interface MoistureStepResult {
  cellsAdded: number;
  cellsRemoved: number;
}

/** Puddle depth (store units) from which a cell counts as a puddle for events: 1 mm. */
const PUDDLE_EVENT_UNITS = Math.round(1 / WX_PUDDLE_UNIT_MM);

/**
 * Advances the outdoor moisture cells of one row band (`slice` of `slices`; the default is the whole grid) by
 * `dtTicks`; the band of slice 0 also steps the water bodies and the surface wetness. Calling every slice once per
 * period steps every cell once with the period's dt, spreading the cost over the period's ticks.
 */
export function stepMoisture(
  sim: Sim, dtTicks: number, inp: StepInputs = moistureInputs(sim, dtTicks), slice = 0, slices = 1,
): MoistureStepResult {
  const m = sim.state.env.moisture;
  const res: MoistureStepResult = { cellsAdded: 0, cellsRemoved: 0 };
  if (m.nx <= 0 || m.theta0.length !== m.nx * m.nz) return res;
  const st = moistureStatic(sim.world, m.cell, m.nx, m.nz);
  const tick = sim.state.tick;
  const t0 = m.theta0, t1 = m.theta1, pud = m.puddle;
  const r0 = Math.floor((slice * m.nz) / slices), r1 = Math.floor(((slice + 1) * m.nz) / slices);
  for (let c = r0 * m.nx; c < r1 * m.nx; c++) {
    if (st.interior[c]) continue;
    params.tex = TEX_IDS[st.tex[c]];
    params.icap = st.icap[c];
    params.permeable = st.permeable[c];
    params.shade = st.shade[c];
    params.litter = st.litter[c];
    params.veg = st.veg[c] === 1;
    params.natural = st.natural[c] === 1;
    params.puddleCapMm = st.puddleCap[c] * WX_PUDDLE_UNIT_MM;
    cellState.theta0 = t0[c] / 255;
    cellState.theta1 = t1[c] / 255;
    cellState.puddleMm = pud[c] * WX_PUDDLE_UNIT_MM;
    const wasPuddle = pud[c] >= PUDDLE_EVENT_UNITS;
    stepCell(params, inp, cellState);
    t0[c] = quant(cellState.theta0, 255, c, tick, 1);
    t1[c] = quant(cellState.theta1, 255, c, tick, 2);
    pud[c] = Math.min(st.puddleCap[c], quant(cellState.puddleMm, 1 / WX_PUDDLE_UNIT_MM, c, tick, 3));
    const isPuddle = pud[c] >= PUDDLE_EVENT_UNITS;
    if (isPuddle && !wasPuddle) res.cellsAdded++;
    else if (wasPuddle && !isPuddle) res.cellsRemoved++;
  }
  if (slice === 0) {
    stepWaterBodies(sim, inp);
    stepSurfaceWet(sim, inp);
  }
  return res;
}

const BODY_KINDS: ReadonlySet<string> = new Set(WX_BODY_RAIN_KINDS);

/** Rain fills outdoor puddle-like water bodies; they lose water to evaporation and drainage. */
function stepWaterBodies(sim: Sim, inp: StepInputs): void {
  const levels = sim.state.worldDelta.waterLevels;
  const bodies = sim.world.waterBodies;
  if (!levels) return;
  const st = moistureStatic(sim.world, sim.state.env.moisture.cell, sim.state.env.moisture.nx, sim.state.env.moisture.nz);
  for (let i = 0; i < bodies.length && i < levels.length; i++) {
    const b = bodies[i];
    if (!BODY_KINDS.has(b.kind)) continue;
    const ix = Math.min(st.nx - 1, Math.max(0, Math.floor(b.pos.x / st.cell)));
    const iz = Math.min(st.nz - 1, Math.max(0, Math.floor(b.pos.z / st.cell)));
    if (st.interior[iz * st.nx + ix]) continue;
    const gain = inp.rainMmH * WX_BODY_CATCH_MULT * inp.dtH;
    const loss = inp.frozen ? 0 : (evapRateMmH(inp.evapIdx, 1, st.shade[iz * st.nx + ix], 0) + WX_PUDDLE_DRAIN_MMH * (WX_BODY_DRAIN_MULT[b.kind] ?? 1)) * inp.dtH;
    levels[i] = Math.min(b.capMm, Math.max(0, levels[i] + gain - loss));
  }
}

/** Global surface wetness: soaks toward rainRate / WET_FULL in rain, dries with evaporation otherwise. */
function stepSurfaceWet(sim: Sim, inp: StepInputs): void {
  const m = sim.state.env.moisture;
  let w = m.surfaceWet ?? 0;
  if (inp.rainMmH > 0) {
    const target = Math.min(1, inp.rainMmH / WX_WET_FULL_MMH);
    if (target > w) w += (target - w) * (1 - Math.exp(-inp.dtH / WX_WET_RISE_H));
  } else {
    w -= inp.evapIdx * WX_WET_DRY_K * inp.dtH;
  }
  m.surfaceWet = w < 0 ? 0 : w > 1 ? 1 : w;
}

// ---- queries ----

function cellIndex(sim: Sim, x: number, z: number): number {
  const m = sim.state.env.moisture;
  if (m.nx <= 0) return -1;
  let ix = Math.floor(x / m.cell), iz = Math.floor(z / m.cell);
  ix = ix < 0 ? 0 : ix >= m.nx ? m.nx - 1 : ix;
  iz = iz < 0 ? 0 : iz >= m.nz ? m.nz - 1 : iz;
  return iz * m.nx + ix;
}

/** Soil saturation 0..1 of a layer (0 top, 1 sub) at (x, z). */
export function moistureAtXZ(sim: Sim, x: number, z: number, layer: 0 | 1 = 0): number {
  const c = cellIndex(sim, x, z);
  if (c < 0) return 0;
  const m = sim.state.env.moisture;
  return (layer === 0 ? m.theta0[c] : m.theta1[c]) / 255;
}

/** Standing puddle depth at (x, z), mm. */
export function puddleDepthMm(sim: Sim, x: number, z: number): number {
  const c = cellIndex(sim, x, z);
  return c < 0 ? 0 : sim.state.env.moisture.puddle[c] * WX_PUDDLE_UNIT_MM;
}

/** Surface wetness 0..1 (renderers: wet look, friction x0.9 for locomotion). */
export function surfaceWetness(sim: Sim): number {
  return sim.state.env.moisture.surfaceWet ?? 0;
}

/** Sets top and sub moisture to m (0..1) for every cell whose centre lies within radius of (center.x, center.z). */
export function setSoilMoistureRegion(sim: Sim, cx: number, cz: number, radius: number, m: number): number {
  const mo = sim.state.env.moisture;
  const v = Math.round(Math.min(1, Math.max(0, m)) * 255);
  let n = 0;
  for (let iz = 0; iz < mo.nz; iz++) for (let ix = 0; ix < mo.nx; ix++) {
    const x = (ix + 0.5) * mo.cell, z = (iz + 0.5) * mo.cell;
    if (radius >= 0 && (x - cx) ** 2 + (z - cz) ** 2 > radius * radius) continue;
    mo.theta0[iz * mo.nx + ix] = v;
    mo.theta1[iz * mo.nx + ix] = v;
    n++;
  }
  return n;
}
