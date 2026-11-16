// wire-stage2 review finding 2: the e2e's per-renderer frame cost (tests/e2e/stage2.mjs perf section) moves a
// renderer's objects to camera layer 31 for one frame instead of hiding its group, because the renderers own their
// visibility (the weather renderer re-shows its group on every update). This checks the method's premise in Node:
// over several updates in rain, no Stage 2 renderer resets those layers or adds an object outside them.
import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Scene, type Object3D, type WebGLRenderer } from 'three';
import { getPreset } from '@/render/app';
import { RenderRegistry, type FrameInfo, type RenderContext } from '@/render';
import { makeTestSim } from '@/sim/testing';
import type { Sim } from '@/sim/types';
import { WorldSlot } from './index';

const OFF_MASK = (1 << 31) >>> 0; // three keeps the mask unsigned

function context(scene: Scene, camera: PerspectiveCamera): RenderContext {
  return {
    renderer: { domElement: { height: 360 }, toneMappingExposure: 1 } as unknown as WebGLRenderer, scene, camera, quality: getPreset('test'),
    assets: null, game: { requestRender: () => {}, testMode: true },
  };
}

function frame(sim: Sim, camera: PerspectiveCamera, dt: number): FrameInfo {
  return {
    dt, time: 0, alpha: 1, sim, view: 'observer', underground: false, camera, viewportHeightPx: 360, subject: null, possessedId: -1,
    possessedPose: null, subjectOpacity: 1, cutaway: null,
  };
}

/** The objects the e2e moves for a slot (same choice as tests/e2e/stage2.mjs). */
function rootsOf(reg: RenderRegistry, scene: Scene, slot: string): Object3D[] {
  const r = reg.entries.find((e) => e.slot === slot)!.renderer as unknown as Record<string, { group?: Object3D } | Object3D | undefined>;
  if (slot === 'creatures') return [(r.creatures as { group: Object3D }).group];
  if (slot === 'weather') return [(r.weather as { group: Object3D }).group];
  if (slot === 'humans') return [r.group as Object3D];
  return scene.children.filter((o) => o.name.startsWith('fx:') && o.name !== 'fx:markers');
}

describe('per-renderer frame cost by camera layer', () => {
  it('the Stage 2 renderers keep objects moved to layer 31 there across updates in rain', async () => {
    const reg = new RenderRegistry();
    const scene = new Scene(), camera = new PerspectiveCamera(60, 16 / 9, 0.1, 1e5);
    await reg.init(context(scene, camera));
    const w = reg.entries.find((e) => e.slot === 'world')!.renderer;
    if (w instanceof WorldSlot) (w.world as unknown as { skyEnv: object }).skyEnv = { update: () => false, texture: null, bakes: 0, dispose: () => {} };
    const sim = makeTestSim({});
    await reg.onGameStart(sim);
    const wx = sim.state.env.weather as unknown as Record<string, unknown>;
    wx.precip = 1; wx.rainRateMmH = 8;
    camera.position.set(sim.state.ants[0].pos.x, 60, sim.state.ants[0].pos.z + 80);
    reg.update(frame(sim, camera, 0));
    for (const slot of ['creatures', 'humans', 'weather', 'fx']) {
      const roots = rootsOf(reg, scene, slot);
      expect(roots.length, slot).toBeGreaterThan(0);
      for (const root of roots) root.traverse((o) => o.layers.set(31));
      for (let i = 0; i < 3; i++) reg.update(frame(sim, camera, 0.1));
      let leaked = 0;
      for (const root of rootsOf(reg, scene, slot)) root.traverse((o) => { if (o.layers.mask !== OFF_MASK) leaked++; });
      expect(leaked, slot).toBe(0);
      for (const root of roots) root.traverse((o) => o.layers.set(0));
    }
    reg.onGameEnd();
    reg.dispose();
  });
});
