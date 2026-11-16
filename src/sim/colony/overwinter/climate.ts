// The winter's climate for the aggregate model (GDD 06 §6.3): where the workers cluster (the deepest chambers with
// room), the cluster temperature of every winter day, frost nights and rain. The soil model of the environment gives
// the seasonal course at the cluster depth: the current chamber temperature is carried along the soil wave. Frost
// nights and rain are one draw per day from `rng.winter` (deviation from "the weather machine runs for real": the
// weather machine is not stepped through the winter; recorded in the report of task overwinter-repro).

import { rngFloat, rngRange, type RngState } from '@/core/rng';
import type { Chamber, Colony, Sim } from '@/sim/types';
import { soilTempAtDepth } from '@/sim/environment';
import { isInteriorAt } from '@/sim/environment/ground';
import { chamberTempC } from '../envAdapter';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '@/sim/time';
import { CHAMBER_RH_DEPTH_MM } from '@/sim/balance/environment';
import {
  WINT_CLUSTER_DEPTH_FRAC, WINT_INTERIOR_WETNESS, WINT_FROST_DAMP_MM, WINT_FROST_DAY_P, WINT_FROST_DROP_C, WINT_RAIN_DAY_P, WINT_RAIN_MM,
  WINT_SAMPLE_HOURS,
} from '@/sim/balance/lifecycle';

export interface ClusterInfo {
  chambers: Chamber[];
  /** Depth of the cluster (mean of its chambers), mm; and the deepest chamber's id (-1 none). */
  depthMm: number;
  deepestId: number;
  /**
   * Mean chamber temperature now, C; nest humidity 0..1 (the soil's water saturation at the cluster, 1 in a chamber
   * still wet from a flood; see `chamberWetness`); flood safety 0..1.
   */
  tNow: number;
  humidity: number;
  floodSafety: number;
}

/** Fallback depth when the colony has no chamber (a lost nest), mm. */
const NO_CHAMBER_DEPTH_MM = 40;

export function colonyChambers(sim: Sim, col: Colony): Chamber[] {
  const out: Chamber[] = [];
  for (const n of sim.state.nests) if (n.alive && n.colony === col.id) out.push(...n.chambers);
  return out;
}

/** The cluster: the colony's chambers at least WINT_CLUSTER_DEPTH_FRAC as deep as the deepest one. */
export function clusterOf(sim: Sim, col: Colony): ClusterInfo {
  const all = colonyChambers(sim, col);
  if (all.length === 0) {
    const t = soilTempAtDepth(sim, NO_CHAMBER_DEPTH_MM);
    return { chambers: [], depthMm: NO_CHAMBER_DEPTH_MM, deepestId: -1, tNow: t, humidity: 0.8, floodSafety: 0.5 };
  }
  const deepest = all.reduce((a, b) => (b.depthMm > a.depthMm ? b : a));
  const chambers = all.filter((c) => c.depthMm >= WINT_CLUSTER_DEPTH_FRAC * deepest.depthMm);
  let t = 0, h = 0, risk = 0, d = 0;
  for (const c of chambers) {
    t += chamberTempC(sim, c.id);
    h += chamberWetness(sim, c);
    risk = Math.max(risk, c.floodRisk);
    d += c.depthMm;
  }
  const n = chambers.length;
  return { chambers, depthMm: d / n, deepestId: deepest.id, tNow: t / n, humidity: h / n, floodSafety: 1 - risk };
}

/** Soil moisture layer value at (x, z), 0..1 of the layer's water capacity. */
function layerAt(sim: Sim, layer: Uint8Array, x: number, z: number): number {
  const m = sim.state.env.moisture;
  const ix = Math.min(m.nx - 1, Math.max(0, Math.floor(x / m.cell)));
  const iz = Math.min(m.nz - 1, Math.max(0, Math.floor(z / m.cell)));
  return (layer[iz * m.nx + ix] ?? 0) / 255;
}

/**
 * The winter model's nest humidity of a chamber (GDD 06 §6.3 fungus term): the soil's water saturation around it,
 * blended from the top to the deep layer by depth as the environment's chamber humidity does. The chamber air's
 * relative humidity is not used: it is saturated in any moist soil (1.0 from about a third of the capacity), so a
 * threshold on it would mark every nest as wet. A chamber still wet from a flood counts as 1.
 */
export function chamberWetness(sim: Sim, c: Chamber): number {
  if (c.wetUntilTick > sim.state.tick) return 1;
  if (isInteriorAt(sim.world, c.center.x, c.center.z)) return WINT_INTERIOR_WETNESS;
  const env = sim.state.env.moisture;
  if (!env || env.nx <= 0) return WINT_INTERIOR_WETNESS;
  const surf = layerAt(sim, env.theta0, c.center.x, c.center.z);
  const deep = layerAt(sim, env.theta1, c.center.x, c.center.z);
  return deep + (surf - deep) * Math.exp(-Math.max(0, c.depthMm) / CHAMBER_RH_DEPTH_MM);
}

/** Soil temperature at `depthMm` at a calendar offset from now (the calendar anchor moves and is put back). */
function soilAt(sim: Sim, depthMm: number, offsetTicks: number): number {
  const cal = sim.state.env.calendar;
  const keep = cal.startTick;
  cal.startTick = keep + offsetTicks;
  try {
    return soilTempAtDepth(sim, depthMm);
  } finally {
    cal.startTick = keep;
  }
}

export interface WinterClimate {
  tMean: number[];
  tMin: number[];
  frost: boolean[];
  rainMm: number[];
}

/**
 * Day-by-day cluster temperatures for `days` game days from the start of the current day, and the frost and rain
 * draws. `tNow` is the cluster's temperature now; the soil wave at the cluster depth moves it day by day.
 */
export function winterClimate(sim: Sim, cluster: ClusterInfo, days: number, rng: RngState): WinterClimate {
  const out: WinterClimate = { tMean: [], tMin: [], frost: [], rainMm: [] };
  const hourNow = (sim.state.tick + sim.state.env.calendar.startTick) % TICKS_PER_DAY;
  const ref = soilAt(sim, cluster.depthMm, 0);
  const frostDrop = WINT_FROST_DROP_C * Math.exp(-cluster.depthMm / WINT_FROST_DAMP_MM);
  for (let g = 0; g < days; g++) {
    const frost = rngFloat(rng) < WINT_FROST_DAY_P;
    const rain = rngFloat(rng) < WINT_RAIN_DAY_P ? rngRange(rng, WINT_RAIN_MM[0], WINT_RAIN_MM[1]) : 0;
    let sum = 0, min = Infinity;
    for (const h of WINT_SAMPLE_HOURS) {
      const off = g * TICKS_PER_DAY + Math.round(h * TICKS_PER_HOUR) - hourNow;
      const t = cluster.tNow + soilAt(sim, cluster.depthMm, off) - ref - (frost ? frostDrop : 0);
      sum += t;
      if (t < min) min = t;
    }
    out.tMean.push(sum / WINT_SAMPLE_HOURS.length);
    out.tMin.push(min);
    out.frost.push(frost);
    out.rainMm.push(rain);
  }
  return out;
}
