// Herds beyond the instance cap (GDD 05 §1.4 "up to 200; above that, density texture"), herd near detail under the
// shared near cap (only near detail casts shadows), and T3 scale herds drawn as scale insects.
import { describe, expect, it } from 'vitest';
// Load order: the sim's ecology <-> human-events import cycle only resolves when ecology is loaded first (also fails on HEAD; sim owners' fix).
import '@/sim/ecology';
import { PerspectiveCamera, Scene, type InstancedMesh, type Object3D } from 'three';
import type { Primitive } from '@/sim/types';
import { getPreset, type QualityId } from '@/render/app/quality';
import { CreatureRenderer } from './CreatureRenderer';
import { herdSpots } from './herds';
import type { CreatureSimSource, HerdView } from './simAdapter';
import { HERD_DENSITY } from './tuning';

const STEM: Primitive = {
  id: 1, shape: 'capsule', pos: { x: 0, y: 30, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 }, size: { x: 1.2, y: 30, z: 0 }, round: 0, material: 'plant', flags: 0, objectId: 1,
};
const SITE = { x: -1.2, y: 40, z: 0 };

function scene(herd: Partial<HerdView>, quality: QualityId, cam: [number, number, number] = [0, 45, 60]) {
  const h: HerdView = { id: 9, alive: true, kind: 'aphid', hostId: 5, segment: 0, a: 37, ...herd };
  const src: CreatureSimSource = {
    state: { tick: 10, creatures: [], plants: [{ id: 5, alive: true, objectId: 1 }], ecology: { herds: [h], hazards: [], birdEvent: null } },
    world: { prims: [STEM], objects: [{ id: 1, pos: { x: 0, y: 0, z: 0 }, primStart: 0, primCount: 1, poiIds: [2] }], pois: [{ id: 2, kind: 'aphid-site', pos: SITE, objectId: 1 }] },
  };
  const s = new Scene();
  const camera = new PerspectiveCamera(40, 16 / 9, 0.1, 5000);
  camera.position.set(...cam); camera.lookAt(0, 40, 0); camera.updateMatrixWorld();
  const r = new CreatureRenderer();
  r.init({ scene: s, camera, quality: getPreset(quality) });
  r.setSim(src);
  const frame = () => r.update({ dt: 1 / 60, time: 0, alpha: 1, camera, viewportHeightPx: 720 });
  return { r, s, h, frame };
}

function meshes(o: Object3D, name: string): InstancedMesh[] {
  const out: InstancedMesh[] = [];
  o.traverse((c) => { if ((c as InstancedMesh).isInstancedMesh && c.visible && c.name === name && (c as InstancedMesh).count > 0) out.push(c as InstancedMesh); });
  return out;
}

describe('herd density layer and herd detail', () => {
  const spotsOnStem = herdSpots([STEM], SITE, HERD_DENSITY.maxSpots, 9).length;

  for (const q of ['high', 'test'] as QualityId[]) {
    it(`${q}: a herd above the instance cap shows the rest of A in the density layer (one draw call)`, () => {
      const { r, s, h, frame } = scene({ a: 330 }, q);
      const cap = q === 'high' ? 200 : 120;
      frame();
      const total = Math.min(330, spotsOnStem);
      expect(r.stats.aphids).toBe(cap);
      expect(r.stats.herdDecals).toBe(total - cap);
      expect(meshes(s, 'herd-density').length).toBe(1);
      // shrinking below the cap empties the layer
      h.a = 50; frame();
      expect(r.stats.aphids).toBe(50);
      expect(r.stats.herdDecals).toBe(0);
      expect(meshes(s, 'herd-density').length).toBe(0);
      r.dispose();
    });
  }

  it('the density spots lie on the stem surface, past the instanced ones', () => {
    const spots = herdSpots([STEM], SITE, HERD_DENSITY.maxSpots, 9);
    expect(spots.length).toBeGreaterThan(250);
    for (const sp of spots.slice(200)) {
      const t = Math.max(-30, Math.min(30, sp.pos.y - 30));
      expect(Math.abs(Math.hypot(sp.pos.x, sp.pos.y - 30 - t, sp.pos.z) - 1.2)).toBeLessThan(0.05);
    }
  });

  it('a herd filling the view uses near detail only within the shared near cap; only those cast shadows', () => {
    const { r, s, frame } = scene({ a: 200 }, 'high', [6, 41, 8]);
    frame();
    const maxNear = 24; // tuning CREATURE_LOD_CAPS.high
    const near = meshes(s, 'creature-batch').filter((m) => m.castShadow);
    const nearCount = near.reduce((n, m) => n + m.count, 0);
    expect(nearCount).toBeGreaterThan(0);
    expect(nearCount).toBeLessThanOrEqual(maxNear);
    expect(r.stats.aphids).toBe(200);
    r.dispose();
  });

  it('a scale herd is drawn as scale insects, not aphids', () => {
    const { r, frame } = scene({ kind: 'scale', a: 60 }, 'high');
    frame();
    const store = (r as unknown as { store: { entries: Map<string, { lods: ({ body: { n: number } } | null)[] }> } }).store;
    const drawn = (k: string) => (store.entries.get(k)?.lods ?? []).reduce((n, l) => n + (l?.body.n ?? 0), 0);
    expect(drawn('scale-insect')).toBe(60);
    expect(drawn('aphid')).toBe(0);
    r.dispose();
  });
});
