// Ground snapping of the drawn primitives (look-pass 2): gaps under upright boxes, posts and stems are closed, the
// rest is left alone, and the input is never modified.
import { describe, expect, it } from 'vitest';
import type { Primitive } from '@/sim/types';
import { SNAP_MAX_GAP_BU, SNAP_MIN_GAP_MM, SNAP_SKIRT_MM, snapPrimitivesToGround, type SnapStats } from './groundSnap';

const BU = 4;
const IDENT = { x: 0, y: 0, z: 0, w: 1 };
function prim(over: Partial<Primitive> & { shape: Primitive['shape'] }): Primitive {
  return { id: 1, pos: { x: 100, y: 10, z: 100 }, rot: IDENT, size: { x: 5, y: 5, z: 5 }, round: 0, material: 'stone', flags: 0, objectId: -1, ...over };
}
const flat = (h: number) => () => h;
const stats = (): SnapStats => ({ considered: 0, snapped: 0, maxGapMm: 0 });

describe('snapPrimitivesToGround', () => {
  it('stretches a floating box down to the ground and keeps its top where it was', () => {
    const p = prim({ shape: 'box', pos: { x: 100, y: 12, z: 100 }, size: { x: 20, y: 3, z: 8 } }); // bottom 9, ground 5
    const st = stats();
    const [q] = snapPrimitivesToGround([p], flat(5), BU, st);
    expect(st.snapped).toBe(1);
    expect(q.pos.y + q.size.y).toBeCloseTo(p.pos.y + p.size.y, 9); // top
    expect(q.pos.y - q.size.y).toBeCloseTo(5 - SNAP_SKIRT_MM, 9); // bottom: below the ground
    expect(q.size.x).toBe(20);
    expect(p.pos.y).toBe(12); // input untouched
    expect(q.id).toBe(p.id);
  });

  it('uses the LOWEST ground under the footprint (a brick on a slope)', () => {
    const p = prim({ shape: 'box', pos: { x: 100, y: 9, z: 100 }, size: { x: 20, y: 3, z: 8 } }); // bottom 6
    const slope = (x: number) => 6 - (x - 100) * 0.1; // 4 at x = 120, 8 at x = 80
    const [q] = snapPrimitivesToGround([p], slope, BU);
    expect(q.pos.y - q.size.y).toBeCloseTo(4 - SNAP_SKIRT_MM, 6);
  });

  it('extends a capsule stem and a cylinder post along their own axis', () => {
    const stem = prim({ id: 2, shape: 'capsule', pos: { x: 50, y: 30, z: 50 }, size: { x: 1, y: 20, z: 1 } }); // bottom 9
    const post = prim({ id: 3, shape: 'cylinder', pos: { x: 60, y: 30, z: 60 }, size: { x: 2, y: 20, z: 2 } }); // bottom 10
    const [a, b] = snapPrimitivesToGround([stem, post], flat(7), BU);
    expect(a.pos.y - (a.size.y + a.size.x)).toBeCloseTo(7 - SNAP_SKIRT_MM, 6);
    expect(b.pos.y - b.size.y).toBeCloseTo(7 - SNAP_SKIRT_MM, 6);
  });

  it('leaves things alone that rest on the ground, stand far above it, are tilted, are ellipsoids or flat plates', () => {
    const onGround = prim({ id: 1, shape: 'box', pos: { x: 100, y: 8, z: 100 }, size: { x: 5, y: 3, z: 5 } }); // bottom 5 = ground
    const tableTop = prim({ id: 2, shape: 'box', pos: { x: 200, y: 200, z: 100 }, size: { x: 50, y: 2, z: 50 } });
    const s = Math.sin(Math.PI / 8), c = Math.cos(Math.PI / 8); // 45 degrees about x
    const tilted = prim({ id: 3, shape: 'capsule', pos: { x: 100, y: 20, z: 100 }, rot: { x: s, y: 0, z: 0, w: c }, size: { x: 1, y: 10, z: 1 } });
    const leaf = prim({ id: 5, shape: 'box', pos: { x: 100, y: 12, z: 100 }, size: { x: 20, y: 0.3, z: 8 } }); // a plate 7 mm above the ground
    const rock = prim({ id: 4, shape: 'ellipsoid', pos: { x: 100, y: 20, z: 100 }, size: { x: 4, y: 3, z: 4 } });
    const st = stats();
    const all = [onGround, tableTop, tilted, rock, leaf];
    const out = snapPrimitivesToGround(all, flat(5), BU, st);
    expect(out.every((q, i) => q === all[i])).toBe(true);
    expect(st.snapped).toBe(0);
  });

  it('closes gaps up to SNAP_MAX_GAP_BU body units and no more', () => {
    const at = (gap: number) => prim({ shape: 'box', pos: { x: 0, y: 5 + gap + 2, z: 0 }, size: { x: 4, y: 2, z: 4 } });
    const ok = snapPrimitivesToGround([at(SNAP_MAX_GAP_BU * BU - 0.01)], flat(5), BU)[0];
    const far = snapPrimitivesToGround([at(SNAP_MAX_GAP_BU * BU + 0.01)], flat(5), BU)[0];
    expect(ok.size.y).toBeGreaterThan(2);
    expect(far.size.y).toBe(2);
    const tiny = snapPrimitivesToGround([at(SNAP_MIN_GAP_MM / 2)], flat(5), BU)[0];
    expect(tiny.size.y).toBe(2);
  });
});
