// FxRenderer as a SubRenderer and overlay host, in Node (three objects only, no WebGL context): overlays draw only
// when switched on, exclusive overlays replace each other, the dig-plans overlay switches the marker layer, the
// `test` preset keeps particles off unless requested, and the scent view draws a real trail in one draw call.
import { describe, expect, it } from 'vitest';
import { Group, PerspectiveCamera, Scene } from 'three';
import type { FrameInfo, RenderContext } from '@/render';
import { getPreset } from '@/render/app/quality';
import { fxScenario, runTicks } from '../../../../spikes/fx-demo/scenario';
import { FxRenderer, MARKER_LAYER_NAME, overlayHostOf } from './FxRenderer';

function setup(quality: 'test' | 'high') {
  const scene = new Scene();
  const camera = new PerspectiveCamera(50, 16 / 9, 0.5, 40000);
  const ctx = {
    renderer: { toneMappingExposure: 1 }, scene, camera, quality: getPreset(quality), assets: null,
    game: { requestRender: () => {}, testMode: quality === 'test' },
  } as unknown as RenderContext;
  const fx = new FxRenderer();
  fx.init(ctx);
  return { fx, scene, camera };
}

function frame(sim: FrameInfo['sim'], camera: PerspectiveCamera, dt = 0): FrameInfo {
  camera.updateMatrixWorld();
  return {
    dt, time: 0, alpha: 1, sim, view: 'observer', underground: false, camera, viewportHeightPx: 720, subject: null, possessedId: -1,
    possessedPose: null, subjectOpacity: 1, cutaway: null,
  };
}

describe('FxRenderer', () => {
  const sc = fxScenario(1);
  runTicks(sc.sim, 1500);

  it('draws nothing until an overlay is switched on; the scent view is one draw call', () => {
    const { fx, camera } = setup('test');
    fx.onGameStart(sc.sim);
    camera.position.set(400, 150, 400);
    camera.lookAt(250, 0, 256);
    fx.update(frame(sc.sim, camera));
    expect(fx.drawCalls()).toBe(0);
    expect(fx.stats().particles + fx.stats().motes).toBe(0);
    fx.setOverlay('scent', true);
    fx.update(frame(sc.sim, camera));
    const s = fx.stats();
    expect(s.scentCells).toBeGreaterThan(50);
    expect(s.scentPending).toBe(0);
    expect(fx.drawCalls()).toBe(2); // the 25 % scene dim + the glyphs
    fx.setOverlay('scent', false);
    fx.update(frame(sc.sim, camera));
    expect(fx.drawCalls()).toBe(0);
    fx.dispose();
  });

  it('exclusive overlays replace each other; scent combines with any; the field covers the locality', () => {
    const { fx, camera } = setup('test');
    fx.onGameStart(sc.sim);
    camera.position.set(256, 400, 500);
    camera.lookAt(256, 0, 256);
    fx.setOverlay('scent', true);
    fx.setOverlay('temperature', true);
    fx.setOverlay('moisture', true);
    expect(fx.overlayState).toEqual({ scent: true, other: 'moisture' });
    fx.update(frame(sc.sim, camera));
    expect(fx.stats().field).toBe(2);
    expect(fx.stats().fieldPasses).toBe(1);
    fx.setOverlay('moisture', false);
    expect(fx.overlayState).toEqual({ scent: true, other: null });
    fx.dispose();
  });

  it('dig-plans switches the marker layer on and restores it', () => {
    const { fx, scene } = setup('high');
    const layer = new Group();
    layer.name = MARKER_LAYER_NAME;
    layer.visible = false;
    scene.add(layer);
    fx.onGameStart(sc.sim);
    fx.setOverlay('dig-plans', true);
    expect(layer.visible).toBe(true);
    fx.setOverlay('threats', true); // exclusive: dig plans off
    expect(layer.visible).toBe(false);
    fx.dispose();
  });

  it('particles are off in the test preset unless requested, on at high', () => {
    const t = setup('test');
    t.fx.onGameStart(sc.sim);
    expect(t.fx.parts.particles!.effectsOn).toBe(false);
    t.fx.setEffects({ particles: true, motes: true });
    expect(t.fx.parts.particles!.effectsOn).toBe(true);
    expect(t.fx.parts.particles!.fx.capacity).toBeGreaterThan(1);
    t.fx.dispose();
    const h = setup('high');
    h.fx.onGameStart(sc.sim);
    expect(h.fx.parts.particles!.effectsOn).toBe(true);
    h.fx.dispose();
  });

  it('is found in a registry as the overlay host', () => {
    const { fx } = setup('test');
    expect(overlayHostOf({ entries: [{ slot: 'world', renderer: {} }, { slot: 'fx', renderer: fx }] })).toBe(fx);
    expect(overlayHostOf({ entries: [{ slot: 'fx', renderer: {} }] })).toBeNull();
    fx.dispose();
  });
});
