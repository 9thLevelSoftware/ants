import { describe, expect, it } from 'vitest';
import { buildAntVariant } from './buildAnt';
import { PART } from './rig';
import { SPECIES_MORPHS, resolveMorph, type MorphCaste } from '../morph/catalog';

function partVerts(g: ReturnType<typeof buildAntVariant>['lods'][number], part: number) {
  const r = g.getAttribute('aRig'); let n = 0;
  for (let i = 0; i < r.count; i++) if (Math.round(r.getX(i)) === part) n++;
  return n;
}

describe('buildAntVariant', () => {
  for (const [species, s] of Object.entries(SPECIES_MORPHS)) {
    for (const caste of Object.keys(s.castes) as MorphCaste[]) {
      it(`${species} ${caste}: exact length, finite, six legs, LOD budget`, () => {
        const m = resolveMorph(species, caste, null);
        const v = buildAntVariant(m);
        const pos = v.lods[0]!.getAttribute('position');
        for (let i = 0; i < pos.array.length; i++) expect(Number.isFinite(pos.array[i]!)).toBe(true);
        // legs: indices 0..5 present at LOD0
        const r = v.lods[0]!.getAttribute('aRig'); const legs = new Set<number>();
        for (let i = 0; i < r.count; i++) if (Math.round(r.getX(i)) === PART.LEG) legs.add(Math.round(r.getY(i)));
        expect([...legs].sort()).toEqual([0, 1, 2, 3, 4, 5]);
        // three body regions + antennae + mandibles at LOD0
        for (const p of [PART.HEAD, PART.BODY, PART.GASTER, PART.SCAPE, PART.FUNICULUS, PART.MANDIBLE, PART.PETIOLE]) expect(partVerts(v.lods[0]!, p)).toBeGreaterThan(0);
        // LOD ladder: decreasing triangle counts, LOD0 under ~7k, LOD3 under 150
        for (let l = 1; l < 4; l++) expect(v.tris[l]!).toBeLessThan(v.tris[l - 1]!);
        expect(v.tris[0]!).toBeLessThan(7000);
        expect(v.tris[3]!).toBeLessThan(150);
        expect(!!v.wings).toBe(m.wings === 'full');
        // the rig stride is positive and proportional to the body
        expect(Math.abs(v.rig.gait[0] / m.bodyLength / m.gait.stride - 1)).toBeLessThan(0.25);
        // grip is in front of the head, gaster tip behind the waist
        expect(v.rig.grip[2]).toBeGreaterThan(v.rig.neck[2]);
        expect(v.rig.grip[2] - v.rig.gasterTip[2]).toBeCloseTo(m.bodyLength, 1);
      });
    }
  }

  it('formicines get one scale, myrmicines two nodes (petiole vertex count differs)', () => {
    const las = buildAntVariant(resolveMorph('lasius-niger', 'worker', null));
    const mes = buildAntVariant(resolveMorph('messor-barbarus', 'media', null));
    expect(las.morph.petiole.nodes).toBe(1);
    expect(mes.morph.petiole.nodes).toBe(2);
    expect(partVerts(mes.lods[0]!, PART.PETIOLE)).toBeGreaterThan(partVerts(las.lods[0]!, PART.PETIOLE));
  });

  it('applies the species appearance block', () => {
    const m = resolveMorph('lasius-niger', 'worker', { bodyColour: '#112233', waistNodes: 1, spines: 0, headWidthRatio: { worker: 0.25 } });
    expect(m.colors.head).toBe('#112233');
    expect(m.head.width).toBe(0.25);
  });
});
