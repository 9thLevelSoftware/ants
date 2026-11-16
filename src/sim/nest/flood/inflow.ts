// Water into a nest (GDD 03 §11.1): Q_in = sum over entrances of Q_BASE x I x c x f_cover x f_rim x f_state, plus
// seepage from saturated subsoil (GDD 06 §3.10), times the difficulty's floodInflowMult (GDD 06 §14).
//   I       rain intensity at the entrance (GDD 06 rainIntensityAt; cheat.setRain overrides it)
//   c       catchment: clamp(1 + (h_ring - h_ent) / 2 BU, 0.25, 4) on an 8 BU ring of base terrain, x 1.5 when the
//           ring is mostly crusted, x the world hydrology hydroFactorOf(floodRisk) (decision of this module: 0.1 on
//           every site worldgen calls flood-safe, 1 at FLOOD_HYDRO_NEUTRAL_RISK, up to 4 in a hollow), clamped to
//           [0.25 x 0.1, 4]: a raised site may go below the ring floor
//   f_cover 0.15 if a solid lies above the opening within 20 BU
//   f_rim   max(0.1, 1 - rim / 3 BU), rim = the entrance mound's crater rim
//   f_state open 1, sealing 0.5, sealed / reopening 0.1; in a claustral founding cell 0 for its plug and for an
//           opening that does not reach the cell's basin (FLOOD_FOUNDING_PLUG_FACTOR: the sealed cell takes water only
//           by seepage, GDD 06 §5.12, weather-fix2), 1 for a real hole into it

import type { Vec3 } from '@/core/math/vec3';
import type { Entrance, Mound, Nest, Sim } from '@/sim/types';
import {
  FLOOD_CATCH_DIV_BU, FLOOD_CATCH_MAX, FLOOD_CATCH_MIN, FLOOD_CATCH_RING_BU, FLOOD_COVER_BU, FLOOD_COVER_FACTOR,
  FLOOD_CRUST_HALF, FLOOD_CRUST_RUNOFF, FLOOD_FOUNDING_PLUG_FACTOR, FLOOD_HYDRO_GAIN, FLOOD_HYDRO_NEUTRAL_RISK,
  FLOOD_HYDRO_SAFE_FACTOR, FLOOD_HYDRO_SAFE_RISK, FLOOD_Q_BASE, FLOOD_RIM_FULL_BU, FLOOD_RIM_MIN, FLOOD_SEEP_RATE,
  FLOOD_SEEP_THETA1, FLOOD_STATE_FACTOR,
} from '@/sim/balance/weather';
import { RIM_RING_BU } from '@/sim/balance/nest';
import { rainIntensityAt } from '@/sim/environment/queries';
import { isInteriorAt } from '@/sim/environment/ground';
import { byteAt, heightAt } from '@/sim/world/terrainSample';
import { moundById } from '../mounds';
import { moundOrigin } from '../moundRelax';
import { floodCheats } from './cheats';
import { spillFor } from './runtime';
import { entranceOpensBasin } from './spill';

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

/** World-hydrology multiplier of the catchment by the static map's flood risk (balance: FLOOD_HYDRO_*). */
export function hydroFactorOf(floodRisk: number): number {
  const r = Math.min(1, Math.max(0, floodRisk));
  if (r <= FLOOD_HYDRO_SAFE_RISK) return FLOOD_HYDRO_SAFE_FACTOR;
  if (r <= FLOOD_HYDRO_NEUTRAL_RISK) {
    return FLOOD_HYDRO_SAFE_FACTOR + (1 - FLOOD_HYDRO_SAFE_FACTOR) * (r - FLOOD_HYDRO_SAFE_RISK) / (FLOOD_HYDRO_NEUTRAL_RISK - FLOOD_HYDRO_SAFE_RISK);
  }
  return 1 + FLOOD_HYDRO_GAIN * (r - FLOOD_HYDRO_NEUTRAL_RISK) / (1 - FLOOD_HYDRO_NEUTRAL_RISK);
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
  c = Math.min(FLOOD_CATCH_MAX, c) * hydroFactorOf(byteAt(w.maps.floodRisk, e.pos.x, e.pos.z) / 255);
  // the ring term keeps GDD 03's floor; the world factor may take a raised site below it (balance FLOOD_HYDRO_*)
  return Math.min(FLOOD_CATCH_MAX, Math.max(FLOOD_CATCH_MIN * FLOOD_HYDRO_SAFE_FACTOR, c));
}

/** f_cover: a solid above the opening within FLOOD_COVER_BU shields it. */
export function coverFactorOf(sim: Sim, e: Entrance): number {
  const bu = sim.world.bu, reach = FLOOD_COVER_BU * bu;
  probe.x = e.pos.x; probe.y = Math.max(e.pos.y, sim.field.height(e.pos.x, e.pos.z)) + 0.5 * bu; probe.z = e.pos.z;
  return sim.field.sphereTrace(probe, UP, reach, 0.1 * bu) < reach - 1e-6 ? FLOOD_COVER_FACTOR : 1;
}

/**
 * Highest pile on the ring r_ent .. r_ent + RIM_RING around the mound's own entrance, BU: the same cells and the same
 * result as the nest module's rimHeight, visiting only the ring's bounding box of the grid (rimHeight scans the
 * whole 128 x 128 grid, about 1.5 ms per entrance and flood step in rain; task weather-fix2).
 */
function rimHeightOf(sim: Sim, m: Mound): number {
  const nest = m.entranceId >= 0 ? sim.stores.nests.get(m.nestId) : undefined;
  const e = nest?.entrances.find((x) => x.id === m.entranceId);
  if (!e) return 0;
  const bu = sim.world.bu, { x0, z0 } = moundOrigin(m), reach = e.radius + RIM_RING_BU * bu;
  const i0 = Math.max(0, Math.floor((e.pos.x - reach - x0) / m.cell)), i1 = Math.min(m.n - 1, Math.ceil((e.pos.x + reach - x0) / m.cell));
  const k0 = Math.max(0, Math.floor((e.pos.z - reach - z0) / m.cell)), k1 = Math.min(m.n - 1, Math.ceil((e.pos.z + reach - z0) / m.cell));
  let best = 0;
  for (let iz = k0; iz <= k1; iz++) for (let ix = i0; ix <= i1; ix++) {
    const idx = iz * m.n + ix;
    const d = Math.hypot(x0 + ix * m.cell - e.pos.x, z0 + iz * m.cell - e.pos.z);
    if (d >= e.radius && d <= reach && m.h[idx] > best) best = m.h[idx];
  }
  return best / bu;
}

/** f_rim from the entrance's mound crater rim (GDD 03 §4.3). */
export function rimFactorOf(sim: Sim, e: Entrance): number {
  const m = e.moundId >= 0 ? moundById(sim, e.moundId) : undefined;
  const rim = m ? rimHeightOf(sim, m) : 0;
  return Math.max(FLOOD_RIM_MIN, 1 - rim / FLOOD_RIM_FULL_BU);
}

/** Rain intensity I at an entrance (the flood cheat overrides it outdoors). */
export function intensityAt(sim: Sim, p: Vec3): number {
  const forced = floodCheats(sim.state).rainI;
  if (forced >= 0) return isInteriorAt(sim.world, p.x, p.z) ? 0 : forced;
  return rainIntensityAt(sim, p);
}

/** A founding nest in its claustral phase (sealed cell, or the plug being reopened by the first workers). */
export function isClaustralCell(nest: Nest | undefined): boolean {
  const st = nest?.founding?.state;
  return st === 'sealed' || st === 'reopening';
}

/**
 * f_state of an entrance: GDD 03 §4.2 by status. In a claustral founding cell a plug (an entrance that is not
 * `open`) lets nothing in (FLOOD_FOUNDING_PLUG_FACTOR), and an `open` entrance counts only where it really opens the
 * nest's basin to the air (spill.ts entranceOpensBasin; review finding 2): a hole into the cell (a roof breach, the
 * queen digging out, a new opening) takes the full inflow, while a trial pit beside the cell or a throat the founding
 * module already found plugged takes none. The nest pools all its water in one basin, so rain into an opening that
 * does not reach the basin must not be counted there. Needs the sim and the nest only for that case.
 */
export function stateFactorOf(e: Entrance, nest?: Nest, sim?: Sim): number {
  if (!isClaustralCell(nest)) return FLOOD_STATE_FACTOR[e.status] ?? 1;
  if (e.status !== 'open' || !sim || !nest) return FLOOD_FOUNDING_PLUG_FACTOR;
  return entranceOpensBasin(sim, spillFor(sim, nest), e) ? FLOOD_STATE_FACTOR.open : FLOOD_FOUNDING_PLUG_FACTOR;
}

/**
 * Catchment and cover of an entrance, cached per Sim (derived, never persisted). Both are pure functions of the
 * entrance position, the static world, the terrain deformations and the dynamic primitives, which form the key, so
 * a cached value always equals a fresh one. The cover trace runs up to 20 BU through vegetation and was most of
 * the flood step's cost in rain (task weather-fix2: up to 120 ms in one tick on a woodland world).
 */
interface SiteFactors { key: string; catchment: number; cover: number }
const SITES = new WeakMap<Sim, { tick: number; dynKey: string; byEntrance: Map<number, SiteFactors> }>();

function dynamicKey(sim: Sim): string {
  const d = sim.state.worldDelta;
  let k = `${d.heightDeltas.length}|`;
  for (const p of d.dynPrims) k += `${p.id}:${p.pos.x},${p.pos.y},${p.pos.z},${p.rot.x},${p.rot.y},${p.rot.z},${p.rot.w};`;
  return k;
}

function siteFactors(sim: Sim, e: Entrance): SiteFactors {
  let rt = SITES.get(sim);
  if (!rt) { rt = { tick: -1, dynKey: '', byEntrance: new Map() }; SITES.set(sim, rt); }
  if (rt.tick !== sim.state.tick) { rt.tick = sim.state.tick; rt.dynKey = dynamicKey(sim); }
  const key = `${e.pos.x},${e.pos.y},${e.pos.z}|${rt.dynKey}`;
  let f = rt.byEntrance.get(e.id);
  if (!f || f.key !== key) {
    f = { key, catchment: catchmentOf(sim, e), cover: coverFactorOf(sim, e) };
    rt.byEntrance.set(e.id, f);
  }
  return f;
}

/** One entrance's inflow and its factors; `iOverride` replaces I (the reference storm); `nest` owns the entrance. */
export function entranceInflow(sim: Sim, e: Entrance, iOverride = -1, nest?: Nest): EntranceInflow {
  const intensity = iOverride >= 0 ? (isInteriorAt(sim.world, e.pos.x, e.pos.z) ? 0 : iOverride) : intensityAt(sim, e.pos);
  const out: EntranceInflow = { entranceId: e.id, intensity, catchment: 1, cover: 1, rim: 1, state: 0, q: 0 };
  if (intensity <= 0) {
    out.state = isClaustralCell(nest) ? FLOOD_FOUNDING_PLUG_FACTOR : FLOOD_STATE_FACTOR[e.status] ?? 1;
    return out;
  }
  out.state = stateFactorOf(e, nest, sim);
  const site = siteFactors(sim, e);
  out.catchment = site.catchment;
  out.cover = site.cover;
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
    const f = entranceInflow(sim, e, iOverride, nest);
    q += f.q;
    out?.push(f);
  }
  return q + (iOverride >= 0 ? 0 : seepageOf(sim, nest));
}
