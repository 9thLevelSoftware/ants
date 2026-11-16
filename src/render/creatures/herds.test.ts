// Aphids sit ON their plant (GDD 05 §1.4): every spot lies on a primitive's surface, nearest the herd's site first,
// stems wrapped ring by ring, leaves on their underside; the herd layer draws min(A, cap) of them.
import { describe, expect, it } from 'vitest';
// Load order: the sim's ecology <-> human-events import cycle only resolves when ecology is loaded first (also fails on HEAD; sim owners' fix).
import '@/sim/ecology';
import { PerspectiveCamera, Scene } from 'three';
import type { Primitive } from '@/sim/types';
import { getPreset } from '@/render/app/quality';
import { herdSpots } from './herds';
import { CreatureRenderer } from './CreatureRenderer';
import type { CreatureSimSource } from './simAdapter';

const q = (ax: number, ay: number, az: number, a: number) => { const s = Math.sin(a / 2), l = Math.hypot(ax, ay, az); return { x: (ax / l) * s, y: (ay / l) * s, z: (az / l) * s, w: Math.cos(a / 2) }; };
const prim = (shape: Primitive['shape'], pos: [number, number, number], size: [number, number, number], rot = q(0, 0, 1, 0)): Primitive => ({
  id: 1, shape, pos: { x: pos[0], y: pos[1], z: pos[2] }, rot, size: { x: size[0], y: size[1], z: size[2] }, round: 0, material: 'plant', flags: 0, objectId: 1,
});

/** Distance of p from a capsule's surface (axis = rotated local Y). */
function capsuleDist(c: Primitive, p: { x: number; y: number; z: number }): number {
  const ax = { x: 2 * (c.rot.x * c.rot.y - c.rot.w * c.rot.z), y: 1 - 2 * (c.rot.x * c.rot.x + c.rot.z * c.rot.z), z: 2 * (c.rot.y * c.rot.z + c.rot.w * c.rot.x) };
  const d = { x: p.x - c.pos.x, y: p.y - c.pos.y, z: p.z - c.pos.z };
  const t = Math.max(-c.size.y, Math.min(c.size.y, d.x * ax.x + d.y * ax.y + d.z * ax.z));
  return Math.hypot(d.x - ax.x * t, d.y - ax.y * t, d.z - ax.z * t) - c.size.x;
}

describe('herd spots', () => {
  it('wrap an upright stem around the site, on its surface, nearest first, heads down the stem', () => {
    const stem = prim('capsule', [0, 30, 0], [1.2, 30, 0]);
    const site = { x: -1.2, y: 40, z: 0 };
    const spots = herdSpots([stem], site, 200, 7);
    expect(spots.length).toBe(200);
    for (const s of spots) {
      expect(Math.abs(capsuleDist(stem, s.pos))).toBeLessThan(0.05);
      expect(Math.hypot(s.up.x, s.up.y, s.up.z)).toBeCloseTo(1, 5);
      expect(Math.abs(s.up.x * s.fwd.x + s.up.y * s.fwd.y + s.up.z * s.fwd.z)).toBeLessThan(1e-6);
    }
    // the first spot is next to the site; later ones spread along the stem
    expect(Math.hypot(spots[0]!.pos.x - site.x, spots[0]!.pos.y - site.y, spots[0]!.pos.z - site.z)).toBeLessThan(0.6);
    const ys = spots.slice(0, 10).map((s) => Math.abs(s.pos.y - 40));
    expect(Math.max(...ys)).toBeLessThan(3);
    const meanFwdY = spots.reduce((a, s) => a + s.fwd.y, 0) / spots.length;
    expect(meanFwdY).toBeLessThan(-0.5);
  });

  it('lie on a horizontal twig and on the underside of a leaf', () => {
    const twig = prim('capsule', [10, 0.5, 0], [0.5, 2.5, 0], q(0, 0, 1, Math.PI / 2));
    const t = herdSpots([twig], { x: 10, y: 1, z: 0 }, 4, 1);
    expect(t.length).toBe(4);
    for (const s of t) expect(Math.abs(capsuleDist(twig, s.pos))).toBeLessThan(0.05);
    const leaf = prim('ellipsoid', [0, 20, 0], [10, 0.35, 5.5], q(0, 0, 1, 0.2));
    const l = herdSpots([leaf], { x: 0, y: 19.6, z: 0 }, 60, 3);
    expect(l.length).toBeGreaterThan(30);
    for (const s of l) {
      expect(s.up.y).toBeLessThan(-0.9); // underside
      const k = Math.hypot(((s.pos.x) * Math.cos(-0.2) - (s.pos.y - 20) * Math.sin(-0.2)) / 10, ((s.pos.x) * Math.sin(-0.2) + (s.pos.y - 20) * Math.cos(-0.2)) / 0.35, s.pos.z / 5.5);
      expect(k).toBeGreaterThan(0.9); expect(k).toBeLessThan(1.1);
    }
  });

  it('the renderer draws min(A, cap) aphids of a herd on its plant', () => {
    const stem = prim('capsule', [0, 30, 0], [1.2, 30, 0]);
    const src: CreatureSimSource = {
      state: {
        tick: 10, creatures: [], plants: [{ id: 5, alive: true, objectId: 1 }],
        ecology: { herds: [{ id: 9, alive: true, kind: 'aphid', hostId: 5, segment: 0, a: 37.4 }], hazards: [], birdEvent: null },
      },
      world: { prims: [stem], objects: [{ id: 1, pos: { x: 0, y: 0, z: 0 }, primStart: 0, primCount: 1, poiIds: [2] }], pois: [{ id: 2, kind: 'aphid-site', pos: { x: -1.2, y: 40, z: 0 }, objectId: 1 }] },
    };
    const scene = new Scene();
    const camera = new PerspectiveCamera(40, 16 / 9, 0.1, 5000);
    camera.position.set(0, 45, 60); camera.lookAt(0, 40, 0); camera.updateMatrixWorld();
    const r = new CreatureRenderer();
    r.init({ scene, camera, quality: getPreset('high') });
    r.setSim(src);
    r.update({ dt: 1 / 60, time: 0, alpha: 1, camera, viewportHeightPx: 720 });
    expect(r.stats.herds).toBe(1);
    expect(r.stats.aphids).toBe(37);
    src.state.ecology!.herds[0]!.a = 500;
    r.update({ dt: 1 / 60, time: 0, alpha: 1, camera, viewportHeightPx: 720 });
    expect(r.stats.aphids).toBe(200); // GDD 05 §1.4: up to 200 instances
    r.dispose();
  });
});
