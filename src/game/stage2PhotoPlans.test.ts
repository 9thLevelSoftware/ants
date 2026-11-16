// wire-stage2 review finding 1: the dig-plans overlay's plan outlines obey photo mode's "hide markers and outlines"
// toggle (on by default, GDD 08 §7.9). Drives the real ViewsLayer (marker renderer on a bare three Scene) through
// possession -> photo mode -> toggle off, with the overlay flag set on the marker layer as FxRenderer sets it.
import { afterEach, describe, expect, it } from 'vitest';
import { Scene } from 'three';
import type { RenderApp } from '@/render/app';
import type { RenderRegistry } from '@/render';
import { makeTestSim } from '@/sim/testing';
import type { Command, Sim } from '@/sim/types';
import { collectRefusals } from '@/game/refusals';
import { clearOverlays } from '@/ui/overlays/state';
import { photoActions, photoUi } from '@/ui/screens/photo/store';
import { GameSession } from './session';
import { DigPlanner, playerNest } from './views/colony/digPlanner';
import { togglePhoto, type ViewSwitchHost } from './views/viewSwitch';
import { ViewsLayer, type ViewsGame } from './views/viewsLayer';

const CAM = { autoFollow: 'off' as const, fovOffset: 0, worldUpLock: false, reducedMotion: false };

function simWithPlan(): Sim {
  const sim = makeTestSim({ nest: 'small', workers: 2, systems: [] });
  const ch = playerNest(sim)!.chambers.find((c) => c.type === 'nursery')!;
  const out = { x: 0, y: 0, z: 0 }, n = { x: 0, y: 0, z: 0 };
  sim.field.project({ x: ch.center.x + ch.radii.x, y: ch.center.y, z: ch.center.z }, 0, out, n);
  const p = new DigPlanner();
  p.chamberType = 'nursery';
  p.hover(sim, { point: out, normal: n, kind: 'wall' });
  const host = {
    sim, toast() {}, possess() {},
    command(cmd: Command) { sim.enqueue(cmd); return { applied: true, rejected: collectRefusals(sim, () => { sim.applyPendingCommands(); sim.events.flush(); }) }; },
  };
  if (p.confirm(host).outcome === 'confirm-warnings') p.confirm(host);
  return sim;
}

/** Just enough of the renderer for photo mode (no depth of field, a 1280x720 canvas). */
function fakeApp(): RenderApp {
  const gl = { getParameter: () => 8192 };
  return {
    post: null, setFocus() {}, setExposure() {}, setGrade() {},
    quality: { id: 'test' }, renderer: { domElement: { width: 1280, height: 720 }, getContext: () => gl },
  } as unknown as RenderApp;
}

function setup() {
  const sim = simWithPlan();
  const s = new GameSession(sim, CAM);
  const ref: { layer?: ViewsLayer } = {};
  const game = {
    session: s, mode: 'playing', camera: {} as ViewsGame['camera'], app: fakeApp(), hover: null, inspect: null,
    possess: () => null, release: () => {}, command: () => ({ applied: true, rejected: [] }), toast: () => {}, viewChanged: () => {},
    togglePhoto: () => togglePhoto(game),
    get viewsLayer() { return ref.layer!; },
  } as unknown as ViewsGame & ViewSwitchHost;
  const layer = new ViewsLayer(game);
  ref.layer = layer;
  const scene = new Scene();
  layer.attach({} as HTMLCanvasElement, scene, { entries: [] } as unknown as RenderRegistry);
  s.driver.enqueue(s.possessCommand('queen', true));
  s.driver.applyCommandsNow();
  s.update(0);
  s.views.settle(1, 0.05);
  const markerLayer = scene.getObjectByName('fx:markers')!;
  return { sim, s, game, layer, markerLayer };
}

afterEach(() => { clearOverlays(); photoUi.value = null; photoActions.value = null; });

describe('dig-plans overlay in photo mode', () => {
  it('outlines show while possessing, are hidden in photo mode by default, and come back when the toggle is off', () => {
    const { sim, s, game, layer, markerLayer } = setup();
    const plans = playerNest(sim)!.digPlans.length;
    expect(plans).toBeGreaterThan(0);
    markerLayer.userData.digPlansOverlay = true; // what FxRenderer.applyMarkerLayer sets for the dig-plans overlay
    expect(s.view).toBe('possess');
    layer.frame(s, null, 0);
    expect(layer.lastMarkerScene!.lines.length).toBe(plans);

    togglePhoto(game);
    expect(s.view).toBe('photo');
    expect(layer.photo.hidesMarkers).toBe(true);
    layer.frame(s, null, 0.1);
    expect(layer.lastMarkerScene!.lines.length).toBe(0);
    expect(markerLayer.children.length).toBe(0); // nothing left on the marker layer for the capture

    layer.photo.setHideMarkers(false);
    layer.frame(s, null, 0.2);
    expect(layer.lastMarkerScene!.lines.length).toBe(plans);
  });
});
