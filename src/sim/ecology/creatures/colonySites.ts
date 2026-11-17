// Where a colony-range territory goes (threats-live; GDD 05 §2.2: hunters where the ants are - jumping spiders on
// the stems ants climb, ant-spiders near trails, wolf spiders across the paths). Predators strike only an ant that
// pauses in reach (the wind-up gate, attack.ts), and the colony's ants pause at their food sources (harvesting,
// tending, drinking), so a site goes next to one of the colony's nearest sources ("pause points") when the ring
// allows it, else near the routes entrance -> source, else anywhere in the kind's habitat in the ring.
// Pure functions of the world and the saved state; draws come from the caller's forked stream.

import type { Vec3 } from '@/core/math/vec3';
import type { Quat } from '@/core/math/quat';
import { quatRotateVec3 } from '@/core/math/quat';
import type { CreatureKind, Primitive, Sim } from '@/sim/types';
import { PrimFlag } from '@/sim/types';
import type { RngState } from '@/core/rng';
import { rngRange } from '@/core/rng';
import { zoneAt } from '@/sim/world';
import {
  COLONY_PAUSE_KINDS, COLONY_PAUSE_SOURCES, COLONY_RANGE_BU, COLONY_RANGE_CANDIDATES, COLONY_RANGE_ZONES, COLONY_ROUTE_NEAR_BU,
  COLONY_ROUTE_REACH_BU, COLONY_SOURCE_CANDIDATES, COLONY_SOURCE_NEAR_BU, JUMPING_SPIDER_SITE_MARGIN_MM,
  JUMPING_SPIDER_SURFACE_MIN_MM, UPRIGHT_MAX_TILT_DEG,
} from '@/sim/balance/creatures';

type P2 = { x: number; z: number };
const hdist = (a: P2, b: P2): number => Math.hypot(a.x - b.x, a.z - b.z);

export function inRing(sim: Sim, anchor: Vec3, p: P2): boolean {
  const d = hdist(p, anchor) / sim.world.bu;
  return d >= COLONY_RANGE_BU[0] && d <= COLONY_RANGE_BU[1];
}

/** Open ground at (x, z): on the world, in one of `zones`, not under an object. Returns the ground point. */
function openGround(sim: Sim, x: number, z: number, zones: readonly string[]): Vec3 | null {
  if (x < 0 || z < 0 || x > sim.world.size || z > sim.world.size) return null;
  if (!zones.includes(zoneAt(sim.world, x, z))) return null;
  const y = sim.field.height(x, z);
  if (sim.field.sample({ x, y: y + sim.world.bu, z }) <= 0) return null;
  return { x, y, z };
}

// ------------------------------------------------------------------ pause points and routes

/** Live food sources within reach of the colony, nearest the entrance first (where its foragers walk and pause). */
export function colonySources(sim: Sim, anchor: Vec3): Vec3[] {
  const reach = COLONY_ROUTE_REACH_BU * sim.world.bu;
  const out: { p: Vec3; d: number; id: number }[] = [];
  for (const s of sim.stores.sources.list) {
    if (!s.alive) continue;
    const d = hdist(s.pos, anchor);
    if (d <= reach) out.push({ p: s.pos, d, id: s.id });
  }
  out.sort((a, b) => a.d - b.d || a.id - b.id);
  return out.map((o) => o.p);
}

/** Horizontal distance from p to the nearest route segment (anchor -> source); Infinity without routes. */
function routeDist(anchor: Vec3, ends: readonly Vec3[], p: P2): number {
  let best = Infinity;
  for (const e of ends) {
    const dx = e.x - anchor.x, dz = e.z - anchor.z, l2 = dx * dx + dz * dz;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - anchor.x) * dx + (p.z - anchor.z) * dz) / l2)) : 0;
    best = Math.min(best, Math.hypot(p.x - (anchor.x + dx * t), p.z - (anchor.z + dz * t)));
  }
  return best;
}

/** Kinds that wait at the pause points rather than along the routes (COLONY_PAUSE_KINDS). */
export function atPausePoints(kind: CreatureKind): boolean {
  return COLONY_PAUSE_KINDS.includes(kind);
}

/**
 * The site among `cands`: for a pause-point kind, random among those within COLONY_SOURCE_NEAR_BU of the nearest
 * pause point that has any (the COLONY_PAUSE_SOURCES sources nearest the entrance); else random among those within
 * COLONY_ROUTE_NEAR_BU of a route, else the one nearest a route, else (no sources yet) the first.
 */
export function pickSite(sim: Sim, anchor: Vec3, kind: CreatureKind, cands: readonly Vec3[], sources: readonly Vec3[], pick: number): Vec3 | null {
  if (cands.length === 0) return null;
  const bu = sim.world.bu;
  const randomOf = (l: readonly Vec3[]) => l[Math.min(l.length - 1, Math.floor(pick * l.length))];
  for (const s of atPausePoints(kind) ? sources.slice(0, COLONY_PAUSE_SOURCES) : []) {
    const near = cands.filter((c) => hdist(c, s) <= COLONY_SOURCE_NEAR_BU * bu);
    if (near.length > 0) return randomOf(near);
  }
  if (sources.length === 0) return cands[0];
  const d = cands.map((c) => routeDist(anchor, sources, c));
  const close = cands.filter((_, i) => d[i] <= COLONY_ROUTE_NEAR_BU * bu);
  if (close.length > 0) return randomOf(close);
  let bi = 0;
  for (let i = 1; i < cands.length; i++) if (d[i] < d[bi]) bi = i;
  return cands[bi];
}

// ------------------------------------------------------------------ ground kinds

/**
 * Ground sites in the kind's zones inside the ring: for a pause-point kind COLONY_SOURCE_CANDIDATES points around each
 * of the nearest pause points (pulled into the ring when the source lies inside its inner edge), then
 * COLONY_RANGE_CANDIDATES anywhere in the ring (distance drawn uniformly: the colony's ants are densest near the
 * entrance).
 */
export function groundSites(sim: Sim, anchor: Vec3, kind: CreatureKind, sources: readonly Vec3[], rng: RngState): Vec3[] {
  const zones = COLONY_RANGE_ZONES[kind] ?? [];
  const bu = sim.world.bu, r0 = COLONY_RANGE_BU[0] * bu, r1 = COLONY_RANGE_BU[1] * bu, near = COLONY_SOURCE_NEAR_BU * bu;
  const out: Vec3[] = [];
  const push = (a: number, r: number) => {
    const p = openGround(sim, anchor.x + Math.cos(a) * r, anchor.z + Math.sin(a) * r, zones);
    if (p && inRing(sim, anchor, p)) out.push(p);
  };
  for (const s of atPausePoints(kind) ? sources.slice(0, COLONY_PAUSE_SOURCES) : []) {
    const a0 = Math.atan2(s.z - anchor.z, s.x - anchor.x);
    const rs = Math.min(r1, Math.max(r0, hdist(s, anchor)));
    const da = near / rs; // an arc of +-COLONY_SOURCE_NEAR_BU at that radius
    for (let i = 0; i < COLONY_SOURCE_CANDIDATES; i++) {
      push(a0 + rngRange(rng, -da, da), Math.min(r1, Math.max(r0, rs + rngRange(rng, -near, near))));
    }
  }
  for (let i = 0; i < COLONY_RANGE_CANDIDATES; i++) push(rngRange(rng, 0, 2 * Math.PI), rngRange(rng, r0, r1));
  return out;
}

// ------------------------------------------------------------------ jumping spider: vertical surfaces

const _ax: Vec3 = { x: 0, y: 0, z: 0 };
/** World-space y component of the primitive's local axis `i` (0 x, 1 y, 2 z). */
function axisY(rot: Quat, i: number): number {
  return quatRotateVec3(_ax, rot, { x: i === 0 ? 1 : 0, y: i === 1 ? 1 : 0, z: i === 2 ? 1 : 0 }).y;
}

/**
 * An upright solid primitive (a face or axis within UPRIGHT_MAX_TILT_DEG of vertical: wall, post, stem, trunk): its
 * world-space top (mm) and the horizontal radius of its foot. Null for lying ones (a fallen log, a board on the
 * ground) and visual-only ones. `size` holds local half-extents, so the rotation is applied.
 */
export function uprightPrim(p: Primitive): { top: number; footR: number } | null {
  if (p.flags & PrimFlag.VISUAL_ONLY) return null;
  const cosMax = Math.cos((UPRIGHT_MAX_TILT_DEG * Math.PI) / 180);
  const ay = [axisY(p.rot, 0), axisY(p.rot, 1), axisY(p.rot, 2)].map(Math.abs);
  const s = [p.size.x, p.size.y, p.size.z];
  if (p.shape === 'cylinder' || p.shape === 'capsule') {
    if (ay[1] < cosMax) return null;
    const side = Math.sqrt(Math.max(0, 1 - ay[1] * ay[1]));
    const hy = ay[1] * s[1] + (p.shape === 'capsule' ? s[0] : s[0] * side);
    return { top: p.pos.y + hy, footR: s[0] };
  }
  const up = ay.findIndex((v) => v >= cosMax);
  if (up < 0) return null;
  const others = [0, 1, 2].filter((i) => i !== up).map((i) => s[i]);
  if (p.shape === 'ellipsoid') {
    // a steep-sided boulder only: taller than it is wide
    if (s[up] < Math.max(...others)) return null;
    return { top: p.pos.y + Math.hypot(ay[0] * s[0], ay[1] * s[1], ay[2] * s[2]), footR: Math.max(...others) };
  }
  return { top: p.pos.y + ay[0] * s[0] + ay[1] * s[1] + ay[2] * s[2], footR: Math.hypot(others[0], others[1]) };
}

/**
 * Jumping-spider sites: the foot of each upright primitive (of a world object) rising at least
 * JUMPING_SPIDER_SURFACE_MIN_MM, on the side facing the colony, on open ground in the kind's zones inside the ring.
 */
export function jumpingSpiderSites(sim: Sim, anchor: Vec3): Vec3[] {
  const zones = COLONY_RANGE_ZONES['jumping-spider'] ?? [];
  const r1 = (COLONY_RANGE_BU[1] + 10) * sim.world.bu;
  const sites: Vec3[] = [];
  for (const ob of sim.world.objects) {
    for (let i = ob.primStart; i < ob.primStart + ob.primCount; i++) {
      const p = sim.world.prims[i];
      if (!p || hdist(p.pos, anchor) > r1 + Math.max(p.size.x, p.size.y, p.size.z)) continue;
      const up = uprightPrim(p);
      if (!up || up.top - sim.field.height(p.pos.x, p.pos.z) < JUMPING_SPIDER_SURFACE_MIN_MM) continue;
      const dx = anchor.x - p.pos.x, dz = anchor.z - p.pos.z, l = Math.hypot(dx, dz) || 1;
      const off = up.footR + JUMPING_SPIDER_SITE_MARGIN_MM;
      const site = openGround(sim, p.pos.x + (dx / l) * off, p.pos.z + (dz / l) * off, zones);
      if (site && inRing(sim, anchor, site)) sites.push(site);
    }
  }
  return sites;
}
