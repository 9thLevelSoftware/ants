// Read-only nest queries for the architect (later task), the UI and the debug API: free wall space, chamber
// stats, nest bounds, the voxel query of GDD 03 App. B.

import type { Vec3 } from '@/core/math/vec3';
import type { ChamberLoad, ChamberType, MaterialId, Nest, Sim } from '@/sim/types';
import { OPEN_MIN } from './carve/keys';
import { nestSampleBox } from './chambers/detect';
import { nestComponents } from './entrances';
import { nestRuntime } from './runtime';

export interface WallSpot {
  /** Open sample next to the wall, mm. */
  pos: Vec3;
  /** Unit horizontal normal out of the wall (into the cavity). */
  normal: Vec3;
  /** Depth below the surface, BU. */
  depthBu: number;
}

const H4 = [1, 0, -1, 0, 0, 1, 0, -1];

/**
 * Walkable wall spots of the nest with a horizontal solid neighbour and a floor below (architect candidates,
 * GDD 03 §8.4 a): every `stride`-th qualifying open sample in fixed scan order, at most `max`.
 */
export function wallSpots(sim: Sim, nestId: number, max: number, stride = 1): WallSpot[] {
  const nest = sim.stores.nests.get(nestId);
  if (!nest) return [];
  const carve = sim.carve, v = carve.voxel, bu = sim.world.bu, b = nestSampleBox(sim, nest);
  const comps = nestComponents(sim, nest), out: WallSpot[] = [];
  let n = 0;
  const keys = [...carve.data.keys].sort((a, c) => a - c);
  for (const key of keys) {
    if (out.length >= max) break;
    carve.forEachOpenSample(key, (i, j, k) => {
      if (out.length >= max || i < b.i0 || i > b.i1 || j < b.j0 || j > b.j1 || k < b.k0 || k > b.k1) return;
      if (carve.sampleAt(i, j - 1, k) >= OPEN_MIN) return; // needs a floor below
      for (let d = 0; d < 8; d += 2) {
        if (carve.sampleAt(i + H4[d], j, k + H4[d + 1]) >= OPEN_MIN) continue;
        const pos = { x: i * v, y: j * v, z: k * v };
        if (sim.field.substrateXYZ(pos.x, pos.y, pos.z) >= 0 || !comps.has(sim.nestNav.componentAt(pos))) return;
        if (n++ % stride !== 0) return;
        out.push({ pos, normal: { x: -H4[d], y: 0, z: -H4[d + 1] }, depthBu: (sim.field.height(pos.x, pos.z) - pos.y) / bu });
        return;
      }
    });
  }
  return out;
}

export interface ChamberStat {
  id: number;
  type: ChamberType;
  volume: number;
  depthBu: number;
  covered: boolean;
  capacity: ChamberLoad;
  occupancy: ChamberLoad;
  temp: number;
  humidity: number;
}

export function chamberStats(sim: Sim, nestId: number): ChamberStat[] {
  const nest = sim.stores.nests.get(nestId);
  return (nest?.chambers ?? []).map((c) => ({
    id: c.id, type: c.type, volume: c.volume, depthBu: c.depthBu, covered: c.covered,
    capacity: { ...c.capacity }, occupancy: { ...c.occupancy }, temp: c.temp, humidity: c.humidity,
  }));
}

/** Footprint and depth limits of a nest (template) and its origin, mm. */
export function nestBounds(sim: Sim, nest: Nest): { min: Vec3; max: Vec3 } {
  const b = nestSampleBox(sim, nest), v = sim.carve.voxel;
  return { min: { x: b.i0 * v, y: b.j0 * v, z: b.k0 * v }, max: { x: b.i1 * v, y: b.j1 * v, z: b.k1 * v } };
}

/** GDD 03 App. B `voxel(p)`: openness byte and flags of the sample nearest p, material at p. */
export function voxelAt(sim: Sim, p: Vec3): { open: number; flags: number; material: MaterialId } {
  const v = sim.carve.voxel, i = Math.round(p.x / v), j = Math.round(p.y / v), k = Math.round(p.z / v);
  return { open: sim.carve.sampleAt(i, j, k), flags: nestRuntime(sim).flags.get(i, j, k), material: sim.field.materialAt(p) };
}
