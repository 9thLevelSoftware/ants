import { describe, expect, it } from 'vitest';
import type { Primitive } from '@/sim/types/geom';
import { PrimFlag } from '@/sim/types/geom';
import { sdCappedCylinder, sdCapsule, sdEllipsoid, sdRoundBox } from '@/core/math/sdf';
import { createCarveGrid } from '@/sim/nest/carve/grid';
import { emptyCarve, makeByteMap, makeFlatWorld, makePrim, TEST_BU } from '@/sim/kernel.testWorld';
import { createWorldField, smax, smin, type WorldField } from './field';
import { makePrimEntry, primEval } from './primHash';

const BU = TEST_BU;
const v = (x: number, y: number, z: number) => ({ x, y, z });
const len = (a: { x: number; y: number; z: number }) => Math.hypot(a.x, a.y, a.z);

function numGrad(F: WorldField, p: { x: number; y: number; z: number }, h = 1e-3) {
  return v(
    (F.sampleXYZ(p.x + h, p.y, p.z) - F.sampleXYZ(p.x - h, p.y, p.z)) / (2 * h),
    (F.sampleXYZ(p.x, p.y + h, p.z) - F.sampleXYZ(p.x, p.y - h, p.z)) / (2 * h),
    (F.sampleXYZ(p.x, p.y, p.z + h) - F.sampleXYZ(p.x, p.y, p.z - h)) / (2 * h),
  );
}

function expectSameDir(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }, cosMin = 0.995) {
  const c = (a.x * b.x + a.y * b.y + a.z * b.z) / (len(a) * len(b));
  expect(c).toBeGreaterThan(cosMin);
}

const SHAPES: { name: string; prim: Primitive; inside: { x: number; y: number; z: number } }[] = [
  { name: 'box', prim: makePrim(1, 'box', v(100, 30, 100), v(20, 12, 8), { round: 2, yaw: 0.7 }), inside: v(100, 30, 100) },
  { name: 'cylinder', prim: makePrim(2, 'cylinder', v(200, 40, 100), v(6, 30, 0), { round: 1, rot: { x: Math.sin(0.3), y: 0, z: 0, w: Math.cos(0.3) } }), inside: v(200, 40, 100) },
  { name: 'capsule', prim: makePrim(3, 'capsule', v(100, 40, 250), v(3, 20, 0), { rot: { x: 0, y: 0, z: Math.sin(0.5), w: Math.cos(0.5) } }), inside: v(100, 40, 250) },
  { name: 'ellipsoid', prim: makePrim(4, 'ellipsoid', v(250, 25, 250), v(18, 9, 12), { yaw: -0.4 }), inside: v(250, 25, 250) },
];

describe('smooth min/max', () => {
  it('stays within k/4 of min/max', () => {
    for (let n = 0; n < 200; n++) {
      const a = ((n * 37) % 41) / 10 - 2, b = ((n * 53) % 43) / 10 - 2;
      expect(Math.min(a, b) - smin(a, b, 1.5)).toBeLessThanOrEqual(1.5 / 4 + 1e-12);
      expect(smax(a, b, 1.5) - Math.max(a, b)).toBeLessThanOrEqual(1.5 / 4 + 1e-12);
    }
  });
});

describe('primitive evaluation', () => {
  it('values equal the core SDFs and gradients match central differences', () => {
    for (const s of SHAPES) {
      const e = makePrimEntry(s.prim, false);
      const g = v(0, 0, 0);
      for (let n = 0; n < 300; n++) {
        const p = v(s.inside.x + ((n * 7.13) % 50) - 25, s.inside.y + ((n * 3.71) % 50) - 25, s.inside.z + ((n * 5.37) % 50) - 25);
        const d = primEval(e, p.x, p.y, p.z, g);
        const h = 1e-4;
        const nx = (primEval(e, p.x + h, p.y, p.z, null) - primEval(e, p.x - h, p.y, p.z, null)) / (2 * h);
        const ny = (primEval(e, p.x, p.y + h, p.z, null) - primEval(e, p.x, p.y - h, p.z, null)) / (2 * h);
        const nz = (primEval(e, p.x, p.y, p.z + h, null) - primEval(e, p.x, p.y, p.z - h, null)) / (2 * h);
        // the ellipsoid gradient is the implicit-surface normal: compare directions only, near the surface
        if (s.name === 'ellipsoid') {
          if (Math.abs(d) < 2) expectSameDir(g, v(nx, ny, nz), 0.97);
        } else if (Math.abs(len(v(nx, ny, nz)) - 1) < 1e-3) {
          expect(g.x).toBeCloseTo(nx, 3); expect(g.y).toBeCloseTo(ny, 3); expect(g.z).toBeCloseTo(nz, 3);
        }
      }
      // value agrees with the core function in local space
      const L = v(3, -2, 1);
      const sz = s.prim.size;
      const core = s.name === 'box' ? sdRoundBox(L, sz, s.prim.round) : s.name === 'cylinder' ? sdCappedCylinder(L, sz.x, sz.y, s.prim.round)
        : s.name === 'capsule' ? sdCapsule(L, sz.y, sz.x) : sdEllipsoid(L, sz.x, sz.y, sz.z);
      const q = s.prim.rot; // local -> world: p = pos + R L
      const tx = 2 * (q.y * L.z - q.z * L.y), ty = 2 * (q.z * L.x - q.x * L.z), tz = 2 * (q.x * L.y - q.y * L.x);
      const W = v(L.x + q.w * tx + (q.y * tz - q.z * ty) + s.prim.pos.x, L.y + q.w * ty + (q.z * tx - q.x * tz) + s.prim.pos.y,
        L.z + q.w * tz + (q.x * ty - q.y * tx) + s.prim.pos.z);
      expect(primEval(e, W.x, W.y, W.z, null)).toBeCloseTo(core, 9);
    }
  });
});

describe('world field', () => {
  it('flat ground: sign and gradient', () => {
    const F = createWorldField(makeFlatWorld({ h0: 5 }), null);
    const g = v(0, 0, 0);
    expect(F.sampleXYZ(100, 7, 100)).toBeCloseTo(2, 9);
    expect(F.sampleXYZ(100, 3, 100)).toBeCloseTo(-2, 9);
    expect(F.gradient(v(100, 6, 120), g)).toBeCloseTo(1, 9);
    expect(g.x).toBeCloseTo(0, 12); expect(g.y).toBeCloseTo(1, 12); expect(g.z).toBeCloseTo(0, 12);
  });

  it('sloped terrain: slope-corrected distance and plane normal', () => {
    const w = makeFlatWorld();
    for (let iz = 0; iz < w.terrain.nz; iz++) for (let ix = 0; ix < w.terrain.nx; ix++) w.terrain.data[iz * w.terrain.nx + ix] = 0.5 * ix * w.terrain.cell;
    const F = createWorldField(w, null);
    const p = v(120, 0.5 * 120 + 10, 90);
    const g = v(0, 0, 0);
    const f = F.gradient(p, g);
    expect(f).toBeCloseTo(10 / Math.sqrt(1.25), 6);
    expectSameDir(g, v(-0.5, 1, 0), 0.99999);
  });

  it('each primitive type: sign, gradient direction, and the outward surface normal', () => {
    for (const s of SHAPES) {
      const F = createWorldField(makeFlatWorld({ h0: -200, prims: [s.prim] }), null);
      expect(F.sample(s.inside)).toBeLessThan(0);
      const e = makePrimEntry(s.prim, false);
      const g = v(0, 0, 0), pg = v(0, 0, 0);
      let tested = 0;
      for (let n = 0; n < 3000; n++) {
        const p = v(s.inside.x + ((n * 7.13) % 70) - 35, s.inside.y + ((n * 3.71) % 70) - 35, s.inside.z + ((n * 5.37) % 70) - 35);
        const d = primEval(e, p.x, p.y, p.z, pg);
        const f = F.gradient(p, g);
        // sign agrees with the primitive away from the margin bound
        if (d < F.params.hashMargin - 2 * F.params.blend && Math.abs(d) > 0.01) expect(Math.sign(f)).toBe(Math.sign(d));
        if (d > 0.2 && d < 3) {
          // near the surface the field gradient is the primitive's outward normal and matches finite differences
          expectSameDir(g, pg, 0.999);
          // the ellipsoid's gradient is its implicit-surface normal, not the derivative of the approximate SDF
          expectSameDir(g, numGrad(F, p), s.name === 'ellipsoid' ? 0.97 : 0.995);
          tested++;
        }
      }
      expect(tested).toBeGreaterThan(5);
    }
  });

  it('a carved sphere below ground is free inside, and its wall gradient points into the cavity', () => {
    const w = makeFlatWorld();
    const grid = createCarveGrid(emptyCarve(BU));
    const c = v(150, -40, 150), r = 3 * BU;
    grid.carveSphere(c, r);
    const F = createWorldField(w, grid);
    expect(F.sample(c)).toBeGreaterThan(0);
    expect(F.sampleXYZ(c.x, c.y - r - 3, c.z)).toBeLessThan(0);
    const g = v(0, 0, 0);
    for (const d of [v(1, 0.01, 0.02), v(0.03, -1, 0), v(0.6, 0.8, 0.01), v(-0.48, 0.6, -0.64)]) {
      const l = len(d);
      const p = v(c.x + (d.x / l) * (r - 0.6), c.y + (d.y / l) * (r - 0.6), c.z + (d.z / l) * (r - 0.6));
      const f = F.gradient(p, g);
      expect(f).toBeGreaterThan(0);
      expect(f).toBeLessThan(1.5);
      expectSameDir(g, v(-d.x, -d.y, -d.z), 0.98);
      expectSameDir(g, numGrad(F, p, 1e-4), 0.98); // trilinear derivative: exact inside a cell
      expect(F.isUnderground(p)).toBe(true);
    }
  });

  it('a carved sphere breaching the surface opens the ground and the rim is smooth', () => {
    const w = makeFlatWorld();
    const grid = createCarveGrid(emptyCarve(BU));
    const c = v(150, -2, 150), r = 2 * BU;
    const F = createWorldField(w, grid);
    grid.setSubstrateProbe((x, y, z) => F.substrateXYZ(x, y, z));
    const res = grid.carveSphere(c, r);
    expect(res.breach).toBe(true);
    expect(F.sampleXYZ(c.x, -1, c.z)).toBeGreaterThan(0); // below the original ground, inside the hole
    expect(F.isHoleAt(c.x, c.z)).toBe(true);
    expect(F.isHoleAt(c.x + r + 3, c.z)).toBe(false);
    expect(F.sampleXYZ(c.x + r + 4, -1, c.z)).toBeLessThan(0);
    // across the rim the gradient turns from up (ground) to into the hole without flipping
    const g = v(0, 0, 0);
    let minY = 1;
    for (let x = c.x + r + 3; x > c.x + 0.6 * r; x -= 0.25) {
      const p = v(x, 0.6, c.z);
      const ok = F.project(p, 0.6, p);
      expect(ok).toBe(true);
      F.normal(p, g);
      expect(g.x).toBeLessThanOrEqual(0.05); // never points away from the hole
      expect(g.y).toBeGreaterThan(0); // the rim is rounded: no normal flips on the level set near it
      minY = Math.min(minY, g.y);
    }
    expect(minY).toBeLessThan(0.6); // the level set turns down into the hole
  });

  it('project converges onto the level set within 0.02 BU from points up to 2 BU away', () => {
    const w = makeFlatWorld({ prims: SHAPES.map((s) => ({ ...s.prim, pos: { ...s.prim.pos, y: s.prim.pos.y + 60 } })) });
    const grid = createCarveGrid(emptyCarve(BU));
    grid.carveSphere(v(320, -50, 320), 4 * BU);
    grid.carveCapsule(v(300, -30, 80), v(360, -30, 80), BU);
    const F = createWorldField(w, grid);
    const foot = 0.15 * BU, out = v(0, 0, 0), nrm = v(0, 0, 0);
    const surfacePts = [
      v(50, 0, 50), v(320 + 4 * BU, -50, 320), v(320, -50 - 4 * BU, 320), v(320, -50 + 4 * BU, 320), v(330, -30 - BU, 80),
      ...SHAPES.map((s) => v(s.inside.x, s.inside.y + 60 + (s.name === 'box' ? 12 : 9), s.inside.z)),
    ];
    let n = 0;
    for (const s of surfacePts) {
      for (let k = 0; k < 40; k++) {
        const a = k * 2.399, b = (k * 0.618) % 1;
        const dir = v(Math.cos(a) * Math.sqrt(1 - (2 * b - 1) ** 2), 2 * b - 1, Math.sin(a) * Math.sqrt(1 - (2 * b - 1) ** 2));
        const dist = ((k % 8) + 1) * 0.25 * BU; // up to 2 BU
        const p = v(s.x + dir.x * dist, s.y + dir.y * dist, s.z + dir.z * dist);
        const ok = F.project(p, foot, out, nrm);
        expect(ok, `from ${JSON.stringify(p)}`).toBe(true);
        expect(Math.abs(F.sample(out) - foot)).toBeLessThan(0.02 * BU);
        expect(len(nrm)).toBeCloseTo(1, 6);
        n++;
      }
    }
    expect(n).toBe(surfacePts.length * 40);
  });

  it('project finds a small cavity (a 2 BU tunnel tip) from deep solid exactly 2 BU from its level set, any direction', () => {
    // deep in soil the field saturates (gradient 0): only the probe rays can find the tip, a small target
    const grid = createCarveGrid(emptyCarve(BU));
    const tip = v(100, -60, 100);
    grid.carveCapsule(tip, v(160, -60, 100), BU);
    const F = createWorldField(makeFlatWorld(), grid);
    const foot = 0.15 * BU, out = v(0, 0, 0), g = v(0, 0, 0);
    let n = 0;
    for (let k = 0; k < 300; k++) {
      // directions over the hemisphere facing away from the tunnel (nearest level-set point = straight back)
      const b = (k + 0.5) / 300, a = k * 2.399963;
      const s = Math.sqrt(1 - b * b);
      const d = v(-b, Math.cos(a) * s, Math.sin(a) * s);
      let rho = 0; // level-set radius along d
      while (F.sampleXYZ(tip.x + d.x * rho, tip.y + d.y * rho, tip.z + d.z * rho) > foot) rho += 0.01;
      const R = rho + 2 * BU;
      const p = v(tip.x + d.x * R, tip.y + d.y * R, tip.z + d.z * R);
      expect(F.gradient(p, g)).toBeLessThan(0); // in solid ...
      expect(len(g)).toBeLessThan(0.1); // ... where the gradient vanishes
      expect(F.project(p, foot, out), `dir ${JSON.stringify(d)}`).toBe(true);
      expect(Math.abs(F.sample(out) - foot)).toBeLessThan(0.02 * BU);
      n++;
    }
    expect(n).toBe(300);
  });

  it('sphereTrace never overshoots into solid', () => {
    const w = makeFlatWorld({ prims: SHAPES.map((s) => s.prim) });
    const grid = createCarveGrid(emptyCarve(BU));
    grid.carveSphere(v(150, -2, 150), 3 * BU);
    grid.carveCapsule(v(150, -2, 150), v(220, -30, 200), BU);
    const F = createWorldField(w, grid);
    const radius = 0.3;
    let hits = 0;
    for (let k = 0; k < 200; k++) {
      const o = v(40 + ((k * 37) % 300), 30 + ((k * 13) % 40), 40 + ((k * 71) % 300));
      const a = k * 2.399, b = -0.95 + ((k * 0.618) % 1) * 1.2;
      const c = Math.sqrt(1 - b * b);
      const d = v(Math.cos(a) * c, b, Math.sin(a) * c);
      if (F.sample(o) < radius) continue;
      const t = F.sphereTrace(o, d, 200, radius);
      if (t < 200) hits++;
      for (let s = 0; s <= t; s += 0.1) {
        expect(F.sampleXYZ(o.x + d.x * s, o.y + d.y * s, o.z + d.z * s)).toBeGreaterThan(radius - 0.01);
      }
    }
    expect(hits).toBeGreaterThan(100);
    expect(F.segmentFree(v(10, 20, 10), v(390, 20, 390), 0.5)).toBe(false); // crosses the shapes
    expect(F.segmentFree(v(10, 5, 10), v(30, 5, 12), 0.5)).toBe(true);
  });

  it('dynamic primitives: add, update, remove', () => {
    const F = createWorldField(makeFlatWorld(), null);
    const p = makePrim(9, 'ellipsoid', v(100, 0, 100), v(20, 10, 20), { material: 'loam', flags: PrimFlag.DYNAMIC });
    expect(F.sampleXYZ(100, 5, 100)).toBeGreaterThan(4);
    F.addPrim(p);
    expect(F.sampleXYZ(100, 5, 100)).toBeLessThan(0);
    F.updatePrim({ ...p, pos: v(200, 0, 200) });
    expect(F.sampleXYZ(100, 5, 100)).toBeGreaterThan(4);
    expect(F.sampleXYZ(200, 5, 200)).toBeLessThan(0);
    expect(F.removePrim(9)).toBe(true);
    expect(F.sampleXYZ(200, 5, 200)).toBeGreaterThan(4);
  });

  it('carving opens the diggable group only: a tunnel under a hard slab has the slab as ceiling', () => {
    const slab = makePrim(1, 'box', v(200, 0, 200), v(60, 8, 60), { material: 'concrete' });
    const log = makePrim(2, 'cylinder', v(100, 10, 100), v(10, 30, 0), { material: 'wood-decayed', flags: PrimFlag.DIGGABLE, rot: { x: Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 } });
    const grid = createCarveGrid(emptyCarve(BU));
    const F = createWorldField(makeFlatWorld({ prims: [slab, log] }), grid);
    grid.carveCapsule(v(150, -9, 200), v(250, -9, 200), 3, { force: true });
    expect(F.sampleXYZ(200, -10, 200)).toBeGreaterThan(0); // tunnel open under the slab
    expect(F.sampleXYZ(200, -7.5, 200)).toBeLessThan(0); // the slab stays solid (ceiling)
    grid.carveSphere(v(100, 10, 100), 5, { force: true });
    expect(F.sampleXYZ(100, 10, 100)).toBeGreaterThan(0); // diggable log opened
  });

  it('materialAt, primAt, isUnderground', () => {
    const w = makeFlatWorld({ prims: [makePrim(1, 'box', v(100, 10, 100), v(10, 10, 10), { material: 'brick' })] });
    w.ground.crustMm.data.fill(5);
    w.ground.surface.data.fill(6); // asphalt
    const F = createWorldField(w, null);
    expect(F.materialAt(v(100, 20.1, 100))).toBe('brick');
    expect(F.materialAt(v(200, -2, 200))).toBe('asphalt');
    expect(F.materialAt(v(200, -8, 200))).toBe('loam');
    expect(F.primAt(v(100, 22, 100), 3)?.id).toBe(1);
    expect(F.primAt(v(100, 40, 100), 3)).toBeNull();
    expect(F.isUnderground(v(200, 5, 200))).toBe(false);
  });

  it('terrain holes remove the ground term with a smooth rim', () => {
    const size = 400, cell = 16;
    const holes = makeByteMap(size, cell, (x, z) => (x > 192 && x < 208 && z > 192 && z < 208 ? 1 : 0));
    const F = createWorldField(makeFlatWorld({ size, holes }), null);
    expect(F.sampleXYZ(200, -30, 200)).toBeGreaterThan(0);
    expect(F.sampleXYZ(200, -300, 200)).toBeGreaterThan(0);
    expect(F.sampleXYZ(180, -30, 200)).toBeLessThan(0);
    expect(F.sampleXYZ(100, 2, 100)).toBeCloseTo(2, 6);
    expect(F.isHoleAt(200, 200)).toBe(true);
    const out = v(0, 0, 0), nrm = v(0, 0, 0);
    expect(F.project(v(190, -10, 200), 0.6, out, nrm)).toBe(true);
    expect(nrm.x).toBeGreaterThan(0.9); // the hole wall faces into the hole
  });
});
