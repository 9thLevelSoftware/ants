// Founding round 3 addendum: "Warmth shows 0 of 5 dots beside the word 'Mild'. Dots and word must come from the same
// value." The dots are the factor value (the suitability map's fWarm); the row's word now follows that value.
import { describe, expect, it } from 'vitest';
import { makeTestSim } from '@/sim/testing';
import { SITE_FACTORS } from '@/sim/types';
import { openingOf, queenOf } from '@/sim/colony/founding/access';
import { foundingView } from '@/sim/colony/founding';
import { siteDots } from '@/ui/screens/founding/store';
import { buildFoundingUi, siteRowWord } from './flowView';

const FLAGS = { skipping: false, outcomeOpen: false, handoverOpen: false, failureDismissed: false, reducedMotion: false };
const ORDER = ['Cold', 'Cool', 'Mild', 'Warm', 'Hot'];

describe('site read-out: warmth dots and word', () => {
  it('the warmth word rises with the dots drawn, never against them', () => {
    let last = -1;
    for (let v = 0; v <= 1.0001; v += 0.01) {
      const i = ORDER.indexOf(siteRowWord('warmth', v, 'Mild'));
      expect(i).toBe(Math.max(0, siteDots(v) - 1));
      expect(i).toBeGreaterThanOrEqual(last);
      last = i;
    }
    expect(siteRowWord('warmth', 0, 'Mild')).toBe('Cold');
    expect(siteRowWord('warmth', 1, 'Cold')).toBe('Hot');
    expect(siteRowWord('warmth', NaN, 'Mild')).toBe('Cold');
  });

  it('other factors keep the word the founding view gives them', () => {
    expect(siteRowWord('moisture', 0.1, 'Waterlogged')).toBe('Waterlogged');
    expect(siteRowWord('diggability', 0.9, 'Loose')).toBe('Loose');
  });

  it('a shaded site in the comfortable band no longer reads "Mild" beside 0 dots (the reported frame)', () => {
    const sim = makeTestSim();
    const op = openingOf(sim);
    const q = queenOf(sim);
    if (!op || !q) throw new Error('test sim has no opening');
    op.phase = 'search';
    op.siteFactors = SITE_FACTORS.map((id) => (id === 'warmth' ? 0.05 : 0.8));
    op.siteQ = 0.5; op.siteWord = 'fair';
    q.bb['fd.siteTempC'] = 23; // inside Lasius' 20-26 C band: the founding view words this "Mild"
    expect(foundingView(sim)?.site?.factors.find((f) => f.id === 'warmth')?.word).toBe('Mild'); // the disagreement
    const ui = buildFoundingUi(sim, FLAGS);
    const row = ui?.site?.rows.find((r) => r.id === 'warmth');
    expect(row).toBeDefined();
    expect(siteDots(row!.value)).toBe(0);
    expect(row!.word).toBe('Cold');
  });
});
