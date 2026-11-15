// Test support: a kernel surface walker that follows a nav-grid path across a generated world (GDD 04 §11), the
// way an ant does: at the AI's walking speed it aims at each waypoint's ground point (so it walks down a stone or a
// stem it has climbed and back onto the cell's ground, instead of circling a bulge on a level heading), and when it
// makes no progress it climbs the game's stuck ladder (sidestep, back off, re-snap, let go when pinned). It never
// teleports: reaching the end shows that a real walker can physically follow the path the nav grid claims.

import type { Vec3 } from '@/core/math/vec3';
import type { Kernel } from '@/sim/kernel';
import { createWalkerKin, walkerLetGo, walkerPlace, walkerStep, type WalkerKin } from '@/sim/locomotion/walker';
import type { WorldData } from '@/sim/types';
import { navDistances } from '../validate/graph';
import { walkable } from '../maps/nav';
import { exactLocalField, type FieldFn } from './exactField';

export interface CrossResult {
  /** Waypoints reached (the last one included when the walk ended there). */
  reached: number;
  /** Final XZ distance to the last waypoint, mm. */
  endDist: number;
  steps: number;
  /** Stuck episodes (stall windows that started a recovery ladder). */
  episodes: number;
  /** Recovery manoeuvres used (sidesteps, back-offs, re-snaps, let-gos). */
  recoveries: number;
  /** Let-gos (rung 4 when hanging, rung 6). */
  letGos: number;
  /** Rungs beyond the game's surface ladder (5 climb, 6 let go), used where the game would relocate. */
  extras: number;
  /** Where the walker was when it gave up (null when it arrived). */
  stuckAt: Vec3 | null;
}

export interface CrossOptions {
  /** Walking speed, mm/s (default WALK_SPEED_BU: the AI's cruise, so the stall window covers the game's distance). */
  speed?: number;
  /** Step budget for the whole path. */
  maxSteps?: number;
  /** Called after every step (e.g. to record the highest point of the walk). */
  onStep?: (kin: WalkerKin) => void;
}

// The walker mirrors the locomotion module's stuck ladder (src/sim/locomotion/stuck.ts and params.ts LOCO_TUNING;
// worldgen may not import that module, so the numbers are repeated here): a stall is a window of stuckWindowS
// without stuckProgressBU of progress, and each stall climbs one rung: 1 re-aim (the game re-plans; the path here
// is fixed), 2 sidestep, 3 back off, 4 re-snap onto the surface, 5 the game relocates the walker (a teleport), so
// here the walk is stuck. Progress resets the rung; episodes per walk are capped as per request in the game.
// One deviation, counted in `letGos`: at rung 4 a walker hanging on a wall or an underside lets go and drops (GDD 01
// `let-go`) instead of re-snapping. The game applies its pinned let-go (update.ts letGoPinned) only in cavities; on
// the surface a walker that has wrapped round a leaf tip or under a stone's bulge waits for rung 5 (relocation).
/** Design seed §3: ant walk speed ~12 BU/s. */
const WALK_SPEED_BU = 12;
const STEP_S = 0.1;
const STALL_STEPS = Math.round(2.5 / STEP_S);
const PROGRESS_BU = 0.5;
const SIDESTEP_STEPS = Math.round(1.2 / STEP_S);
const BACKOFF_STEPS = Math.round(0.8 / STEP_S);
/** Stuck episodes allowed per walk (LOCO_TUNING.episodesMax, per request in the game). */
const EPISODES_MAX = 16;
/** Rungs of the game's surface ladder before its relocation, and of this walker's (two extra manoeuvres). */
const GAME_RUNGS = 4;
const LADDER_RUNGS = 6;
/** Hanging on a wall or an underside: up.y below this (LOCO_TUNING.pinnedUpY). */
const PINNED_UP_Y = 0.7;
/** A waypoint counts as passed when the walker's foot point is within this share of a nav cell of its ground point (3D). */
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
  const p0 = cellGround(w, path[0], { x: 0, y: 0, z: 0 });
  const start = { x: p0.x, y: k.field.height(p0.x, p0.z) + 20 * w.bu, z: p0.z };
  return follow(k, start, path.length, (i, out) => cellGround(w, path[i], out), REACH_CELLS * w.nav.cls.cell, opts);
}

/**
 * Places a walker on the surface nearest `points[0]` and walks it through the other points in order (each one's
 * nearest surface point passed within `reach` mm of the foot point, in 3D). For short passages such as a door crack.
 */
export function walkPoints(k: Kernel, points: readonly Vec3[], reach: number, opts: CrossOptions = {}): CrossResult & { kin: WalkerKin } {
  const ground = points.map((p) => surfacePoint(k, p));
  return follow(k, points[0], points.length, (i, out) => { out.x = ground[i].x; out.y = ground[i].y; out.z = ground[i].z; return out; }, reach, opts);
}

/** The walkable surface point nearest `p` (a mouth position may sit inside a floor slab): the level set less the foot offset. */
export function surfacePoint(k: Kernel, p: Vec3): Vec3 {
  const kin = createWalkerKin(k.walker.footOffset);
  if (!walkerPlace(k.field, kin, p, {}, k.walker)) return { ...p };
  const f = kin.footOffset;
  return { x: kin.pos.x - kin.up.x * f, y: kin.pos.y - kin.up.y * f, z: kin.pos.z - kin.up.z * f };
}

function follow(k: Kernel, start: Vec3, count: number, target: (i: number, out: Vec3) => Vec3, reach: number,
  opts: CrossOptions): CrossResult & { kin: WalkerKin } {
  const kin = createWalkerKin(k.walker.footOffset);
  const bu = k.bu;
  if (!walkerPlace(k.field, kin, start, {}, k.walker)) {
    return { kin, reached: 0, endDist: Infinity, steps: 0, episodes: 0, recoveries: 0, letGos: 0, extras: 0, stuckAt: { ...start } };
  }
  const speed = opts.speed ?? WALK_SPEED_BU * bu, maxSteps = opts.maxSteps ?? 200_000;
  const progressMm = PROGRESS_BU * bu, foot = kin.footOffset;
  const t: Vec3 = { x: 0, y: 0, z: 0 }, dir: Vec3 = { x: 0, y: 0, z: 0 };
  let wp = 0, steps = 0, episodes = 0, recoveries = 0, letGos = 0, extras = 0, stuck = false;
  let best = Infinity, sinceBest = 0, rung = 0, manoeuvre = 0, side = 1;
  let kind: 'side' | 'back' | 'climb' = 'side';
  while (wp < count && steps < maxSteps && !stuck) {
    target(wp, t);
    const dx = t.x - kin.pos.x, dz = t.z - kin.pos.z;
    // the foot point (the walker's centre rides footOffset along its up vector) against the target ground point
    const fx = kin.pos.x - kin.up.x * foot - t.x, fy = kin.pos.y - kin.up.y * foot - t.y, fz = kin.pos.z - kin.up.z * foot - t.z;
    const d3 = Math.sqrt(fx * fx + fy * fy + fz * fz);
    if (d3 < reach) { wp++; best = Infinity; sinceBest = 0; rung = 0; manoeuvre = 0; continue; }
    if (d3 < best - progressMm) { best = d3; sinceBest = 0; rung = 0; } else sinceBest++;
    if (sinceBest > STALL_STEPS && manoeuvre === 0) {
      if (rung === 0 && ++episodes > EPISODES_MAX) { stuck = true; break; }
      rung++;
      sinceBest = 0;
      if (rung > LADDER_RUNGS) { stuck = true; break; }
      if (rung > 1) recoveries++;
      if (rung > GAME_RUNGS) extras++;
      switch (rung) {
        case 1: break; // re-aim (the game re-plans)
        case 2: kind = 'side'; side = -side; manoeuvre = SIDESTEP_STEPS; break;
        case 3: kind = 'back'; manoeuvre = BACKOFF_STEPS; break;
        case 4:
          // re-snap; hanging on a wall or an underside, let go instead (see the header)
          if (kin.up.y < PINNED_UP_Y) { walkerLetGo(k.field, kin, undefined, k.walker); letGos++; }
          else walkerPlace(k.field, kin, kin.pos, { dir: { x: -kin.up.x, y: -kin.up.y, z: -kin.up.z } }, k.walker);
          break;
        case 5: kind = 'climb'; manoeuvre = SIDESTEP_STEPS; break;
        default: walkerLetGo(k.field, kin, undefined, k.walker); letGos++; break;
      }
    }
    // aim at the target's ground point (the walker's centre rides footOffset above it)
    dir.x = dx; dir.y = t.y + foot - kin.pos.y; dir.z = dz;
    if (manoeuvre > 0) {
      manoeuvre--;
      if (kind === 'back') { dir.x = -dx; dir.y = -dir.y; dir.z = -dz; }
      else if (kind === 'climb') { dir.x = 0; dir.y = 1; dir.z = 0; }
      else {
        const u = kin.up;
        const sx = u.y * dir.z - u.z * dir.y, sy = u.z * dir.x - u.x * dir.z, sz = u.x * dir.y - u.y * dir.x;
        dir.x = side * sx; dir.y = side * sy; dir.z = side * sz;
      }
    }
    if (kin.medium === 'air') walkerStep(k.field, kin, null, 0, STEP_S, k.walker);
    else walkerStep(k.field, kin, dir, speed, STEP_S, k.walker);
    steps++;
    opts.onStep?.(kin);
    if (!Number.isFinite(kin.pos.x) || !Number.isFinite(kin.pos.y) || !Number.isFinite(kin.pos.z)) break;
  }
  const end = target(count - 1, t);
  const ex = kin.pos.x - end.x, ez = kin.pos.z - end.z, endDist = Math.sqrt(ex * ex + ez * ez);
  const arrived = wp >= count;
  return { kin, reached: Math.min(wp, count), endDist, steps, episodes, recoveries, letGos, extras, stuckAt: arrived ? null : { ...kin.pos } };
}

/**
 * True if a sphere of radius `r` can travel from near `a` to near `b` (both within `reach`) the way a walker does,
 * along surfaces: a breadth-first search over a lattice of spacing `step` (< r, so neighbouring spheres overlap)
 * inside the box around a, b and `include` (points the passage runs past, e.g. a pipe's ends) grown by `margin`,
 * keeping the lattice points whose clearance f lies in [r, r + shell] (free for the sphere, and within `shell` of
 * a surface, which keeps the search off the open air). Shows that a passage (door crack, pipe annulus) is
 * physically as wide as the clearance it must offer. `exact` measures with the unblended field (exactField.ts:
 * the kernel's smooth minimum reads up to k/4 low between facing surfaces, so it understates a gap's width).
 */
export function spherePasses(k: Kernel, a: Vec3, b: Vec3, r: number,
  opts: { step?: number; reach?: number; margin?: number; shell?: number; include?: readonly Vec3[]; exact?: boolean } = {}): boolean {
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
  const grow = r + shell + step;
  const field: FieldFn = opts.exact
    ? exactLocalField(k, { x: x0 - grow, y: y0 - grow, z: z0 - grow }, { x: x0 + nx * step + grow, y: y0 + ny * step + grow, z: z0 + nz * step + grow })
    : (x, y, z) => k.field.sampleXYZ(x, y, z);
  const free = (i: number, j: number, l: number) => {
    const f = field(x0 + i * step, y0 + j * step, z0 + l * step);
    return f >= r && f <= r + shell;
  };
  const near = (p: Vec3, i: number, j: number, l: number) => {
    const dx = x0 + i * step - p.x, dy = y0 + j * step - p.y, dz = z0 + l * step - p.z;
    return dx * dx + dy * dy + dz * dz <= reach * reach;
  };
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
