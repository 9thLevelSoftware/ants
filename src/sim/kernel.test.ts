import { describe, expect, it } from 'vitest';
import type { CarveData } from '@/sim/types/geom';
import { PrimFlag } from '@/sim/types/geom';
import { decode, encode } from '@/core/serialize';
import { rngFloat, rngRange, rngSeed } from '@/core/rng';
import { createKernel } from './kernel';
import { carveTestNest, emptyCarve, makeFlatWorld, makeGround, makeHeightField, makePrim, makeSceneWorld, TEST_BU } from './kernel.testWorld';

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

  it('hard crusts of any thickness stay closed when a shaft is dug up through them (BU 4 and 7, flat and sloped)', () => {
    const rng = rngSeed(91);
    for (const bu of [4, 7]) for (const slope of [0, 0.3]) for (let t = 0; t < 12; t++) {
      const V = bu / 2, mm = 1 + (t % 6); // 1..6 mm: thinner and thicker than a voxel
      const w = makeFlatWorld({ bu, size: 240 });
      w.terrain = makeHeightField(240, w.terrain.cell, (x, z) => slope * (z - 120) + rngRange(rng, -0.2, 0.2) + 0.7);
      w.ground = makeGround(240, w.terrain.cell, 'loam', 'loam', { where: () => true, material: t % 2 ? 'asphalt' : 'tile', mm });
      const k = createKernel(w, emptyCarve(bu));
      const x = 120 + rngFloat(rng) * V, z = 120 + rngFloat(rng) * V, h = k.field.height(x, z);
      const res = k.carveCapsule(v(x, h - 6 * bu, z), v(x, h + 0.5 * bu, z), 1.5 * bu); // geometrically breaks out
      const tag = `bu ${bu} slope ${slope} crust ${mm} mm`;
      expect(res.breach, tag).toBe(false);
      expect(res.blockedFraction, tag).toBeGreaterThan(0);
      for (let dx = -1.5 * bu; dx <= 1.5 * bu; dx += 0.5) for (let dz = -1.5 * bu; dz <= 1.5 * bu; dz += 0.5) {
        expect(k.field.isHoleAt(x + dx, z + dz), tag).toBe(false);
      }
      expect(k.field.sampleXYZ(x, h - mm / 2, z), tag).toBeLessThan(0); // the crust itself
      // ... and the shaft still reaches close under it (the refused band is one voxel, slope-widened)
      if (slope === 0) expect(k.field.sampleXYZ(x, h - mm - 2.5 * V, z), tag).toBeGreaterThan(0);
    }
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

  it('dynamic primitives: a hard box dropped into a tunnel blocks nest nav until it is moved or removed', () => {
    const k = createKernel(makeFlatWorld(), emptyCarve(BU));
    k.carveCapsule(v(20, -20, 100), v(180, -20, 100), BU, { force: true });
    k.nav.setTarget('w', { points: [v(20, -20, 100)], radius: 3 });
    const far = v(170, -20, 100);
    const d0 = k.nav.distanceAt('w', far);
    expect(d0).toBeLessThan(Infinity);
    const plug = makePrim(50, 'box', v(100, -20, 100), v(3, 8, 8), { material: 'stone', flags: PrimFlag.DYNAMIC });
    k.addPrim(plug);
    expect(k.nav.distanceAt('w', far)).toBe(Infinity);
    plug.pos.y = 30; // lifted out of the ground
    k.updatePrim(plug);
    expect(k.nav.distanceAt('w', far)).toBe(d0);
    plug.pos.y = -20;
    k.updatePrim(plug);
    expect(k.nav.distanceAt('w', far)).toBe(Infinity);
    expect(k.removePrim(50)).toBe(true);
    expect(k.nav.distanceAt('w', far)).toBe(d0);
    // a diggable primitive changes the meshes' discard attribute: their chunks become dirty; a far hard one does not
    k.carve.takeDirty();
    k.addPrim(makePrim(51, 'box', v(300, 50, 300), v(5, 5, 5), { material: 'stone', flags: PrimFlag.DYNAMIC }));
    expect(k.carve.dirtyCount()).toBe(0);
    k.addPrim(makePrim(52, 'box', v(60, -14, 100), v(3, 3, 3), { material: 'wood-decayed', flags: PrimFlag.DIGGABLE | PrimFlag.DYNAMIC }));
    expect(k.carve.dirtyCount()).toBeGreaterThan(0);
  });

  it('mesh normals (openness central differences) beat the faceted field gradient and agree with its direction', () => {
    const k = createKernel(makeFlatWorld(), emptyCarve(BU));
    const c = v(150.3, -60.7, 140.2);
    k.carveSphere(c, 9.3, { force: true });
    const g = v(0, 0, 0);
    const errors = (useField: boolean) => {
      let sum = 0, worst = 0, n = 0, minDot = 1;
      for (const key of k.meshKeys()) {
        const m = k.meshChunk(key, useField ? { gradient: (x, y, z, out) => { k.field.gradientXYZ(x, y, z, out); } } : {});
        if (!m) continue;
        for (let i = 0; i < m.positions.length / 3; i++) {
          const p = v(m.positions[i * 3], m.positions[i * 3 + 1], m.positions[i * 3 + 2]);
          const nx = m.normals[i * 3], ny = m.normals[i * 3 + 1], nz = m.normals[i * 3 + 2];
          const t = Math.hypot(c.x - p.x, c.y - p.y, c.z - p.z); // true normal: towards the centre (into the cavity)
          const deg = (Math.acos(Math.min(1, (nx * (c.x - p.x) + ny * (c.y - p.y) + nz * (c.z - p.z)) / t)) * 180) / Math.PI;
          sum += deg; worst = Math.max(worst, deg); n++;
          k.field.gradient(p, g);
          minDot = Math.min(minDot, (nx * g.x + ny * g.y + nz * g.z) / Math.hypot(g.x, g.y, g.z));
        }
      }
      return { mean: sum / n, worst, minDot, n };
    };
    const own = errors(false), viaField = errors(true);
    expect(own.n).toBeGreaterThan(300);
    expect(own.mean).toBeLessThan(2); // measured 1.2 deg
    expect(own.worst).toBeLessThan(6); // measured 4.9 deg
    expect(viaField.mean).toBeGreaterThan(own.mean); // trilinear derivative: measured 6.7 deg
    expect(own.minDot).toBeGreaterThan(0.95); // same direction as the field gradient (measured >= 0.977)
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

  it('the breach flag is exactly the field hole mask: spheres and capsules, flat and sloped ground, BU 4 and 7', () => {
    const rng = rngSeed(404);
    for (const bu of [4, 7]) for (const slope of [0, 0.35]) {
      const V = bu / 2;
      let breaches = 0;
      for (let t = 0; t < 30; t++) {
        const w = makeFlatWorld({ bu, size: 240 });
        w.terrain = makeHeightField(240, w.terrain.cell, (x, z) => slope * (x - 120) + 0.3 * Math.sin(x / 9 + z / 13));
        const k = createKernel(w, emptyCarve(bu));
        const r = rngRange(rng, 0.75, 3) * bu;
        const cx = 120 + rngFloat(rng) * V, cz = 120 + rngFloat(rng) * V;
        const a = v(cx, k.field.height(cx, cz) + rngRange(rng, -1.5, 1.5) * V - r, cz);
        const b = t % 2 ? v(a.x + rngRange(rng, -2, 2) * bu, a.y - rngRange(rng, 0, 2) * bu, a.z + rngRange(rng, -2, 2) * bu) : a;
        const res = t % 2 ? k.carveCapsule(a, b, r) : k.carveSphere(a, r);
        // the field's hole mask over the footprint: every sample column, plus a dense lattice between them
        let hole = false;
        const x0 = Math.min(a.x, b.x) - r - V, x1 = Math.max(a.x, b.x) + r + V, z0 = Math.min(a.z, b.z) - r - V, z1 = Math.max(a.z, b.z) + r + V;
        for (let i = Math.floor(x0 / V); i <= Math.ceil(x1 / V) && !hole; i++) for (let n = Math.floor(z0 / V); n <= Math.ceil(z1 / V); n++) if (k.field.isHoleAt(i * V, n * V)) { hole = true; break; }
        for (let x = x0; x <= x1 && !hole; x += 0.25) for (let z = z0; z <= z1; z += 0.25) if (k.field.isHoleAt(x, z)) { hole = true; break; }
        expect(res.breach, `bu ${bu} slope ${slope} trial ${t}`).toBe(hole);
        expect(k.carve.breaches.length > 0).toBe(hole);
        if (res.breach) breaches++;
      }
      expect(breaches).toBeGreaterThan(5); // both outcomes occur
      expect(breaches).toBeLessThan(28);
    }
    // re-digging an existing hole is no new breach; widening it is
    const k = createKernel(makeFlatWorld(), emptyCarve(BU));
    expect(k.carveSphere(v(100, 0, 100), 1.5 * BU).breach).toBe(true);
    const deeper = k.carveSphere(v(100, -4, 100), 1.5 * BU); // raises samples under columns that are holes already
    expect(deeper.changed).toBeGreaterThan(0);
    expect(deeper.breach).toBe(false);
    expect(k.carveSphere(v(100, 0, 100), 2.5 * BU).breach).toBe(true);
  });

  it('rejects carve data with the wrong voxel size', () => {
    expect(() => createKernel(makeFlatWorld(), emptyCarve(7))).toThrow();
  });
});
