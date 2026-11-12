import { describe, expect, it } from 'vitest';
import type { Mound, Primitive } from '@/sim/types';
import { primSignature } from '../primitives/primInstances';
import { HASH_SEED, hashNum, hashStr } from './signature';
import { moundSignature, objectMovesSignature } from './simAdapter';

const prim = (): Primitive => ({
  id: 1, shape: 'box', pos: { x: 1, y: 2, z: 3 }, rot: { x: 0, y: 0, z: 0, w: 1 }, size: { x: 4, y: 5, z: 6 }, round: 0.5,
  material: 'stone', flags: 0,
} as unknown as Primitive);

describe('allocation-free change signatures', () => {
  it('are numbers, stable for equal input and change with any drawn field', () => {
    const a = prim(), b = prim();
    expect(typeof primSignature(a)).toBe('number');
    expect(primSignature(a)).toBe(primSignature(b));
    const variants: ((p: Primitive) => void)[] = [
      (p) => { p.pos.x += 1e-9; }, (p) => { p.rot.w = 0.999; }, (p) => { p.size.z = 7; }, (p) => { p.round = 0.4; },
      (p) => { (p as { material: string }).material = 'wood'; }, (p) => { p.flags = 2; }, (p) => { (p as { tint?: number }).tint = 3; },
    ];
    for (const change of variants) { const c = prim(); change(c); expect(primSignature(c)).not.toBe(primSignature(a)); }
  });

  it('mound and object-move signatures follow their fields', () => {
    const m = { n: 8, cell: 2, volume: 10, absorbed: 0, lastBatchTick: 5, centerX: 1, centerZ: 2 } as unknown as Mound;
    const s0 = moundSignature(m);
    expect(moundSignature({ ...m })).toBe(s0);
    expect(moundSignature({ ...m, volume: 11 })).not.toBe(s0);
    expect(objectMovesSignature([])).not.toBe(objectMovesSignature([{ objectId: 1, pos: { x: 0, y: 0, z: 0 } } as never]));
    expect(hashStr(HASH_SEED, 'ab')).not.toBe(hashStr(HASH_SEED, 'ba'));
    expect(hashNum(HASH_SEED, 0)).not.toBe(hashNum(HASH_SEED, -0));
  });
});
