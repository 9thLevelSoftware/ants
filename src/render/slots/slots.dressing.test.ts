// render-integration: the world slot with decor and the map boundary registered (headless three in Node, no WebGL;
// the sky's PMREM bake is stubbed as in slots.test.ts). Decor shares the world's uniforms and is patched for the
// cutaway like every surface material; the occlusion cone reaches the world frame; the colour grade follows the
// lighting and fades underground; quality switches and two game starts / ends leave nothing behind.
import { describe, expect, it, vi } from 'vitest';
import { Mesh, PerspectiveCamera, Scene, type Material, type WebGLRenderer } from 'three';
import { getPreset, type QualityId } from '@/render/app';
import type { GradeParams } from '@/render/app/look';
import { RenderRegistry, type FrameInfo, type RenderContext } from '@/render';
import type { CutawayParams, FadeOutput } from '@/render/camera';
import { makeTestSim } from '@/sim/testing';
import type { Sim } from '@/sim/types';
import { buildTestWorld } from '../world/decor/testWorld';
import { WorldSlot } from './index';

function context(scene: Scene, camera: PerspectiveCamera, q: QualityId, grades: GradeParams[]): RenderContext {
  return {
    renderer: { domElement: { height: 360 } } as unknown as WebGLRenderer, scene, camera, quality: getPreset(q), assets: null,
    game: { requestRender: () => {}, testMode: true }, setGrade: (g) => grades.push({ saturation: g.saturation, gain: [...g.gain] }),
  };
}

function frame(sim: Sim | null, camera: PerspectiveCamera, extra: Partial<FrameInfo> = {}): FrameInfo {
  return {
    dt: 0, time: 0, alpha: 1, sim, view: 'possess', underground: false, camera, viewportHeightPx: 360, subject: null, possessedId: -1,
    possessedPose: null, subjectOpacity: 1, cutaway: null, ...extra,
  };
}

async function boot(q: QualityId = 'low') {
  const grades: GradeParams[] = [];
  const reg = new RenderRegistry();
  const scene = new Scene(), camera = new PerspectiveCamera(50, 16 / 9, 0.5, 1e5);
  await reg.init(context(scene, camera, q, grades));
  const world = reg.entries[0]!.renderer as WorldSlot;
  (world.world as unknown as { skyEnv: object }).skyEnv = { update: () => false, texture: null, bakes: 0, dispose: () => {} };
  return { reg, scene, camera, world, grades };
}

/** A sim on the decor test world (lawn, forest, paving, car park) with the camera low over the lawn. */
function lawnSim(camera: PerspectiveCamera): Sim {
  const sim = makeTestSim({ world: buildTestWorld() });
  camera.position.set(700, 14, 700);
  camera.lookAt(760, 2, 700);
  camera.updateMatrixWorld();
  return sim;
}

/** Meshes under the world slot's groups (world, decor, boundary); `all` counts every mesh in the scene. */
function meshCount(scene: Scene, all = false): number {
  let n = 0;
  scene.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    let p = o.parent;
    while (p && !['world', 'decor', 'boundary'].includes(p.name)) p = p.parent;
    if (all || p) n++;
  });
  return n;
}

describe('world slot with decor and boundary', () => {
  it('draws decor around the camera at low quality, sharing the world uniforms; none at test quality', async () => {
    const { reg, camera, world } = await boot('low');
    const sim = lawnSim(camera);
    await reg.onGameStart(sim);
    reg.update(frame(sim, camera, { subject: { x: 760, y: 2, z: 700 } }));
    const st = reg.stats().world!;
    expect(st['decor.blades']).toBeGreaterThan(100);
    expect(st['decor.blocks']).toBeGreaterThan(0);
    expect(st['boundary.skirtTriangles']).toBeGreaterThan(1000);
    expect(st['boundary.backdropShapes']).toBeGreaterThan(5);
    expect(world.decor.shared.world).toBe(world.world.uniforms); // one set of time / wind / camera / subject uniforms
    // the boundary's edge haze fades toward the world lighting's sky (its own uniforms, independent of scene.fog)
    expect(world.boundary.uniforms.uBdHorizon.value.equals(world.world.lighting.skyHorizon)).toBe(true);
    expect(world.boundary.uniforms.uBdZenith.value.equals(world.world.lighting.skyZenith)).toBe(true);
    reg.setQuality(getPreset('test'));
    reg.update(frame(sim, camera));
    expect(reg.stats().world!['decor.blades']).toBe(0);
    reg.setQuality(getPreset('high'));
    reg.update(frame(sim, camera));
    expect(reg.stats().world!['decor.blades']).toBeGreaterThan(st['decor.blades']!);
    reg.dispose();
  });

  it('passes the possession camera fade to the world frame as occlusion (and null outside possession)', async () => {
    const { reg, camera, world } = await boot('test');
    const sim = lawnSim(camera);
    await reg.onGameStart(sim);
    const spy = vi.spyOn(world.world, 'update');
    const fade: FadeOutput = { target: 0.6, occlusion: 1, capsuleA: { x: 700, y: 14, z: 700 }, capsuleB: { x: 755, y: 3, z: 700 }, capsuleRadius: 3, coneStart: 0.3 };
    reg.update(frame(sim, camera, { fade }));
    expect(spy.mock.calls.at(-1)![0].occlusion).toBe(fade);
    reg.update(frame(sim, camera, { view: 'observer', fade: null }));
    expect(spy.mock.calls.at(-1)![0].occlusion).toBeNull();
    reg.dispose();
  });

  it('applies the colour grade from the lighting: frost desaturates, underground and no world are neutral', async () => {
    const { reg, camera, grades } = await boot('test');
    const sim = lawnSim(camera);
    await reg.onGameStart(sim);
    sim.state.env.weather.state = 'frost';
    reg.update(frame(sim, camera));
    const frost = grades.at(-1)!;
    expect(frost.saturation).toBeLessThan(0.8);
    reg.update(frame(sim, camera, { underground: true }));
    expect(grades.at(-1)!.saturation).toBeCloseTo(1, 6); // a settle frame snaps the underground blend
    reg.onGameEnd();
    expect(grades.at(-1)).toEqual({ saturation: 1, gain: [1, 1, 1] });
    reg.dispose();
  });

  it('the colony cutaway patches decor and boundary materials like every other surface material', async () => {
    const { reg, scene, camera } = await boot('low');
    const sim = lawnSim(camera);
    await reg.onGameStart(sim);
    reg.update(frame(sim, camera));
    const cut: CutawayParams = { mode: 'slice', center: { x: 760, z: 700 }, planeY: -10, radius: 200, outsideDarken: 0.3, minPlaneY: -100 };
    reg.update(frame(sim, camera, { view: 'colony', cutaway: cut }));
    const names: string[] = [];
    scene.traverse((o) => {
      const m = (o as Mesh).material as Material | undefined;
      if (!m || !(o.parent?.name === 'decor' || o.parent?.name === 'boundary')) return;
      if ((m as { isMeshStandardMaterial?: boolean }).isMeshStandardMaterial) {
        expect((m.userData as { nestCut?: boolean }).nestCut, `${o.name || o.parent?.name} patched`).toBe(true);
        names.push(o.parent!.name);
      }
    });
    expect(names).toContain('decor');
    expect(names).toContain('boundary');
    reg.dispose();
  });

  it('two game starts and ends leave the scene as it was: world, decor and boundary keep no meshes', async () => {
    const { reg, scene, camera } = await boot('low');
    const baseline = meshCount(scene);
    const totals: number[] = [];
    for (let i = 0; i < 2; i++) {
      const sim = lawnSim(camera);
      await reg.onGameStart(sim);
      reg.update(frame(sim, camera));
      expect(meshCount(scene)).toBeGreaterThan(baseline);
      reg.onGameEnd();
      reg.update(frame(null, camera));
      expect(meshCount(scene)).toBe(baseline);
      expect(reg.stats().world!['decor.blocks']).toBe(0);
      expect(reg.stats().world!['boundary.skirtTriangles']).toBe(0);
      totals.push(meshCount(scene, true)); // the ant renderer keeps its variant batches between games (by design)
    }
    expect(totals[1]).toBe(totals[0]);
    reg.dispose();
  });

  it('a start superseded while the world loads does not build decor for the stale world', async () => {
    const { reg, camera, world } = await boot('low');
    const a = lawnSim(camera), b = makeTestSim({ sizeBu: 128 });
    const setWorld = vi.spyOn(world.decor, 'setWorld');
    const pa = reg.onGameStart(a);
    const pb = reg.onGameStart(b);
    await Promise.all([pa, pb]);
    expect(setWorld).toHaveBeenCalledTimes(1);
    expect(setWorld.mock.calls[0]![0]).toBe(b.world);
    reg.dispose();
  });
});
