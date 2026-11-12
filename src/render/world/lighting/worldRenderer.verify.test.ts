// Adversarial checks of the WorldRenderer and the simulation adapter (reviewer tests, headless three in Node).
// The renderer is driven without WebGL: the renderer object is a stub and the PMREM sky bake is replaced, so these
// tests cover the CPU side only (state, caches, uniforms, ordering).
import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Scene, type Mesh, type WebGLRenderer } from 'three';
import { getPreset } from '@/render/app';
import { makeFlatWorld } from '@/sim/kernel.testWorld';
import type { Mound, Sim, WorldData } from '@/sim/types';
import { heightDeltaSignature } from './simAdapter';
import { WorldRenderer } from './worldRenderer';
import type { WorldFrame } from './types';

function world(size = 400): WorldData {
  const w = makeFlatWorld({ size, bu: 4, h0: 0 }) as unknown as WorldData;
  const zone = { cell: 16, nx: Math.ceil(size / 16), nz: Math.ceil(size / 16), data: new Uint8Array(Math.ceil(size / 16) ** 2) };
  return Object.assign(w, {
    zones: [{ id: 0, type: 'lawn', variant: null, rects: [], areaMm2: size * size }],
    maps: { zone }, objects: [],
  });
}

function mound(): Mound {
  const n = 16, cell = 2, base = new Float32Array(n * n), h = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) h[j * n + i] = Math.hypot(i - 7.5, j - 7.5) < 6 ? 3 : 0;
  return { id: 1, nestId: 1, entranceId: 1, centerX: 200, centerZ: 200, cell, n, base, h, material: 'loam', volume: 1, absorbed: 0, lastBatchTick: 0 };
}

function fakeSim(w: WorldData, mounds: Mound[]): Sim {
  return {
    world: w,
    state: { tick: 0, worldDelta: { carve: { voxel: 2, keys: [], chunks: [], breaches: [] }, dynPrims: [], mounds, objectStates: [], heightDeltas: [] } },
  } as unknown as Sim;
}

async function makeRenderer(): Promise<WorldRenderer> {
  const wr = new WorldRenderer();
  const camera = new PerspectiveCamera(50, 16 / 9, 0.5, 40000);
  camera.position.set(150, 10, 150);
  camera.lookAt(200, 0, 200);
  camera.updateMatrixWorld();
  await wr.init({ renderer: {} as unknown as WebGLRenderer, scene: new Scene(), camera, quality: getPreset('test'), assets: null });
  // no WebGL here: skip the PMREM bake of the sky environment
  (wr as unknown as { skyEnv: { update: () => boolean; texture: null; bakes: number; dispose: () => void } }).skyEnv = {
    update: () => false, texture: null, bakes: 0, dispose: () => {},
  };
  return wr;
}

const frame = (sim: Sim): WorldFrame => ({ dt: 0, time: 0, sim, env: { hour: 12 } });

describe('WorldRenderer across games (setWorld twice)', () => {
  it('mound material reads the CURRENT hole mask after a second setWorld (new game / load)', async () => {
    const wr = await makeRenderer();
    const w1 = world(), w2 = world();
    const s1 = fakeSim(w1, [mound()]), s2 = fakeSim(w2, [mound()]);
    await wr.setWorld(w1, s1);
    wr.update(frame(s1));
    await wr.setWorld(w2, s2);
    wr.update(frame(s2));
    const mesh = wr.mounds.group.children.find((c) => (c as Mesh).isMesh && (c as Mesh).geometry.getAttribute('position')) as Mesh;
    expect(mesh).toBeDefined();
    // run the material's shader patch the way three does at compile time and look at the hole-mask uniform it binds
    const shader = {
      uniforms: {} as Record<string, unknown>,
      vertexShader: '#include <common>\n#include <beginnormal_vertex>\n#include <begin_vertex>\n#include <project_vertex>',
      fragmentShader: '#include <common>\n#include <map_fragment>\n#include <roughnessmap_fragment>\n#include <normal_fragment_maps>',
    };
    const mat = mesh.material as { onBeforeCompile: (s: unknown, r: unknown) => void };
    mat.onBeforeCompile(shader, null);
    // BUG: the library caches the mound material by 'loam|mound', so the second world's MoundRenderer gets the
    // first world's material, whose patch binds the first (disposed) hole mask: entrance holes in mounds stop opening.
    expect(shader.uniforms.tHoleIdx).toBe(wr.terrain.holeMask!.uniforms.tHoleIdx);
    wr.dispose();
  });

  it('update() during a pending setWorld does not throw (render loop running while textures load)', async () => {
    const wr = await makeRenderer();
    const w = world(), s = fakeSim(w, [mound()]);
    const pending = wr.setWorld(w, s); // not awaited: the game's render loop keeps calling update()
    // BUG: `world` is set before the first await but `mounds` is created after it -> TypeError in update()
    expect(() => wr.update(frame(s))).not.toThrow();
    await pending;
    wr.dispose();
  });
});

describe('simulation adapter: change detection of deformation tiles', () => {
  it('heightDeltaSignature changes when ANY cell of an existing tile changes (footprint inside a tile)', () => {
    const data = new Int16Array(32 * 32);
    const sim = { state: { worldDelta: { heightDeltas: [{ tileIndex: 3, data }] } } } as unknown as Sim;
    const before = heightDeltaSignature(sim);
    // a 3 x 3 footprint near the tile centre (no index is a multiple of the 37 sampling stride)
    for (const [i, j] of [[15, 15], [16, 15], [17, 15], [15, 16], [16, 16], [17, 16], [15, 17], [16, 17], [17, 17]]) {
      if ((j * 32 + i) % 37 !== 0) data[j * 32 + i] = -48;
    }
    // BUG: only every 37th element is hashed, so the new footprint is never uploaded to the height texture
    expect(heightDeltaSignature(sim)).not.toBe(before);
  });
});

describe('WorldRenderer edge cases', () => {
  it('survives a world without a sim and a camera outside the world', async () => {
    const wr = await makeRenderer();
    const w = world();
    await wr.setWorld(w, null);
    const cam = (wr as unknown as { ctx: { camera: PerspectiveCamera } }).ctx.camera;
    cam.position.set(-5000, 30, 99999);
    cam.updateMatrixWorld();
    expect(() => wr.update({ dt: 0.016, time: 1, sim: null, env: { hour: 3 } })).not.toThrow();
    expect(Number.isFinite(wr.lighting.fogDensity)).toBe(true);
    expect(Number.isFinite(wr.lighting.exposureEV)).toBe(true);
    wr.setWetness(7);
    expect(wr.uniforms.uWet.value).toBe(1);
    wr.setWetness(-1);
    expect(wr.uniforms.uWet.value).toBe(0);
    wr.dispose();
  });

  it('a NaN or negative frame dt does not poison the eased lighting state', async () => {
    const wr = await makeRenderer();
    const w = world();
    await wr.setWorld(w, null);
    wr.update({ dt: Number.NaN, time: 0, sim: null, underground: true, env: { hour: 12 } });
    wr.update({ dt: -1, time: 0, sim: null, env: { hour: 12 } });
    wr.update({ dt: 0.016, time: 0, sim: null, env: { hour: 12 } });
    expect(Number.isFinite(wr.lighting.exposureEV)).toBe(true);
    expect(Number.isFinite(wr.lighting.fogDensity)).toBe(true);
    expect(Number.isFinite(wr.uniforms.uUnder.value)).toBe(true);
    wr.dispose();
  });

  it('an hour override (photo mode, demo flag) keeps the simulation weather', async () => {
    const wr = await makeRenderer();
    const w = world(), s = fakeSim(w, []);
    (s.state as unknown as { env: unknown }).env = {
      weather: { state: 'rain', cloud: 1, fogDensity: 0.3, precip: 0.8, wind2m: 2, windDir: { x: 0, y: 0, z: 1 } },
    };
    await wr.setWorld(w, s);
    wr.update({ dt: 0, time: 0, sim: s, env: { hour: 9 } });
    // BUG: with a sim AND an hour override, sampleEnvironment skips readEnvironment and never copies the sim's
    // weather, so the frame is lit as 'clear' with cloud 0.1 while it rains
    expect(wr.env.weather).toBe('rain');
    expect(wr.env.cloud).toBe(1);
    wr.dispose();
  });
});
