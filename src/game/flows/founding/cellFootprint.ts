// The queen's cell as the slice shot shows it (app-seams-4 item 5): the open voxels of the carve field that connect to the queen and lie
// at or under the slice plane, bounded by a sphere. The outcome card's shot frames this sphere whole, so the cell is not cut by the top of
// the frame whatever the queen's own spread says.
//
// Why under the plane and not only on it (card6/card7 pictures, seed 1): the queen stands in the throat of the shaft, where the cell reaches
// the plane, but the cell itself lies 15 to 20 mm under her; the slice shows it as one blob from above, a cell 22 x 16 mm and 20 mm deep
// while its footprint at the plane is 10 mm across. A circle on the plane framed the throat only. Pure reads of the field; one small
// grid reused between calls.
import { FSHOT_PITCH_DEG } from '@/render/camera';
import type { Sim } from '@/sim/types';

/** Grid step (BU: 1 mm for the ants of a 4 mm body unit), the half size of the probe in x and z, and its depth under the plane (BU). */
export const FOOTPRINT_STEP_BU = 0.25;
export const FOOTPRINT_HALF_BU = 10;
export const FOOTPRINT_DEPTH_BU = 12;
/** The start point may be this far (BU) from the queen's reference point when she stands in the wall. */
const START_SEARCH_BU = 1.5;
/**
 * The shot looks down at FSHOT_PITCH_DEG: a height difference counts for cos(pitch) of its length on the screen, a distance on the plane
 * for up to 1 (whatever the yaw). The "radius" of a point set is the screen reach of its farthest point, an upper bound for every yaw:
 * sqrt(h^2 + (dy cos p)^2 + 2 |dy| h cos p sin p).
 */
const COS_P = Math.cos((FSHOT_PITCH_DEG * Math.PI) / 180), SIN_P = Math.sin((FSHOT_PITCH_DEG * Math.PI) / 180);
function screenReach(dx: number, dy: number, dz: number): number {
  const h = Math.hypot(dx, dz), v = Math.abs(dy) * COS_P;
  return Math.sqrt(h * h + v * v + 2 * v * h * SIN_P);
}

/** The queen stands within this share of the sphere's radius from its centre (the "middle third" of the diameter). */
export const QUEEN_CENTRAL_SHARE = 1 / 3;

export interface Footprint {
  /** The sphere: centre and radius, mm. */
  x: number; y: number; z: number; radius: number;
  /** Open voxels found. */
  cells: number;
}

export interface FootAnchor { x: number; y: number; z: number }

type FieldLike = { sampleXYZ(x: number, y: number, z: number): number };

let seen = new Uint8Array(0);
let queue = new Int32Array(0);

interface Filled {
  /** Voxels in the queue (`queue[0 .. tail)`, packed ids), the grid's index ranges, and the position of a voxel (mm). */
  tail: number; i0: number; i1: number; k0: number; k1: number; jx0: number; jx1: number;
  nx: number; step: number;
  px: (i: number) => number; py: (j: number) => number; pz: (k: number) => number;
}

/** The flood fill of the cell under `planeY` from the open voxel nearest to `anchor`; null as cellFootprint's header says. The voxels stay in `queue[0 .. tail)` until the next call. */
function fillCell(field: FieldLike | undefined, anchor: FootAnchor, planeY: number, bu: number): Filled | null {
  if (!field) return null;
  const step = FOOTPRINT_STEP_BU * bu;
  const nx = Math.round((2 * FOOTPRINT_HALF_BU) / FOOTPRINT_STEP_BU) + 1, ny = Math.round(FOOTPRINT_DEPTH_BU / FOOTPRINT_STEP_BU) + 1;
  const mid = (nx - 1) / 2, total = nx * nx * ny;
  if (seen.length < total) { seen = new Uint8Array(total); queue = new Int32Array(total); }
  seen.fill(0, 0, total);
  const px = (i: number) => anchor.x + (i - mid) * step, pz = (k: number) => anchor.z + (k - mid) * step, py = (j: number) => planeY - j * step;
  const open = (i: number, k: number, j: number) => field.sampleXYZ(px(i), py(j), pz(k)) > 0;
  const id = (i: number, k: number, j: number) => (j * nx + k) * nx + i;
  // start: the open voxel nearest to the anchor (she may stand on the wall, where the exact point reads solid)
  const reach = Math.ceil(START_SEARCH_BU / FOOTPRINT_STEP_BU), j0 = Math.max(0, Math.min(ny - 1, Math.round((planeY - anchor.y) / step)));
  let start = -1, best = Infinity;
  for (let dj = -reach; dj <= reach; dj++) {
    const j = j0 + dj;
    if (j < 0 || j >= ny) continue;
    for (let dk = -reach; dk <= reach; dk++) {
      for (let di = -reach; di <= reach; di++) {
        const d = di * di + dk * dk + dj * dj;
        if (d < best && open(mid + di, mid + dk, j)) { best = d; start = id(mid + di, mid + dk, j); }
      }
    }
  }
  if (start < 0) return null;
  let head = 0, tail = 0;
  let i0 = Infinity, i1 = -Infinity, k0 = Infinity, k1 = -Infinity, jx0 = Infinity, jx1 = -Infinity;
  queue[tail++] = start; seen[start] = 1;
  while (head < tail) {
    const c = queue[head++]!, i = c % nx, rest = (c - i) / nx, k = rest % nx, j = (rest - k) / nx;
    if (i < i0) i0 = i; if (i > i1) i1 = i; if (k < k0) k0 = k; if (k > k1) k1 = k; if (j < jx0) jx0 = j; if (j > jx1) jx1 = j;
    // the probe's side walls and its floor end the search: a shaft or tunnel that runs on is not a cell (the plane above is the cut: nothing above it counts)
    if (i === 0 || k === 0 || i === nx - 1 || k === nx - 1 || j === ny - 1) return null;
    for (let n = 0; n < 6; n++) {
      const a = i + (n === 0 ? 1 : n === 1 ? -1 : 0), b = k + (n === 2 ? 1 : n === 3 ? -1 : 0), d = j + (n === 4 ? 1 : n === 5 ? -1 : 0);
      if (d < 0) continue;
      const nb = id(a, b, d);
      if (seen[nb]) continue;
      seen[nb] = 1;
      if (open(a, b, d)) queue[tail++] = nb;
    }
  }
  return { tail, i0, i1, k0, k1, jx0, jx1, nx, step, px, py, pz };
}

/**
 * Flood fill (6-connected) of the open voxels at or under `planeY` from the open one nearest to `anchor` (the queen). Returns null when
 * there is no field, no open voxel near the anchor, or the open region reaches the edge of the probe (a tunnel running on is not a cell).
 * The sphere is the bounding box's centre moved toward the anchor as far as it takes to bring her into the middle third of its diameter
 * (smallest sphere that does), so the picture shows the cell whole with the queen in the middle of it.
 */
export function cellFootprint(field: FieldLike | undefined, anchor: FootAnchor, planeY: number, bu: number): Footprint | null {
  const fl = fillCell(field, anchor, planeY, bu);
  if (!fl) return null;
  const { tail, i0, i1, k0, k1, jx0, jx1, nx, step, px, py, pz } = fl;
  // bounding box centre, then toward the anchor until she is in the middle third
  const cx0 = (px(i0) + px(i1)) / 2, cy0 = (py(jx0) + py(jx1)) / 2, cz0 = (pz(k0) + pz(k1)) / 2;
  const radiusAt = (cx: number, cy: number, cz: number): number => {
    let r2 = 0; // (the largest reach so far)
    for (let q = 0; q < tail; q++) {
      const c = queue[q]!, i = c % nx, rest = (c - i) / nx, k = rest % nx, j = (rest - k) / nx;
      const d = screenReach(px(i) - cx, py(j) - cy, pz(k) - cz);
      if (d > r2) r2 = d;
    }
    return r2 + step * 0.87; // half a voxel's diagonal
  };
  let out: Footprint | null = null;
  for (let t = 0; t <= 1.0001; t += 0.05) {
    const cx = cx0 + (anchor.x - cx0) * t, cy = cy0 + (anchor.y - cy0) * t, cz = cz0 + (anchor.z - cz0) * t;
    const r = radiusAt(cx, cy, cz), off = screenReach(anchor.x - cx, anchor.y - cy, anchor.z - cz);
    if (off <= r * QUEEN_CENTRAL_SHARE || t >= 1) { out = { x: cx, y: cy, z: cz, radius: r, cells: tail }; break; }
  }
  return out;
}

/** How the card shot's frame is shaped (cardFraming.ts): horizontal room in units of the band's half height, and the middle third of the frame's width in the same units. */
export interface CardFrame { kx: number; kq: number }

export interface FramedFootprint extends Footprint {
  /** The yaw (radians, foundingShotAt's convention: the camera stands toward +Z at 0) the fit was made for: the shot holds it. */
  yawRad: number;
}

/** Candidate yaws of the framed fit, radians (24 steps of 15 degrees): the one that frames the cell largest wins. */
const FRAME_YAWS = 24;

/**
 * The card shot's subject for a camera at a known yaw: the open voxels' extents on the SCREEN (the pitch FSHOT_PITCH_DEG, the yaw tried), not a sphere. A cell is a
 * long thing; a sphere that holds it wastes most of a band that is a few times wider than it is tall (the sphere version framed a cell at a third of the band).
 * The yaw that puts the cell's long axis across the screen wins. The queen stands in the middle third of the band (vertically) and of the frame (horizontally):
 * the centre moves from the box's centre toward her as far as that takes. Returns the look point and the radius whose sphere, at foundingShotAt's distance for
 * the card's `fill`, spans the band: the larger of the vertical half extent and the horizontal one scaled by the room (`kx`).
 */
export function cellFootprintFramed(field: FieldLike | undefined, anchor: FootAnchor, planeY: number, bu: number, frame: CardFrame): FramedFootprint | null {
  const fl = fillCell(field, anchor, planeY, bu);
  if (!fl) return null;
  const { tail, nx, step, px, py, pz } = fl;
  const xs = new Float32Array(tail), ys = new Float32Array(tail), zs = new Float32Array(tail);
  for (let q = 0; q < tail; q++) {
    const c = queue[q]!, i = c % nx, rest = (c - i) / nx, k = rest % nx, j = (rest - k) / nx;
    xs[q] = px(i) - anchor.x; ys[q] = py(j) - anchor.y; zs[q] = pz(k) - anchor.z;
  }
  const margin = step * 0.87; // half a voxel's diagonal
  let best: { r: number; cx: number; cy: number; yaw: number } | null = null;
  for (let a = 0; a < FRAME_YAWS; a++) {
    const yaw = (a / FRAME_YAWS) * 2 * Math.PI, sy_ = Math.sin(yaw), cy_ = Math.cos(yaw);
    let sx0 = Infinity, sx1 = -Infinity, sv0 = Infinity, sv1 = -Infinity;
    for (let q = 0; q < tail; q++) {
      const sx = xs[q]! * cy_ - zs[q]! * sy_, along = -xs[q]! * sy_ - zs[q]! * cy_, sv = along * SIN_P + ys[q]! * COS_P;
      if (sx < sx0) sx0 = sx; if (sx > sx1) sx1 = sx; if (sv < sv0) sv0 = sv; if (sv > sv1) sv1 = sv;
    }
    // the queen (screen origin) stands in the middle third of the band and of the frame: the centre goes from the box's centre toward her until she does
    const bx = (sx0 + sx1) / 2, bv = (sv0 + sv1) / 2;
    for (let t = 0; t <= 1.0001; t += 0.02) {
      const cx = bx * (1 - t), cv = bv * (1 - t);
      const r = Math.max(Math.max(sv1 - cv, cv - sv0), Math.max(sx1 - cx, cx - sx0) / frame.kx) + margin;
      if ((Math.abs(cv) <= r * QUEEN_CENTRAL_SHARE && Math.abs(cx) <= r * frame.kq) || t >= 1) {
        if (!best || r < best.r) best = { r, cx, cy: cv, yaw };
        break;
      }
    }
  }
  if (!best) return null;
  // the look point: the box's centre in 3D moved across the screen plane to the chosen centre
  const sy_ = Math.sin(best.yaw), cy_ = Math.cos(best.yaw);
  let mx = 0, my = 0, mz = 0;
  for (let q = 0; q < tail; q++) { mx += xs[q]!; my += ys[q]!; mz += zs[q]!; }
  mx /= tail; my /= tail; mz /= tail;
  const msx = mx * cy_ - mz * sy_, msv = (-mx * sy_ - mz * cy_) * SIN_P + my * COS_P;
  const dsx = best.cx - msx, dsv = best.cy - msv;
  // right = (cos, 0, -sin); up in the view = (f_x sin p, cos p, f_z sin p) with f = (-sin, 0, -cos)
  const x = anchor.x + mx + dsx * cy_ + dsv * (-sy_ * SIN_P);
  const y = anchor.y + my + dsv * COS_P;
  const z = anchor.z + mz + dsx * (-sy_) + dsv * (-cy_ * SIN_P);
  return { x, y, z, radius: best.r, cells: tail, yawRad: best.yaw };
}

/** Footprint of the cell the sim's field has around the anchor, cached for 64 ticks of the sim (the cell does not change shape faster). */
const cache = new WeakMap<object, { key: string; value: Footprint | FramedFootprint | null }>();
export function cachedFootprint(sim: Sim, anchor: FootAnchor, planeY: number, frame?: CardFrame): Footprint | FramedFootprint | null {
  const bu = sim.world.bu, field = (sim as Partial<Sim>).field;
  const key = `${Math.round(anchor.x / bu * 2)}|${Math.round(planeY / bu * 2)}|${Math.round(anchor.z / bu * 2)}|${Math.round(anchor.y / bu * 2)}|${sim.state.tick >> 6}|${frame ? `${frame.kx.toFixed(2)},${frame.kq.toFixed(2)}` : '-'}`;
  const hit = cache.get(sim);
  if (hit && hit.key === key) return hit.value;
  const value = frame ? cellFootprintFramed(field, anchor, planeY, bu, frame) : cellFootprint(field, anchor, planeY, bu);
  cache.set(sim, { key, value });
  return value;
}
