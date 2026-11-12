// Test support for the interior (used by the *.test.ts files next to it): a kernel built on a generated world,
// a kernel walker steered waypoint to waypoint, nav-grid paths with micro-connection portals, and the
// interior-room cell test. Pure; kernel and worldgen imports only.

import type { Vec3 } from '@/core/math/vec3';
import { createKernel, type Kernel } from '@/sim/kernel';
import { createWalkerKin, walkerPlace, walkerStep, type WalkerKin } from '@/sim/locomotion/walker';
import type { MicroConn, WorldData } from '@/sim/types';
import { portals, cellAt, navDistances } from '../../validate/graph';
import { walkable } from '../../maps/nav';
import { MICRO } from '../../tuning/pipeline';

export function kernelFor(w: WorldData): Kernel {
  return createKernel(w, { voxel: w.bu / 2, keys: [], chunks: [], breaches: [] });
}

/** Minimal GenContext for the validation graph helpers on a finished world. */
export function navCtx(w: WorldData, micro: MicroConn[] = w.micro) {
  return { dims: { navN: w.nav.cls.nx, navCell: w.nav.cls.cell, bu: w.bu }, world: { ...w, micro } } as unknown as Parameters<typeof navDistances>[0];
}

/** A waypoint; `flat` steers in the horizontal plane only (cell-to-cell travel on the ground). */
export interface Waypoint { p: Vec3; flat?: boolean; arrive?: number }

export interface FollowResult { ok: boolean; reached: number; steps: number; minUpY: number; fell: boolean; pos: Vec3 }

/**
 * Steers a kernel walker to each waypoint in turn (desired direction = towards the waypoint), at `speedBu` BU/s
 * in 0.1 s ticks. Fails if it falls or makes no progress for `stallSteps` steps.
 */
export function follow(k: Kernel, kin: WalkerKin, pts: readonly Waypoint[], speedBu = 6, maxSteps = 60_000, stallSteps = 400): FollowResult {
  const bu = k.bu, dir: Vec3 = { x: 0, y: 0, z: 0 };
  let i = 0, steps = 0, best = Infinity, since = 0, minUpY = kin.up.y;
  while (i < pts.length && steps < maxSteps) {
    const w = pts[i], arrive = w.arrive ?? 0.75 * bu;
    // flat waypoints steer level while the walker stands on level ground, in 3D while it climbs a face
    const dx = w.p.x - kin.pos.x, dy = w.flat && kin.up.y > 0.7 ? 0 : w.p.y - kin.pos.y, dz = w.p.z - kin.pos.z;
    const l = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (l < arrive) { i++; best = Infinity; since = 0; continue; }
    if (l < best - 0.1 * bu) { best = l; since = 0; } else if (++since > stallSteps) break;
    dir.x = dx / l; dir.y = dy / l; dir.z = dz / l;
    walkerStep(k.field, kin, dir, speedBu * bu, 0.1, k.walker);
    steps++;
    if (kin.up.y < minUpY) minUpY = kin.up.y;
    if (kin.medium === 'air') return { ok: false, reached: i, steps, minUpY, fell: true, pos: { ...kin.pos } };
  }
  return { ok: i >= pts.length, reached: i, steps, minUpY, fell: false, pos: { ...kin.pos } };
}

/** A walker placed on the surface just below p (dropped from 2 BU above). */
export function walkerAt(k: Kernel, p: Vec3): WalkerKin | null {
  const kin = createWalkerKin(k.walker.footOffset);
  const ok = walkerPlace(k.field, kin, { x: p.x, y: p.y + 2 * k.bu, z: p.z }, { dir: { x: 0, y: -1, z: 0 } }, k.walker);
  return ok ? kin : null;
}

export interface NavStep { cell: number; viaMicro: number }

/** Nav-grid path from `from` to `to` (cells) by steepest descent of the distance to `to`; portals allowed. */
export function navPathWithPortals(w: WorldData, from: number, to: number): NavStep[] | null {
  const ctx = navCtx(w);
  const d = navDistances(ctx, [to]);
  if (!(d[from] < Infinity)) return null;
  const ports = portals(ctx).filter((p) => p.clearanceBu >= MICRO.passClearK); // as the distance search
  const n = w.nav.cls.nx, cls = w.nav.cls.data;
  const out: NavStep[] = [{ cell: from, viaMicro: -1 }];
  let c = from;
  while (c !== to && out.length < 8 * n) {
    let best = c, via = -1;
    const ci = c % n, ck = Math.floor(c / n);
    for (let dk = -1; dk <= 1; dk++) for (let di = -1; di <= 1; di++) {
      const x = ci + di, z = ck + dk;
      if ((!di && !dk) || x < 0 || z < 0 || x >= n || z >= n) continue;
      const j = z * n + x;
      if (!walkable(cls[j]) || (di && dk && (!walkable(cls[ck * n + x]) || !walkable(cls[z * n + ci])))) continue;
      if (d[j] < d[best]) { best = j; via = -1; }
    }
    for (const p of ports) {
      if (p.a !== c && p.b !== c) continue;
      const j = p.a === c ? p.b : p.a;
      if (d[j] + p.lenBu <= d[c] + 1e-6 && d[j] < d[best]) { best = j; via = p.microId; }
    }
    if (best === c) return null;
    out.push({ cell: best, viaMicro: via });
    c = best;
  }
  return c === to ? out : null;
}

export function cellCentre(w: WorldData, c: number): Vec3 {
  const n = w.nav.cls.nx, cell = w.nav.cls.cell;
  return { x: ((c % n) + 0.5) * cell, y: w.nav.groundY ? w.nav.groundY[c] : 0, z: (Math.floor(c / n) + 0.5) * cell };
}

/** Cells whose centre lies inside the room's floor finish (the kitchen proper). */
export function roomCells(w: WorldData): Set<number> {
  const floor = w.objects.find((o) => o.templateId === 'floor-slab');
  const out = new Set<number>();
  if (!floor) return out;
  const p = w.prims[floor.primStart + 1];
  const n = w.nav.cls.nx, cell = w.nav.cls.cell;
  for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) {
    const x = (i + 0.5) * cell, z = (k + 0.5) * cell;
    if (x > p.pos.x - p.size.x && x < p.pos.x + p.size.x && z > p.pos.z - p.size.z && z < p.pos.z + p.size.z) out.add(k * n + i);
  }
  return out;
}

export { cellAt, walkable };
