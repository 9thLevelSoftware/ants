// Water into a nest (GDD 03 §11.1): Q_in = sum over entrances of Q_BASE x I x c x f_cover x f_rim x f_state, plus
// seepage from saturated subsoil (GDD 06 §3.10), times the difficulty's floodInflowMult (GDD 06 §14).
//   I       rain intensity at the entrance (GDD 06 rainIntensityAt; cheat.setRain overrides it)
//   c       catchment: clamp(1 + (h_ring - h_ent) / 2 BU, 0.25, 4) on an 8 BU ring of base terrain, x 1.5 when the
//           ring is mostly crusted, x the world hydrology 1 + GAIN x floodRisk (decision of this module, so a site
//           worldgen calls flood-safe keeps the flat-ground value and a hollow gathers more), clamped again
//   f_cover 0.15 if a solid lies above the opening within 20 BU
//   f_rim   max(0.1, 1 - rim / 3 BU), rim = the entrance mound's crater rim
//   f_state open 1, sealing 0.5, sealed / reopening 0.1

import type { Vec3 } from '@/core/math/vec3';
import type { Entrance, Nest, Sim } from '@/sim/types';
import {
  FLOOD_CATCH_DIV_BU, FLOOD_CATCH_MAX, FLOOD_CATCH_MIN, FLOOD_CATCH_RING_BU, FLOOD_COVER_BU, FLOOD_COVER_FACTOR,
  FLOOD_CRUST_HALF, FLOOD_CRUST_RUNOFF, FLOOD_HYDRO_GAIN, FLOOD_Q_BASE, FLOOD_RIM_FULL_BU, FLOOD_RIM_MIN,
  FLOOD_SEEP_RATE, FLOOD_SEEP_THETA1, FLOOD_STATE_FACTOR,
} from '@/sim/balance/weather';
import { rainIntensityAt } from '@/sim/environment/queries';
import { isInteriorAt } from '@/sim/environment/ground';
import { byteAt, heightAt } from '@/sim/world/terrainSample';
import { moundById, rimHeight } from '../mounds';
import { floodCheats } from './cheats';

const RING_POINTS = 16;
const UP: Vec3 = { x: 0, y: 1, z: 0 };
const probe: Vec3 = { x: 0, y: 0, z: 0 };

/** The factors of one entrance's inflow (diagnostics read them as limiting factors). */
export interface EntranceInflow {
  entranceId: number;
  intensity: number;
  catchment: number;
  cover: number;
  rim: number;
  state: number;
  /** BU^3/s */
  q: number;
}

/** Catchment factor c of an entrance (ring height, crust, world hydrology). */
export function catchmentOf(sim: Sim, e: Entrance): number {
  const w = sim.world, bu = w.bu, r = FLOOD_CATCH_RING_BU * bu;
  const hEnt = heightAt(w.terrain, e.pos.x, e.pos.z);
  let sum = 0, crusted = 0;
  for (let n = 0; n < RING_POINTS; n++) {
    const a = (2 * Math.PI * n) / RING_POINTS;
    const x = e.pos.x + Math.cos(a) * r, z = e.pos.z + Math.sin(a) * r;
    sum += heightAt(w.terrain, x, z);
    if (byteAt(w.ground.crustMm, x, z) > 0) crusted++;
  }
  let c = 1 + (sum / RING_POINTS - hEnt) / (FLOOD_CATCH_DIV_BU * bu);
  c = Math.min(FLOOD_CATCH_MAX, Math.max(FLOOD_CATCH_MIN, c));
  if (crusted / RING_POINTS >= FLOOD_CRUST_HALF) c *= FLOOD_CRUST_RUNOFF;
  c *= 1 + FLOOD_HYDRO_GAIN * (byteAt(w.maps.floodRisk, e.pos.x, e.pos.z) / 255);
  return Math.min(FLOOD_CATCH_MAX, Math.max(FLOOD_CATCH_MIN, c));
}

/** f_cover: a solid above the opening within FLOOD_COVER_BU shields it. */
export function coverFactorOf(sim: Sim, e: Entrance): number {
  const bu = sim.world.bu, reach = FLOOD_COVER_BU * bu;
  probe.x = e.pos.x; probe.y = Math.max(e.pos.y, sim.field.height(e.pos.x, e.pos.z)) + 0.5 * bu; probe.z = e.pos.z;
  return sim.field.sphereTrace(probe, UP, reach, 0.1 * bu) < reach - 1e-6 ? FLOOD_COVER_FACTOR : 1;
}

/** f_rim from the entrance's mound crater rim (GDD 03 §4.3). */
export function rimFactorOf(sim: Sim, e: Entrance): number {
  const m = e.moundId >= 0 ? moundById(sim, e.moundId) : undefined;
  const rim = m ? rimHeight(sim, m) : 0;
  return Math.max(FLOOD_RIM_MIN, 1 - rim / FLOOD_RIM_FULL_BU);
}

/** Rain intensity I at an entrance (the flood cheat overrides it outdoors). */
export function intensityAt(sim: Sim, p: Vec3): number {
  const forced = floodCheats(sim.state).rainI;
  if (forced >= 0) return isInteriorAt(sim.world, p.x, p.z) ? 0 : forced;
  return rainIntensityAt(sim, p);
}

/** One entrance's inflow and its factors; `iOverride` replaces I (the reference storm). */
export function entranceInflow(sim: Sim, e: Entrance, iOverride = -1): EntranceInflow {
  const intensity = iOverride >= 0 ? (isInteriorAt(sim.world, e.pos.x, e.pos.z) ? 0 : iOverride) : intensityAt(sim, e.pos);
  const out: EntranceInflow = { entranceId: e.id, intensity, catchment: 1, cover: 1, rim: 1, state: FLOOD_STATE_FACTOR[e.status] ?? 1, q: 0 };
  if (intensity <= 0) return out;
  out.catchment = catchmentOf(sim, e);
  out.cover = coverFactorOf(sim, e);
  out.rim = rimFactorOf(sim, e);
  out.q = FLOOD_Q_BASE * intensity * out.catchment * out.cover * out.rim * out.state * sim.state.config.difficulty.params.floodInflowMult;
  return out;
}

/** Seepage into the nest's chambers from saturated subsoil, BU^3/s. */
export function seepageOf(sim: Sim, nest: Nest): number {
  const m = sim.state.env.moisture;
  if (m.nx <= 0) return 0;
  let q = 0;
  for (const c of nest.chambers) {
    const ix = Math.min(m.nx - 1, Math.max(0, Math.floor(c.center.x / m.cell)));
    const iz = Math.min(m.nz - 1, Math.max(0, Math.floor(c.center.z / m.cell)));
    if (m.theta1[iz * m.nx + ix] / 255 >= FLOOD_SEEP_THETA1) q += FLOOD_SEEP_RATE * c.floorArea;
  }
  return q;
}

/** Total inflow of a nest now, BU^3/s (entrances + seepage); per-entrance factors into `out` when given. */
export function nestInflow(sim: Sim, nest: Nest, out?: EntranceInflow[], iOverride = -1): number {
  let q = 0;
  for (const e of nest.entrances) {
    const f = entranceInflow(sim, e, iOverride);
    q += f.q;
    out?.push(f);
  }
  return q + (iOverride >= 0 ? 0 : seepageOf(sim, nest));
}
