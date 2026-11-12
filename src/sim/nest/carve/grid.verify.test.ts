// Adversarial checks of the carve grid and brushes (reviewer tests, F2-kernel acceptance criterion 4).
import { describe, expect, it } from 'vitest';
import type { Vec3 } from '@/core/math/vec3';
import { rngFloat, rngRange, rngSeed } from '@/core/rng';
import { createKernel } from '@/sim/kernel';
import { emptyCarve, makeFlatWorld, makeGround, TEST_BU } from '@/sim/kernel.testWorld';
import { createCarveGrid } from './grid';
import { CHUNK3 } from './keys';

const BU = TEST_BU;
const V = BU / 2;
const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

describe('carve grid (verify)', () => {
  it('breach flag agrees with the field: a hole opens in the ground exactly when breach is reported', () => {
    // ground NOT aligned with the sample lattice (h0 = 0.7 mm); spheres just below / just through the surface
    const rng = rngSeed(31);
    let disagreements = 0, n = 0;
    const notes: string[] = [];
    for (let t = 0; t < 120; t++) {
      const k = createKernel(makeFlatWorld({ h0: 0.7, size: 200 }), emptyCarve(BU));
      const r = rngRange(rng, 1, 3) * BU;
      const top = 0.7 + rngRange(rng, -1.5, 1.5) * V; // sphere top relative to the ground
      const c = v(100 + rngFloat(rng) * V, top - r, 100 + rngFloat(rng) * V);
      const res = k.carveSphere(c, r);
      // a hole in the field: some column inside the sphere's footprint is open just below the ground
      let hole = false;
      for (let dx = -r; dx <= r && !hole; dx += 0.25) for (let dz = -r; dz <= r && !hole; dz += 0.25) {
        if (dx * dx + dz * dz > r * r) continue;
        if (k.field.isHoleAt(c.x + dx, c.z + dz)) hole = true;
      }
      n++;
      if (hole !== res.breach) {
        disagreements++;
        if (notes.length < 5) notes.push(`top-ground ${(top - 0.7).toFixed(2)} mm: breach ${res.breach}, field hole ${hole}`);
      }
    }
    expect(n).toBe(120);
    expect(disagreements, notes.join('\n')).toBe(0);
  });

  it('a hard crust thinner than one voxel is NOT dug through by the default dig predicate', () => {
    // Messor/Atta BU = 7 (voxel 3.5 mm): a 3 mm tile crust over loam, ground at y = 3.4 mm, so no lattice sample
    // falls inside the crust layer (samples at y = 0 are 3.4 mm deep = subsoil, at y = 3.5 in the air).
    const bu = 7;
    const w = makeFlatWorld({ bu, h0: 3.4, size: 300 });
    w.ground = makeGround(w.size, w.terrain.cell, 'loam', 'loam', { where: () => true, material: 'tile', mm: 3 });
    const k = createKernel(w, emptyCarve(bu));
    expect(k.canDigAt(150, 2, 150)).toBe(false); // inside the crust
    const res = k.carveCapsule(v(150, -20, 150), v(150, 3.4, 150), 1.5 * bu); // a shaft dug up to the surface
    expect(res.breach).toBe(false);
    expect(k.field.isHoleAt(150, 150)).toBe(false);
  });

  it('opening and closing keeps data arrays, index and open volume consistent through many random edits', () => {
    const data = emptyCarve(BU);
    const g = createCarveGrid(data);
    const rng = rngSeed(9);
    for (let n = 0; n < 300; n++) {
      const c = v(rngRange(rng, -40, 40), rngRange(rng, -40, 40), rngRange(rng, -40, 40));
      if (rngFloat(rng) < 0.4) g.fillSphere(c, rngRange(rng, 1, 12));
      else g.carveSphere(c, rngRange(rng, 0.5, 8));
    }
    expect(data.keys.length).toBe(data.chunks.length);
    expect(new Set(data.keys).size).toBe(data.keys.length);
    for (const a of data.chunks) {
      expect(a.length).toBe(CHUNK3);
      expect(a.some((b) => b !== 0)).toBe(true); // empty chunks are dropped after fills (only fills drop them)
    }
    const vol = g.openVolume();
    g.rebuild();
    expect(g.openVolume()).toBeCloseTo(vol, 6);
    // a fresh grid over the same arrays reads identically
    const g2 = createCarveGrid({ ...data, keys: [...data.keys], chunks: data.chunks.map((a) => a.slice()) });
    for (let n = 0; n < 2000; n++) {
      const x = rngRange(rng, -50, 50), y = rngRange(rng, -50, 50), z = rngRange(rng, -50, 50);
      expect(g2.cavity(x, y, z)).toBe(g.cavity(x, y, z));
    }
  });

  it('carving is order-independent for disjoint brushes and deterministic for the same sequence', () => {
    const run = (order: number[]) => {
      const d = emptyCarve(BU);
      const g = createCarveGrid(d);
      const spheres = [v(0, -30, 0), v(60, -30, 0), v(0, -30, 60)];
      for (const i of order) g.carveSphere(spheres[i], 6);
      return d;
    };
    const a = run([0, 1, 2]), b = run([2, 0, 1]);
    const mapOf = (d: ReturnType<typeof run>) => new Map(d.keys.map((key, i) => [key, Array.from(d.chunks[i]).join(',')]));
    expect(mapOf(a)).toEqual(mapOf(b));
  });
});
