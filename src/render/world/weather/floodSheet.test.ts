// The flood sheet's outline fades (gate-close-app: a few flooded cells read as a pale cut-out cross in the founding
// chamber): a corner shared by four cells is opaque, a corner on the outline takes FLOOD_WATER_EDGE_ALPHA.
import { describe, expect, it } from 'vitest';
import { sheetGeometry } from './floodWater';
import { FLOOD_WATER_EDGE_ALPHA } from './tuning';

describe('flood sheet edge', () => {
  it('a 3x3 block: only the centre cell corners shared by four cells are opaque', () => {
    const cells: number[] = [];
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) cells.push(i * 2, j * 2);
    const g = sheetGeometry(cells, 2, 0);
    const a = g.getAttribute('color');
    const p = g.getAttribute('position');
    let inner = 0, edge = 0;
    for (let v = 0; v < a.count; v++) {
      const onOutline = Math.abs(p.getX(v)) > 2.5 || Math.abs(p.getZ(v)) > 2.5;
      expect(a.getW(v)).toBeCloseTo(onOutline ? FLOOD_WATER_EDGE_ALPHA : 1, 6);
      if (onOutline) edge++; else inner++;
    }
    expect(inner).toBeGreaterThan(0);
    expect(edge).toBeGreaterThan(0);
  });
  it('a single cell is all outline (faint)', () => {
    const a = sheetGeometry([0, 0], 2, 0).getAttribute('color');
    for (let v = 0; v < a.count; v++) expect(a.getW(v)).toBeCloseTo(FLOOD_WATER_EDGE_ALPHA, 6);
  });
});
