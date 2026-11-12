// Human walking lanes and activity areas of the kitchen (GDD 04 §4.2 step 3, §15.2), derived from a finished
// WorldData so the Tier 2 human-activity system can use them without a new contract field (reported need:
// `WorldStatic.lanes`). A 250 mm human grid over the room floor blocks cells under anything taller than 150 mm
// (furniture, appliances, the table) within a 500 mm body width; lanes are shortest 8-neighbour paths from the
// back door to every human node (counter, sink, fridge, cooker, table seats, pet bowl, bin). The broom and
// vacuum cover the free floor, the wipe covers counter and table tops, the crevice pass follows the skirting.

import type { Primitive, WorldData } from '@/sim/types';
import { entryOf, primColumn, type ColumnHit } from '../../kit/column';
import { MinHeap } from '../../kit/heap';

export const HUMAN_GRID = {
  cell: 250,
  /** Objects taller than this above the floor block the human grid (GDD 04 step 3). */
  blockAbove: 150,
  /** Half the walking width a lane keeps clear, mm. */
  halfBody: 125,
  /** Head height: hovering things above it do not block. */
  headroom: 1800,
};

type Rect = { x0: number; x1: number; z0: number; z1: number };
export type HumanNodeKind = 'door' | 'counter' | 'sink' | 'fridge' | 'cooker' | 'seat' | 'pet-bowl' | 'bin';

export interface InteriorHumanAreas {
  room: Rect;
  floorY: number;
  cell: number; nx: number; nz: number;
  /** 1 = a person can stand here (500 mm square clear of tall objects). Row-major nx x nz from room.x0, room.z0. */
  free: Uint8Array;
  nodes: { kind: HumanNodeKind; x: number; z: number; cell: number }[];
  /** Lanes from the door to each node (cell centres, door first); a node without a lane is listed in `unreachable`. */
  lanes: { to: HumanNodeKind; points: { x: number; z: number }[]; lengthMm: number }[];
  unreachable: HumanNodeKind[];
  /** Wipe areas: counter and table tops (world rects, with their top height). */
  wipe: (Rect & { y: number })[];
  /** Crevice pass of the vacuum: skirting boards (world rects). */
  crevice: Rect[];
}

const _col: ColumnHit = { hit: false, bottom: 0, top: 0 };

function bounds(p: Primitive): Rect & { y0: number; y1: number } {
  const e = entryOf(p);
  return { x0: e.minX, x1: e.maxX, z0: e.minZ, z1: e.maxZ, y0: e.minY, y1: e.maxY };
}

/** Lanes and areas of the world's kitchen, or null when the world has no kitchen. */
export function interiorHumanAreas(world: WorldData): InteriorHumanAreas | null {
  const objOf = (id: string) => world.objects.filter((o) => o.templateId === id);
  const floor = objOf('floor-slab')[0], door = objOf('back-door')[0];
  if (!floor || !door) return null;
  const fin = bounds(world.prims[floor.primStart + 1]);
  const room: Rect = { x0: fin.x0, x1: fin.x1, z0: fin.z0, z1: fin.z1 }, floorY = fin.y1;
  const G = HUMAN_GRID, c = G.cell;
  const nx = Math.max(1, Math.floor((room.x1 - room.x0) / c)), nz = Math.max(1, Math.floor((room.z1 - room.z0) / c));
  const free = new Uint8Array(nx * nz).fill(1);
  const skip = new Set([floor.id, ...objOf('ceiling').map((o) => o.id)]);
  const tall = world.prims.filter((p) => !skip.has(p.objectId)).map((p) => ({ p, b: bounds(p) }))
    .filter(({ b }) => b.y1 > floorY + G.blockAbove && b.y0 < floorY + G.headroom && b.x1 > room.x0 && b.x0 < room.x1 && b.z1 > room.z0 && b.z0 < room.z1);
  for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
    const cx = room.x0 + (i + 0.5) * c, cz = room.z0 + (k + 0.5) * c;
    let hit = cx - G.halfBody < room.x0 || cx + G.halfBody > room.x1 || cz - G.halfBody < room.z0 || cz + G.halfBody > room.z1;
    for (const { p, b } of tall) {
      if (hit) break;
      if (b.x1 < cx - G.halfBody || b.x0 > cx + G.halfBody || b.z1 < cz - G.halfBody || b.z0 > cz + G.halfBody) continue;
      const e = entryOf(p);
      for (const dx of [-1, -0.5, 0, 0.5, 1]) for (const dz of [-1, -0.5, 0, 0.5, 1]) {
        primColumn(e, cx + dx * G.halfBody, cz + dz * G.halfBody, _col);
        if (_col.hit && _col.top > floorY + G.blockAbove && _col.bottom < floorY + G.headroom) hit = true;
      }
    }
    if (hit) free[k * nx + i] = 0;
  }
  const cellOf = (x: number, z: number) => {
    const i = Math.min(nx - 1, Math.max(0, Math.floor((x - room.x0) / c))), k = Math.min(nz - 1, Math.max(0, Math.floor((z - room.z0) / c)));
    return k * nx + i;
  };
  /** Nearest free cell to a point (ties: lower index), within 3 cells. */
  const snap = (x: number, z: number): number => {
    const c0 = cellOf(x, z), i0 = c0 % nx, k0 = Math.floor(c0 / nx);
    let best = -1, bd = Infinity;
    for (let dk = -3; dk <= 3; dk++) for (let di = -3; di <= 3; di++) {
      const i = i0 + di, k = k0 + dk;
      if (i < 0 || k < 0 || i >= nx || k >= nz || !free[k * nx + i]) continue;
      const d = (room.x0 + (i + 0.5) * c - x) ** 2 + (room.z0 + (k + 0.5) * c - z) ** 2;
      if (d < bd) { bd = d; best = k * nx + i; }
    }
    return best;
  };
  const poisOf = (tpl: string, kind: string) => objOf(tpl).flatMap((o) => world.pois.filter((q) => q.objectId === o.id && q.kind === kind));
  const leaf = bounds(world.prims[door.primStart]);
  const dc = { x: (leaf.x0 + leaf.x1) / 2, z: (leaf.z0 + leaf.z1) / 2 };
  // the door's room side: step from the leaf toward the room centre along the wall normal
  const alongX = leaf.x1 - leaf.x0 < leaf.z1 - leaf.z0;
  const rc = { x: (room.x0 + room.x1) / 2, z: (room.z0 + room.z1) / 2 };
  const inside = alongX ? { x: dc.x + Math.sign(rc.x - dc.x) * 600, z: dc.z } : { x: dc.x, z: dc.z + Math.sign(rc.z - dc.z) * 600 };
  const raw: { kind: HumanNodeKind; x: number; z: number }[] = [{ kind: 'door', ...inside }];
  for (const q of poisOf('countertop', 'food-spot')) raw.push({ kind: 'counter', x: q.pos.x, z: q.pos.z });
  for (const q of poisOf('sink', 'water-spot')) raw.push({ kind: 'sink', x: q.pos.x, z: q.pos.z });
  for (const q of poisOf('fridge', 'shelter')) raw.push({ kind: 'fridge', x: q.pos.x, z: q.pos.z });
  for (const q of poisOf('cooker', 'food-spot')) raw.push({ kind: 'cooker', x: q.pos.x, z: q.pos.z });
  for (const o of objOf('chair')) raw.push({ kind: 'seat', x: o.pos.x, z: o.pos.z });
  for (const q of poisOf('pet-bowl-pair', 'food-spot')) raw.push({ kind: 'pet-bowl', x: q.pos.x, z: q.pos.z });
  for (const o of objOf('pedal-bin')) raw.push({ kind: 'bin', x: o.pos.x, z: o.pos.z });
  const nodes = raw.map((n) => ({ ...n, cell: snap(n.x, n.z) }));
  const out: InteriorHumanAreas = { room, floorY, cell: c, nx, nz, free, nodes, lanes: [], unreachable: [], wipe: [], crevice: [] };
  const start = nodes[0].cell;
  const prev = start >= 0 ? paths(free, nx, nz, start) : null;
  for (const n of nodes.slice(1)) {
    if (!prev || n.cell < 0 || (n.cell !== start && prev.dist[n.cell] === Infinity)) { out.unreachable.push(n.kind); continue; }
    const pts: { x: number; z: number }[] = [];
    for (let q = n.cell; q >= 0; q = q === start ? -1 : prev.from[q]) pts.push({ x: room.x0 + ((q % nx) + 0.5) * c, z: room.z0 + (Math.floor(q / nx) + 0.5) * c });
    out.lanes.push({ to: n.kind, points: pts.reverse(), lengthMm: prev.dist[n.cell] * c });
  }
  for (const o of [...objOf('countertop'), ...objOf('kitchen-table')]) {
    const ps = world.prims.slice(o.primStart, o.primStart + o.primCount).map(bounds);
    const top = o.templateId === 'kitchen-table' ? [ps[0]] : ps;
    for (const b of top) out.wipe.push({ x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1, y: b.y1 });
  }
  for (const o of objOf('skirting')) {
    for (let i = 0; i < o.primCount; i += 2) { const b = bounds(world.prims[o.primStart + i]); out.crevice.push({ x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1 }); }
  }
  return out;
}

/** Dijkstra over free cells (8-neighbour, no corner cutting), distances in cells. */
function paths(free: Uint8Array, nx: number, nz: number, start: number): { dist: Float64Array; from: Int32Array } {
  const dist = new Float64Array(nx * nz).fill(Infinity), from = new Int32Array(nx * nz).fill(-1);
  const heap = new MinHeap(256);
  dist[start] = 0;
  heap.push(0, 0, start);
  while (heap.size > 0) {
    const d = heap.topKey(), c = heap.topValue();
    heap.pop();
    if (d > dist[c]) continue;
    const ci = c % nx, ck = Math.floor(c / nx);
    for (let dk = -1; dk <= 1; dk++) for (let di = -1; di <= 1; di++) {
      if (!di && !dk) continue;
      const i = ci + di, k = ck + dk;
      if (i < 0 || k < 0 || i >= nx || k >= nz) continue;
      const j = k * nx + i;
      if (!free[j] || (di && dk && (!free[ck * nx + i] || !free[k * nx + ci]))) continue;
      const nd = d + (di && dk ? Math.SQRT2 : 1);
      if (nd < dist[j]) { dist[j] = nd; from[j] = c; heap.push(nd, 0, j); }
    }
  }
  return { dist, from };
}
