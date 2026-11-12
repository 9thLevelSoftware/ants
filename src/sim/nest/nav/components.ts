// Connected components of the open-voxel graph (same 26-neighbour corner-cutting rules as the distance
// fields). Labels are canonical: components are numbered in order of their smallest (chunk key, sample index),
// so a loaded game and an uninterrupted one agree. Labels change whenever the carve grid changes; do not
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
  private readonly nh = makeNeighbourhood();

  label(slot: number, idx: number): number {
    const l = this.labels[slot];
    return l === undefined ? -1 : l[idx];
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
    this.valid = true;
  }
}
