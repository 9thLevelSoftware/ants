// Reviewer test (render-decor): the per-pixel resolve (dcResolve, CPU twin drapedResolve) on SLOPED, bumpy ground
// seen from ant height. drapedShape.test.ts only measures the gentle test world (slopes below about 0.1) with the
// camera 6 BU up. The resolve is a fixed-point iteration y -> surface along the view ray; it contracts only while
// the ground slope along the ray is smaller than the ray's own slope, which is not the case for an ant-height camera
// looking up a 10-15 degree bank. A pixel that resolves off its card is discarded (hole in the leaf); one that
// resolves to the wrong point writes a wrong depth.
//
// Amended by the module owner after the fix (secant resolve): a ray that never meets the hugging surface (it passes
// above the coarser drawn terrain but under the walker's bilinear surface, a gap of up to ~0.4 mm on this bank) can
// have no point within 0.2 mm of that surface at all, so "worst < 0.2 mm" is now asserted only for rays that do meet
// it (found by a dense scan), and with a 0.1 % allowance: a ray that grazes a crest can meet the surface only far
// from the card point. For the others the written point must be about the closest the ray gets (within 0.05 mm of
// the scan's best) and below the surface, never above. Nothing may be off by more than 0.5 mm either way. The original numbers (53 / 112 off card, 247 / 565 more than
// 0.5 mm below, worst 6.2 mm) are what the old fixed-point resolve produced.
import { describe, expect, it } from 'vitest';
import { getPreset } from '@/render/app';
import { buildWorld } from '@/sim/testing/worldBuilder';
import { defaultWorldParams } from '@/worldgen/params';
import { blockContext } from './blockContext';
import { clipmapParams, drapeLayout } from './drape';
import { drapeLift, drapedResolve, drapedVertex, hugResidual, hugSurface } from './drapedShape';
import { GroundView } from './ground';
import { DRAPED_KIND, DRAPED_STRIDE } from './instances';
import { placeDraped } from './placement';
import { blockRef } from './tiles';
import { DRAPE } from './tuning';

const BU = 4;
// a forest bank: 0.22 slope (12 degrees) uphill along +x, plus litter-scale bumps
const height = (x: number, z: number) => 0.22 * x + 3 * Math.sin(x / 23) * Math.cos(z / 19);
const world = buildWorld({ params: defaultWorldParams('lasius-niger', 5), size: 4096, bu: BU, height, zone: 'forest', surface: 'humus' });
const ground = new GroundView(world);

function measure(camHeightBU: number, uphill = true) {
  const camXZ = { x: 1500, z: 500 };
  const layout = drapeLayout(camXZ.x, camXZ.z, clipmapParams(ground.src, getPreset('high')));
  const cam = { x: camXZ.x, y: ground.height(camXZ.x, camXZ.z) + camHeightBU * BU, z: camXZ.z };
  const rec = placeDraped(blockContext(ground, blockRef(1, 0, BU)));
  const [gu, gv] = DRAPE.lodGrid[0];
  let samples = 0, lost = 0, worst = 0, above = 0, below = 0, noRoot = 0, noRootWorse = 0, rootedOff = 0;
  for (let o = 0; o < rec.length; o += DRAPED_STRIDE) {
    if (rec[o + 8] !== DRAPED_KIND.leaf) continue;
    const dx = rec[o] - cam.x, dz = rec[o + 1] - cam.z, d = Math.hypot(dx, dz);
    if (d < 40 || d > 300 || (uphill ? dx < 0 : dx > 0)) continue; // leaves up (or down) the bank from the camera
    for (let j = 0; j <= gv; j++) for (let i = 0; i <= gu; i++) {
      // inner card points only (|u|,|v| <= 0.8): their pixels belong to the item whatever the resolve does
      const u = -0.8 + (1.6 * i) / gu, v = -0.8 + (1.6 * j) / gv;
      const p = drapedVertex(rec, o, u, v, 0.5, BU, ground.src, layout);
      const r = drapedResolve(rec, o, cam, p, 0.5, BU, ground.src, layout);
      samples++;
      if (!r.inside) { lost++; continue; }
      // signed error of the written point against the hugging surface + this point's own lift
      const err = r.y - (hugSurface(ground.src, layout, r.x, r.z, rec[o + 7]) + drapeLift(rec[o + 6], r.u, r.v, BU));
      if (err > 0.5) above++;
      if (err < -0.5) below++;
      const best = closestApproach(cam, p, rec, o, layout);
      if (best < 0) {
        noRoot++;
        if (err > 1e-3 || err < best - 0.05) noRootWorse++;
      } else {
        worst = Math.max(worst, Math.abs(err));
        if (Math.abs(err) > 0.2) rootedOff++;
      }
    }
  }
  return { samples, lost, worst, above, below, noRoot, noRootWorse, rootedOff };
}

/** Largest height of the ray (through card point p) above the hugging surface within 40 mm of p (< 0: no root). */
function closestApproach(cam: { x: number; y: number; z: number }, p: { x: number; y: number; z: number }, rec: Float32Array, o: number,
  layout: ReturnType<typeof drapeLayout>): number {
  const L = Math.hypot(p.x - cam.x, p.y - cam.y, p.z - cam.z);
  const rx = (p.x - cam.x) / L, ry = (p.y - cam.y) / L, rz = (p.z - cam.z) / L;
  let best = -1e9;
  for (let t = -40; t <= 40; t += 0.05) {
    best = Math.max(best, hugResidual(rec, o, p.x + rx * t, p.y + ry * t, p.z + rz * t, 0.5, BU, ground.src, layout));
    if (best >= 0) return best;
  }
  return best;
}

describe('draped resolve on a bank seen from ant height (review)', () => {
  it('pixels of a leaf stay on the leaf and on the ground (camera 1.5 BU up, looking uphill)', () => {
    const r = measure(1.5);
    // eslint-disable-next-line no-console
    console.log(`[review] bank, cam 1.5 BU: ${r.lost}/${r.samples} inner leaf pixels resolved off their card; worst depth error ${r.worst.toFixed(3)} mm; >0.5 mm above ${r.above}, below ${r.below}; rays that never meet the surface ${r.noRoot} (worse than their closest approach: ${r.noRootWorse}); met but > 0.2 mm off ${r.rootedOff}`);
    expect(r.samples).toBeGreaterThan(500);
    expect(r.below + r.above + r.noRootWorse).toBe(0);
    expect(r.lost / r.samples).toBeLessThan(0.01);
    expect(r.rootedOff / r.samples).toBeLessThan(0.001);
  });

  it('same at 6 BU (the original test height) as a control', () => {
    const r = measure(6);
    // eslint-disable-next-line no-console
    console.log(`[review] bank, cam 6 BU: ${r.lost}/${r.samples} off card; worst depth error ${r.worst.toFixed(3)} mm; >0.5 mm above ${r.above}, below ${r.below}; never meet ${r.noRoot} (worse: ${r.noRootWorse}); met but > 0.2 mm off ${r.rootedOff}`);
    expect(r.below + r.above + r.noRootWorse).toBe(0);
    expect(r.lost / r.samples).toBeLessThan(0.01);
    expect(r.rootedOff / r.samples).toBeLessThan(0.001);
  });

  it('looking down the bank (control)', () => {
    const r = measure(6, false);
    // eslint-disable-next-line no-console
    console.log(`[review] bank downhill, cam 6 BU: ${r.lost}/${r.samples} off card; worst depth error ${r.worst.toFixed(3)} mm; >0.5 mm above ${r.above}, below ${r.below}`);
    // passes today (worst 0.45 mm): kept as a regression guard for the downhill case
    expect(r.lost).toBe(0);
    expect(r.below).toBe(0);
  });
});
