// The renderer draws every running event's actors where the plan puts them, with a shadow, and nothing when idle.
// Node only (no WebGL): scene graph and transforms.

import { describe, expect, it } from 'vitest';
import { DirectionalLight, PerspectiveCamera, Scene, Vector3, type Mesh } from 'three';
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

describe('human actor geometry (task stage2-look-fix)', () => {
  it('a shoe stays within +-10 % of the triangle count it had before the leg, shoe and shadow rework (3640)', async () => {
    const { buildShoe } = await import('./geometry');
    const { createHumanMaterials, disposeHumanMaterials } = await import('./materials');
    const mt = createHumanMaterials();
    let tris = 0;
    buildShoe(mt, 280, 100, false).traverse((o) => {
      const m = o as Mesh;
      if (m.isMesh) tris += (m.geometry.index ? m.geometry.index.count : m.geometry.getAttribute('position').count) / 3;
    });
    disposeHumanMaterials(mt);
    expect(tris).toBeGreaterThan(3640 * 0.9);
    expect(tris).toBeLessThan(3640 * 1.1);
  });

  it('the trouser leg is a fabric tube: folds darken the vertex colour, the weave is a bump, the fade keeps the folds', async () => {
    const { buildTrouserLeg, fadeFolds } = await import('./geometry');
    const g = fadeFolds(buildTrouserLeg(60, 70, 400), 100, 350);
    const c = g.getAttribute('color'), p = g.getAttribute('position');
    let lo = 1, hi = 0, opaque = 0, clear = 0;
    for (let i = 0; i < c.count; i++) {
      lo = Math.min(lo, c.getX(i)); hi = Math.max(hi, c.getX(i));
      if (p.getY(i) < 100 && c.getW(i) === 1) opaque++;
      if (p.getY(i) >= 350 && c.getW(i) === 0) clear++;
    }
    expect(hi - lo).toBeGreaterThan(0.15); // visible fold shading, not one flat tone
    expect(opaque).toBeGreaterThan(0);
    expect(clear).toBeGreaterThan(0);
    const mt = (await import('./materials')).createHumanMaterials();
    expect(mt.trouser.bumpMap).toBeTruthy();
    expect(mt.trouser.roughness).toBeGreaterThan(0.9);
    (await import('./materials')).disposeHumanMaterials(mt);
  });

  it('the blob shadow leans away from the key light, and a bristle comb casts no shadow-map shadow', () => {
    const { r, scene } = renderer();
    const key = new DirectionalLight(0xffffff, 3.3);
    key.name = 'world:key-light';
    key.position.set(300, 300, 0); // the sun stands at +X: shadows fall toward -X
    scene.add(key, key.target);
    key.updateMatrixWorld(true);
    key.target.updateMatrixWorld(true);
    const sim = humanSim(patioWorld({ surface: 'concrete', sizeMm: 4000 }));
    const site = humanSites(sim.world).list.find((s) => s.kind === 'patio')!;
    const inst = scheduleNow(sim, 'sweeping', 'broom', site.id, null);
    sim.tick();
    const plan = humanPlan(sim, inst)!;
    while (sim.state.tick < inst.startTick + plan.impacts[0].t - 1) sim.tick();
    r.update(frame(sim));
    const shadows = r.group.children.filter((c) => c.visible && c.type === 'Mesh' && (c as Mesh).geometry.type === 'CircleGeometry');
    expect(shadows.length).toBeGreaterThan(0);
    const axis = new Vector3(1, 0, 0).applyQuaternion(shadows[0]!.quaternion);
    expect(axis.x).toBeLessThan(-0.99);
    // the broom's own meshes do not cast into the sun's shadow map (the soft blob is its shadow)
    const groups = r.group.children.filter((c) => c.visible && c.type === 'Group');
    let casters = 0;
    for (const g of groups) g.traverse((o) => { if ((o as Mesh).isMesh && o.castShadow) casters++; });
    expect(casters).toBe(0);
    r.dispose();
  });
});
