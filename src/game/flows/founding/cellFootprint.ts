// The footprint of the queen's cell at the slice plane (app-seams-4 item 5): the open cells of the carve field at height y that connect to
// the point under the queen, as a bounding circle. The outcome card's shot frames this circle whole, so the cell is not cut by the top
// of the frame whatever the queen's own spread says (look6 item3-s1-high-real-beats-09-12-after.png: the queen stood at the rim of a cell
// twice the size of her brood's sphere). Pure reads of the field; nothing allocated per call beyond a small grid reused between calls.
import type { Sim } from '@/sim/types';

/** Grid step and half size of the probe (BU): a cell or a room of the first nest is well inside 20 BU. */
export const FOOTPRINT_STEP_BU = 0.5;
export const FOOTPRINT_HALF_BU = 20;
/** The start point may be this far (BU) from the queen's reference point when it lies in the wall. */
const START_SEARCH_BU = 1.5;

export interface Footprint {
  /** Bounding circle (bbox centre, farthest open cell), mm. */
  x: number; z: number; radius: number;
  /** Open grid cells found. */
  cells: number;
}

type FieldLike = { sampleXYZ(x: number, y: number, z: number): number };

let seen = new Uint8Array(0);
let queue = new Int32Array(0);

/**
 * Flood fill of the open cells at height `y` from (x, z). Returns null when there is no field, the start is in solid, or the open region
 * reaches the edge of the probe (a shaft or tunnel running on: it is not a cell).
 */
export function cellFootprint(field: FieldLike | undefined, x: number, y: number, z: number, bu: number): Footprint | null {
  if (!field) return null;
  const step = FOOTPRINT_STEP_BU * bu, n = Math.round((2 * FOOTPRINT_HALF_BU) / FOOTPRINT_STEP_BU) + 1, mid = (n - 1) / 2;
  if (seen.length < n * n) { seen = new Uint8Array(n * n); queue = new Int32Array(n * n); }
  seen.fill(0, 0, n * n);
  const px = (i: number) => x + (i - mid) * step, pz = (k: number) => z + (k - mid) * step;
  // start: the open cell nearest to the queen's point (she may stand on the wall, where the exact point reads solid)
  let start = -1, best = Infinity;
  const reach = Math.ceil(START_SEARCH_BU / FOOTPRINT_STEP_BU);
  for (let di = -reach; di <= reach; di++) {
    for (let dk = -reach; dk <= reach; dk++) {
      const i = mid + di, k = mid + dk, d = di * di + dk * dk;
      if (d < best && field.sampleXYZ(px(i), y, pz(k)) > 0) { best = d; start = k * n + i; }
    }
  }
  if (start < 0) return null;
  let head = 0, tail = 0, count = 0, edge = false;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  queue[tail++] = start; seen[start] = 1;
  while (head < tail) {
    const c = queue[head++]!, i = c % n, k = (c - i) / n;
    count++;
    const cx = px(i), cz = pz(k);
    if (cx < x0) x0 = cx; if (cx > x1) x1 = cx; if (cz < z0) z0 = cz; if (cz > z1) z1 = cz;
    if (i === 0 || k === 0 || i === n - 1 || k === n - 1) { edge = true; break; }
    for (const nb of [c - 1, c + 1, c - n, c + n]) {
      if (seen[nb]) continue;
      seen[nb] = 1;
      const ni = nb % n, nk = (nb - ni) / n;
      if (field.sampleXYZ(px(ni), y, pz(nk)) > 0) queue[tail++] = nb;
    }
  }
  if (edge) return null;
  const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
  let r = 0;
  for (let q = 0; q < tail; q++) {
    const c = queue[q]!, i = c % n, k = (c - i) / n;
    r = Math.max(r, Math.hypot(px(i) - mx, pz(k) - mz));
  }
  return { x: mx, z: mz, radius: r + step / 2, cells: count };
}

/** Footprint of the cell the sim's field has at (x, y, z), cached per game second of the sim (the cell does not change shape faster). */
const cache = new WeakMap<object, { key: string; value: Footprint | null }>();
export function cachedFootprint(sim: Sim, x: number, y: number, z: number): Footprint | null {
  const bu = sim.world.bu, field = (sim as Partial<Sim>).field;
  const key = `${Math.round(x / bu * 2)}|${Math.round(y / bu * 2)}|${Math.round(z / bu * 2)}|${sim.state.tick >> 3}`;
  const hit = cache.get(sim);
  if (hit && hit.key === key) return hit.value;
  const value = cellFootprint(field, x, y, z, bu);
  cache.set(sim, { key, value });
  return value;
}
