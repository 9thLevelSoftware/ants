// Flower dressing (headless, no GL): near flower heads are built from parts, the shader radius follows the quality
// preset, and switching quality at runtime rebuilds or drops the parts (Low keeps the shader-only heads).
import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { getPreset } from '@/render/app';
import type { Primitive, WorldObject } from '@/sim/types';
import { createWorldUniforms } from '../materials/uniforms';
import { FlowerDressing } from './flowerDressing';
import { lookTable } from './looks';
import { FLOWER_QUALITY } from './tuning';

const head = (id: number, x: number): Primitive => ({
  id, shape: 'ellipsoid', pos: { x, y: 60, z: 100 }, rot: { x: 0, y: 0, z: 0, w: 1 }, size: { x: 10, y: 4, z: 10 }, round: 0, material: 'plant', flags: 0, objectId: id,
});
const daisy = (id: number): WorldObject => ({ id, templateId: 'daisy', pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 }, primStart: 0, primCount: 1, tags: ['plant'], routeIds: [], poiIds: [] });

describe('FlowerDressing', () => {
  it('dresses the heads within the preset radius and follows quality switches', () => {
    const u = createWorldUniforms();
    const fd = new FlowerDressing(u, getPreset('high'));
    const prims = [head(1, 100), head(2, 100 + FLOWER_QUALITY.high.radiusMm * 3)];
    fd.setPrims(prims, lookTable([daisy(1), daisy(2)]), 4);
    expect(u.uFlowerMm.value).toBe(FLOWER_QUALITY.high.radiusMm);
    const cam = new Vector3(100, 70, 60);
    fd.update(cam, 0);
    expect(fd.headCount).toBe(1); // the far head stays a shader-only head
    expect(fd.partCount).toBeGreaterThan(20);
    fd.setQuality(getPreset('low'));
    expect(u.uFlowerMm.value).toBe(0);
    fd.update(cam, 0);
    expect(fd.partCount).toBe(0);
    fd.setQuality(getPreset('medium'));
    fd.update(cam, 0);
    expect(u.uFlowerMm.value).toBe(FLOWER_QUALITY.medium.radiusMm);
    expect(fd.headCount).toBe(1);
    fd.update(cam, 1); // underground: hidden
    expect(fd.group.visible).toBe(false);
    fd.dispose();
    expect(u.uFlowerMm.value).toBe(0);
  });
});
