// Connected components of the open-voxel graph (same 26-neighbour corner-cutting rules as the distance
// fields). A full compute numbers components in order of their smallest (chunk key, sample index). Carves that
// only open samples are applied incrementally (addBox): new samples get labels joined to their neighbours'
// through a union-find, so a label is canonical only up to renaming. Callers compare labels for equality within
// one state (same component or not), never by value; labels change whenever the carve grid changes: do not
// persist them.

import { CHUNK3 } from '@/sim/nest/carve/keys';
import { makeNeighbourhood, scanNeighbours as scanNeighboursImp, stepAllowed as stepAllowedImp, type NavChunks } from './graph';

// Hot imports re-bound as local consts: under Vitest (vite-node) an imported binding is read through a getter
// on a module object, several times slower in tight loops; in the browser build both forms are equivalent.
const scanNeighbours = scanNeighboursImp, stepAllowed = stepAllowedImp;

export class Components {
  labels: (Int32Array | undefined)[] = [];
  count = 0;
  valid = false;
  /** Union-find parents of labels created or merged by addBox (identity after a full compute). */
  private parent: number[] = [];
  private readonly nh = makeNeighbourhood();

  label(slot: number, idx: number): number {
    const l = this.labels[slot];
    if (l === undefined) return -1;
    const raw = l[idx];
    return raw < 0 ? -1 : this.find(raw);
  }

  private find(x: number): number {
    const p = this.parent;
    let r = x;
    while (p[r] !== r) r = p[r];
    while (p[x] !== r) { const n = p[x]; p[x] = r; x = n; }
    return r;
  }

  private union(a: number, b: number): void {
    const ra = this.find(a), rb = this.find(b);
    if (ra === rb) return;
    if (ra < rb) this.parent[rb] = ra; else this.parent[ra] = rb;
  }

  /**
   * After a carve that only GAINED passable samples inside the box: labels the new samples (flood over unlabelled
   * passable samples, 26 steps with the corner rule) and joins every component they touch. Equivalent to a full
   * compute up to label renaming (only new samples can be unlabelled, and every new step needs passable face
   * neighbours, so connectivity changes only through them).
   */
  addBox(ch: NavChunks, i0: number, j0: number, k0: number, i1: number, j1: number, k1: number): void {
    for (let s = this.labels.length; s < ch.count; s++) this.labels[s] = new Int32Array(CHUNK3).fill(-1);
    const stack: number[] = [];
    for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const s = ch.slotAt(i, j, k);
      if (s < 0) continue;
      const idx = (i & 15) | ((j & 15) << 4) | ((k & 15) << 8);
      const lab = this.labels[s]!;
      if (ch.pass[s][idx] !== 1 || lab[idx] !== -1) continue;
      const id = this.count++;
      this.parent[id] = id;
      lab[idx] = id;
      stack.push((s << 12) | idx);
      while (stack.length) {
        const e = stack.pop()!;
        scanNeighbours(ch, e >>> 12, e & 4095, this.nh);
        const mask = this.nh.mask;
        for (let n = 0; n < 26; n++) {
          if (!stepAllowed(mask, n)) continue;
          const nl = this.labels[this.nh.slot[n]]!, ni = this.nh.idx[n];
          if (nl[ni] === -1) { nl[ni] = id; stack.push((this.nh.slot[n] << 12) | ni); }
          else this.union(id, nl[ni]);
        }
      }
    }
  }

  compute(ch: NavChunks): void {
    this.labels = [];
    for (let s = 0; s < ch.count; s++) this.labels[s] = new Int32Array(CHUNK3).fill(-1);
    const slots = [...ch.keys.keys()].sort((a, b) => ch.keys[a] - ch.keys[b]);
    const stack: number[] = [];
    let next = 0;
    for (const s of slots) {
      const pass = ch.pass[s], lab = this.labels[s]!;
      for (let idx = 0; idx < CHUNK3; idx++) {
        if (pass[idx] !== 1 || lab[idx] !== -1) continue;
        const id = next++;
        lab[idx] = id;
        stack.push((s << 12) | idx);
        while (stack.length) {
          const e = stack.pop()!;
          const es = e >>> 12, ei = e & 4095;
          scanNeighbours(ch, es, ei, this.nh);
          const mask = this.nh.mask;
          for (let n = 0; n < 26; n++) {
            if (!stepAllowed(mask, n)) continue;
            const ns = this.nh.slot[n], ni = this.nh.idx[n];
            const nl = this.labels[ns]!;
            if (nl[ni] !== -1) continue;
            nl[ni] = id;
            stack.push((ns << 12) | ni);
          }
        }
      }
    }
    this.count = next;
    this.parent = Array.from({ length: next }, (_, n) => n);
    this.valid = true;
  }
}
