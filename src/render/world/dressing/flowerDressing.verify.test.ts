// Adversarial checks of the flower dressing (review of the look pass). The surface shader switches EVERY head nearer
// the camera than uFlowerMm to its bare "core" form (a seed clock keeps only its receptacle, the wide underside of
// every head is discarded) and relies on flowerParts having built that head's petals. When the per-quality part cap
// is reached, the remaining heads inside the radius get no parts, so they render as bare cores.
import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { getPreset } from '@/render/app';
import type { Primitive, WorldObject } from '@/sim/types';
import { generateWorld, defaultWorldParams } from '@/worldgen';
import { createWorldUniforms } from '../materials/uniforms';
import { staticPrims } from '../lighting/simAdapter';
import { FlowerDressing } from './flowerDressing';
import { flowerHead, flowerParts, isFlowerFinish } from './flowerParts';
import { lookTable } from './looks';
import { FLOWER_QUALITY } from './tuning';

const head = (id: number, x: number, z: number): Primitive => ({
  id, shape: 'ellipsoid', pos: { x, y: 60, z }, rot: { x: 0, y: 0, z: 0, w: 1 }, size: { x: 10, y: 4, z: 10 }, round: 0, material: 'plant', flags: 0, objectId: id,
});
const obj = (id: number, templateId: string): WorldObject => ({ id, templateId, pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 }, primStart: 0, primCount: 1, tags: ['plant'], routeIds: [], poiIds: [] });

describe('FlowerDressing (verify)', () => {
  it('every head the shader treats as dressed (within uFlowerMm of the camera) has its parts', () => {
    const u = createWorldUniforms();
    const fd = new FlowerDressing(u, getPreset('high'));
    // a patch of dandelion heads and clocks inside the High radius: 120 heads x ~170 parts > maxParts 12 000
    const prims: Primitive[] = [], objs: WorldObject[] = [];
    for (let i = 0; i < 120; i++) {
      const a = i * 2.4, r = 30 + (i / 120) * 400;
      prims.push(head(i + 1, 1000 + Math.cos(a) * r, 1000 + Math.sin(a) * r));
      objs.push(obj(i + 1, 'dandelion'));
    }
    const look = lookTable(objs);
    expect(isFlowerFinish(look(prims[0]).look[0])).toBe(true);
    fd.setPrims(prims, look, 4);
    const cam = new Vector3(1000, 70, 1000);
    fd.update(cam, 0);
    const R = u.uFlowerMm.value;
    const inside = prims.filter((p) => Math.hypot(p.pos.x - cam.x, p.pos.y - cam.y, p.pos.z - cam.z) < R).length;
    expect(fd.partCount).toBeLessThanOrEqual(FLOWER_QUALITY.high.maxParts);
    expect(fd.headCount).toBeGreaterThanOrEqual(inside);
    fd.dispose();
  });

  it('real worlds (seed 1): parts needed within the High radius stay under the cap (numbers for the report)', { timeout: 60000 }, () => {
    const R = FLOWER_QUALITY.high.radiusMm + 40;
    for (const archetype of ['suburban-garden', 'playground-park'] as const) {
      const world = generateWorld({ ...defaultWorldParams('lasius-niger', 1), archetype });
      const look = lookTable(world.objects);
      const heads = staticPrims(world).map((p) => ({ p, l: look(p) })).filter((e) => isFlowerFinish(e.l.look[0]))
        .map((e) => flowerHead(e.p, e.l.look[0], e.l.color ?? [1, 1, 1]));
      const per = heads.map((h) => flowerParts(h, []).length);
      // camera at each head (the worst places to stand are among flowers)
      let worst = 0;
      for (const c of heads) {
        let n = 0;
        for (let j = 0; j < heads.length; j++) if (Math.hypot(heads[j].pos.x - c.pos.x, heads[j].pos.y - c.pos.y, heads[j].pos.z - c.pos.z) < R) n += per[j];
        worst = Math.max(worst, n);
      }
      console.info(`[flower-verify] ${archetype}: ${heads.length} heads, worst parts within ${R} mm = ${worst}`);
      expect(worst).toBeLessThanOrEqual(FLOWER_QUALITY.high.maxParts);
    }
  });
});
