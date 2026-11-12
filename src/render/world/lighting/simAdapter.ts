// THE ONE PLACE the world renderer reads simulation data. The contracts in src/sim/types are still being
// synchronised, so every field name the renderer depends on is read here; a rename costs one edit in this file.
// Read-only: nothing here writes to the simulation. Imports from src/sim are types, the PrimFlag/MATERIAL_IDS
// constants of the type barrel, and the environment queries (calendarNow, sunDirection, lightLevel).
import { Quaternion, Vector3 } from 'three';
import * as envQueries from '@/sim/environment';
import type {
  Breach, CalendarDerived, Mound, ObjectStateChange, Primitive, Sim, WeatherState, WorldData, ZoneType,
} from '@/sim/types';
import { PrimFlag } from '@/sim/types';
import type { HoleProbe } from '../terrain/holeMask';

// ---------------------------------------------------------------------------------------------------- terrain

/** Plain terrain data the terrain renderer uploads (heights include runtime deformation tiles). */
export interface TerrainSource {
  worldSize: number;
  bu: number;
  /** Height grid: mm per cell, grid points, heights mm (row-major, z rows). */
  cell: number;
  nx: number;
  nz: number;
  heights: Float32Array;
  /** Surface material code per cell (MATERIAL_IDS index). */
  matCell: number;
  matNx: number;
  matNz: number;
  matCodes: Uint8Array;
  /** Cells where the terrain is removed (drains, holes), non-zero = hole. */
  holes: { cell: number; nx: number; nz: number; data: Uint8Array } | null;
}

/** Edge of a height-deformation tile in height cells (GDD 04 App. A: 32 x 32 cells, 1/16 mm units). */
export const HEIGHT_DELTA_TILE = 32;
export const HEIGHT_DELTA_UNIT_MM = 1 / 16;

type DeltaTile = { tileIndex: number; data: Int16Array };

function heightDeltaTiles(sim: Sim | null | undefined): readonly DeltaTile[] {
  return (sim?.state.worldDelta as { heightDeltas?: DeltaTile[] } | undefined)?.heightDeltas ?? [];
}

/**
 * Terrain source of a world, with the simulation's deformation tiles applied when a sim is given.
 * Tile layout ASSUMPTION (not specified by the contracts): tileIndex = tz * ceil(nx / 32) + tx, data row-major
 * over the 32 x 32 grid points of the tile.
 */
export function terrainSource(world: WorldData, sim?: Sim | null): TerrainSource {
  const hf = world.terrain, g = world.ground.surface;
  const heights = new Float32Array(hf.data);
  applyHeightDeltas(heights, hf.nx, hf.nz, heightDeltaTiles(sim));
  const holes = world.terrainHoles ? { cell: world.terrainHoles.cell, nx: world.terrainHoles.nx, nz: world.terrainHoles.nz, data: world.terrainHoles.data } : null;
  return {
    worldSize: world.size, bu: world.bu, cell: hf.cell, nx: hf.nx, nz: hf.nz, heights,
    matCell: g.cell, matNx: g.nx, matNz: g.nz, matCodes: g.data, holes,
  };
}

export function applyHeightDeltas(heights: Float32Array, nx: number, nz: number, tiles: readonly DeltaTile[]): void {
  const T = HEIGHT_DELTA_TILE, tilesX = Math.ceil(nx / T);
  for (const t of tiles) {
    const tx = t.tileIndex % tilesX, tz = Math.floor(t.tileIndex / tilesX);
    for (let j = 0; j < T; j++) {
      const iz = tz * T + j;
      if (iz >= nz) break;
      for (let i = 0; i < T; i++) {
        const ix = tx * T + i;
        if (ix >= nx) break;
        heights[iz * nx + ix] += (t.data[j * T + i] ?? 0) * HEIGHT_DELTA_UNIT_MM;
      }
    }
  }
}

/** Cheap change signature of the deformation tiles (count + checksum of a few samples). */
export function heightDeltaSignature(sim: Sim | null | undefined): number {
  const tiles = heightDeltaTiles(sim);
  let s = tiles.length;
  for (const t of tiles) {
    s = (s * 31 + t.tileIndex) | 0;
    for (let i = 0; i < t.data.length; i += 37) s = (s * 31 + t.data[i]) | 0;
  }
  return s;
}

// ---------------------------------------------------------------------------------------------------- primitives

export function staticPrims(world: WorldData): readonly Primitive[] {
  return world.prims;
}

/** Dynamic primitives (mounds as prims, moved objects, toys). Contract name `dynPrims` (was `dynamicPrims`). */
export function dynamicPrims(sim: Sim | null | undefined): readonly Primitive[] {
  const d = sim?.state.worldDelta as { dynPrims?: Primitive[]; dynamicPrims?: Primitive[] } | undefined;
  return d?.dynPrims ?? d?.dynamicPrims ?? [];
}

export function isDiggablePrim(p: Primitive): boolean {
  return (p.flags & PrimFlag.DIGGABLE) !== 0;
}

/** Object moves recorded by the simulation (moved car, opened door ...). */
export function objectMoves(sim: Sim | null | undefined): readonly ObjectStateChange[] {
  return sim?.state.worldDelta.objectStates ?? [];
}

const qa = new Quaternion(), qb = new Quaternion(), qc = new Quaternion(), va = new Vector3();

/**
 * Static primitives of moved objects with their new transforms (prim follows its object rigidly). Returns
 * replacement copies keyed by primitive id; objects without a recorded pos/rot are skipped.
 */
export function movedStaticPrims(world: WorldData, moves: readonly ObjectStateChange[], out: Map<number, Primitive>): Map<number, Primitive> {
  out.clear();
  for (const m of moves) {
    if (!m.pos && !m.rot) continue;
    const obj = world.objects.find((o) => o.id === m.objectId);
    if (!obj) continue;
    const newPos = m.pos ?? obj.pos, newRot = m.rot ?? obj.rot;
    // delta = newRot * oldRot^-1
    qa.set(obj.rot.x, obj.rot.y, obj.rot.z, obj.rot.w).invert();
    qb.set(newRot.x, newRot.y, newRot.z, newRot.w).multiply(qa);
    for (let i = obj.primStart; i < obj.primStart + obj.primCount; i++) {
      const p = world.prims[i];
      if (!p) continue;
      va.set(p.pos.x - obj.pos.x, p.pos.y - obj.pos.y, p.pos.z - obj.pos.z).applyQuaternion(qb);
      qc.set(p.rot.x, p.rot.y, p.rot.z, p.rot.w).premultiply(qb);
      out.set(p.id, {
        ...p,
        pos: { x: newPos.x + va.x, y: newPos.y + va.y, z: newPos.z + va.z },
        rot: { x: qc.x, y: qc.y, z: qc.z, w: qc.w },
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------- nest data

export function mounds(sim: Sim | null | undefined): readonly Mound[] {
  return sim?.state.worldDelta.mounds ?? [];
}

/** Change signature of one mound (the nest system rewrites h[] in place every batch). */
export function moundSignature(m: Mound): string {
  return `${m.n}|${m.cell}|${m.volume}|${m.absorbed}|${m.lastBatchTick}|${m.centerX}|${m.centerZ}`;
}

export function breaches(sim: Sim | null | undefined): readonly Breach[] {
  return sim?.carve?.breaches ?? sim?.state.worldDelta.carve.breaches ?? [];
}

/** Minimal carve-grid view: version counter and change listener (boxes in sample indices). */
export interface CarveView {
  voxel: number;
  version: number;
  addListener(fn: (c: { box: { i0: number; j0: number; k0: number; i1: number; j1: number; k1: number } }) => void): void;
  removeListener(fn: (c: { box: { i0: number; j0: number; k0: number; i1: number; j1: number; k1: number } }) => void): void;
}

export function carveView(sim: Sim | null | undefined): CarveView | null {
  const c = sim?.carve as unknown as Partial<CarveView> | undefined;
  return c && typeof c.addListener === 'function' && typeof c.removeListener === 'function' ? (c as CarveView) : null;
}

/** Depth below the terrain surface that must be carved for the ground to count as opened (kernel holeProbeDepth). */
export const HOLE_PROBE_DEPTH_BU = 0.1;
/**
 * The terrain hole is shrunk by this margin inside the carved cavity, so the terrain lip always overhangs the top
 * of the cavity wall mesh (marching-cubes chordal error, the nest renderer's skin discard) and no gap opens onto
 * the sky (spike-nest.md 5.6: breach margin 0.5 mm > cavity skin 0.2 mm).
 */
export const HOLE_MARGIN_BU = 0.125;

/**
 * Signed openness of the ground at (x, z): the carve cavity term just below the terrain surface minus the margin
 * (> 0 = carved through). The cavity term (not the smoothed full field, whose fillet rounds the rim outward) is
 * what the cavity meshes are built from, so the terrain hole and the tunnel walls meet.
 */
export function fieldHoleProbe(sim: Sim | null | undefined): HoleProbe | null {
  const f = sim?.field as unknown as { height?(x: number, z: number): number; cavity?(p: { x: number; y: number; z: number }): number } | undefined;
  const c = sim?.carve as unknown as { cavity?(x: number, y: number, z: number): number } | undefined;
  if (!f || typeof f.height !== 'function') return null;
  const bu = sim?.world.bu ?? 4;
  const d = HOLE_PROBE_DEPTH_BU * bu, margin = HOLE_MARGIN_BU * bu;
  const h = f.height.bind(f);
  if (c && typeof c.cavity === 'function') return (x, z) => c.cavity!(x, h(x, z) - d, z) - margin;
  if (typeof f.cavity !== 'function') return null;
  const p = { x: 0, y: 0, z: 0 };
  return (x, z) => { p.x = x; p.y = h(x, z) - d; p.z = z; return f.cavity!(p) - margin; };
}

/** Fallback probe from breach spheres only (no carve grid available): open inside any sphere, minus the margin. */
export function breachHoleProbe(list: () => readonly Breach[], height: (x: number, z: number) => number, bu: number): HoleProbe {
  const depth = HOLE_PROBE_DEPTH_BU * bu, margin = HOLE_MARGIN_BU * bu;
  return (x, z) => {
    const y = height(x, z) - depth;
    let best = -1e9;
    for (const b of list()) {
      const v = b.r - Math.hypot(x - b.pos.x, y - b.pos.y, z - b.pos.z);
      if (v > best) best = v;
    }
    return best - margin;
  };
}

// ---------------------------------------------------------------------------------------------------- zones

export function zoneTypeAt(world: WorldData, x: number, z: number): ZoneType {
  const m = world.maps.zone;
  const ix = Math.floor(x / m.cell), iz = Math.floor(z / m.cell);
  const id = ix >= 0 && iz >= 0 && ix < m.nx && iz < m.nz ? m.data[iz * m.nx + ix] : (world.zones[0]?.id ?? 0);
  return world.zones.find((zd) => zd.id === id)?.type ?? world.zones[0]?.type ?? 'lawn';
}

// ---------------------------------------------------------------------------------------------------- environment

/** What the lighting needs from the environment, in render-friendly form. */
export interface EnvSample {
  /** Hour of day 0..24. */
  hour: number;
  /** Year fraction 0..1. */
  yearFrac: number;
  /** Unit vector toward the sun (y < 0 below the horizon). */
  sunDir: Vector3;
  /** Sun elevation, degrees (negative below the horizon). */
  sunElevDeg: number;
  /** Unit vector toward the moon. */
  moonDir: Vector3;
  moonIllum: number;
  /** GDD 06 1.4 `light` 0..1 (daylight x cloud attenuation, or moonlight). */
  light: number;
  weather: WeatherState;
  /** Cloud cover 0..1. */
  cloud: number;
  /** Weather fog 0..1 (thickens the haze). */
  fog: number;
  precip: number;
  /** Wind at 2 m, m/s, and unit direction in XZ. */
  wind: number;
  windDir: Vector3;
}

export function createEnvSample(): EnvSample {
  return {
    hour: 12, yearFrac: 0.3, sunDir: new Vector3(0, 1, 0), sunElevDeg: 60, moonDir: new Vector3(0, 1, 0), moonIllum: 0.5,
    light: 1, weather: 'clear', cloud: 0.1, fog: 0, precip: 0, wind: 1, windDir: new Vector3(1, 0, 0),
  };
}

/** Peak (noon) sun elevation at the shortest and longest day, degrees: about 52 degrees N. */
export const SUN_PEAK_ELEV_DEG = { minDay: 15, maxDay: 61 } as const;
/** Lowest sun elevation at midnight, degrees (drives twilight / night grading). */
export const SUN_NIGHT_DEPTH_DEG = 30;
/** Moon elevation at its highest, degrees. */
export const MOON_PEAK_ELEV_DEG = 45;

/**
 * Sun direction from the calendar (GDD 06 1.3/1.4): rises in the east (+X) at SR, culminates in the south (+Z) at
 * 12:00, sets in the west (-X) at SS. Peak elevation follows day length (8 h -> 15 deg, 16 h -> 61 deg).
 */
export function sunFromCalendar(hour: number, sunrise: number, sunset: number, out: Vector3): number {
  const L = Math.max(1e-3, sunset - sunrise);
  const peak = SUN_PEAK_ELEV_DEG.minDay + (SUN_PEAK_ELEV_DEG.maxDay - SUN_PEAK_ELEV_DEG.minDay) * Math.min(1, Math.max(0, (L - 8) / 8));
  let elev: number, azim: number;
  if (hour >= sunrise && hour <= sunset) {
    const t = (hour - sunrise) / L;
    elev = peak * Math.sin(Math.PI * t);
    azim = Math.PI * t;
  } else {
    const night = 24 - L;
    const t = (((hour - sunset) % 24) + 24) % 24 / night;
    elev = -SUN_NIGHT_DEPTH_DEG * Math.sin(Math.PI * Math.min(1, t));
    azim = Math.PI + Math.PI * Math.min(1, t); // below the horizon, west -> north -> east
  }
  const e = (elev * Math.PI) / 180;
  out.set(Math.cos(azim) * Math.cos(e), Math.sin(e), Math.sin(azim) * Math.cos(e)).normalize();
  return elev;
}

/** Moon: opposite the sun in azimuth, up while the sun is down (a stylised but stable sky). */
export function moonFromSun(sunDir: Vector3, out: Vector3): Vector3 {
  const sunElev = Math.asin(Math.max(-1, Math.min(1, sunDir.y)));
  const elev = Math.max(10 * Math.PI / 180, Math.min(MOON_PEAK_ELEV_DEG * Math.PI / 180, -sunElev * 1.5));
  const h = Math.hypot(sunDir.x, sunDir.z) || 1;
  return out.set((-sunDir.x / h) * Math.cos(elev), Math.sin(elev), (-sunDir.z / h) * Math.cos(elev)).normalize();
}

type EnvApi = {
  calendarNow?: (sim: Sim) => CalendarDerived;
  sunDirection?: (sim: Sim, out: { x: number; y: number; z: number }) => { x: number; y: number; z: number };
  lightLevel?: (sim: Sim, p: { x: number; y: number; z: number }) => number;
};
const env = envQueries as unknown as EnvApi;
const tmp = { x: 0, y: 0, z: 0 };

/** Fills `out` from the simulation's environment (calendar, sun, light, weather). */
export function readEnvironment(sim: Sim, camPos: { x: number; y: number; z: number }, out: EnvSample): EnvSample {
  const cal = env.calendarNow?.(sim);
  out.hour = cal?.hour ?? 12;
  out.yearFrac = cal?.yearFrac ?? 0.3;
  out.moonIllum = cal?.moonIllum ?? 0.5;
  const sr = cal?.sunrise ?? 6, ss = cal?.sunset ?? 18;
  // The environment stub answers "straight up" until env-core lands; a real sun is never exactly at the zenith
  // at this latitude, so that answer means "not implemented": use the calendar-based sun instead.
  const s = env.sunDirection?.(sim, tmp);
  if (s && !(s.x === 0 && s.z === 0)) {
    out.sunDir.set(s.x, s.y, s.z).normalize();
    out.sunElevDeg = (Math.asin(Math.max(-1, Math.min(1, out.sunDir.y))) * 180) / Math.PI;
  } else {
    out.sunElevDeg = sunFromCalendar(out.hour, sr, ss, out.sunDir);
  }
  moonFromSun(out.sunDir, out.moonDir);
  const w = sim.state.env.weather;
  out.weather = w.state;
  out.cloud = w.cloud;
  out.fog = w.fogDensity;
  out.precip = w.precip;
  out.wind = w.wind2m;
  out.windDir.set(w.windDir.x, 0, w.windDir.z);
  if (out.windDir.lengthSq() < 1e-6) out.windDir.set(1, 0, 0);
  out.windDir.normalize();
  out.light = env.lightLevel ? env.lightLevel(sim, camPos) : (cal?.daylight ?? 1);
  return out;
}
