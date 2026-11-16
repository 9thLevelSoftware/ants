// The snap layer keeps drawn props on the ground after the world changes under or with them (look-pass 2).
import { describe, expect, it } from 'vitest';
import type { Primitive } from '@/sim/types';
import { SnapLayer } from './snapLayer';

const BU = 4;
const IDENT = { x: 0, y: 0, z: 0, w: 1 };
const post = (id: number, x: number, y: number): Primitive => ({
  id, pos: { x, y, z: 50 }, rot: IDENT, size: { x: 2, y: 6, z: 2 }, round: 0, material: 'wood', flags: 0, objectId: id, shape: 'box',
});
const bottom = (p: Primitive) => p.pos.y - p.size.y;

describe('SnapLayer', () => {
  it('snaps a moved copy to the ground it now stands on, and leaves the moved input alone', () => {
    const layer = new SnapLayer();
    layer.setWorld([post(1, 10, 6)], () => 0, BU);
    const moved = new Map([[1, post(1, 90, 10)]]); // dropped 4 mm above flat ground
    const out = layer.merge(moved, () => 0, new Map());
    expect(bottom(out.get(1)!)).toBeLessThan(0);
    expect(out.get(1)!.pos.y + out.get(1)!.size.y).toBeCloseTo(16, 9); // top where it was
    expect(moved.get(1)!.pos.y).toBe(10);
  });

  it('re-snaps a prop when the ground under it drops, and hands it back when the ground returns', () => {
    const layer = new SnapLayer();
    let ground = 0;
    const h = () => ground;
    const drawn = layer.setWorld([post(1, 10, 6.1)], h, BU); // standing on the ground (bottom 0.1 above: within the min gap)
    expect(drawn[0].size.y).toBe(6);
    ground = -3; // erosion takes 3 mm of soil away
    layer.heightsChanged(h);
    expect(layer.dirty).toBe(true);
    const out = layer.merge(new Map(), h, new Map());
    expect(bottom(out.get(1)!)).toBeLessThan(-3);
    ground = 0;
    layer.heightsChanged(h);
    expect(layer.merge(new Map(), h, new Map()).has(1)).toBe(false);
  });

  it('does nothing for an unchanged world', () => {
    const layer = new SnapLayer();
    layer.setWorld([post(1, 10, 6.1), post(2, 30, 9)], () => 0, BU);
    layer.heightsChanged(() => 0);
    expect(layer.dirty).toBe(false);
  });
});
