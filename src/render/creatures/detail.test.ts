// Acceptance 4 (triangles): at the same projected size no creature costs more triangles than the reference ant
// (Lasius worker) under the ants' own LOD rule, above the ants' last LOD switch; herd members included.
import { describe, expect, it } from 'vitest';
import { getPreset, type QualityId } from '@/render/app/quality';
import { buildAntVariant } from '@/render/ants/geometry/buildAnt';
import { resolveMorph } from '@/render/ants/morph/catalog';
import { LOOKS } from './looks';
import { antTrisAt, detailFor } from './detail';
import { ANT_REFERENCE_TRIS, creatureLodFor } from './tuning';

const trisOf = (key: string, d: 0 | 1 | 2) => { const b = LOOKS[key]!.build(d); return b.body.triangles + (d < 2 ? (b.wings?.triangles ?? 0) : 0); };

describe('creature detail vs the ants\' per-instance triangles', () => {
  it('the reference ant triangle counts match the ant builder (Lasius worker)', () => {
    const v = buildAntVariant(resolveMorph('lasius-niger', 'worker', null));
    expect([...v.tris]).toEqual([...ANT_REFERENCE_TRIS]);
  });

  for (const q of ['test', 'high'] as QualityId[]) {
    it(`${q}: every look at every projected size costs no more than the ant at that size (above the ants' LOD3 switch)`, () => {
      const p = getPreset(q);
      const s = creatureLodFor(q, p.density.crowdLod, p.shadows.enabled);
      const bad: string[] = [];
      for (const key of Object.keys(LOOKS)) {
        const t = [trisOf(key, 0), trisOf(key, 1), trisOf(key, 2)];
        for (let px = s.antPx[2]; px < 800; px *= 1.07) {
          const d = detailFor(px, t[1]!, s, true);
          if (t[d]! > antTrisAt(px, s)) bad.push(`${key} at ${px.toFixed(0)} px: detail ${d} ${t[d]} tris > ant ${antTrisAt(px, s)}`);
        }
      }
      expect(bad).toEqual([]);
    });
  }
});
