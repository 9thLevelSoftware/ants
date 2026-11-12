// One number per carve sample (i, j, k): exact in float64 for |i|, |j|, |k| < 16384 (the grid's chunk range).
// Used for chamber seed voxels (Chamber.seedVoxel, persisted) and as Set / Map keys.

const OFF = 16384;
const S = 32768;
const S2 = S * S;

export function packSample(i: number, j: number, k: number): number {
  return (i + OFF) + (j + OFF) * S + (k + OFF) * S2;
}

export function sampleI(key: number): number {
  return (key % S) - OFF;
}

export function sampleJ(key: number): number {
  return (Math.floor(key / S) % S) - OFF;
}

export function sampleK(key: number): number {
  return Math.floor(key / S2) - OFF;
}
