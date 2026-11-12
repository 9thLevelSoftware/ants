// worldgen-interior acceptance 5: a kernel walker starting outside reaches the pet-bowl food POI using only the
// nav grid (cell to cell), one indoor-outdoor micro-connection (door crack or pipe penetration) and the bowl's
// climb route.
import { describe, expect, it, vi } from 'vitest';
import type { Vec3 } from '@/core/math/vec3';
import type { Kernel } from '@/sim/kernel';
import type { MicroConn, WorldData } from '@/sim/types';
import { report } from '../../testing/fixtures';
import { cellAt, snapWalkable } from '../../validate/graph';
import { cellCentre, follow, kernelFor, navCtx, navPathWithPortals, walkerAt, type Waypoint } from './testkit';

vi.setConfig({ testTimeout: 600_000 });

/** Waypoints through a micro-connection, entered from the mouth nearer `from`. */
function through(w: WorldData, k: Kernel, m: MicroConn, from: Vec3, foot: number): Waypoint[] {
  const dA = (m.posA.x - from.x) ** 2 + (m.posA.z - from.z) ** 2, dB = (m.posB.x - from.x) ** 2 + (m.posB.z - from.z) ** 2;
  const [p0, p1] = dA <= dB ? [m.posA, m.posB] : [m.posB, m.posA];
  const mid: Waypoint[] = [];
  if (m.kind === 'door-crack') {
    const leaf = w.prims[w.objects.find((o) => o.templateId === 'back-door')!.primStart];
    mid.push({ p: { x: leaf.pos.x, y: leaf.pos.y - leaf.size.y - m.gapMm + foot, z: leaf.pos.z } });
  } else {
    // pipe: up the wall face to the hole, along the hole's floor beside the pipe, down the far face
    const pipe = w.objects.filter((o) => o.templateId === 'service-pipe').map((o) => w.prims[o.primStart])
      .reduce((a, b) => ((a.pos.x - p0.x) ** 2 + (a.pos.z - p0.z) ** 2 < (b.pos.x - p0.x) ** 2 + (b.pos.z - p0.z) ** 2 ? a : b));
    const bottom = pipe.pos.y - pipe.size.x - m.gapMm;
    const ux = Math.abs(p1.x - p0.x) > Math.abs(p1.z - p0.z) ? Math.sign(p1.x - p0.x) : 0, uz = ux === 0 ? Math.sign(p1.z - p0.z) : 0;
    const half = pipe.size.y; // half length of the pipe through the wall (stubs included)
    const c = pipe.pos;
    const at = (t: number, y: number): Vec3 => ({ x: c.x + ux * t, y, z: c.z + uz * t });
    // the wall foot at terrain level first: paving may leave a joint along the wall, which the walker goes down
    // into and up out of on the wall side
    const fx = c.x + ux * (-half + 40 - foot), fz = c.z + uz * (-half + 40 - foot);
    mid.push({ p: { x: fx, y: k.field.height(fx, fz) + foot, z: fz } });
    mid.push({ p: at(-half + 25, bottom - 12) }, { p: at(-half + 50, bottom + foot) }, { p: at(half - 20, bottom + foot) }, { p: at(half - 10, bottom - 12) });
  }
  return [{ p: p0, flat: true }, ...mid, { p: { ...p1, y: p1.y + foot } }];
}

describe('outside -> micro-connection -> pet bowl food', () => {
  it('a walker reaches the pet-bowl POI on several seeds', () => {
    let trips = 0;
    const log: string[] = [];
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const w = report('kitchen-door', seed).world;
      const bowls = w.objects.find((o) => o.templateId === 'pet-bowl-pair');
      if (!bowls) continue;
      const k = kernelFor(w), foot = k.walker.footOffset;
      const route = w.climbRoutes.find((r) => r.objectId === bowls.id && w.pois.some((p) => p.objectId === bowls.id && p.kind === 'food-spot'
        && (p.pos.x - r.points[r.points.length - 1].x) ** 2 + (p.pos.z - r.points[r.points.length - 1].z) ** 2 < 100 ** 2))!;
      const poi = w.pois.find((p) => p.objectId === bowls.id && p.kind === 'food-spot')!;
      const crack = w.micro.find((m) => m.kind === 'door-crack')!;
      const out = { x: crack.posA.x - crack.posB.x, z: crack.posA.z - crack.posB.z }, l = Math.sqrt(out.x ** 2 + out.z ** 2);
      const ctx = navCtx(w);
      const start = snapWalkable(ctx, cellAt(ctx, crack.posA.x + (out.x / l) * 1500, crack.posA.z + (out.z / l) * 1500), 4);
      const goal = snapWalkable(ctx, cellAt(ctx, route.points[0].x, route.points[0].z), 3);
      const path = navPathWithPortals(w, start, goal);
      expect(path, `seed ${seed} nav path`).not.toBeNull();
      const portals = path!.filter((s) => s.viaMicro >= 0).map((s) => w.micro.find((m) => m.id === s.viaMicro)!);
      expect(portals.map((m) => m.kind).filter((k2) => k2 === 'door-crack' || k2 === 'pipe-penetration').length, `seed ${seed} one indoor-outdoor portal`).toBe(1);
      const wps: Waypoint[] = [];
      let prev = cellCentre(w, start);
      for (const s of path!) {
        const c = cellCentre(w, s.cell);
        if (s.viaMicro >= 0) wps.push(...through(w, k, w.micro.find((m) => m.id === s.viaMicro)!, prev, foot));
        wps.push({ p: c, flat: true, arrive: 0.6 * w.nav.cls.cell });
        prev = c;
      }
      wps.push(...route.points.map((p) => ({ p })), { p: poi.pos, arrive: 2 * w.bu });
      const kin = walkerAt(k, { ...cellCentre(w, start), y: k.field.height(cellCentre(w, start).x, cellCentre(w, start).z) + 30 })!;
      const res = follow(k, kin, wps, 6, 200_000, 600);
      log.push(`seed ${seed}: ${portals.map((m) => m.kind)} reached ${res.reached}/${wps.length} at ${JSON.stringify(res.pos)} fell=${res.fell}`);
      expect(res.ok, log[log.length - 1]).toBe(true);
      trips++;
    }
    expect(trips, log.join('\n')).toBeGreaterThanOrEqual(3);
  });
});
