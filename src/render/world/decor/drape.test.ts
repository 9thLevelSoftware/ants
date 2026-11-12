// The CPU drape twin against the terrain's own vertex formula (morphedXZ + bilinear heights at the morphed
// positions, triangles (a,c,b), (b,c,d)), on rough ground: decor that uses the drape lies exactly on the drawn terrain.
import { describe, expect, it } from 'vitest';
import { getPreset } from '@/render/app';
import { morphedXZ, type ClipLevel } from '../terrain/clipmap';
import { sampleHeight } from '../terrain/terrainData';
import { clipmapParams, drapeHeight, drapeLayout, drapeLevel } from './drape';

function roughSource(size = 4000, cell = 16) {
  const nx = Math.floor(size / cell) + 1, heights = new Float32Array(nx * nx);
  for (let k = 0; k < nx; k++) for (let i = 0; i < nx; i++) {
    const x = i * cell, z = k * cell;
    heights[k * nx + i] = 8 * Math.sin(x / 23) * Math.cos(z / 31) + 3 * Math.sin((x + 2 * z) / 11) + 0.01 * x;
  }
  return { worldSize: size, bu: 4, cell, nx, nz: nx, heights };
}

/** Height of the terrain level `lv` as drawn at (x, z): search the morphed quads around the point. */
function terrainMeshHeight(src: ReturnType<typeof roughSource>, lv: ClipLevel, x: number, z: number): number | null {
  const gi = Math.floor((x - lv.originX) / lv.spacing), gk = Math.floor((z - lv.originZ) / lv.spacing);
  const o = { x: 0, z: 0 };
  const vert = (i: number, k: number) => { morphedXZ(lv, i, k, o); return { x: o.x, z: o.z, h: sampleHeight(src, o.x, o.z) }; };
  for (let k = gk - 2; k <= gk + 2; k++) for (let i = gi - 2; i <= gi + 2; i++) {
    if (i < 0 || k < 0 || i >= lv.n || k >= lv.n) continue;
    const a = vert(i, k), b = vert(i + 1, k), c = vert(i, k + 1), d = vert(i + 1, k + 1);
    for (const [p, q, r] of [[a, c, b], [b, c, d]]) {
      const det = (q.z - r.z) * (p.x - r.x) + (r.x - q.x) * (p.z - r.z);
      if (Math.abs(det) < 1e-9) continue;
      const w1 = ((q.z - r.z) * (x - r.x) + (r.x - q.x) * (z - r.z)) / det;
      const w2 = ((r.z - p.z) * (x - r.x) + (p.x - r.x) * (z - r.z)) / det;
      const w3 = 1 - w1 - w2;
      if (w1 >= -1e-7 && w2 >= -1e-7 && w3 >= -1e-7) return w1 * p.h + w2 * q.h + w3 * r.h;
    }
  }
  return null;
}

describe('drape matches the drawn terrain', () => {
  const src = roughSource();
  const params = clipmapParams(src, getPreset('high'));
  const cam = { x: 1987.3, z: 2011.9 };
  const layout = drapeLayout(cam.x, cam.z, params);

  it('is exact inside each level and in the morph bands', () => {
    let worstInner = 0, worstBand = 0, n = 0;
    for (let s = 0; s < 4000; s++) {
      const r = 600 * Math.sqrt(((s * 7919) % 4000) / 4000), a = s * 2.399;
      const x = cam.x + r * Math.cos(a), z = cam.z + r * Math.sin(a);
      const l = drapeLevel(layout, x, z), lv = layout.levels[l];
      const ref = terrainMeshHeight(src, lv, x, z);
      if (ref === null) continue;
      n++;
      const half = lv.n / 2, gx = (x - lv.originX) / lv.spacing, gz = (z - lv.originZ) / lv.spacing;
      const dn = Math.max(Math.abs(gx - half), Math.abs(gz - half)) / half;
      const err = Math.abs(drapeHeight(src, layout, x, z) - ref);
      if (dn < 0.8) worstInner = Math.max(worstInner, err); else worstBand = Math.max(worstBand, err);
    }
    expect(n).toBeGreaterThan(3500);
    expect(worstInner).toBeLessThan(1e-3);
    expect(worstBand).toBeLessThan(1e-3);
    console.info(`drape vs drawn terrain: inner ${worstInner.toExponential(2)} mm, morph band ${worstBand.toFixed(3)} mm`);
  });

  it('the bilinear heightfield alone would be off by a visible amount on this ground (why the drape exists)', () => {
    let worst = 0;
    for (let s = 0; s < 2000; s++) {
      const x = cam.x - 100 + (s % 50) * 4.1, z = cam.z - 100 + Math.floor(s / 50) * 4.9;
      worst = Math.max(worst, Math.abs(sampleHeight(src, x, z) - drapeHeight(src, layout, x, z)));
    }
    expect(worst).toBeGreaterThan(0.05);
  });
});
