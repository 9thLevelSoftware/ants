// The open-voxel graph of the nest: per-chunk passability (shared by all distance fields) and the 26-neighbour
// step rules.
//
// Passable sample = openness >= 128 and not inside the hard group (isBlocked). Steps: 6 face (cost 3),
// 12 edge (cost 4), 8 corner (cost 5): about 3 x the Euclidean length in voxels. CORNER-CUTTING RULE: an edge
// step needs both face neighbours it passes between to be passable; a corner step needs all three face and all
// three edge neighbours. So two cavities touching only along a voxel edge or corner stay disconnected, exactly
// as the marching-cubes mesh (which separates diagonal open corners) shows them.

import type { CarveGrid } from '@/sim/nest/carve/grid';
import { CHUNK3, OPEN_MIN as OPEN_MINImp, chunkKey as chunkKeyImp, keyCx, keyCy, keyCz, type VoxelBox } from '@/sim/nest/carve/keys';

// Hot imports re-bound as local consts: under Vitest (vite-node) an imported binding is read through a getter
// on a module object, several times slower in tight loops; in the browser build both forms are equivalent.
const chunkKey = chunkKeyImp, OPEN_MIN = OPEN_MINImp;

/** Neighbour offsets (26), in a fixed order. */
export const NB_DI = new Int8Array(26), NB_DJ = new Int8Array(26), NB_DK = new Int8Array(26);
/** Step cost per neighbour (3 face, 4 edge, 5 corner). */
export const NB_COST = new Uint8Array(26);
/** Bit mask over the 26 neighbours that must be passable for the step (includes the target itself). */
export const NB_REQ = new Int32Array(26);
/** Index offset inside a chunk for each neighbour (valid when the step stays in the chunk). */
export const NB_LOCAL = new Int32Array(26);
/** Chunk-neighbour code (0..26) for a chunk offset (ox, oy, oz) in -1..1. */
export const chunkCode = (ox: number, oy: number, oz: number): number => (ox + 1) + 3 * (oy + 1) + 9 * (oz + 1);

(function buildNeighbours() {
  const idOf = new Map<string, number>();
  let n = 0;
  for (let dk = -1; dk <= 1; dk++) for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
    if (di === 0 && dj === 0 && dk === 0) continue;
    NB_DI[n] = di; NB_DJ[n] = dj; NB_DK[n] = dk;
    const m = Math.abs(di) + Math.abs(dj) + Math.abs(dk);
    NB_COST[n] = m === 1 ? 3 : m === 2 ? 4 : 5;
    NB_LOCAL[n] = di + (dj << 4) + (dk << 8);
    idOf.set(`${di},${dj},${dk}`, n);
    n++;
  }
  for (let m = 0; m < 26; m++) {
    const di = NB_DI[m], dj = NB_DJ[m], dk = NB_DK[m];
    let req = 0;
    // every non-zero sub-offset (component subset) of the step must be passable
    for (const a of di ? [0, di] : [0]) for (const b of dj ? [0, dj] : [0]) for (const c of dk ? [0, dk] : [0]) {
      if (a === 0 && b === 0 && c === 0) continue;
      req |= 1 << idOf.get(`${a},${b},${c}`)!;
    }
    NB_REQ[m] = req;
  }
})();

export type BlockedFn = (x: number, y: number, z: number) => boolean;

/** Bits returned by passability refreshes: some sample became passable / became impassable. */
export const PASS_GAINED = 1;
export const PASS_LOST = 2;

/** Slots for carve chunks: passability masks and chunk-neighbour links. Derived, rebuildable. */
export class NavChunks {
  readonly grid: CarveGrid;
  readonly isBlocked: BlockedFn | null;
  readonly slotOf = new Map<number, number>();
  readonly keys: number[] = [];
  readonly bi: number[] = [];
  readonly bj: number[] = [];
  readonly bk: number[] = [];
  readonly pass: Uint8Array[] = [];
  /** 27 entries per slot: slot of the neighbouring chunk (code chunkCode), -1 if none; the centre is the slot. */
  nbr = new Int32Array(27 * 64);

  constructor(grid: CarveGrid, isBlocked: BlockedFn | null) {
    this.grid = grid;
    this.isBlocked = isBlocked;
  }

  get count(): number {
    return this.keys.length;
  }

  clear(): void {
    this.slotOf.clear();
    this.keys.length = 0; this.bi.length = 0; this.bj.length = 0; this.bk.length = 0; this.pass.length = 0;
  }

  /** Rebuilds every slot from the grid's stored chunks. */
  rebuildAll(): void {
    this.clear();
    for (const key of this.grid.data.keys) this.ensureSlot(key);
  }

  /** Slot of a chunk key, creating it (with passability computed) if the grid stores the chunk. -1 otherwise. */
  ensureSlot(key: number): number {
    const have = this.slotOf.get(key);
    if (have !== undefined) return have;
    const cx = keyCx(key), cy = keyCy(key), cz = keyCz(key);
    const arr = this.grid.chunk(cx, cy, cz);
    if (arr === undefined) return -1;
    const slot = this.keys.length;
    this.slotOf.set(key, slot);
    this.keys.push(key); this.bi.push(cx * 16); this.bj.push(cy * 16); this.bk.push(cz * 16);
    const m = new Uint8Array(CHUNK3);
    this.pass.push(m);
    this.fillPass(slot, 0, 0, 0, 15, 15, 15);
    if (this.nbr.length < 27 * (slot + 1)) {
      const grown = new Int32Array(this.nbr.length * 2);
      grown.set(this.nbr);
      this.nbr = grown;
    }
    for (let c = 0; c < 27; c++) {
      const ox = (c % 3) - 1, oy = (Math.floor(c / 3) % 3) - 1, oz = Math.floor(c / 9) - 1;
      const ns = c === 13 ? slot : this.slotOf.get(chunkKey(cx + ox, cy + oy, cz + oz)) ?? -1;
      this.nbr[slot * 27 + c] = ns;
      if (ns >= 0 && ns !== slot) this.nbr[ns * 27 + chunkCode(-ox, -oy, -oz)] = slot;
    }
    return slot;
  }

  /** Recomputes passability of local samples [l0, l1] in a slot. Returns PASS_GAINED | PASS_LOST bits. */
  fillPass(slot: number, li0: number, lj0: number, lk0: number, li1: number, lj1: number, lk1: number): number {
    const v = this.grid.voxel, m = this.pass[slot];
    const arr = this.grid.chunk(keyCx(this.keys[slot]), keyCy(this.keys[slot]), keyCz(this.keys[slot]));
    const bi = this.bi[slot], bj = this.bj[slot], bk = this.bk[slot];
    let bits = 0;
    for (let k = lk0; k <= lk1; k++) for (let j = lj0; j <= lj1; j++) for (let i = li0; i <= li1; i++) {
      const idx = i | (j << 4) | (k << 8);
      let p = 0;
      if (arr !== undefined && arr[idx] >= OPEN_MIN) p = this.isBlocked && this.isBlocked((bi + i) * v, (bj + j) * v, (bk + k) * v) ? 0 : 1;
      if (m[idx] !== p) { m[idx] = p; bits |= p === 1 ? PASS_GAINED : PASS_LOST; }
    }
    return bits;
  }

  /**
   * Refreshes passability inside a box of samples (creating slots for new chunks). Returns PASS_GAINED |
   * PASS_LOST bits (0: nothing changed).
   */
  refreshBox(b: VoxelBox): number {
    let bits = 0;
    for (let cz = b.k0 >> 4; cz <= b.k1 >> 4; cz++)
      for (let cy = b.j0 >> 4; cy <= b.j1 >> 4; cy++)
        for (let cx = b.i0 >> 4; cx <= b.i1 >> 4; cx++) {
          const key = chunkKey(cx, cy, cz);
          const existed = this.slotOf.has(key);
          const slot = this.ensureSlot(key);
          if (slot < 0) continue;
          if (!existed) { bits |= PASS_GAINED; continue; } // a new slot only adds passable samples
          const i0 = Math.max(0, b.i0 - cx * 16), i1 = Math.min(15, b.i1 - cx * 16);
          const j0 = Math.max(0, b.j0 - cy * 16), j1 = Math.min(15, b.j1 - cy * 16);
          const k0 = Math.max(0, b.k0 - cz * 16), k1 = Math.min(15, b.k1 - cz * 16);
          bits |= this.fillPass(slot, i0, j0, k0, i1, j1, k1);
        }
    return bits;
  }

  /** Slot of the chunk holding global sample (i, j, k), or -1. */
  slotAt(i: number, j: number, k: number): number {
    const s = this.slotOf.get(chunkKey(i >> 4, j >> 4, k >> 4));
    return s === undefined ? -1 : s;
  }

  passableAt(i: number, j: number, k: number): boolean {
    const s = this.slotAt(i, j, k);
    return s >= 0 && this.pass[s][(i & 15) | ((j & 15) << 4) | ((k & 15) << 8)] === 1;
  }

  /** Bytes held by passability masks. */
  bytes(): number {
    return this.pass.length * CHUNK3 + this.nbr.byteLength;
  }
}

/** Scratch of one neighbourhood scan. */
export interface Neighbourhood {
  /** Bit n set when neighbour n is passable. */
  mask: number;
  slot: Int32Array;
  idx: Int32Array;
}

export function makeNeighbourhood(): Neighbourhood {
  return { mask: 0, slot: new Int32Array(26), idx: new Int32Array(26) };
}

/** Fills the passability mask and neighbour addresses of local sample idx in slot. */
export function scanNeighbours(ch: NavChunks, slot: number, idx: number, out: Neighbourhood): void {
  const li = idx & 15, lj = (idx >> 4) & 15, lk = idx >> 8;
  let mask = 0;
  if (li > 0 && li < 15 && lj > 0 && lj < 15 && lk > 0 && lk < 15) {
    const p = ch.pass[slot];
    for (let n = 0; n < 26; n++) {
      const ni = idx + NB_LOCAL[n];
      out.slot[n] = slot; out.idx[n] = ni;
      if (p[ni] === 1) mask |= 1 << n;
    }
  } else {
    const base = slot * 27;
    for (let n = 0; n < 26; n++) {
      const i = li + NB_DI[n], j = lj + NB_DJ[n], k = lk + NB_DK[n];
      const ox = i < 0 ? -1 : i > 15 ? 1 : 0, oy = j < 0 ? -1 : j > 15 ? 1 : 0, oz = k < 0 ? -1 : k > 15 ? 1 : 0;
      const s = ox === 0 && oy === 0 && oz === 0 ? slot : ch.nbr[base + chunkCode(ox, oy, oz)];
      const ni = (i & 15) | ((j & 15) << 4) | ((k & 15) << 8);
      out.slot[n] = s; out.idx[n] = ni;
      if (s >= 0 && ch.pass[s][ni] === 1) mask |= 1 << n;
    }
  }
  out.mask = mask;
}

/** True if step n is allowed by the corner-cutting rule for this neighbourhood. */
export function stepAllowed(mask: number, n: number): boolean {
  const r = NB_REQ[n];
  return (mask & r) === r;
}
