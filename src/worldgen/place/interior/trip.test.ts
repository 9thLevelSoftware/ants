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

type Wp = Waypoint;
const dist2 = (a: Vec3, b: Vec3) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;

/** Waypoints through a micro-connection, entered from the mouth nearer `from`. */
function through(w: WorldData, k: Kernel, m: MicroConn, from: Vec3, foot: number): Wp[] {
  const dA = (m.posA.x - from.x) ** 2 + (m.posA.z - from.z) ** 2, dB = (m.posB.x - from.x) ** 2 + (m.posB.z - from.z) ** 2;
  const [p0, p1] = dA <= dB ? [m.posA, m.posB] : [m.posB, m.posA];
  const mid: Wp[] = [];
  if (m.kind === 'door-crack') {
    const leaf = w.prims[w.objects.find((o) => o.templateId === 'back-door')!.primStart];
    const sillTop = leaf.pos.y - leaf.size.y - m.gapMm;
    // the sill's garden face (nose 30 beyond the wall; the leaf's outer face is 40 inside it), 20 below its top
    const ox = Math.sign(p0.x - leaf.pos.x) * (Math.abs(p0.x - leaf.pos.x) > Math.abs(p0.z - leaf.pos.z) ? 1 : 0);
    const oz = ox === 0 ? Math.sign(p0.z - leaf.pos.z) : 0;
    const nose = 40 + leaf.size.z * (oz !== 0 ? 1 : 0) + leaf.size.x * (ox !== 0 ? 1 : 0) + 30 + foot;
    mid.push({ p: { x: leaf.pos.x + ox * nose, y: sillTop - 20, z: leaf.pos.z + oz * nose }});
    mid.push({ p: { x: leaf.pos.x, y: sillTop + foot, z: leaf.pos.z } });
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
    // pipe runs from 40 outside the garden face (t = -half) to 10 inside the room (t = half)
    const face = -half + 40, inner = half - 10;
    mid.push({ p: at(face - foot, bottom - 12)}, { p: at(face + 5, bottom + foot) }, { p: at(inner - 5, bottom + foot) }, { p: at(inner + foot, bottom - 12) });
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
      // the outside mouth of the open indoor-outdoor connection (the door crack unless the door is sealed)
      const crack = w.micro.find((m) => (m.kind === 'door-crack' || m.kind === 'pipe-penetration') && m.minClearanceBu >= 0.6 - 1e-9)!;
      // start outside the door, one terrain cell beyond the wall (outdoor props on the patio - mats with curled
      // edges, steps, slab joints - are the outdoor module's and are not part of this check)
      const ctx = navCtx(w);
      const start = snapWalkable(ctx, cellAt(ctx, crack.posA.x, crack.posA.z), 2);
      const goal = snapWalkable(ctx, cellAt(ctx, route.points[0].x, route.points[0].z), 3);
      const path = navPathWithPortals(w, start, goal);
      expect(path, `seed ${seed} nav path`).not.toBeNull();
      const portals = path!.filter((s) => s.viaMicro >= 0).map((s) => w.micro.find((m) => m.id === s.viaMicro)!);
      expect(portals.map((m) => m.kind).filter((k2) => k2 === 'door-crack' || k2 === 'pipe-penetration').length, `seed ${seed} one indoor-outdoor portal`).toBe(1);
      const wps: Wp[] = [];
      let prev = cellCentre(w, start);
      let steps = path!;
      for (let i = 0; i < steps.length; i++) {
        const s = steps[i];
        const c = cellCentre(w, s.cell);
        if (s.viaMicro >= 0) {
          const m = w.micro.find((x) => x.id === s.viaMicro)!;
          wps.push(...through(w, k, m, prev, foot));
          if (m.kind === 'pipe-penetration') {
            // the pipe comes out in the kick space under the sink: leave it through the run's kick-space gap
            // (a second micro-connection), behind the plinth legs, then plan on from its room-side mouth
            const kick = w.micro.filter((x) => x.kind === 'kick-space').reduce((a, b) => (dist2(a.posB, m.posB) < dist2(b.posB, m.posB) ? a : b));
            const back = { x: kick.posB.x + (kick.posB.x - kick.posA.x) * 2, y: kick.posB.y + foot, z: kick.posB.z + (kick.posB.z - kick.posA.z) * 2 };
            const inner = { x: m.posB.x, y: m.posB.y + foot, z: m.posB.z };
            const turn = Math.abs(kick.posA.x - kick.posB.x) > Math.abs(kick.posA.z - kick.posB.z) ? { x: back.x, y: back.y, z: inner.z } : { x: inner.x, y: back.y, z: back.z };
            wps.push({ p: turn }, { p: back }, { p: { ...kick.posB, y: kick.posB.y + foot } }, { p: { ...kick.posA, y: kick.posA.y + foot } });
            const rest = navPathWithPortals(w, snapWalkable(ctx, cellAt(ctx, kick.posA.x, kick.posA.z), 2), goal);
            expect(rest, `seed ${seed} path from the kick space`).not.toBeNull();
            steps = rest!;
            i = -1;
            prev = { ...kick.posA };
            continue;
          }
        }
        wps.push({ p: c, flat: true, arrive: 0.6 * w.nav.cls.cell });
        prev = c;
      }
      wps.push(...route.points.map((p) => ({ p })), { p: poi.pos, arrive: 2 * w.bu });
      const kin = walkerAt(k, { x: crack.posA.x, y: crack.posA.y + 120, z: crack.posA.z })!;
      const res = follow(k, kin, wps, 6, 200_000, 600);
      log.push(`seed ${seed}: ${portals.map((m) => m.kind)} reached ${res.reached}/${wps.length} at ${JSON.stringify(res.pos)} next ${JSON.stringify(wps[res.reached]?.p)}`);
      expect(res.ok, log[log.length - 1]).toBe(true);
      trips++;
    }
    console.log(log.join('\n'));
    expect(trips, log.join('\n')).toBeGreaterThanOrEqual(3);
  });
});
