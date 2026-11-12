// The nest's artificial-light gain is applied every frame without re-parsing hex strings (int-1A review finding 4),
// and the opening sort reuses its comparator.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Color } from 'three';
import { createNestUniforms } from '../materials/nestUniforms';
import { NEST_LIGHT } from '../params';
import { NestLighting } from './nestLighting';

describe('NestLighting', () => {
  afterEach(() => vi.restoreAllMocks());

  it('setArtificialGain scales the warm ambient and the sense light without parsing colour strings', () => {
    const u = createNestUniforms();
    const l = new NestLighting(u);
    l.setBodyUnit(4);
    const amb0 = new Color(NEST_LIGHT.ambientHex).multiplyScalar(NEST_LIGHT.ambientLevel);
    const lan0 = new Color(NEST_LIGHT.lanternHex).multiplyScalar(NEST_LIGHT.lanternLevel);
    const parse = vi.spyOn(Color.prototype, 'setStyle');
    for (let i = 0; i < 100; i++) l.setArtificialGain(i < 50 ? 0.25 : 0.25 + i * 1e-3);
    expect(parse).not.toHaveBeenCalled();
    l.setArtificialGain(0.5);
    expect(u.uAmb.value.r).toBeCloseTo(amb0.r * 0.5, 9);
    expect(u.uLanternCol.value.g).toBeCloseTo(lan0.g * 0.5, 9);
    l.setArtificialGain(Number.NaN); // non-finite: full gain
    expect(u.uAmb.value.r).toBeCloseTo(amb0.r, 9);
    l.setArtificialGain(0.5);
    l.setBodyUnit(4); // a new body unit keeps the current gain
    expect(u.uLanternCol.value.g).toBeCloseTo(lan0.g * 0.5, 9);
  });

  it('feeds the nearest openings to the camera first', () => {
    const u = createNestUniforms();
    const l = new NestLighting(u);
    const pts = [[100, 0, 0], [5, 0, 0], [50, 0, 0], [1, 0, 0]];
    l.refreshOpenings({ openings: (out: { x: number; y: number; z: number; r: number }[]) => {
      pts.forEach((p, i) => { out[i] = { x: p[0], y: p[1], z: p[2], r: 1 }; });
      return pts.length;
    } } as never);
    l.update({} as never, { x: 0, y: 0, z: 0 }, null);
    const xs = u.uSky.value.slice(0, Math.min(pts.length, NEST_LIGHT.maxOpenings)).map((v) => v.x);
    expect(xs).toEqual([1, 5, 50, 100].slice(0, xs.length));
  });
});
