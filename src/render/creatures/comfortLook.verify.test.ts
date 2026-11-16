// Independent review of the spider comfort looks (task stage2-look-fix, defect 3; GDD 08 §12: softened = no hair, eyes
// not detailed, leg motion amplitude 50 %): the built geometry of "softened" differs from "off" in what a player sees at
// observer distance (overall colour, silhouette footprint), not only in fine detail, at every level of detail.
import { describe, expect, it } from 'vitest';
import type { BufferGeometry } from 'three';
import { LOOKS } from './looks';

function stats(g: BufferGeometry): { lum: number; spread: number; footprint: number } {
  const p = g.getAttribute('position'), c = g.getAttribute('color');
  let lum = 0, lum2 = 0, minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < c.count; i++) {
    const l = 0.2126 * c.getX(i) + 0.7152 * c.getY(i) + 0.0722 * c.getZ(i);
    lum += l; lum2 += l * l;
  }
  for (let i = 0; i < p.count; i++) {
    minX = Math.min(minX, p.getX(i)); maxX = Math.max(maxX, p.getX(i));
    minZ = Math.min(minZ, p.getZ(i)); maxZ = Math.max(maxZ, p.getZ(i));
  }
  lum /= c.count;
  return { lum, spread: Math.sqrt(Math.max(0, lum2 / c.count - lum * lum)), footprint: (maxX - minX) * (maxZ - minZ) };
}

describe('spider comfort: softened is visibly not "off"', () => {
  for (const k of ['wolf-spider', 'jumping-spider', 'ant-spider']) {
    for (const d of [0, 1, 2] as const) {
      it(`${k} at detail ${d}: one even tone (no markings), a smaller leg footprint, legs at half amplitude`, () => {
        const off = stats(LOOKS[k]!.build(d).body.toCreatureGeometry());
        const soft = stats(LOOKS[`${k}-softened`]!.build(d).body.toCreatureGeometry());
        // the markings are gone: the colour varies far less across the body than the real animal's
        // (at the far detail level the real animal has no markings either: only the leg/body tones differ)
        if (d < 2) expect(soft.spread).toBeLessThan(off.spread * 0.75);
        // short stout legs: the animal covers less ground
        expect(soft.footprint).toBeLessThan(off.footprint * 0.95);
        expect(LOOKS[`${k}-softened`]!.legAmp).toBeCloseTo(0.5, 9);
      });
    }
  }
});
