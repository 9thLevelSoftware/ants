// Review fixes of the world overlays: the temperature / moisture fill is a multiplier of the ground (exposure and
// HDR independent, never a wash), the ink pass composites in premultiplied alpha (inks keep their hue), flooded
// chambers are solid blue with wave hatching, rival territory without a territory grid uses the GDD core radius,
// and the dig-plans overlay flags the marker layer for the views layer.
import { describe, expect, it } from 'vitest';
import { Color, CustomBlending, DstColorFactor, Group, NormalBlending, OneMinusSrcAlphaFactor, PerspectiveCamera, Scene } from 'three';
import type { RenderContext } from '@/render';
import { getPreset } from '@/render/app/quality';
import type { Chamber, Colony, Nest } from '@/sim/types';
import { OKABE_ITO } from '@/ui/overlays/catalogue';
import { fxScenario } from '../../../../spikes/fx-demo/scenario';
import { ChamberOverlay } from './ChamberOverlay';
import { FxRenderer, MARKER_LAYER_NAME } from './FxRenderer';
import { GroundOverlay } from './GroundOverlay';
import { threatZones } from './samplers';
import { FLOOD_ALPHA, OVERLAY_BUDGET } from './tuning';

const sc = fxScenario(1, 4);

describe('ground overlay passes', () => {
  it('fills are a multiplier pass (dst x mix(1, ratio, a)); lines and hatching are premultiplied ink', () => {
    const g = new GroundOverlay(new Scene(), OVERLAY_BUDGET.test);
    g.setSim(sc.sim);
    const stain = g.stainMesh.material as unknown as Record<string, unknown>;
    expect(stain.blending).toBe(CustomBlending);
    expect(stain.blendSrc).toBe(DstColorFactor);
    expect(stain.blendDst).toBe(OneMinusSrcAlphaFactor);
    expect(stain.toneMapped).toBe(false);
    const ink = g.mesh.material as unknown as Record<string, unknown>;
    expect(ink.blending).toBe(NormalBlending);
    expect(ink.premultipliedAlpha).toBe(true);
    // one set of uniforms drives both passes
    expect((g.stainMesh.material as unknown as { uniforms: unknown }).uniforms).toBe((g.mesh.material as unknown as { uniforms: unknown }).uniforms);
    g.dispose();
  });

  it('the stain pass draws for temperature and moisture only; threats are ink only', () => {
    const g = new GroundOverlay(new Scene(), OVERLAY_BUDGET.test);
    g.setSim(sc.sim);
    const f = { now: 0, focusX: 256, focusZ: 256, heightMm: 400, converge: true, exposure: 1 };
    for (const [mode, stain] of [['temperature', true], ['moisture', true], ['threats', false]] as const) {
      g.setMode(mode);
      g.update(f);
      expect(g.mesh.visible, mode).toBe(true);
      expect(g.stainMesh.visible, mode).toBe(stain);
    }
    g.setMode(null);
    g.update(f);
    expect(g.mesh.visible || g.stainMesh.visible).toBe(false);
    g.dispose();
  });
});

describe('chamber overlay', () => {
  it('a flooded chamber is solid blue with wave hatching; others use the ramp at the normal opacity', () => {
    const sim = sc.sim;
    const nest = sim.state.nests[0];
    expect(nest.chambers.length).toBeGreaterThan(1);
    const saved = nest.chambers.map((c) => c.flooded);
    nest.chambers[0].flooded = 1;
    for (let i = 1; i < nest.chambers.length; i++) nest.chambers[i].flooded = 0;
    const o = new ChamberOverlay(new Scene());
    o.setSim(sim);
    o.setMode('moisture');
    o.update(1);
    const blue = new Color(OKABE_ITO.blue);
    const a = o.instance(0), b = o.instance(1);
    expect(a.flooded).toBe(true);
    expect(a.color[0]).toBeCloseTo(blue.r, 5);
    expect(a.color[1]).toBeCloseTo(blue.g, 5);
    expect(a.color[2]).toBeCloseTo(blue.b, 5);
    expect(b.flooded).toBe(false);
    expect(o.alphas.flooded).toBe(FLOOD_ALPHA);
    expect(FLOOD_ALPHA).toBeGreaterThanOrEqual(0.9);
    expect(o.alphas.normal).toBeLessThan(0.6);
    nest.chambers.forEach((c: Chamber, i: number) => { c.flooded = saved[i]; });
    o.dispose();
  });
});

describe('rival territory without a territory grid', () => {
  it('outlines each rival entrance at R_core = min(150, 40 + 0.1 N) BU (GDD 05 §3.5)', () => {
    const sim = sc.sim;
    const bu = sim.world.bu;
    const t = sim.state.rivals.territory;
    const savedMarks = t.marks;
    t.marks = new Float32Array(0);
    const player = sim.state.colonies[0];
    const rival = { ...player, id: 900, isPlayer: false, alive: true, rival: { ...(player.rival ?? {}), n: 300 } } as unknown as Colony;
    const big = { ...rival, id: 901, rival: { n: 5000 } } as unknown as Colony;
    const nestOf = (colony: number, x: number) => ({ ...sim.state.nests[0], id: 9000 + colony, colony, entrances: [{ ...sim.state.nests[0].entrances[0], pos: { x, y: 0, z: 100 } }] }) as unknown as Nest;
    sim.state.colonies.push(rival, big);
    sim.state.nests.push(nestOf(900, 100), nestOf(901, 300));
    try {
      const zones = threatZones(sim).zones.filter((z) => z.ch === 1);
      expect(zones).toHaveLength(2);
      expect(zones.find((z) => z.x === 100)!.r).toBeCloseTo(70 * bu, 6);
      expect(zones.find((z) => z.x === 300)!.r).toBeCloseTo(150 * bu, 6);
    } finally {
      sim.state.colonies.splice(-2, 2);
      sim.state.nests.splice(-2, 2);
      t.marks = savedMarks;
    }
  });
});

describe('dig-plans overlay', () => {
  it('flags the marker layer for the views layer and clears the flag when switched off', () => {
    const scene = new Scene();
    const ctx = {
      renderer: { toneMappingExposure: 1 }, scene, camera: new PerspectiveCamera(), quality: getPreset('test'), assets: null,
      game: { requestRender: () => {}, testMode: true },
    } as unknown as RenderContext;
    const layer = new Group();
    layer.name = MARKER_LAYER_NAME;
    scene.add(layer);
    const fx = new FxRenderer();
    fx.init(ctx);
    fx.onGameStart(sc.sim);
    fx.setOverlay('dig-plans', true);
    expect(fx.digPlansOverlay).toBe(true);
    expect(layer.userData.digPlansOverlay).toBe(true);
    fx.setOverlay('dig-plans', false);
    expect(fx.digPlansOverlay).toBe(false);
    expect(layer.userData.digPlansOverlay).toBe(false);
    fx.dispose();
  });
});
