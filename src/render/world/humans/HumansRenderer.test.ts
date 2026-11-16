// The renderer draws every running event's actors where the plan puts them, with a shadow, and nothing when idle.
// Node only (no WebGL): scene graph and transforms.

import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Scene, type Mesh } from 'three';
import type { FrameInfo, RenderContext } from '@/render';
import { getPreset } from '@/render/app';
import type { HumanEventKind, HumanVariant } from '@/sim/types';
import { humanSim, patioWorld, scheduleNow } from '@/sim/environment/human/testkit';
import { humanPlan } from '@/sim/environment/human/plans';
import { humanSites } from '@/sim/environment/human/sites';
import { HumansRenderer } from './HumansRenderer';

function frame(sim: FrameInfo['sim']): FrameInfo {
  return {
    dt: 0, time: 0, alpha: 1, sim, view: 'observer', underground: false, camera: new PerspectiveCamera(), viewportHeightPx: 720, subject: null,
    possessedId: -1, possessedPose: null, subjectOpacity: 1, cutaway: null,
  };
}

function renderer(): { r: HumansRenderer; scene: Scene } {
  const scene = new Scene();
  const r = new HumansRenderer();
  r.init({ scene, camera: new PerspectiveCamera(), quality: getPreset('test'), assets: null, game: { requestRender: () => {}, testMode: true } } as unknown as RenderContext);
  return { r, scene };
}

describe('HumansRenderer', () => {
  it('draws nothing when no event runs', () => {
    const { r } = renderer();
    const sim = humanSim(patioWorld({ surface: 'concrete' }));
    r.update(frame(sim));
    expect(r.stats().actors).toBe(0);
    r.dispose();
  });

  const cases: [HumanEventKind, HumanVariant | null, string, number][] = [
    ['footsteps', 'adult', 'patio-lane', 40], ['sweeping', 'broom', 'patio', 10], ['food-drop', 'crumb-fall', '', 10],
    ['spill', 'sugary', 'patio', 10], ['bait-station', 'station', '', 10],
  ];
  it.each(cases)('draws %s actors at their plan pose, with shadows on the ground', (kind, variant, siteKind, steps) => {
    const { r, scene } = renderer();
    const sim = humanSim(patioWorld({ surface: 'concrete', sizeMm: 4000 }));
    const site = siteKind ? humanSites(sim.world).list.find((s) => s.kind === siteKind)! : null;
    const inst = scheduleNow(sim, kind, variant, site?.id ?? -1, site ? null : { x: 2000, y: 0, z: 2000 });
    sim.tick();
    const plan = humanPlan(sim, inst)!;
    // just before the first impact everything that falls or walks is on screen
    while (sim.state.tick < inst.startTick + plan.impacts[0].t - 1 + steps * 0) sim.tick();
    r.update(frame(sim));
    expect(r.stats().runs).toBe(1);
    expect(r.stats().actors).toBeGreaterThan(0);
    const shown = r.group.children.filter((c) => c.visible && c.type === 'Group');
    expect(shown.length).toBeGreaterThan(0);
    const fp = plan.impacts[0].fp;
    const near = shown.some((g) => Math.hypot(g.position.x - fp.x, g.position.z - fp.z) < 1500);
    expect(near).toBe(true);
    const shadows = r.group.children.filter((c) => c.visible && c.type === 'Mesh' && (c as Mesh).geometry.type === 'CircleGeometry');
    expect(shadows.length).toBeGreaterThan(0);
    expect(scene.children).toContain(r.group);
    r.dispose();
    expect(scene.children).not.toContain(r.group);
  });
});
