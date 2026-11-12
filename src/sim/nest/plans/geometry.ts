// Plan geometry (GDD 03 §7.1, §7.2): the analytic plan volume g(p) (> 0 inside: a union of capsules and an
// optional yawed ellipsoid, minus pillar cylinders) and its expansion into ordered carve spheres (§7.4).
//
// The geometry is rebuilt from the persisted plan record alone, so the record holds the RESOLVED geometry:
// tunnel/shaft `geom.end` (+ `bend`), entrance `anchor.pos` (cavity end) and `geom.surfacePoint`, chamber
// `geom.yawDeg` (absolute yaw of the neck direction) and, for chamber plans only, `geom.length` = pillar count.

import type { Vec3 } from '@/core/math/vec3';
import { sdCapsuleSegment, sdEllipsoid } from '@/core/math/sdf';
import type { ChamberSize, ChamberType, DigPlan, PlanKind, PlanSphere, SpeciesId } from '@/sim/types';
import {
  CHAMBER_SILL_BU, ENTRANCE_FLARE_BU, ENTRANCE_FLARE_LEN_BU, LATTICE_SHRINK_BU, LATTICE_SPHERE_R_BU, LATTICE_STEP_BU,
  NECK_LEN_BU, PILLAR_D_BU, SPHERE_PAD_BU, SPHERE_STEP_TUNNEL_BU, nestTemplate, type ChamberDims,
} from '@/sim/balance/nest';

export interface Capsule { a: Vec3; b: Vec3; r: number }

export interface PlanEllipsoid {
  c: Vec3;
  /** Half extents along the local axes: w (across, = neck direction), h (up), l (long axis). */
  hw: number; hh: number; hl: number;
  /** Unit horizontal axes: across (neck direction) and long. */
  aw: Vec3; al: Vec3;
}

export interface PlanGeometry {
  kind: PlanKind;
  capsules: Capsule[];
  ellipsoid: PlanEllipsoid | null;
  /** Pillar centres on the ellipsoid's mid plane, radius, mm. */
  pillars: Vec3[];
  pillarR: number;
  /** AABB of the volume, mm. */
  min: Vec3;
  max: Vec3;
  /** Where chamber digging enters the room (neck end), mm. */
  mouth: Vec3;
}

const P: Vec3 = { x: 0, y: 0, z: 0 };

/** Plan volume: > 0 inside, approximately the distance to the boundary (negative outside), mm. */
export function planG(g: PlanGeometry, x: number, y: number, z: number): number {
  P.x = x; P.y = y; P.z = z;
  let best = -Infinity;
  for (const c of g.capsules) {
    const d = -sdCapsuleSegment(P, c.a, c.b, c.r);
    if (d > best) best = d;
  }
  const e = g.ellipsoid;
  if (e) {
    const dx = x - e.c.x, dy = y - e.c.y, dz = z - e.c.z;
    P.x = dx * e.aw.x + dz * e.aw.z; P.y = dy; P.z = dx * e.al.x + dz * e.al.z;
    let d = -sdEllipsoid(P, e.hw, e.hh, e.hl);
    for (const p of g.pillars) d = Math.min(d, Math.hypot(x - p.x, z - p.z) - g.pillarR); // minus the pillars
    if (d > best) best = d;
  }
  return best;
}

/** Chamber dimensions of a type and size for a species (BU), or null when it does not build that. */
export function chamberDims(species: SpeciesId | string, type: ChamberType, size: ChamberSize): ChamberDims | null {
  return nestTemplate(species).chambers[type]?.[size] ?? null;
}

function bounds(g: PlanGeometry): void {
  const min = { x: Infinity, y: Infinity, z: Infinity }, max = { x: -Infinity, y: -Infinity, z: -Infinity };
  const grow = (p: Vec3, r: number) => {
    min.x = Math.min(min.x, p.x - r); min.y = Math.min(min.y, p.y - r); min.z = Math.min(min.z, p.z - r);
    max.x = Math.max(max.x, p.x + r); max.y = Math.max(max.y, p.y + r); max.z = Math.max(max.z, p.z + r);
  };
  for (const c of g.capsules) { grow(c.a, c.r); grow(c.b, c.r); }
  if (g.ellipsoid) grow(g.ellipsoid.c, Math.max(g.ellipsoid.hw, g.ellipsoid.hh, g.ellipsoid.hl));
  g.min = min; g.max = max;
}

const yawDir = (deg: number): Vec3 => ({ x: Math.cos((deg * Math.PI) / 180), y: 0, z: Math.sin((deg * Math.PI) / 180) });

/** Rebuilds the geometry of a plan record; null when the record cannot be built (missing dims). */
export function buildGeometry(plan: DigPlan, species: SpeciesId | string, bu: number): PlanGeometry | null {
  const t = nestTemplate(species);
  const r = (t.tunnelD / 2) * bu;
  const a = plan.anchor.pos;
  const g: PlanGeometry = {
    kind: plan.kind, capsules: [], ellipsoid: null, pillars: [], pillarR: (PILLAR_D_BU / 2) * bu,
    min: { ...a }, max: { ...a }, mouth: { ...a },
  };
  switch (plan.kind) {
    case 'tunnel': case 'shaft': case 'widen': case 'backfill': {
      const end = plan.geom.end;
      if (!end) return null;
      if (plan.geom.bend) {
        g.capsules.push({ a, b: plan.geom.bend, r }, { a: plan.geom.bend, b: end, r });
      } else g.capsules.push({ a, b: end, r });
      g.mouth = { ...end };
      break;
    }
    case 'entrance': {
      const s = plan.geom.surfacePoint;
      if (!s) return null;
      const top = { x: s.x, y: s.y + 0.5 * bu, z: s.z };
      g.capsules.push({ a, b: top, r });
      const len = Math.hypot(top.x - a.x, top.y - a.y, top.z - a.z);
      const k = Math.max(0, 1 - (ENTRANCE_FLARE_LEN_BU * bu) / Math.max(len, 1e-9));
      const flareStart = { x: a.x + (top.x - a.x) * k, y: a.y + (top.y - a.y) * k, z: a.z + (top.z - a.z) * k };
      g.capsules.push({ a: flareStart, b: top, r: r + (ENTRANCE_FLARE_BU / 2) * bu });
      g.mouth = top;
      break;
    }
    case 'chamber': {
      const dims = plan.chamberType && plan.size ? chamberDims(species, plan.chamberType, plan.size) : null;
      if (!dims) return null;
      const dir = yawDir(plan.geom.yawDeg);
      const neckEnd = { x: a.x + dir.x * NECK_LEN_BU * bu, y: a.y + CHAMBER_SILL_BU * bu, z: a.z + dir.z * NECK_LEN_BU * bu };
      g.capsules.push({ a, b: neckEnd, r });
      const hw = (dims.w / 2) * bu, hh = (dims.h / 2) * bu, hl = (dims.l / 2) * bu;
      // the room starts at the neck end; its floor is level with the neck floor
      const c = { x: neckEnd.x + dir.x * hw * 0.9, y: neckEnd.y - r + hh, z: neckEnd.z + dir.z * hw * 0.9 };
      const al = { x: -dir.z, y: 0, z: dir.x };
      g.ellipsoid = { c, hw, hh, hl, aw: dir, al };
      const pillars = Math.max(0, Math.round(plan.geom.length));
      for (let n = 0; n < pillars; n++) {
        const u = ((n + 1) / (pillars + 1) - 0.5) * 2 * hl;
        g.pillars.push({ x: c.x + al.x * u, y: c.y, z: c.z + al.z * u });
      }
      g.mouth = neckEnd;
      break;
    }
    default:
      return null;
  }
  bounds(g);
  return g;
}

/** Ordered carve spheres (GDD 03 §7.4). Seal / reopen plans carry their own single sphere. */
export function expandSpheres(g: PlanGeometry, bu: number): PlanSphere[] {
  const out: PlanSphere[] = [];
  const step = SPHERE_STEP_TUNNEL_BU * bu, pad = SPHERE_PAD_BU * bu;
  const along = (c: Capsule) => {
    const len = Math.hypot(c.b.x - c.a.x, c.b.y - c.a.y, c.b.z - c.a.z);
    const n = Math.max(1, Math.ceil(len / step));
    for (let s = out.length === 0 ? 0 : 1; s <= n; s++) {
      const t = s / n;
      out.push({ c: { x: c.a.x + (c.b.x - c.a.x) * t, y: c.a.y + (c.b.y - c.a.y) * t, z: c.a.z + (c.b.z - c.a.z) * t }, r: c.r + pad, done: false, obstructed: false });
    }
  };
  if (g.kind === 'entrance') {
    along(g.capsules[0]);
    const f = g.capsules[1];
    for (const s of out) {
      const t = projT(f, s.c);
      if (t >= 0) s.r = f.r + pad;
    }
    return out;
  }
  for (const c of g.capsules) along(c);
  const e = g.ellipsoid;
  if (!e) return out;
  // lattice inside the ellipsoid shrunk by LATTICE_SHRINK, in the room's local frame
  const L = LATTICE_STEP_BU * bu, sh = LATTICE_SHRINK_BU * bu;
  const aw = Math.max(0, e.hw - sh), ah = Math.max(0, e.hh - sh), al = Math.max(0, e.hl - sh);
  const nw = Math.floor(aw / L), nh = Math.floor(ah / L), nl = Math.floor(al / L);
  const pts: { u: number; v: number; w: number; p: Vec3 }[] = [];
  const index = new Map<string, number>();
  for (let iv = -nh; iv <= nh; iv++) for (let iu = -nw; iu <= nw; iu++) for (let iw = -nl; iw <= nl; iw++) {
    const x = iu * L, y = iv * L, z = iw * L;
    if ((aw > 0 ? (x / aw) ** 2 : x === 0 ? 0 : 2) + (ah > 0 ? (y / ah) ** 2 : y === 0 ? 0 : 2) + (al > 0 ? (z / al) ** 2 : z === 0 ? 0 : 2) > 1) continue;
    const p = { x: e.c.x + e.aw.x * x + e.al.x * z, y: e.c.y + y, z: e.c.z + e.aw.z * x + e.al.z * z };
    if (g.pillars.some((q) => Math.hypot(p.x - q.x, p.z - q.z) < g.pillarR)) continue;
    index.set(`${iu},${iv},${iw}`, pts.length);
    pts.push({ u: iu, v: iv, w: iw, p });
  }
  if (pts.length === 0) return out;
  // geodesic (lattice-adjacency BFS) order from the point nearest the neck mouth; ties: lower y, x, z
  let start = 0, best = Infinity;
  for (let n = 0; n < pts.length; n++) {
    const d = (pts[n].p.x - g.mouth.x) ** 2 + (pts[n].p.y - g.mouth.y) ** 2 + (pts[n].p.z - g.mouth.z) ** 2;
    if (d < best - 1e-9) { best = d; start = n; }
  }
  const dist = new Array<number>(pts.length).fill(-1);
  dist[start] = 0;
  const queue = [start];
  for (let q = 0; q < queue.length; q++) {
    const a = pts[queue[q]];
    for (const [du, dv, dw] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
      const n = index.get(`${a.u + du},${a.v + dv},${a.w + dw}`);
      if (n !== undefined && dist[n] < 0) { dist[n] = dist[queue[q]] + 1; queue.push(n); }
    }
  }
  const order = pts.map((_, n) => n).filter((n) => dist[n] >= 0);
  order.sort((x, y) => dist[x] - dist[y] || pts[x].p.y - pts[y].p.y || pts[x].p.x - pts[y].p.x || pts[x].p.z - pts[y].p.z);
  const r = LATTICE_SPHERE_R_BU * bu;
  for (const n of order) out.push({ c: pts[n].p, r, done: false, obstructed: false });
  return out;
}

/** Parameter of p's projection on a capsule axis (0..1 inside the segment, -1 before a). */
function projT(c: Capsule, p: Vec3): number {
  const bx = c.b.x - c.a.x, by = c.b.y - c.a.y, bz = c.b.z - c.a.z, bb = bx * bx + by * by + bz * bz;
  if (bb === 0) return 0;
  const t = ((p.x - c.a.x) * bx + (p.y - c.a.y) * by + (p.z - c.a.z) * bz) / bb;
  return t < -1e-9 ? -1 : t;
}
