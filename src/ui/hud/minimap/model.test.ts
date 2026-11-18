import { describe, expect, it } from 'vitest';
import type { MinimapPlate } from '@/game/uiBridge/minimap';
import { fromBox, paintPlate, tintOfZone, toBox, VOID_TINT, ZONE_TINTS } from './model';

const frame = { cx: 100, cz: 100, windowMm: 200 };

describe('minimap geometry', () => {
  it('the centre maps to the middle of the box; north (smaller z) is up', () => {
    expect(toBox(frame, 100, 100)).toEqual({ u: 0.5, v: 0.5 });
    expect(toBox(frame, 100, 0).v).toBeCloseTo(0);
    expect(toBox(frame, 200, 100).u).toBeCloseTo(1);
  });
  it('fromBox is the inverse of toBox', () => {
    const b = toBox(frame, 123, 77);
    const w = fromBox(frame, b.u, b.v);
    expect(w.x).toBeCloseTo(123);
    expect(w.z).toBeCloseTo(77);
  });
});

describe('zone plate', () => {
  // a 2 x 2 world of 100 mm cells: forest | lawn / pavement | outside is the void
  const plate: MinimapPlate = { map: { cell: 100, nx: 2, nz: 2, data: Uint8Array.from([1, 2, 3, 1]) }, typeById: ['', 'forest', 'lawn', 'pavement'], size: 200 };
  const at = (px: Uint8ClampedArray, size: number, x: number, y: number) => Array.from(px.slice((y * size + x) * 4, (y * size + x) * 4 + 3));

  it('paints each zone its flat tint and the area outside the world the void colour', () => {
    const size = 8;
    // window = the whole world: centre (100, 100), 200 mm
    const px = paintPlate(new Uint8ClampedArray(size * size * 4), size, plate, { cx: 100, cz: 100, windowMm: 200 });
    expect(at(px, size, 1, 1)).toEqual([...ZONE_TINTS.forest]);
    expect(at(px, size, 6, 1)).toEqual([...ZONE_TINTS.lawn]);
    expect(at(px, size, 1, 6)).toEqual([...ZONE_TINTS.pavement]);
    // window shifted left: the left half is outside the world
    const sh = paintPlate(new Uint8ClampedArray(size * size * 4), size, plate, { cx: 0, cz: 100, windowMm: 200 });
    expect(at(sh, size, 1, 3)).toEqual([...VOID_TINT]);
    expect(at(sh, size, 6, 1)).toEqual([...ZONE_TINTS.forest]);
  });
  it('every zone type has a tint and they are all different', () => {
    const seen = new Set(Object.values(ZONE_TINTS).map((t) => t.join(',')));
    expect(seen.size).toBe(Object.keys(ZONE_TINTS).length);
    expect(tintOfZone('nonsense')).toBeDefined();
  });
});
