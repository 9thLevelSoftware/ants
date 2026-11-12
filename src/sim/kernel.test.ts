import { describe, expect, it } from 'vitest';
import type { CarveData } from '@/sim/types/geom';
import { PrimFlag } from '@/sim/types/geom';
import { decode, encode } from '@/core/serialize';
import { createKernel } from './kernel';
import { carveTestNest, emptyCarve, makeFlatWorld, makeGround, makePrim, makeSceneWorld, TEST_BU } from './kernel.testWorld';

const BU = TEST_BU;
const v = (x: number, y: number, z: number) => ({ x, y, z });

function crustWorld() {
  const w = makeFlatWorld({
    prims: [
      makePrim(1, 'box', v(100, -5, 100), v(30, 10, 30), { material: 'concrete' }),
      makePrim(2, 'box', v(250, -5, 250), v(30, 10, 30), { material: 'wood-decayed', flags: PrimFlag.DIGGABLE }),
    ],
  });
  w.ground = makeGround(w.size, w.terrain.cell, 'loam', 'loam', { where: (x) => x > 300, material: 'asphalt', mm: 6 });
  return w;
}

describe('kernel', () => {
  it('default dig predicate: crust, hard and diggable primitives, open air', () => {
    const k = createKernel(crustWorld(), emptyCarve(BU));
    expect(k.canDigAt(50, -3, 50)).toBe(true); // loam
    expect(k.canDigAt(350, -3, 50)).toBe(false); // asphalt crust (6 mm)
    expect(k.canDigAt(350, -10, 50)).toBe(true); // loam below the crust
    expect(k.canDigAt(100, -5, 100)).toBe(false); // inside the concrete block
    expect(k.canDigAt(250, -5, 250)).toBe(true); // decayed wood with the DIGGABLE flag
    expect(k.canDigAt(50, 5, 50)).toBe(true); // open air
  });

  it('a tunnel can run under a hard crust, and a forced pre-carve opens a crack through it', () => {
    const k = createKernel(crustWorld(), emptyCarve(BU));
    const res = k.carveCapsule(v(320, -12, 60), v(380, -5, 60), 5);
    expect(res.blockedFraction).toBeGreaterThan(0);
    expect(res.breach).toBe(false);
    expect(k.field.sampleXYZ(370, -2, 60)).toBeLessThan(0); // crust intact above the tunnel
    expect(k.field.sampleXYZ(340, -11, 60)).toBeGreaterThan(0); // tunnel open
    const crack = k.carveCapsule(v(360, -12, 120), v(360, 4, 120), 1.5, { force: true });
    expect(crack.breach).toBe(true);
    expect(k.field.sampleXYZ(360, -3, 120)).toBeGreaterThan(0);
    expect(k.field.isHoleAt(360, 120)).toBe(true);
  });

  it('nav ignores voxels inside hard primitives', () => {
    const k = createKernel(crustWorld(), emptyCarve(BU));
    // forced carve straight through the concrete block: open bytes, but the field and the nav keep it solid
    k.carveCapsule(v(40, -5, 100), v(160, -5, 100), 3, { force: true });
    expect(k.field.sampleXYZ(100, -5, 100)).toBeLessThan(0);
    k.nav.setTarget('w', { points: [v(45, -5, 100)], radius: 3 });
    expect(k.nav.distanceAt('w', v(60, -5, 100))).toBeLessThan(Infinity);
    expect(k.nav.distanceAt('w', v(155, -5, 100))).toBe(Infinity);
  });

  it('meshes carry the soil-distance discard attribute', () => {
    const k = createKernel(makeFlatWorld(), emptyCarve(BU));
    k.carveSphere(v(50, 0, 50), 6);
    const meshes = k.meshKeys().map((key) => k.meshChunk(key)).filter((m) => m !== null);
    const sub = meshes.flatMap((m) => [...m!.substrate]);
    expect(sub.some((d) => d > 0)).toBe(true); // the part above ground is discardable
    expect(sub.some((d) => d < -1)).toBe(true);
  });

  it('a saved game (CarveData through encode/decode) rebuilds an identical kernel', () => {
    const s = makeSceneWorld(7);
    const data = emptyCarve(BU);
    const k = createKernel(s.world, data);
    carveTestNest(k, s.nest);
    k.nav.setTarget('C3', { points: [s.nest.chambers[2].c], radius: 2 * BU });
    const saved = decode(encode(data)) as CarveData;
    const k2 = createKernel(s.world, saved);
    k2.nav.setTarget('C3', { points: [s.nest.chambers[2].c], radius: 2 * BU });
    const probes = [s.nest.entrance, ...s.nest.chambers.map((c) => c.c), v(316, -52, 316), v(304, -66, 334)];
    for (const p of probes) {
      expect(k2.field.sample(p)).toBe(k.field.sample(p));
      expect(k2.nav.distanceAt('C3', p)).toBe(k.nav.distanceAt('C3', p));
    }
    expect(saved.breaches.length).toBeGreaterThan(0);
    expect(k2.carve.openVolume()).toBeCloseTo(k.carve.openVolume(), 6);
  });

  it('rejects carve data with the wrong voxel size', () => {
    expect(() => createKernel(makeFlatWorld(), emptyCarve(7))).toThrow();
  });
});
