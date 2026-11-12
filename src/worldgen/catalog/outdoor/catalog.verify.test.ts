// Reviewer tests (worldgen-outdoor): catalogue builders under adversarial inputs. The fence test reproduces the
// cause of the missing fence sections: a section's panel and gravel board stop at its own post's half width, so the
// next section's post (a fresh random 75-100 mm square) overlaps them whenever it is the larger one, and the
// placer's collision test then rejects that whole next section (post + panel).
import { describe, expect, it } from 'vitest';
import { rngFork } from '@/core/rng';
import { BEDS, fenceSection, kerbUnit, OUTDOOR_CATALOG } from './index';
import { clampGap } from '../../place/outdoor/paving';
import type { Env } from './types';

const LASIUS: Env = { bu: 4, foot: 0.6, woodNester: false };
const CAMPO: Env = { bu: 9, foot: 1.35, woodNester: true };

/** +X extent of a section's panel and boards, and -X face of its post (both relative to the section origin). */
function extents(seed: number): { post: number; panelEnd: number } {
  const b = fenceSection(rngFork(seed, 'fence'), LASIUS, { panel: true, gap: false, route: false });
  const post = b.tpl.prims[0].size.x; // half width of the post at x = 0
  let panelEnd = -Infinity;
  for (const p of b.tpl.prims.slice(1)) panelEnd = Math.max(panelEnd, p.pos.x + p.size.x);
  return { post, panelEnd };
}

describe('fence sections in a line', () => {
  it("a section's panel and gravel board never reach into the next section's post (any pair of post sizes)", () => {
    const bad: string[] = [];
    for (let s = 0; s < 20; s++) {
      const a = extents(s), b = extents(s + 1);
      // the next section's post sits at x = panelW with half width b.post
      const nextPostFace = BEDS.fence.panelW - b.post;
      if (a.panelEnd > nextPostFace + 1) bad.push(`seeds ${s}->${s + 1}: panel ends ${(a.panelEnd - nextPostFace).toFixed(1)} mm inside the next post`);
    }
    expect(bad).toEqual([]);
  });
});

describe('gap clamping (GDD 04 §6.1)', () => {
  it('clamps up to 0.6 BU inside the real range, and returns the real maximum (closed) when the range is too small', () => {
    for (let i = 0; i < 50; i++) {
      const r = rngFork(i, 'gap');
      const g = clampGap(r, 3, 8, 4);
      expect(g).toBeGreaterThanOrEqual(3);
      expect(g).toBeLessThanOrEqual(8);
      expect(g).toBeGreaterThanOrEqual(2.4);
      const c = clampGap(rngFork(i, 'gapc'), 3, 5, 9); // block-paver grit joints for Camponotus
      expect(c).toBe(5);
      expect(c / 9).toBeLessThan(0.6);
    }
  });
});

describe('kerb unit (GDD 04 §5.5, §6.2 kerb-gap)', () => {
  it('a kerb-gap unit leaves at least 0.6 BU under the kerb at the gutter and its tunnel is >= 1 BU wide, for Lasius and Camponotus', () => {
    for (const env of [LASIUS, CAMPO]) for (let i = 0; i < 30; i++) {
      const b = kerbUnit(rngFork(i, 'kerb'), env, { len: 915, upstand: 120, gap: true, paved: i % 2 === 0, pavedDepth: 46 });
      const m = b.micro![0];
      expect(m.gapMm / env.bu).toBeGreaterThanOrEqual(0.6);
      expect(m.clearMm / env.bu).toBeGreaterThanOrEqual(0.6);
      const tube = b.cavities![0].carves[0];
      expect((2 * tube.r) / env.bu).toBeGreaterThanOrEqual(1 - 1e-9);
      // the unit's underside is the gap's ceiling
      const k = b.tpl.prims[0];
      expect(k.pos.y - k.size.y).toBeCloseTo(-120 + m.gapMm, 6);
    }
  });
});

describe('catalogue builders with a sloping ground sampler', () => {
  it('every builder stays finite with a steep ground function (20 % grade in both axes)', () => {
    const steep: Env = { ...LASIUS, ground: (x, z) => 0.2 * x - 0.2 * z };
    for (const [id, make] of Object.entries(OUTDOOR_CATALOG)) {
      for (let i = 0; i < 5; i++) {
        const b = make(rngFork(i, `steep/${id}`), steep);
        for (const p of b.tpl.prims) expect(Number.isFinite(p.pos.x + p.pos.y + p.pos.z + p.size.x + p.size.y + p.size.z), id).toBe(true);
        for (const r of b.tpl.routes ?? []) for (const q of r.points) expect(Number.isFinite(q.x + q.y + q.z), id).toBe(true);
      }
    }
  });
});
