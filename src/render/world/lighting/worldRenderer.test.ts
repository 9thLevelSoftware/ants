// WorldRenderer behaviour that needs the whole renderer (headless three in Node, no WebGL; the PMREM sky bake is
// stubbed): haze culling of primitives, superseded setWorld calls, the forest dapple, the stars under depth of field.
import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Scene, type WebGLRenderer } from 'three';
import { getPreset, type QualityId } from '@/render/app';
import { makeFlatWorld } from '@/sim/kernel.testWorld';
import type { Primitive, WorldData, ZoneType } from '@/sim/types';
import { dappledLightsChunk } from '../materials/dapple';
import { STARS_DOF_GAIN } from './constants';
import { WorldRenderer } from './worldRenderer';

function world(size: number, zone: ZoneType, prims: Primitive[] = []): WorldData {
  const w = makeFlatWorld({ size, bu: 4, h0: 0 }) as unknown as WorldData;
  const n = Math.ceil(size / 64);
  return Object.assign(w, {
    zones: [{ id: 0, type: zone, variant: null, rects: [], areaMm2: size * size }],
    maps: { zone: { cell: 64, nx: n, nz: n, data: new Uint8Array(n * n) } }, objects: [], prims,
  });
}

function rock(id: number, x: number, z: number, r: number): Primitive {
  return { id, shape: 'ellipsoid', pos: { x, y: r, z }, rot: { x: 0, y: 0, z: 0, w: 1 }, size: { x: r, y: r, z: r }, round: 0, material: 'stone', flags: 0, objectId: -1 };
}

async function makeRenderer(quality: QualityId = 'test', at = { x: 1000, z: 1000 }): Promise<WorldRenderer> {
  const wr = new WorldRenderer();
  const camera = new PerspectiveCamera(50, 16 / 9, 0.5, 40000);
  camera.position.set(at.x, 10, at.z);
  camera.lookAt(at.x + 100, 0, at.z);
  camera.updateMatrixWorld();
  await wr.init({ renderer: {} as unknown as WebGLRenderer, scene: new Scene(), camera, quality: getPreset(quality), assets: null });
  (wr as unknown as { skyEnv: object }).skyEnv = { update: () => false, texture: null, bakes: 0, dispose: () => {} };
  return wr;
}

describe('WorldRenderer: primitives past the haze are not drawn', () => {
  it('a big rock 9 m away on the lawn (haze 1.2 m) is culled, one 0.5 m away is drawn', async () => {
    const wr = await makeRenderer('test');
    await wr.setWorld(world(12000, 'lawn', [rock(1, 1500, 1000, 60), rock(2, 10000, 1000, 60)]), null);
    wr.update({ dt: 0, time: 0, env: { hour: 12 } });
    const s = wr.stats().prims;
    expect(s.instancesNear + s.instancesFar + s.instancesTiny).toBe(1);
    wr.dispose();
  });
});

describe('WorldRenderer: setWorld', () => {
  it('a newer setWorld supersedes a pending one; update() is safe throughout', async () => {
    const wr = await makeRenderer();
    const a = world(2000, 'lawn', [rock(1, 1100, 1000, 5)]), b = world(2000, 'sand', [rock(7, 1100, 1000, 5), rock(8, 1200, 1000, 5)]);
    const pa = wr.setWorld(a, null);
    const pb = wr.setWorld(b, null);
    expect(() => wr.update({ dt: 0.016, time: 0, env: { hour: 12 } })).not.toThrow();
    await Promise.all([pa, pb]);
    wr.update({ dt: 0.016, time: 0, env: { hour: 12 } });
    expect(wr.prims.has(7)).toBe(true);
    expect(wr.prims.has(1)).toBe(false);
    expect(wr.stats().prims.prims).toBe(2);
    wr.dispose();
  });
});

describe('WorldRenderer: forest dapple (GDD 08 11.3)', () => {
  it('the key-light patch point exists in three r187', () => {
    expect(dappledLightsChunk()).toContain('wrDapple(vWrW)');
  });

  it('dapples the sun by day only, on the forest floor only (canopy mask); reduced motion stops the sway', async () => {
    const wr = await makeRenderer();
    await wr.setWorld(world(2000, 'forest'), null);
    wr.update({ dt: 0, time: 3.2, env: { hour: 12 } });
    const d = wr.uniforms.uDapple.value;
    const mask = () => (wr.uniforms.tDappleMask.value as unknown as { image: { data: Uint8Array } }).image.data;
    expect(d.x).toBeGreaterThan(0.5);
    expect(d.y).toBe(3.2);
    expect(mask().every((v) => v === 255)).toBe(true);
    expect(wr.uniforms.uDappleMaskInv.value.x).toBeCloseTo(1 / 2048, 9); // 32 cells of 64 mm
    wr.update({ dt: 0, time: 3.2, env: { hour: 12 }, reducedMotion: true });
    expect(d.y).toBe(0);
    wr.update({ dt: 0, time: 3.2, env: { hour: 0 } });
    expect(d.x).toBe(0);
    await wr.setWorld(world(2000, 'lawn'), null);
    wr.update({ dt: 0, time: 3.2, env: { hour: 12 } });
    expect(mask().every((v) => v === 0)).toBe(true);
    wr.dispose();
  });

  it('every world material carries the dapple uniforms', async () => {
    const wr = await makeRenderer();
    await wr.setWorld(world(2000, 'forest', [rock(1, 1100, 1000, 5)]), null);
    wr.update({ dt: 0, time: 0, env: { hour: 12 } });
    const shader = {
      uniforms: {} as Record<string, unknown>,
      vertexShader: '#include <common>\n#include <beginnormal_vertex>\n#include <begin_vertex>\n#include <project_vertex>',
      fragmentShader: '#include <common>\n#include <map_fragment>\n#include <roughnessmap_fragment>\n#include <normal_fragment_maps>\n#include <lights_fragment_begin>',
    };
    const terrainMat = wr.terrain.group.children[0] as unknown as { material: { onBeforeCompile: (s: unknown, r: unknown) => void } };
    const primMesh = wr.prims.group.children.find((c) => c.visible) as unknown as { material: { onBeforeCompile: (s: unknown, r: unknown) => void } };
    for (const m of [terrainMat.material, primMesh.material]) {
      const s = { ...shader, uniforms: {} as Record<string, unknown> };
      m.onBeforeCompile(s, null);
      expect(s.uniforms.uWrDapple).toBe(wr.uniforms.uDapple);
      expect(s.uniforms.tWrCanopy).toBe(wr.uniforms.tDappleMask);
      expect(s.fragmentShader).toContain('wrDapple(vWrW)');
    }
    wr.dispose();
  });
});

describe('WorldRenderer: night sky', () => {
  it('stars are dimmed when depth of field blurs them into bokeh discs (High), full strength without post', async () => {
    for (const [q, gain] of [['high', STARS_DOF_GAIN], ['test', 1]] as const) {
      const wr = await makeRenderer(q);
      await wr.setWorld(world(2000, 'lawn'), null);
      wr.update({ dt: 0, time: 0, env: { hour: 1 } });
      const sky = (wr as unknown as { sky: { stars: { value: number } } }).sky;
      expect(sky.stars.value).toBeCloseTo(wr.lighting.stars * gain, 6);
      expect(wr.lighting.stars).toBeGreaterThan(0);
      wr.dispose();
    }
  });
});
