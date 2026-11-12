// Tile and block grid of the decor (pure). A tile (64 BU) is the unit of deterministic placement; a block
// (BLOCK_TILES x BLOCK_TILES tiles) is the unit of streaming and drawing. Keys are integers so they hash cheaply.
import { BLOCK_TILES, DECOR_TILE_BU } from './tuning';

export interface BlockRef {
  key: number;
  bx: number;
  bz: number;
  /** World rectangle, mm. */
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

/** Block keys pack (bx, bz) with bx, bz in [0, 65535]. */
export const blockKey = (bx: number, bz: number): number => bz * 65536 + bx;
export const blockOfKey = (key: number): { bx: number; bz: number } => ({ bx: key % 65536, bz: Math.floor(key / 65536) });

export function tileMm(bu: number): number {
  return DECOR_TILE_BU * bu;
}

export function blockMm(bu: number): number {
  return DECOR_TILE_BU * BLOCK_TILES * bu;
}

export function blockRef(bx: number, bz: number, bu: number): BlockRef {
  const s = blockMm(bu);
  return { key: blockKey(bx, bz), bx, bz, x0: bx * s, z0: bz * s, x1: (bx + 1) * s, z1: (bz + 1) * s };
}

/** Distance in XZ from a point to the nearest point of a rectangle, mm (0 inside). */
export function rectDistance(x: number, z: number, r: { x0: number; z0: number; x1: number; z1: number }): number {
  const dx = Math.max(r.x0 - x, 0, x - r.x1), dz = Math.max(r.z0 - z, 0, z - r.z1);
  return Math.hypot(dx, dz);
}

/**
 * Blocks whose nearest point lies within `radius` of (x, z), inside a world of edge `worldSize`, sorted by that
 * distance (ties by key, so the order never depends on anything else).
 */
export function blocksAround(x: number, z: number, radius: number, worldSize: number, bu: number): { ref: BlockRef; dist: number }[] {
  const s = blockMm(bu), max = Math.max(0, Math.ceil(worldSize / s) - 1);
  const out: { ref: BlockRef; dist: number }[] = [];
  if (radius <= 0) return out;
  const b0x = Math.max(0, Math.floor((x - radius) / s)), b1x = Math.min(max, Math.floor((x + radius) / s));
  const b0z = Math.max(0, Math.floor((z - radius) / s)), b1z = Math.min(max, Math.floor((z + radius) / s));
  for (let bz = b0z; bz <= b1z; bz++) for (let bx = b0x; bx <= b1x; bx++) {
    const ref = blockRef(bx, bz, bu);
    const dist = rectDistance(x, z, ref);
    if (dist <= radius) out.push({ ref, dist });
  }
  out.sort((a, b) => a.dist - b.dist || a.ref.key - b.ref.key);
  return out;
}

/** Tile indices covered by a block. */
export function tilesOfBlock(b: BlockRef): { tx: number; tz: number }[] {
  const out: { tx: number; tz: number }[] = [];
  for (let j = 0; j < BLOCK_TILES; j++) for (let i = 0; i < BLOCK_TILES; i++) out.push({ tx: b.bx * BLOCK_TILES + i, tz: b.bz * BLOCK_TILES + j });
  return out;
}
