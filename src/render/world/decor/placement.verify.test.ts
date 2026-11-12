// Reviewer tests (render-decor): edge cases of the block grid and placement (camera outside the world or NaN, the
// world border, a world size that is not a multiple of the block).
import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Scene, type WebGLRenderer } from 'three';
import { getPreset } from '@/render/app';
import { buildWorld } from '@/sim/testing/worldBuilder';
import { defaultWorldParams } from '@/worldgen/params';
import { placeGrass } from '../vegetation/grassPlacement';
import { blockContext } from './blockContext';
import { DecorRenderer } from './DecorRenderer';
import { GroundView } from './ground';
import { BLADE_STRIDE, DRAPED_STRIDE } from './instances';
import { placeDraped } from './placement';
import { blockMm, blockRef, blocksAround } from './tiles';

describe('decor grid and placement edge cases (review)', () => {
  it('blocksAround: nothing for a camera far outside the world or at NaN; sorted and unique otherwise', () => {
    expect(blocksAround(-1e6, -1e6, 2400, 16000, 4)).toEqual([]);
    expect(blocksAround(NaN, 500, 2400, 16000, 4)).toEqual([]);
    expect(blocksAround(500, 500, 0, 16000, 4)).toEqual([]);
    const list = blocksAround(8000, 8000, 2400, 16000, 4);
    const keys = new Set(list.map((b) => b.ref.key));
    expect(keys.size).toBe(list.length);
    for (let i = 1; i < list.length; i++) expect(list[i].dist).toBeGreaterThanOrEqual(list[i - 1].dist);
  });

  it('a partial last block (world size not a multiple of the block) places nothing outside the world', () => {
    const bu = 4, size = 1500; // block = 1024 mm: the second block is cut at 1500
    const world = buildWorld({ params: defaultWorldParams('lasius-niger', 9), size, bu, height: () => 0, zone: 'forest', surface: 'humus' });
    const g = new GroundView(world), ref = blockRef(1, 1, bu);
    expect(ref.x1).toBeGreaterThan(size);
    const grass = placeGrass(blockContext(g, ref)), draped = placeDraped(blockContext(g, ref));
    for (let o = 0; o < grass.length; o += BLADE_STRIDE) expect(grass[o] < size && grass[o + 2] < size).toBe(true);
    for (let o = 0; o < draped.length; o += DRAPED_STRIDE) expect(draped[o] < size && draped[o + 1] < size).toBe(true);
    expect(draped.length).toBeGreaterThan(0);
    expect(blockMm(bu)).toBe(1024);
  });

  it('DecorRenderer survives a NaN camera and an empty world (no zones, no objects)', async () => {
    const world = buildWorld({ params: defaultWorldParams('lasius-niger', 2), size: 2048, bu: 4, height: () => 0 });
    world.zones = [];
    const camera = new PerspectiveCamera(50, 1, 0.5, 40000);
    const d = new DecorRenderer();
    await d.init({ renderer: {} as WebGLRenderer, scene: new Scene(), camera, quality: getPreset('high'), assets: null });
    d.setWorld(world, null);
    camera.position.set(NaN, 10, 500); camera.updateMatrixWorld();
    expect(() => { d.update({ dt: 0, time: 0 }); d.flush(); }).not.toThrow();
    camera.position.set(500, 10, 500); camera.updateMatrixWorld();
    expect(() => { d.update({ dt: 0, time: 0 }); d.flush(); }).not.toThrow();
    expect(d.stats().blocks).toBeGreaterThan(0);
    d.dispose();
  });
});
