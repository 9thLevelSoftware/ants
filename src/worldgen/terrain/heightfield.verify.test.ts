// Reviewer tests (worldgen-terrain): acceptance 5, "the heightfield has no discontinuities other than intended
// steps". Each test names the seeds where the defect was found; they FAIL until the heightfield is fixed.
import { describe, expect, it, vi } from 'vitest';
import { heightAt } from '@/sim/world/terrainSample';
import type { WorldData } from '@/sim/types';
import { report } from '../testing/fixtures';
import { TERRAIN } from '../tuning/terrain';

vi.setConfig({ testTimeout: 120_000 });

const zoneOf = (w: WorldData, i: number, k: number) => {
  const n = w.maps.zone.nx;
  return w.zones[w.maps.zone.data[Math.min(n - 1, Math.max(0, k)) * n + Math.min(n - 1, Math.max(0, i))]];
};

/** Largest |dH| between neighbouring samples whose six touching terrain cells all have a zone type in `types`. */
function maxStep(w: WorldData, ok: (type: string, variant: string | null) => boolean): { dh: number; at: string } {
  const t = w.terrain, n = t.nx, cells = w.maps.zone.nx;
  let best = { dh: 0, at: '' };
  for (let k = 1; k < n - 1; k++) for (let i = 1; i < n - 1; i++) {
    for (const [di, dk] of [[1, 0], [0, 1]] as const) {
      const touch = di ? [[-1, -1], [0, -1], [1, -1], [-1, 0], [0, 0], [1, 0]] : [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 0], [0, 1]];
      let all = true;
      for (const [a, b] of touch) {
        const ci = i + a, ck = k + b;
        if (ci < 0 || ck < 0 || ci >= cells || ck >= cells) continue;
        const z = zoneOf(w, ci, ck);
        if (!ok(z.type, z.variant)) { all = false; break; }
      }
      if (!all) continue;
      const dh = Math.abs(t.data[(k + dk) * n + i + di] - t.data[k * n + i]);
      if (dh > best.dh) best = { dh, at: `x=${i * t.cell} z=${k * t.cell}` };
    }
  }
  return best;
}

// The implementer's own bound for natural ground (terrain.test.ts): micro relief and worm casts only.
const NATURAL_MAX = (cell: number) => TERRAIN.wormCastHeight[1] + 0.5 * cell;

describe('heightfield continuity beyond the seeds the implementer tested', () => {
  it('natural lawn/forest ground has no cliffs next to path junctions (suburban s6, woodland s3)', () => {
    for (const [a, s] of [['suburban-garden', 6], ['woodland-edge', 3]] as const) {
      const w = report(a, s).world;
      const m = maxStep(w, (t) => t === 'forest' || t === 'lawn');
      // found: suburban s6 lawn 42 mm at x=10832 z=13408 (path meets driveway); woodland s3 forest 63 mm near
      // x=15344 z=3504 (path meets lane). Natural samples next to a path blend to the path's own (natural) level
      // when the path sample is the nearest built site, instead of to the neighbouring kerb / driveway level.
      expect(m.dh, `${a} s${s} at ${m.at}`).toBeLessThanOrEqual(NATURAL_MAX(w.terrain.cell));
    }
  });

  it('patio and footpath (both pavement) meet flush (suburban s4, s5)', () => {
    for (const s of [4, 5]) {
      const w = report('suburban-garden', s).world;
      const m = maxStep(w, (t) => t === 'pavement');
      // found: 42 mm between the path (natural smooth level) and the far edge of the patio (+10 - 1:60 fall)
      expect(m.dh, `suburban s${s} at ${m.at}`).toBeLessThanOrEqual(NATURAL_MAX(w.terrain.cell));
    }
  });

  it('no groove along the outer face of the house wall, whichever map side the house is on (kitchen-door s1 z1, s6 x1)', () => {
    for (const s of [1, 6, 3]) {
      const w = report('kitchen-door', s).world;
      const t = w.terrain, cells = w.maps.zone.nx, c = t.cell;
      const interior = (i: number, k: number) => zoneOf(w, i, k).type === 'interior';
      let worst = { drop: 0, at: '' };
      // every boundary between an outside terrain cell and an interior cell, away from the map edges
      for (let k = 2; k < cells - 2; k++) for (let i = 2; i < cells - 2; i++) {
        if (interior(i, k)) continue;
        for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          if (!interior(i + di, k + dk)) continue;
          // the zone boundary (= the wall's outer face); q just outside it, p 1.5 cells further out
          const fx = (i + 0.5 + 0.5 * di) * c, fz = (k + 0.5 + 0.5 * dk) * c;
          const qx = fx - di * 0.1 * c, qz = fz - dk * 0.1 * c, px = fx - di * 1.5 * c, pz = fz - dk * 1.5 * c;
          const drop = heightAt(t, px, pz) - heightAt(t, qx, qz);
          if (drop > worst.drop) worst = { drop, at: `x=${qx} z=${qz}` };
        }
      }
      // found: on house sides x1/z1 the boundary sample takes the interior level (-100, slab underside), so the
      // terrain falls ~100 mm within the last 4 BU cell OUTSIDE the wall (the wall starts at the boundary): a
      // 16 mm wide, 100 mm deep crevice along the whole facade for Lasius. Sides x0/z0 are fine (inside the wall).
      expect(worst.drop, `kitchen-door s${s} at ${worst.at}`).toBeLessThan(20);
    }
  });
});
