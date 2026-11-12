// Adversarial checks of the kernel factory (reviewer tests, F2-kernel).
import { describe, expect, it } from 'vitest';
import type { CarveData } from '@/sim/types/geom';
import { decode, encode } from '@/core/serialize';
import { createKernel } from './kernel';
import { carveTestNest, emptyCarve, makeSceneWorld, TEST_BU } from './kernel.testWorld';

const BU = TEST_BU;
const v = (x: number, y: number, z: number) => ({ x, y, z });

describe('kernel (verify)', () => {
  it('load into a live kernel: replacing CarveData contents + rebuild() equals a freshly created kernel', () => {
    const s = makeSceneWorld(7);
    // the "saved game": test nest plus a few player digs and a fill
    const savedK = createKernel(s.world, emptyCarve(BU));
    carveTestNest(savedK, s.nest);
    savedK.carveSphere(v(300, -40, 300), 6);
    savedK.carveCapsule(v(300, -40, 300), v(330, -50, 330), 3);
    savedK.fillSphere(v(316, -52, 316), 3);
    const saved = decode(encode(savedK.carve.data)) as CarveData;

    // a live kernel that already has other content and built nav fields
    const live = createKernel(s.world, emptyCarve(BU));
    live.carveSphere(v(100, -30, 100), 10);
    live.nav.setTarget('c3', { points: [s.nest.chambers[2].c], radius: 2 * BU });
    live.nav.distanceAt('c3', v(100, -30, 100));
    // load: replace the arrays in place, then rebuild the derived caches
    const d = live.carve.data;
    d.keys.length = 0; d.chunks.length = 0; d.breaches.length = 0;
    d.keys.push(...saved.keys); d.chunks.push(...saved.chunks); d.breaches.push(...saved.breaches);
    live.rebuild();

    const fresh = createKernel(s.world, decode(encode(saved)) as CarveData);
    fresh.nav.setTarget('c3', { points: [s.nest.chambers[2].c], radius: 2 * BU });
    const probes = [s.nest.entrance, ...s.nest.chambers.map((c) => c.c), v(300, -40, 300), v(330, -50, 330), v(100, -30, 100)];
    for (const p of probes) {
      expect(live.field.sample(p)).toBe(fresh.field.sample(p));
      expect(live.nav.distanceAt('c3', p)).toBe(fresh.nav.distanceAt('c3', p));
      expect(live.nav.componentAt(p)).toBe(fresh.nav.componentAt(p));
    }
    expect(live.carve.openVolume()).toBeCloseTo(fresh.carve.openVolume(), 6);
    expect(live.carve.takeDirty()).toEqual([]);
  });

  it('two kernels fed the same command sequence produce identical CarveData (determinism)', () => {
    const s = makeSceneWorld(3);
    const run = () => {
      const k = createKernel(s.world, emptyCarve(BU));
      carveTestNest(k, s.nest);
      for (let i = 0; i < 30; i++) k.carveSphere(v(250 + i * 2.3, -10 - i * 1.7, 250 + i * 1.1), 2 + (i % 4));
      k.fillSphere(v(280, -40, 280), 5);
      return encode(k.carve.data);
    };
    expect(Array.from(run())).toEqual(Array.from(run()));
  });

  it('the default dig predicate refuses the asphalt strip of the test scene but the subsoil below it is diggable', () => {
    const s = makeSceneWorld(7);
    const k = createKernel(s.world, emptyCarve(BU));
    const h = k.field.height(660, 100);
    expect(k.canDigAt(660, h - 1, 100)).toBe(false);
    expect(k.canDigAt(660, h - 10, 100)).toBe(true);
    // digging from below stops at the crust: no breach, the ground stays closed
    const r = k.carveCapsule(v(660, h - 20, 100), v(660, h + 1, 100), 1.5 * BU);
    expect(r.breach).toBe(false);
    for (let d = 1; d <= 5; d++) expect(k.field.sampleXYZ(660, h - d, 100)).toBeLessThan(0); // crust intact
    // the renderers' hole mask must not open the ground over an intact crust (air samples opened by the brush
    // above the ground pull the field's iso surface below the terrain surface)
    expect(k.field.isHoleAt(660, 100)).toBe(false);
  });
});
