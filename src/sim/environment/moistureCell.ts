// One soil-moisture cell over one step (GDD 06 §3.9 table, §3.10 puddle store). Pure float maths on a scratch
// record, so the table-driven tests exercise exactly what the grid step runs. Every term is mm over the step.

import {
  WX_DEW_MM_PER_H, WX_ET_K, WX_EVAP_BASE, WX_EVAP_EXP, WX_EVAP_K, WX_EVAP_LITTER_K, WX_EVAP_SHADE_K, WX_EVAP_WIND_DIV,
  WX_K0, WX_K1, WX_MOISTURE_CLASS_BOUNDS, WX_PUDDLE_DRAIN_MMH, WX_PUDDLE_FILL, WX_RISE_K, WX_THETA_FC, WX_W0_MM, WX_W1_MM, type SoilTex,
} from '@/sim/balance/weather';

/** Static inputs of one cell. */
export interface CellParams {
  tex: SoilTex;
  /** Infiltration capacity, mm/h. */
  icap: number;
  permeable: number;
  shade: number;
  litter: number;
  veg: boolean;
  /** Exposed natural ground (dew wets it). */
  natural: boolean;
  /** Puddle capacity, mm (0: runoff leaves the cell). */
  puddleCapMm: number;
}

/** Weather inputs of one step (global except where noted). */
export interface StepInputs {
  /** Step length, game hours. */
  dtH: number;
  /** Rain rate, mm/h. */
  rainMmH: number;
  /** GDD 06 evapIdx. */
  evapIdx: number;
  insolation: number;
  dewLevel: number;
  /** Transpiration season (spring..autumn). */
  growing: boolean;
  /** Topsoil frozen: no infiltration or evaporation. */
  frozen: boolean;
}

/** Mutable cell state, floats. */
export interface CellState {
  theta0: number;
  theta1: number;
  puddleMm: number;
}

/** What one step did (mm), for diagnostics and tests. */
export interface CellFlux {
  infiltration: number;
  runoff: number;
  evaporation: number;
  drain0: number;
  drain1: number;
  rise: number;
  et: number;
}

/** evapIdx = insolation (1 - RH) (1 + windGround / 5) + 0.05 (GDD 06 §3.9). */
export function evapIndex(insolation: number, rh: number, windGroundMs: number): number {
  const i = Math.max(0, insolation), r = Math.min(1, Math.max(0, rh));
  return i * (1 - r) * (1 + Math.max(0, windGroundMs) / WX_EVAP_WIND_DIV) + WX_EVAP_BASE;
}

/** Top-layer evaporation rate, mm/h, at saturation theta (water surface: theta = 1). */
export function evapRateMmH(evapIdx: number, theta: number, shade: number, litter: number): number {
  return WX_EVAP_K * evapIdx * Math.pow(Math.max(0, theta), WX_EVAP_EXP) * (1 - WX_EVAP_SHADE_K * shade) * (1 - WX_EVAP_LITTER_K * litter);
}

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Advances one cell by one step in place; fills `flux` (optional) with the step's terms. */
export function stepCell(p: CellParams, inp: StepInputs, s: CellState, flux?: CellFlux): void {
  const dt = inp.dtH;
  let rain = Math.max(0, inp.rainMmH) * dt;
  if (p.natural) rain += WX_DEW_MM_PER_H * inp.dewLevel * dt;
  // infiltration from rain and standing water, limited by capacity, permeability and free pore space
  let inf = 0, fromRain = 0;
  if (!inp.frozen && p.permeable > 0) {
    const free = (1 - s.theta0) * WX_W0_MM;
    inf = Math.min(Math.min(rain + s.puddleMm, p.icap * dt) * p.permeable, free);
    fromRain = Math.min(rain, inf);
    s.puddleMm -= inf - fromRain;
    s.theta0 += inf / WX_W0_MM;
  }
  const runoff = rain - fromRain;
  // drainage top -> sub (limited by the space below) and sub -> deep
  const fc = WX_THETA_FC[p.tex];
  let d0 = WX_K0[p.tex] * Math.max(0, s.theta0 - fc) * WX_W0_MM * dt;
  d0 = Math.min(d0, (1 - s.theta1) * WX_W1_MM);
  s.theta0 -= d0 / WX_W0_MM;
  s.theta1 += d0 / WX_W1_MM;
  const d1 = WX_K1[p.tex] * Math.max(0, s.theta1 - fc) * WX_W1_MM * dt;
  s.theta1 -= d1 / WX_W1_MM;
  // capillary rise
  const rise = Math.min(WX_RISE_K * Math.max(0, s.theta1 - s.theta0) * dt, s.theta1 * WX_W1_MM);
  s.theta1 -= rise / WX_W1_MM;
  s.theta0 += rise / WX_W0_MM;
  // evaporation from the top layer (only where the soil is open: x permeable) and transpiration from the sub layer
  let evap = 0;
  if (!inp.frozen) {
    evap = Math.min(evapRateMmH(inp.evapIdx, s.theta0, p.shade, p.litter) * Math.min(1, p.permeable) * dt, s.theta0 * WX_W0_MM);
    s.theta0 -= evap / WX_W0_MM;
  }
  let et = 0;
  if (p.veg && inp.growing) {
    et = Math.min(WX_ET_K * Math.max(0, inp.insolation) * s.theta1 * dt, s.theta1 * WX_W1_MM);
    s.theta1 -= et / WX_W1_MM;
  }
  // puddle store: half the runoff stays, water evaporates and drains
  if (p.puddleCapMm > 0) {
    s.puddleMm += runoff * WX_PUDDLE_FILL;
    const loss = inp.frozen ? 0 : (evapRateMmH(inp.evapIdx, 1, p.shade, 0) + WX_PUDDLE_DRAIN_MMH) * dt;
    s.puddleMm = Math.min(p.puddleCapMm, Math.max(0, s.puddleMm - loss));
  } else s.puddleMm = 0;
  s.theta0 = clamp01(s.theta0);
  s.theta1 = clamp01(s.theta1);
  if (flux) {
    flux.infiltration = inf; flux.runoff = runoff; flux.evaporation = evap; flux.drain0 = d0; flux.drain1 = d1;
    flux.rise = rise; flux.et = et;
  }
}

/** Moisture class of a saturation (GDD 06 §3.9 read-outs). */
export function moistureClass(theta: number): 'dry' | 'slightly-damp' | 'damp' | 'wet' | 'waterlogged' {
  const [dry, damp, wet, sat] = WX_MOISTURE_CLASS_BOUNDS;
  if (theta < dry) return 'dry';
  if (theta < damp) return 'slightly-damp';
  if (theta < wet) return 'damp';
  if (theta <= sat) return 'wet';
  return 'waterlogged';
}
