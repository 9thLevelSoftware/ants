// Remembers where the colony carved recently (GDD 08 11.5: freshly carved walls look darker and damper for one game
// hour). Rebuilt chunks bake the carving tick per vertex; the shader fades the look with the current tick, so no
// rebuild is needed when it expires.
//
// An active colony keeps ~1000 recent edits and the lookup runs per vertex of every rebuilt chunk, so the edit
// boxes are bucketed in a coarse grid (one cell per chunk edge by default): a lookup scans only its cell's list.
import type { CarveEdit } from '../simAdapter';
import { NOT_FRESH } from '../mesh/chunkBuild';

interface Entry { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number; tick: number; cells: number[] }

/** Cells per axis of the key space (coordinates are offset by half of it, so negative cells work). */
const SPAN = 1 << 16;
const OFF = SPAN / 2;
/** An edit box spanning more cells than this is kept in a separate list scanned by every lookup. */
const MAX_CELLS = 64;

export class FreshWalls {
  /** Every live entry, oldest first (insertion order). */
  private entries: Entry[] = [];
  private head = 0;
  private cells = new Map<number, Entry[]>();
  private big: Entry[] = [];

  constructor(private readonly durationTicks: number, private readonly padMm: number, private readonly cellMm = 32) {}

  add(e: CarveEdit, tick: number): void {
    if (e.kind !== 'carve') return;
    const p = this.padMm;
    const en: Entry = { x0: e.x0 - p, y0: e.y0 - p, z0: e.z0 - p, x1: e.x1 + p, y1: e.y1 + p, z1: e.z1 + p, tick, cells: [] };
    // a tick older than the newest entry would break the oldest-first order the pruning relies on: rebuild then
    const last = this.entries[this.entries.length - 1];
    this.entries.push(en);
    if (last && tick < last.tick) { this.rebucket(); return; }
    this.insert(en);
  }

  /** Drops entries older than the fresh look. */
  prune(tick: number): void {
    const limit = tick - this.durationTicks;
    let dropped = false;
    while (this.head < this.entries.length && this.entries[this.head].tick < limit) {
      this.removeFromCells(this.entries[this.head]);
      this.head++;
      dropped = true;
    }
    if (dropped && this.head > 256 && this.head * 2 > this.entries.length) {
      this.entries = this.entries.slice(this.head);
      this.head = 0;
    }
  }

  clear(): void {
    this.entries.length = 0;
    this.head = 0;
    this.cells.clear();
    this.big.length = 0;
  }

  get size(): number {
    return this.entries.length - this.head;
  }

  /** Newest carving tick at a point, or NOT_FRESH. */
  readonly carvedAt = (x: number, y: number, z: number): number => {
    let t = NOT_FRESH;
    const c = this.size === 0 ? undefined : this.cells.get(this.cellKey(this.cell(x), this.cell(y), this.cell(z)));
    if (c) t = newestContaining(c, x, y, z, t);
    if (this.big.length) t = newestContaining(this.big, x, y, z, t);
    return t;
  };

  private cell(v: number): number {
    return Math.floor(v / this.cellMm);
  }

  private cellKey(i: number, j: number, k: number): number {
    return (i + OFF) + SPAN * ((j + OFF) + SPAN * (k + OFF));
  }

  private insert(e: Entry): void {
    const i0 = this.cell(e.x0), i1 = this.cell(e.x1), j0 = this.cell(e.y0), j1 = this.cell(e.y1), k0 = this.cell(e.z0), k1 = this.cell(e.z1);
    if ((i1 - i0 + 1) * (j1 - j0 + 1) * (k1 - k0 + 1) > MAX_CELLS) { this.big.push(e); return; }
    for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const key = this.cellKey(i, j, k);
      let list = this.cells.get(key);
      if (!list) { list = []; this.cells.set(key, list); }
      list.push(e);
      e.cells.push(key);
    }
  }

  private removeFromCells(e: Entry): void {
    if (e.cells.length === 0) { removeItem(this.big, e); return; }
    for (const key of e.cells) {
      const list = this.cells.get(key);
      if (!list) continue;
      removeItem(list, e);
      if (list.length === 0) this.cells.delete(key);
    }
  }

  private rebucket(): void {
    const live = this.entries.slice(this.head).sort((a, b) => a.tick - b.tick);
    this.clear();
    for (const e of live) { e.cells = []; this.entries.push(e); this.insert(e); }
  }
}

/** Lists are in insertion (tick) order: scan from the newest and stop at the first box containing the point. */
function newestContaining(list: readonly Entry[], x: number, y: number, z: number, t: number): number {
  for (let i = list.length - 1; i >= 0; i--) {
    const e = list[i];
    if (e.tick <= t) return t;
    if (x >= e.x0 && x <= e.x1 && y >= e.y0 && y <= e.y1 && z >= e.z0 && z <= e.z1) return e.tick;
  }
  return t;
}

/** Removes e (expected near the front: the oldest entries expire first). */
function removeItem(list: Entry[], e: Entry): void {
  const i = list.indexOf(e);
  if (i === 0) list.shift(); else if (i > 0) list.splice(i, 1);
}
