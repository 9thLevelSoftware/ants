// Draped placement and grass placement: determinism per block (revisits hash the same), zone rules, hugging
// (items lie on the ground or a flat slab top, never in a solid), moss only in joints.
import { describe, expect, it } from 'vitest';
import { placeGrass } from '../vegetation/grassPlacement';
import { blockContext } from './blockContext';
import { GroundView } from './ground';
import { BLADE_STRIDE, DRAPED_KIND, DRAPED_STRIDE, hashFloats, NO_FIXED_Y } from './instances';
import { placeDraped } from './placement';
import { buildTestWorld, TEST_WORLD } from './testWorld';
import { blockMm, blockRef } from './tiles';

const world = buildTestWorld();
const S = blockMm(TEST_WORLD.bu); // 1024 mm
const block = (x: number, z: number) => blockRef(Math.floor(x / S), Math.floor(z / S), TEST_WORLD.bu);

function kinds(rec: Float32Array): Record<number, number> {
  const out: Record<number, number> = {};
  for (let i = 0; i < rec.length; i += DRAPED_STRIDE) out[rec[i + 8]] = (out[rec[i + 8]] ?? 0) + 1;
  return out;
}

describe('decor placement', () => {
  it('is deterministic: the same block hashes the same from fresh ground views, different blocks differ', () => {
    const a = new GroundView(world), b = new GroundView(world);
    const ref = block(500, 500);
    const h1 = hashFloats(placeGrass(blockContext(a, ref)), placeDraped(blockContext(a, ref)));
    // build other blocks in between (a different streaming order must not matter)
    placeDraped(blockContext(b, block(3000, 3000)));
    placeGrass(blockContext(b, block(3000, 500)));
    const h2 = hashFloats(placeGrass(blockContext(b, ref)), placeDraped(blockContext(b, ref)));
    expect(h2).toBe(h1);
    expect(hashFloats(placeGrass(blockContext(a, block(1500, 500))))).not.toBe(h1);
  });

  it('puts the sward on lawns only, at GDD density, sorted by rank', () => {
    const g = new GroundView(world);
    const lawn = placeGrass(blockContext(g, block(500, 500)));
    const n = lawn.length / BLADE_STRIDE;
    // 3000 / m² over 1.05 m² (+ nothing else on a pure lawn block)
    expect(n).toBeGreaterThan(2900);
    expect(n).toBeLessThan(3400);
    for (let i = BLADE_STRIDE; i < lawn.length; i += BLADE_STRIDE) expect(lawn[i + 3]).toBeGreaterThanOrEqual(lawn[i + 3 - BLADE_STRIDE]);
    for (let i = 0; i < lawn.length; i += BLADE_STRIDE) {
      expect(lawn[i + 4]).toBeGreaterThan(20); // mown 50 mm x 0.7..1.2
      expect(lawn[i + 5]).toBeGreaterThanOrEqual(2);
      expect(lawn[i + 5]).toBeLessThanOrEqual(6);
    }
    expect(placeGrass(blockContext(g, block(3000, 3000))).length / BLADE_STRIDE).toBeLessThan(400); // asphalt: edge tufts only
  });

  it('never roots grass under a slab and lays forest leaves at the seasonal maximum density', () => {
    const g = new GroundView(world);
    const pav = placeGrass(blockContext(g, block(500, 2600)));
    for (let i = 0; i < pav.length; i += BLADE_STRIDE) {
      expect(g.prims.inside(pav[i], pav[i + 1] + 2.5, pav[i + 2])).toBe(false);
    }
    const forest = kinds(placeDraped(blockContext(g, block(3000, 1000))));
    const leaves = (forest[DRAPED_KIND.leaf] ?? 0) + (forest[DRAPED_KIND.smallLeaf] ?? 0);
    expect(leaves).toBeGreaterThan(560); // 600 / m² x 1.05 m²
    expect(leaves).toBeLessThan(700);
  });

  it('puts moss in paving joints only, and leaves on slabs on the slab top', () => {
    const g = new GroundView(world);
    const rec = placeDraped(blockContext(g, block(500, 2600)));
    let moss = 0, onSlab = 0;
    for (let i = 0; i < rec.length; i += DRAPED_STRIDE) {
      const x = rec[i], z = rec[i + 1], fy = rec[i + 7], k = rec[i + 8];
      if (k === DRAPED_KIND.moss) {
        moss++;
        expect(fy).toBe(NO_FIXED_Y);
        expect(g.prims.inside(x, g.height(x, z) + 1.5, z)).toBe(false);
      }
      if (fy !== NO_FIXED_Y) {
        onSlab++;
        expect(Math.abs(fy - TEST_WORLD.slabTop)).toBeLessThan(0.05);
      }
    }
    expect(moss).toBeGreaterThan(5);
    expect(onSlab).toBeGreaterThan(0); // the fruit tree's leaf fringe reaches the patio
  });

  it('drops litter near the bin at the bin density', () => {
    const g = new GroundView(world);
    const k = kinds(placeDraped(blockContext(g, block(3000, 3000))));
    expect((k[DRAPED_KIND.wrapper] ?? 0) + (k[DRAPED_KIND.receipt] ?? 0)).toBeLessThan(6);
  });
});
