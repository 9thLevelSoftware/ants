// Test support: a kernel surface walker that follows a nav-grid path across a generated world (GDD 04 §11), the
// way an ant does: it aims at each waypoint's ground point (so it walks down a stone or a stem it has climbed and
// back onto the cell's ground, instead of circling a bulge on a level heading), and when it makes no progress it
// sidesteps or backs off along the surface. It never teleports: reaching the end shows that a real walker can
// physically follow the path the nav grid claims.

import type { Vec3 } from '@/core/math/vec3';
import type { Kernel } from '@/sim/kernel';
import { createWalkerKin, walkerLetGo, walkerPlace, walkerStep, type WalkerKin } from '@/sim/locomotion/walker';
import type { WorldData } from '@/sim/types';
import { navDistances } from '../validate/graph';
import { walkable } from '../maps/nav';

export interface CrossResult {
  /** Waypoints reached (the last one included when the walk ended there). */
  reached: number;
  /** Final XZ distance to the last waypoint's centre, mm. */
  endDist: number;
  steps: number;
  /** Recovery manoeuvres used (sidesteps and back-offs). */
  recoveries: number;
  /** Where the walker was when it gave up (null when it arrived). */
  stuckAt: Vec3 | null;
}

export interface CrossOptions {
  /** Walking speed, mm/s (default 60 BU/s: a test that runs fast; the walker caps the step length anyway). */
  speed?: number;
  /** Step budget for the whole path. */
  maxSteps?: number;
}

/** Steps without 0.5 BU of progress toward the waypoint before a recovery (2.5 s at 0.1 s steps, as the AI). */
const STALL_STEPS = 25;
/** Length of one sidestep / back-off manoeuvre, steps. */
const MANOEUVRE_STEPS = 10;
/** Recoveries allowed per waypoint before the walk counts as stuck. */
const MAX_RECOVERIES = 15;
/** The recovery cycle (one manoeuvre per stall). */
const MANOEUVRES = ['side', 'side', 'up', 'back', 'drop'] as const;
/** Below this `up.y` the walker hangs on a wall or an underside and may let go. */
const HANGING_UP_Y = 0.3;
/** A waypoint counts as passed within this share of a nav cell (XZ). */
const REACH_CELLS = 0.6;

function navCtx(w: WorldData) {
  return { dims: { navN: w.nav.cls.nx, navCell: w.nav.cls.cell, bu: w.bu }, world: w } as unknown as Parameters<typeof navDistances>[0];
}

/** Nav cells from `from` to `to` by steepest descent of the path distance to `to` (8-neighbour moves only). */
export function navPath(w: WorldData, from: number, to: number, d = navDistances(navCtx(w), [to])): number[] | null {
  if (!(d[from] < Infinity)) return null;
  const n = w.nav.cls.nx, out = [from];
  let c = from;
  while (c !== to && out.length < 4 * n) {
    let best = c;
    for (let dk = -1; dk <= 1; dk++) for (let di = -1; di <= 1; di++) {
      const x = (c % n) + di, z = Math.floor(c / n) + dk;
      if (x < 0 || z < 0 || x >= n || z >= n) continue;
      const j = z * n + x;
      if (d[j] < d[best]) best = j;
    }
    if (best === c) return null;
    out.push((c = best));
  }
  return out;
}

/**
 * A west-east crossing along the nav-grid row of `cell`: from the first walkable cell of the row to the last one
 * that a steepest-descent path reaches without a micro-portal (a portal needs a clearance check the cell walk does
 * not make). Null when no such pair spans the row.
 */
export function rowCrossing(w: WorldData, cell: number): number[] | null {
  const n = w.nav.cls.nx, row = Math.floor(cell / n);
  const cols = [...Array(n).keys()].filter((i) => walkable(w.nav.cls.data[row * n + i]));
  for (let b = cols.length - 1; b >= 0; b--) {
    const to = row * n + cols[b];
    const d = navDistances(navCtx(w), [to]);
    for (let a = 0; a < b && cols[b] - cols[a] >= n / 2; a++) {
      const p = navPath(w, row * n + cols[a], to, d);
      if (p) return p;
    }
    if (cols[b] - cols[0] < n / 2) break;
  }
  return null;
}

/** Ground point of a nav cell: its centre at the cell's walkable ground height. */
export function cellGround(w: WorldData, c: number, out: Vec3): Vec3 {
  const n = w.nav.cls.nx, cell = w.nav.cls.cell;
  out.x = ((c % n) + 0.5) * cell;
  out.z = (Math.floor(c / n) + 0.5) * cell;
  const g = w.nav.groundY![c];
  out.y = Number.isFinite(g) ? g : 0;
  return out;
}

/** Places a walker on the surface above the first cell of `path` and walks it to the last one. */
export function crossPath(w: WorldData, k: Kernel, path: readonly number[], opts: CrossOptions = {}): CrossResult & { kin: WalkerKin } {
  const kin = createWalkerKin(k.walker.footOffset);
  const p0 = cellGround(w, path[0], { x: 0, y: 0, z: 0 });
  if (!walkerPlace(k.field, kin, { x: p0.x, y: k.field.height(p0.x, p0.z) + 20 * w.bu, z: p0.z }, {}, k.walker)) {
    return { kin, reached: 0, endDist: Infinity, steps: 0, recoveries: 0, stuckAt: { ...p0 } };
  }
  const speed = opts.speed ?? 60 * w.bu, maxSteps = opts.maxSteps ?? 40_000, dt = 0.1;
  const reach = REACH_CELLS * w.nav.cls.cell, progressMm = 0.5 * w.bu, foot = kin.footOffset;
  const t: Vec3 = { x: 0, y: 0, z: 0 }, dir: Vec3 = { x: 0, y: 0, z: 0 };
  let wp = 0, steps = 0, recoveries = 0, perWp = 0;
  let best = Infinity, sinceBest = 0, manoeuvre = 0, side = 1;
  let kind: (typeof MANOEUVRES)[number] = 'side';
  while (wp < path.length && steps < maxSteps) {
    cellGround(w, path[wp], t);
    const dx = t.x - kin.pos.x, dz = t.z - kin.pos.z, flat = Math.sqrt(dx * dx + dz * dz);
    if (flat < reach) { wp++; best = Infinity; sinceBest = 0; perWp = 0; manoeuvre = 0; continue; }
    if (flat < best - progressMm) { best = flat; sinceBest = 0; } else sinceBest++;
    if (sinceBest > STALL_STEPS && manoeuvre === 0) {
      if (++perWp > MAX_RECOVERIES) break;
      recoveries++;
      manoeuvre = MANOEUVRE_STEPS;
      kind = MANOEUVRES[(perWp - 1) % MANOEUVRES.length];
      side = -side;
      sinceBest = 0;
      if (kind === 'drop') {
        manoeuvre = 0;
        if (kin.up.y < HANGING_UP_Y) walkerLetGo(k.field, kin, undefined, k.walker);
      }
    }
    // aim at the waypoint's ground point (the walker's centre rides footOffset above it)
    dir.x = dx; dir.y = t.y + foot - kin.pos.y; dir.z = dz;
    if (manoeuvre > 0) {
      manoeuvre--;
      if (kind === 'back') { dir.x = -dx; dir.y = -dir.y; dir.z = -dz; }
      else if (kind === 'up') { dir.x = 0; dir.y = 1; dir.z = 0; }
      else {
        const u = kin.up;
        const sx = u.y * dir.z - u.z * dir.y, sy = u.z * dir.x - u.x * dir.z, sz = u.x * dir.y - u.y * dir.x;
        dir.x = side * sx; dir.y = side * sy; dir.z = side * sz;
      }
    }
    if (kin.medium === 'air') walkerStep(k.field, kin, null, 0, dt, k.walker);
    else walkerStep(k.field, kin, dir, speed, dt, k.walker);
    steps++;
    if (!Number.isFinite(kin.pos.x) || !Number.isFinite(kin.pos.y) || !Number.isFinite(kin.pos.z)) break;
  }
  const end = cellGround(w, path[path.length - 1], t);
  const endDist = Math.hypot(kin.pos.x - end.x, kin.pos.z - end.z);
  const arrived = wp >= path.length;
  return { kin, reached: Math.min(wp, path.length), endDist, steps, recoveries, stuckAt: arrived ? null : { ...kin.pos } };
}

/**
 * True if a sphere of radius `r` can travel from near `a` to near `b` (both within `reach`) the way a walker does,
 * along surfaces: a breadth-first search over a lattice of spacing `step` (< r, so neighbouring spheres overlap)
 * inside the box around a, b and `include` (points the passage runs past, e.g. a pipe's ends) grown by `margin`,
 * keeping the lattice points whose clearance f lies in [r, r + shell] (free for the sphere, and within `shell` of
 * a surface, which keeps the search off the open air). Shows that a passage (door crack, pipe annulus) is
 * physically as wide as the clearance it must offer.
 */
export function spherePasses(k: Kernel, a: Vec3, b: Vec3, r: number,
  opts: { step?: number; reach?: number; margin?: number; shell?: number; include?: readonly Vec3[] } = {}): boolean {
  if (!(r > 0)) return false;
  const step = opts.step ?? 0.5 * r, reach = opts.reach ?? 3 * k.bu, margin = opts.margin ?? 4 * k.bu, shell = opts.shell ?? 3 * step;
  const pts = [a, b, ...(opts.include ?? [])];
  const lo = (f: (p: Vec3) => number) => Math.min(...pts.map(f)) - margin, hi = (f: (p: Vec3) => number) => Math.max(...pts.map(f)) + margin;
  const x0 = lo((p) => p.x), y0 = lo((p) => p.y), z0 = lo((p) => p.z);
  const nx = Math.ceil((hi((p) => p.x) - x0) / step) + 1;
  const ny = Math.ceil((hi((p) => p.y) - y0) / step) + 1;
  const nz = Math.ceil((hi((p) => p.z) - z0) / step) + 1;
  const state = new Uint8Array(nx * ny * nz); // 0 unknown, 1 blocked, 2 queued
  const at = (i: number, j: number, l: number) => (l * ny + j) * nx + i;
  const free = (i: number, j: number, l: number) => {
    const f = k.field.sampleXYZ(x0 + i * step, y0 + j * step, z0 + l * step);
    return f >= r && f <= r + shell;
  };
  const near = (p: Vec3, i: number, j: number, l: number) => Math.hypot(x0 + i * step - p.x, y0 + j * step - p.y, z0 + l * step - p.z) <= reach;
  const queue: number[] = [];
  for (let l = 0; l < nz; l++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (!near(a, i, j, l)) continue;
    const q = at(i, j, l);
    if (free(i, j, l)) { state[q] = 2; queue.push(q); } else state[q] = 1;
  }
  for (let h = 0; h < queue.length; h++) {
    const q = queue[h], i = q % nx, j = Math.floor(q / nx) % ny, l = Math.floor(q / (nx * ny));
    if (near(b, i, j, l)) return true;
    for (const [di, dj, dl] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
      const ii = i + di, jj = j + dj, ll = l + dl;
      if (ii < 0 || jj < 0 || ll < 0 || ii >= nx || jj >= ny || ll >= nz) continue;
      const qq = at(ii, jj, ll);
      if (state[qq] !== 0) continue;
      if (free(ii, jj, ll)) { state[qq] = 2; queue.push(qq); } else state[qq] = 1;
    }
  }
  return false;
}
