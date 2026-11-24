// The flood sheet follows the cavity's outline (app-seams-4 item 4): a lattice mesh whose shore value is the carve openness at the
// water level, cut at the iso level in the shader, instead of a union of cell squares with square corners.
import { describe, expect, it } from 'vitest';
import { floodWaterFragment } from './floodWater';
import { NO_DEPTH_MM, opennessAt, shoreGeometry, SHORE_ISO, SHORE_MAX_VERTS, waterDepthMm } from './floodShore';

/** A round pool of radius r (lattice units) centred at the origin: openness falls through 0.5 exactly at r. */
const disc = (r: number) => (i: number, k: number) => Math.max(0, Math.min(1, 0.5 + (r - Math.hypot(i, k)) * 0.5));
const cellsOf = (r: number, cell: number): number[] => {
  const c: number[] = [];
  for (let i = -Math.ceil(r); i <= Math.ceil(r); i++) for (let k = -Math.ceil(r); k <= Math.ceil(r); k++) if (Math.hypot(i, k) <= r) c.push(i * cell, k * cell);
  return c;
};

describe('shoreGeometry', () => {
  it('meshes a round pool: the shore value falls through the iso level at the cavity wall, and the outline is round', () => {
    const r = 5.5, cell = 2;
    const g = shoreGeometry(cellsOf(r, 1).map((v) => v * cell), cell, 3, disc(r))!;
    const pos = g.getAttribute('position'), sh = g.getAttribute('aShore');
    let inside = 0, outside = 0, maxIn = 0;
    for (let v = 0; v < sh.count; v++) {
      const d = Math.hypot(pos.getX(v), pos.getZ(v)) / cell;
      expect(pos.getY(v)).toBe(3);
      if (d < r - 1) { expect(sh.getX(v)).toBeGreaterThan(SHORE_ISO); inside++; }
      if (d > r + 1.01) { expect(sh.getX(v)).toBeLessThanOrEqual(SHORE_ISO); outside++; }
      if (sh.getX(v) > SHORE_ISO) maxIn = Math.max(maxIn, d);
    }
    expect(inside).toBeGreaterThan(20);
    expect(outside).toBeGreaterThan(0);
    expect(maxIn).toBeLessThan(r + 0.01); // nothing above the iso level beyond the wall: no square corners poking out
    expect(g.getIndex()!.count % 3).toBe(0);
  });

  it('never spreads over open air beyond the flooded samples: the ring of neighbours stays under the iso level', () => {
    // all samples are fully open (a big dry room beside one flooded sample)
    const g = shoreGeometry([0, 0], 2, 0, () => 1)!;
    const pos = g.getAttribute('position'), sh = g.getAttribute('aShore');
    for (let v = 0; v < sh.count; v++) {
      const onCell = pos.getX(v) === 0 && pos.getZ(v) === 0;
      expect(sh.getX(v) > SHORE_ISO).toBe(onCell);
    }
  });

  it('returns null with no cells or no water above the iso level, and meshes a huge area coarsely', () => {
    expect(shoreGeometry([], 2, 0, () => 1)).toBeNull();
    expect(shoreGeometry([0, 0], 2, 0, () => 0.2)).toBeNull();
    const big: number[] = [];
    for (let i = 0; i < 400; i++) for (let k = 0; k < 400; k++) big.push(i * 2, k * 2);
    const g = shoreGeometry(big, 2, 0, () => 1)!;
    expect(g.getAttribute('position').count).toBeLessThanOrEqual(SHORE_MAX_VERTS);
  });

  it('carries the water depth per vertex so the shader can end the sheet where the floor comes up (a smooth shore), deep when no floor is given', () => {
    const cells = cellsOf(3, 1).map((v) => v * 2);
    const flat = shoreGeometry(cells, 2, 5, () => 1)!;
    for (let v = 0; v < flat.getAttribute('aDepth').count; v++) expect(flat.getAttribute('aDepth').getX(v)).toBe(NO_DEPTH_MM);
    const g = shoreGeometry(cells, 2, 5, () => 1, (i) => 2 - i * 0.5)!; // the floor rises with i
    const pos = g.getAttribute('position'), d = g.getAttribute('aDepth');
    for (let v = 0; v < d.count; v++) expect(d.getX(v)).toBeCloseTo(2 - (pos.getX(v) / 2) * 0.5, 6);
  });

  it('waterDepthMm finds the floor between the open and the solid row by the iso crossing, and a dry column is -1', () => {
    // rows 0..9: solid under row 4 (bytes 0), open from row 5 (255); the byte ramps through the iso between rows 4 and 5 at 127.5 -> a crossing half way
    const col = (j: number) => (j <= 3 ? 0 : j === 4 ? 100 : 255);
    // the surface at level 8 mm over cell 2 mm: top row 4; row 4 is closed (100 < 127.5): dry
    expect(waterDepthMm(col, 4, 8, 2)).toBe(-1);
    // top row 7 (14 mm): the first row under the iso is row 4 (100), the open row above it row 5 (255): crossing at 4 + (127.5 - 100) / 155 = 4.177 rows
    expect(waterDepthMm(col, 7, 15, 2)).toBeCloseTo(15 - 2 * (4 + 27.5 / 155), 6);
    // no floor within the rows scanned: that deep
    expect(waterDepthMm(() => 255, 7, 15, 2, 10)).toBe(20);
  });

  it('openness at the level is the linear mix of the two sample rows', () => {
    expect(opennessAt(255, 0, 0.5)).toBeCloseTo(0.5, 6);
    expect(opennessAt(0, 255, 0)).toBe(0);
    expect(opennessAt(255, 255, 0.3)).toBe(1);
  });
});

describe('flood water shader patch', () => {
  it('replaces every chunk it hooks and keeps three\'s opaque_fragment', () => {
    const frag = '#include <common>\n#include <map_fragment>\n#include <normal_fragment_maps>\n#include <opaque_fragment>';
    const out = floodWaterFragment(frag);
    expect(out).toContain('vShore');
    expect(out).toContain('discard');
    expect(out).toContain('uFloodTime');
    expect(out.match(/#include <opaque_fragment>/g)!.length).toBe(1);
    expect(out).not.toContain('#include <map_fragment>');
  });
});
