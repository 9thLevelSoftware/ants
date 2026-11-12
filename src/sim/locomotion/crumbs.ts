// Breadcrumbs and path integration (GDD 02 §9.1-9.2). Crumbs are stored LINEARLY in ant.mem.crumbs (x, y, z
// packed): index 0 is the oldest (the entrance the ant left by), crumbLen the count, crumbHead == crumbLen (next
// write). Recording: a crumb every CRUMB_SPACING, or after a heading change > 45 deg and >= 3 BU; loop erasure
// within LOOP_CLOSE; when full, crumb 0 is kept and every second crumb dropped. Cleared on entering the nest.
// Retrace walks the crumbs back, taking the oldest of the next SHORTCUT_LOOKAHEAD crumbs reachable in a straight
// walkable line (nav cells passable, no obstacle above the surface, no avoid marker).

import type { Vec3 } from '@/core/math/vec3';
import type { Ant, Sim } from '@/sim/types';
import { AntFlag } from '@/sim/types';
import { isLocoNavGrid as isLocoNavGridImp } from './grid/navGridImpl';
import { noise01 as noise01Imp, set3 as set3Imp } from './mathx';
import { avoidDiscs as avoidDiscsImp, type LocoRuntime } from './runtime';
import type { NavScratch } from './scratch';

// Hot imports re-bound as local consts (Vitest reads imported bindings through getters; see 02-kernel.md §2.11).
const isLocoNavGrid = isLocoNavGridImp, noise01 = noise01Imp, set3 = set3Imp, avoidDiscs = avoidDiscsImp;

const _a: Vec3 = { x: 0, y: 0, z: 0 }, _b: Vec3 = { x: 0, y: 0, z: 0 };

export function crumbCount(ant: Ant): number {
  return ant.mem.crumbLen;
}

/** Crumb i (0 = oldest) into out. */
export function crumbAt(ant: Ant, i: number, out: Vec3): Vec3 {
  const c = ant.mem.crumbs, k = 3 * i;
  out.x = c[k]; out.y = c[k + 1]; out.z = c[k + 2];
  return out;
}

export function clearCrumbs(ant: Ant): void {
  ant.mem.crumbLen = 0;
  ant.mem.crumbHead = 0;
}

function push(ant: Ant, p: Vec3): void {
  const m = ant.mem, cap = (m.crumbs.length / 3) | 0;
  if (m.crumbLen >= cap) thin(ant);
  const k = 3 * m.crumbLen;
  m.crumbs[k] = p.x; m.crumbs[k + 1] = p.y; m.crumbs[k + 2] = p.z;
  m.crumbLen++;
  m.crumbHead = m.crumbLen;
}

/** Keeps crumb 0 and every second crumb after it. */
function thin(ant: Ant): void {
  const m = ant.mem, c = m.crumbs;
  let n = 1;
  for (let i = 2; i < m.crumbLen; i += 2, n++) {
    c[3 * n] = c[3 * i]; c[3 * n + 1] = c[3 * i + 1]; c[3 * n + 2] = c[3 * i + 2];
  }
  m.crumbLen = n;
  m.crumbHead = n;
}

/** Starts a new crumb trail at p (the entrance the ant leaves by). */
export function startCrumbs(ant: Ant, p: Vec3): void {
  clearCrumbs(ant);
  push(ant, p);
}

/** Records the ant's position if the spacing / turn rule says so (call after each surface step outside nests). */
export function recordCrumb(ant: Ant, r: LocoRuntime): void {
  const P = r.P, m = ant.mem, p = ant.pos;
  if (m.crumbLen === 0) { push(ant, p); return; }
  crumbAt(ant, m.crumbLen - 1, _a);
  const dx = p.x - _a.x, dy = p.y - _a.y, dz = p.z - _a.z;
  const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
  let take = d >= P.crumbSpacing;
  if (!take && d >= P.crumbTurnMin && m.crumbLen >= 2) {
    crumbAt(ant, m.crumbLen - 2, _b);
    const sx = _a.x - _b.x, sy = _a.y - _b.y, sz = _a.z - _b.z, sl = Math.sqrt(sx * sx + sy * sy + sz * sz);
    if (sl > 1e-6) take = (sx * dx + sy * dy + sz * dz) / (sl * d) < P.crumbTurnCos;
  }
  if (!take) return;
  // loop erasure: back near an older crumb k -> drop everything after k
  const lc2 = P.loopClose * P.loopClose, c = m.crumbs;
  for (let k = 0; k < m.crumbLen - 1; k++) {
    const ex = p.x - c[3 * k], ey = p.y - c[3 * k + 1], ez = p.z - c[3 * k + 2];
    if (ex * ex + ey * ey + ez * ez <= lc2) {
      m.crumbLen = k + 1;
      m.crumbHead = m.crumbLen;
      return;
    }
  }
  push(ant, p);
}

/**
 * Path integration (GDD 02 §9.1): homeVec (ant -> home entrance) integrates this step's displacement (pos - prevPos;
 * call after the step), with PI_NOISE error in a hashed random horizontal direction. resetHomeVec on leaving.
 */
export function integrateHome(ant: Ant, r: LocoRuntime, tick: number): void {
  const dx = ant.pos.x - ant.prevPos.x, dy = ant.pos.y - ant.prevPos.y, dz = ant.pos.z - ant.prevPos.z;
  const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const h = ant.mem.homeVec;
  h.x -= dx; h.y -= dy; h.z -= dz;
  if (d > 0) {
    const e = r.P.piNoise * d, a = noise01(ant.id, tick, 41) * 2 * Math.PI;
    h.x += Math.cos(a) * e; h.z += Math.sin(a) * e;
    ant.mem.homeVecErr += e;
  }
}

export function resetHomeVec(ant: Ant, entrance: Vec3 | null): void {
  const h = ant.mem.homeVec;
  if (entrance) set3(h, entrance.x - ant.pos.x, entrance.y - ant.pos.y, entrance.z - ant.pos.z); else set3(h, 0, 0, 0);
  ant.mem.homeVecErr = 0;
}

/** Straight walkable line for a shortcut (GDD 02 §9.2). */
function shortcutOk(sim: Sim, ant: Ant, r: LocoRuntime, from: Vec3, to: Vec3): boolean {
  const g = sim.navGrid;
  const discs = (ant.flags & AntFlag.POSSESSED) === 0 ? avoidDiscs(sim, r, ant.colony) : null;
  if (isLocoNavGrid(g) && !g.gridVisible(from, to, discs)) return false;
  // nothing above the surface in between (stones, walls): one sweep, lifted along the start's normal
  const lift = r.P.shortcutLift;
  set3(_a, from.x + ant.up.x * lift, from.y + ant.up.y * lift, from.z + ant.up.z * lift);
  set3(_b, to.x, to.y + lift, to.z);
  return sim.field.segmentFree(_a, _b, r.P.shortcutR);
}

const _c: Vec3 = { x: 0, y: 0, z: 0 };

/**
 * Retrace step: picks the current crumb target (with shortcuts) into out. Returns false when home is reached
 * (past crumb 0) or there are no crumbs.
 */
export function retraceTarget(sim: Sim, ant: Ant, s: NavScratch, r: LocoRuntime, out: Vec3): boolean {
  const n = ant.mem.crumbLen;
  if (n === 0) return false;
  let check = false;
  if (s.crumbIdx < 0 || s.crumbIdx >= n) { s.crumbIdx = n - 1; check = true; }
  while (s.crumbIdx >= 0 && crumbDist(ant, s.crumbIdx) <= r.P.crumbReach) { s.crumbIdx--; check = true; }
  if (s.crumbIdx < 0) return false;
  if (check) {
    // shortcut: the oldest of crumbs idx-L .. idx-1 in a clear line
    const lo = Math.max(0, s.crumbIdx - r.P.shortcutN);
    for (let j = lo; j < s.crumbIdx; j++) {
      crumbAt(ant, j, _c);
      if (shortcutOk(sim, ant, r, ant.pos, _c)) { s.crumbIdx = j; break; }
    }
  }
  crumbAt(ant, s.crumbIdx, out);
  return true;
}

function crumbDist(ant: Ant, i: number): number {
  crumbAt(ant, i, _c);
  return Math.sqrt((ant.pos.x - _c.x) ** 2 + (ant.pos.y - _c.y) ** 2 + (ant.pos.z - _c.z) ** 2);
}
