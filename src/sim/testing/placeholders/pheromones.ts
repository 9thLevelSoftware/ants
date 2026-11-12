// Minimal PheromoneField over SimState.phero: sparse 16^3-cell chunks per (colony, channel), deposit/sample/
// decay/scale. No diffusion and no directional sensing (sense() returns zero direction). Replaced by
// src/sim/pheromones (phero task), which keeps the same persisted layout.

import type { Vec3 } from '@/core/math/vec3';
import type { PheroChannel, PheromoneField, PheromoneLayer, PheromoneState } from '@/sim/types';

/** Chunk-key packing shared with the carve grid: (c + 512) + (c + 512) * 1024 + (c + 512) * 1048576. */
const KEY_OFF = 512;
const KEY_Y = 1024;
const KEY_Z = 1048576;

export function pheroChunkKey(cx: number, cy: number, cz: number): number {
  return (cx + KEY_OFF) + (cy + KEY_OFF) * KEY_Y + (cz + KEY_OFF) * KEY_Z;
}

export function createPlaceholderPheromones(data: PheromoneState): PheromoneField {
  const n = data.chunkCells;
  const n3 = n * n * n;
  const inv = 1 / data.cell;
  // runtime index: layer -> (key -> chunk index), rebuilt from the persisted arrays
  const index = new Map<PheromoneLayer, Map<number, number>>();
  for (const layer of data.layers) {
    const m = new Map<number, number>();
    layer.keys.forEach((k, i) => m.set(k, i));
    index.set(layer, m);
  }

  const findLayer = (colony: number, channel: PheroChannel, create: boolean): PheromoneLayer | undefined => {
    for (const l of data.layers) if (l.colony === colony && l.channel === channel) return l;
    if (!create) return undefined;
    const l: PheromoneLayer = { colony, channel, keys: [], chunks: [] };
    data.layers.push(l);
    index.set(l, new Map());
    return l;
  };

  const cellRef = (layer: PheromoneLayer, p: Vec3, create: boolean): { arr: Float32Array; i: number } | null => {
    const ix = Math.floor(p.x * inv), iy = Math.floor(p.y * inv), iz = Math.floor(p.z * inv);
    const cx = Math.floor(ix / n), cy = Math.floor(iy / n), cz = Math.floor(iz / n);
    const key = pheroChunkKey(cx, cy, cz);
    const m = index.get(layer) as Map<number, number>;
    let ci = m.get(key);
    if (ci === undefined) {
      if (!create) return null;
      ci = layer.keys.length;
      layer.keys.push(key);
      layer.chunks.push(new Float32Array(n3));
      m.set(key, ci);
    }
    const lx = ix - cx * n, ly = iy - cy * n, lz = iz - cz * n;
    return { arr: layer.chunks[ci], i: lx + ly * n + lz * n * n };
  };

  return {
    deposit(colony, channel, p, amount) {
      if (!(amount > 0)) return;
      const ref = cellRef(findLayer(colony, channel, true) as PheromoneLayer, p, true);
      if (ref) ref.arr[ref.i] += amount;
    },
    sample(colony, channel, p) {
      const layer = findLayer(colony, channel, false);
      const ref = layer ? cellRef(layer, p, false) : null;
      return ref ? ref.arr[ref.i] : 0;
    },
    sense(colony, channel, p, _fwd, _up, out) {
      out.x = 0; out.y = 0; out.z = 0;
      return this.sample(colony, channel, p);
    },
    decay(channel, factor) {
      for (const l of data.layers) {
        if (l.channel !== channel) continue;
        for (const c of l.chunks) for (let i = 0; i < c.length; i++) c[i] *= factor;
      }
    },
    scaleRegion(channel, center, radius, factor) {
      const q = { x: 0, y: 0, z: 0 };
      const steps = Math.ceil(radius * inv);
      for (const l of data.layers) {
        if (l.channel !== channel) continue;
        for (let dz = -steps; dz <= steps; dz++) for (let dy = -steps; dy <= steps; dy++) for (let dx = -steps; dx <= steps; dx++) {
          if ((dx * dx + dy * dy + dz * dz) * data.cell * data.cell > radius * radius) continue;
          q.x = center.x + dx * data.cell; q.y = center.y + dy * data.cell; q.z = center.z + dz * data.cell;
          const ref = cellRef(l, q, false);
          if (ref) ref.arr[ref.i] *= factor;
        }
      }
    },
    clearColony(colony) {
      for (let i = data.layers.length - 1; i >= 0; i--) {
        if (data.layers[i].colony === colony) {
          index.delete(data.layers[i]);
          data.layers.splice(i, 1);
        }
      }
    },
  };
}
