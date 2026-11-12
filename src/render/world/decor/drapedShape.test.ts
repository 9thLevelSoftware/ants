// The hug rule, measured: draped items of a forest block and a patio block, interpolated across their card
// triangles like the GPU does, against the drawn terrain (the drape twin).
//  - Resolved surface (what is shaded and written to depth for every near pixel): the pixel's ray is followed from
//    the card onto the hugging surface (the higher of the drawn terrain and the walker's bilinear surface) + lift,
//    which lies within (liftBU + curlBU) BU of it, far below the walker foot offset (0.15 BU).
//  - Card geometry (only a proxy that covers the pixels): vertices on the drawn ground + lift; between vertices it
//    may bridge or cut the ground's facets by a fraction of a millimetre (reported).
import { describe, expect, it } from 'vitest';
import { getPreset } from '@/render/app';
import { blockContext } from './blockContext';
import { clipmapParams, drapeHeight, drapeLayout } from './drape';
import { drapedResolve, drapedVertex, hugSurface } from './drapedShape';
import { GroundView } from './ground';
import { DRAPED_STRIDE } from './instances';
import { placeDraped } from './placement';
import { buildTestWorld, TEST_WORLD } from './testWorld';
import { blockRef } from './tiles';
import { DRAPE } from './tuning';

const FOOT_OFFSET_BU = 0.15; // src/sim/locomotion/walkerParams.ts footOffsetBU
const world = buildTestWorld();
const ground = new GroundView(world);
const BU = TEST_WORLD.bu;

function measure(bx: number, bz: number, cam: { x: number; z: number }, grid: readonly [number, number]) {
  const layout = drapeLayout(cam.x, cam.z, clipmapParams(ground.src, getPreset('high')));
  const rec = placeDraped(blockContext(ground, blockRef(bx, bz, BU)));
  let maxAbove = 0, maxBelow = 0, n = 0, depthWorst = 0, resolved = 0;
  const cam3 = { x: cam.x, y: ground.height(cam.x, cam.z) + 6 * BU, z: cam.z };
  const [gu, gv] = grid;
  for (let o = 0; o < rec.length; o += DRAPED_STRIDE) {
    if (Math.hypot(rec[o] - cam.x, rec[o + 1] - cam.z) > 300) continue;
    const vert = (i: number, j: number) => drapedVertex(rec, o, -1 + (2 * i) / gu, -1 + (2 * j) / gv, 0.5, BU, ground.src, layout);
    for (let j = 0; j < gv; j++) for (let i = 0; i < gu; i++) {
      const a = vert(i, j), b = vert(i + 1, j), c = vert(i, j + 1), d = vert(i + 1, j + 1);
      for (const [p, q, r] of [[a, c, b], [b, c, d]]) for (let s = 0; s <= 4; s++) for (let t = 0; t <= 4 - s; t++) {
        const w0 = s / 4, w1 = t / 4, w2 = 1 - w0 - w1;
        const x = p.x * w0 + q.x * w1 + r.x * w2, z = p.z * w0 + q.z * w1 + r.z * w2, y = p.y * w0 + q.y * w1 + r.y * w2;
        const fixed = p.ground === q.ground && q.ground === r.ground && rec[o + 7] > -1e8;
        const gy = fixed ? p.ground : drapeHeight(ground.src, layout, x, z);
        maxAbove = Math.max(maxAbove, y - gy);
        // the depth point at the rim (largest lift) must stay inside [ground, ground + band]
        // the pixel through this card point resolves onto the hugging surface, within the band above it
        const res = drapedResolve(rec, o, cam3, { x, y, z }, 0.5, BU, ground.src, layout);
        if (res.inside) {
          const dz = res.y - hugSurface(ground.src, layout, res.x, res.z, rec[o + 7]);
          depthWorst = Math.max(depthWorst, dz < 0 ? -dz : 0, dz - (DRAPE.liftBU + DRAPE.curlBU) * BU);
          resolved++;
        }
        maxBelow = Math.max(maxBelow, gy - y);
        n++;
      }
    }
  }
  return { maxAbove, maxBelow, n, depthWorst, resolved };
}

describe('draped decor hugs the ground', () => {
  it('forest leaves near the camera (LOD 0 cards) lie within the hug band', () => {
    const r = measure(2, 0, { x: 2500, z: 500 }, DRAPE.lodGrid[0]);
    expect(r.n).toBeGreaterThan(10000);
    expect(r.resolved).toBeGreaterThan(r.n * 0.9);
    expect(r.depthWorst).toBeLessThan(0.01);
    expect(DRAPE.liftBU + DRAPE.curlBU).toBeLessThan(FOOT_OFFSET_BU / 3);
    expect(r.maxAbove).toBeLessThan(0.6);
    expect(r.maxBelow).toBeLessThan(0.6);
    console.info(`forest LOD0 card proxy: above ${r.maxAbove.toFixed(3)} mm, below ${r.maxBelow.toFixed(3)} mm; resolved residual ${r.depthWorst.toFixed(4)} mm (${r.resolved}/${r.n})`);
  });

  it('leaves on patio slabs lie on the slab top', () => {
    const r = measure(0, 2, { x: 600, z: 2600 }, DRAPE.lodGrid[0]);
    expect(r.depthWorst).toBeLessThan(0.01);
    expect(r.maxAbove).toBeLessThanOrEqual((DRAPE.liftBU + DRAPE.curlBU) * BU + 1e-6);
    expect(r.maxBelow).toBeLessThan(1e-6);
  });
});
