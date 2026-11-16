// The three spider comfort looks are clearly different from each other (task stage2-look-fix: at observer distance
// "softened" looked like "off"), and creature surfaces are not glossy plastic.
import { describe, expect, it } from 'vitest';
import { Color } from 'three';
import { JUMPING_SPIDER, WOLF_SPIDER, ANT_SPIDER, SOFTENED, softenLook } from './geometry/arachnids';
import { LOOKS } from './looks';
import { surfaceRoughness } from './shader/materials';
import { CREATURE_SURFACE } from './tuning';

const sat = (hex: string): number => { const c = new Color(hex); const hsl = { h: 0, s: 0, l: 0 }; c.getHSL(hsl); return hsl.s; };

describe('spider comfort looks', () => {
  for (const [name, look] of [['jumping', JUMPING_SPIDER], ['wolf', WOLF_SPIDER], ['ant-spider', ANT_SPIDER]] as const) {
    it(`${name}: softened is plumper, shorter-legged, muted, unmarked and hairless`, () => {
      const s = softenLook(look);
      expect(s.carapace[1]).toBeGreaterThan(look.carapace[1] * 1.2);
      expect(s.abdomen[2]).toBeGreaterThan(look.abdomen[2] * 1.4);
      expect(s.legR).toBeGreaterThan(look.legR * 1.5);
      for (let i = 0; i < 4; i++) expect(s.reach[i]!).toBeLessThan(look.reach[i]! * 0.85);
      expect(s.hairs).toBe(0);
      expect(s.pattern).toBe('plain');
      // one muted body colour: no markings, a warm grey
      expect(s.colors.abdomenMark).toBe(s.colors.abdomen);
      expect(s.colors.legBand).toBe(s.colors.legs);
      // a warm grey, not the animal's own colours
      expect(s.colors.carapace).not.toBe(look.colors.carapace);
      expect(sat(s.colors.carapace)).toBeLessThan(0.35);
      expect(SOFTENED.muted).toBeGreaterThan(0.5);
    });
  }

  it('the three looks have their own animation and geometry: off, softened (legs, calmer) and abstract (no legs)', () => {
    for (const k of ['wolf-spider', 'jumping-spider', 'ant-spider']) {
      const off = LOOKS[k]!, soft = LOOKS[`${k}-softened`]!, abs = LOOKS[`${k}-abstract`]!;
      expect(soft.legAmp).toBe(0.5);
      expect(soft.strideMm).toBeGreaterThan(off.strideMm * 1.3); // fewer leg cycles per distance: a slower leg animation
      expect(soft.roughness).toBeGreaterThan(off.roughness);
      expect(abs.ring).toBe(true);
      const o = off.build(0).body, s = soft.build(0).body, a = abs.build(0).body;
      expect(s.triangles).toBeLessThan(o.triangles); // no hairs, no eye domes
      expect(a.triangles).toBeLessThan(s.triangles); // a legless ovoid
    }
  });
});

describe('creature surface', () => {
  it('roughness is lifted off the glossy end for every look and never leaves 0..1', () => {
    expect(surfaceRoughness(0)).toBeCloseTo(CREATURE_SURFACE.roughnessFloor, 9);
    expect(surfaceRoughness(1)).toBe(1);
    for (const l of Object.values(LOOKS)) {
      const r = surfaceRoughness(l.roughness);
      expect(r).toBeGreaterThanOrEqual(CREATURE_SURFACE.roughnessFloor);
      expect(r).toBeLessThanOrEqual(1);
      expect(r).toBeGreaterThanOrEqual(l.roughness);
    }
  });
});
