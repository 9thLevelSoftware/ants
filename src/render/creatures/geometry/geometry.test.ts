// Every look builds at all three details: finite, indexed, smaller at lower detail, about its catalogue size, and the
// comfort substitutes keep no spider parts (GDD 08 §12: abstract = legless smooth ovoid).
import { describe, expect, it } from 'vitest';
import { LOOKS } from '../looks';
import { PART, type Detail } from './builder';
import { birdHeadGeometry, pitGeometry } from './props';

const DETAILS: Detail[] = [0, 1, 2];

function partsOf(rig: ArrayLike<number>): Set<number> {
  const s = new Set<number>();
  for (let i = 0; i < rig.length; i += 4) s.add(Math.round(rig[i]!));
  return s;
}

describe('creature geometry', () => {
  const table: Record<string, number[]> = {};
  for (const [key, def] of Object.entries(LOOKS)) {
    it(`${key}: builds at every detail, finite, sized like the animal`, () => {
      const tris: number[] = [];
      for (const d of DETAILS) {
        const b = def.build(d);
        const g = b.body.toCreatureGeometry();
        const pos = g.getAttribute('position').array as Float32Array;
        expect(pos.length).toBeGreaterThan(0);
        for (const v of pos) expect(Number.isFinite(v)).toBe(true);
        expect(g.getAttribute('aPivot').count).toBe(g.getAttribute('position').count);
        expect(g.getAttribute('aRig').count).toBe(g.getAttribute('position').count);
        expect(g.getAttribute('aFoot').count).toBe(g.getAttribute('position').count);
        tris.push(b.body.triangles + (b.wings?.triangles ?? 0));
        if (d === 0) {
          // body extent along Z (legs, jaws, antennae may stick out) within a factor of the catalogue length
          let zmin = Infinity, zmax = -Infinity;
          for (let i = 2; i < pos.length; i += 3) { zmin = Math.min(zmin, pos[i]!); zmax = Math.max(zmax, pos[i]!); }
          const len = zmax - zmin;
          expect(len).toBeGreaterThan(def.sizeMm * 0.6);
          expect(len).toBeLessThan(def.sizeMm * 2.6);
        }
      }
      expect(tris[0]!).toBeGreaterThanOrEqual(tris[1]!);
      expect(tris[1]!).toBeGreaterThanOrEqual(tris[2]!);
      table[key] = tris;
    });
  }

  it('spiders have eight legs; the abstract substitute has no legs, jaws or feelers', () => {
    for (const k of ['jumping-spider', 'wolf-spider', 'ant-spider']) {
      const g = LOOKS[k]!.build(0).body.toCreatureGeometry();
      const rig = g.getAttribute('aRig').array as Float32Array, piv = g.getAttribute('aPivot').array as Float32Array;
      const hips = new Set<string>();
      for (let i = 0; i < rig.length; i += 4) if (Math.round(rig[i]!) === PART.LEG) hips.add(`${piv[i]!.toFixed(3)},${piv[i + 2]!.toFixed(3)}`);
      expect(hips.size, k).toBe(8);
      const a = LOOKS[`${k}-abstract`]!.build(0).body.toCreatureGeometry();
      const parts = partsOf(a.getAttribute('aRig').array as Float32Array);
      expect([...parts]).toEqual([PART.BODY]);
    }
  });

  it('softened spiders keep their legs but lose hairs and eye domes (fewer triangles)', () => {
    for (const k of ['jumping-spider', 'wolf-spider']) {
      expect(LOOKS[`${k}-softened`]!.build(0).body.triangles).toBeLessThan(LOOKS[k]!.build(0).body.triangles);
      expect(LOOKS[`${k}-softened`]!.legAmp).toBe(0.5);
    }
  });

  it('pit and bird props build', () => {
    expect(pitGeometry().getAttribute('position').count).toBeGreaterThan(100);
    for (const v of ['thrush', 'sparrow', 'woodpecker'] as const) {
      const { geometry, beakLen } = birdHeadGeometry(v);
      geometry.computeBoundingBox();
      // the beak tip is at -beakLen
      expect(geometry.boundingBox!.min.y).toBeCloseTo(-beakLen, 0);
    }
  });

  it('prints the triangle table (report)', () => {
    const rows = Object.entries(table).map(([k, t]) => `${k}: ${t.join(' / ')}`);
    expect(rows.length).toBe(Object.keys(LOOKS).length);
    if ((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.FOUNDRESS_PRINT) console.log(rows.join('\n'));
  });
});
