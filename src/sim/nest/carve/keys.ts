// Chunk keys and voxel indexing for the carve grid.
//
// Samples sit on voxel CORNERS: sample (i, j, k) is at world (i * voxel, j * voxel, k * voxel) mm.
// Chunk (cx, cy, cz) owns the 16^3 samples i in [16 cx, 16 cx + 15] (same for j, k).
// Inside a chunk, sample (li, lj, lk) is at index li | lj << 4 | lk << 8.
//
// The numeric key is part of the SAVE FORMAT (CarveData.keys): never change the encoding.
// Chunk coordinates must lie in [-1024, 1023] on every axis (16 384 voxels = 8 192 BU each way).

export const CHUNK = 16;
export const CHUNK3 = CHUNK * CHUNK * CHUNK;
/** Openness bytes above this value are open (iso level 127.5). */
export const OPEN_MIN = 128;
export const ISO = 127.5;

/**
 * Fraction of a sample's voxel that lies inside the carved iso surface, by openness byte: a box filter one
 * voxel wide across the ramp (the ramp is 2 voxels wide, so o = 63.75 -> 0 and o = 191.25 -> 1).
 */
export const OPEN_FRACTION = new Float64Array(256);
for (let o = 0; o < 256; o++) OPEN_FRACTION[o] = Math.min(1, Math.max(0, o / 127.5 - 0.5));

const KEY_OFFSET = 1024;
const KEY_SPAN = 2048;
const KEY_SPAN2 = KEY_SPAN * KEY_SPAN;

/** Integer key of chunk (cx, cy, cz). Exact in float64 (< 2^33). */
export function chunkKey(cx: number, cy: number, cz: number): number {
  return (cx + KEY_OFFSET) + (cy + KEY_OFFSET) * KEY_SPAN + (cz + KEY_OFFSET) * KEY_SPAN2;
}

export function keyCx(key: number): number {
  return (key % KEY_SPAN) - KEY_OFFSET;
}
export function keyCy(key: number): number {
  return (Math.floor(key / KEY_SPAN) % KEY_SPAN) - KEY_OFFSET;
}
export function keyCz(key: number): number {
  return Math.floor(key / KEY_SPAN2) - KEY_OFFSET;
}

/** Index of local sample (li, lj, lk) inside a chunk array. */
export function localIndex(li: number, lj: number, lk: number): number {
  return li | (lj << 4) | (lk << 8);
}

/** Inclusive box of sample indices. */
export interface VoxelBox {
  i0: number; j0: number; k0: number;
  i1: number; j1: number; k1: number;
}

export function emptyBox(): VoxelBox {
  return { i0: 1e9, j0: 1e9, k0: 1e9, i1: -1e9, j1: -1e9, k1: -1e9 };
}

export function boxIsEmpty(b: VoxelBox): boolean {
  return b.i1 < b.i0;
}

/**
 * Chunk keys whose MESH reads any sample in the box. A chunk meshes the cells between its samples 0..16 and
 * takes central-difference normals, so it reads samples -1..17: sample s is read by chunks c with
 * 16c - 1 <= s <= 16c + 17. Sorted ascending (deterministic).
 */
export function meshChunksForBox(b: VoxelBox): number[] {
  const out: number[] = [];
  if (boxIsEmpty(b)) return out;
  const c0 = (s: number) => Math.ceil((s - 17) / CHUNK);
  const c1 = (s: number) => Math.floor((s + 1) / CHUNK);
  for (let cz = c0(b.k0); cz <= c1(b.k1); cz++)
    for (let cy = c0(b.j0); cy <= c1(b.j1); cy++)
      for (let cx = c0(b.i0); cx <= c1(b.i1); cx++) out.push(chunkKey(cx, cy, cz));
  return out.sort((a, c) => a - c);
}
