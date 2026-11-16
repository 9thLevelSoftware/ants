// One rule for the warmth dots and word (int-1B-app finding 4; viab-founding work item 3): the dots draw the factor
// value (the suitability map's fWarm, the sun the ground gets) and the word is chosen from the same dots by the
// simulation's factorWord, sun words Shaded / Mild / Warm / Sun-baked. The cell temperature never words it.
import { describe, expect, it } from 'vitest';
import { makeTestSim } from '@/sim/testing';
import { SITE_FACTORS } from '@/sim/types';
import { openingOf, queenOf } from '@/sim/colony/founding/access';
import { factorDots, factorWord } from '@/sim/colony/founding';
import { siteDots } from '@/ui/screens/founding/store';
import { buildFoundingUi } from './flowView';

const FLAGS = { skipping: false, outcomeOpen: false, handoverOpen: false, failureDismissed: false, reducedMotion: false };
const ORDER = ['Shaded', 'Mild', 'Warm', 'Sun-baked'];

describe('site read-out: warmth dots and word', () => {
  it('the screen draws the dots the simulation words: one rounding', () => {
    for (let v = -0.1; v <= 1.1001; v += 0.005) expect(siteDots(v)).toBe(factorDots(v));
    expect(siteDots(NaN)).toBe(factorDots(NaN));
  });

  it('the warmth word rises with the dots drawn, never against them', () => {
    let last = -1;
    for (let v = 0; v <= 1.0001; v += 0.01) {
      const i = ORDER.indexOf(factorWord('warmth', v));
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeGreaterThanOrEqual(last);
      last = i;
    }
    expect(factorWord('warmth', 0)).toBe('Shaded');
    expect(factorWord('warmth', 1)).toBe('Sun-baked');
  });

  it('a shaded site at a comfortable cell temperature reads "Shaded" beside 0 dots (the reported frame)', () => {
    const sim = makeTestSim();
    const op = openingOf(sim);
    const q = queenOf(sim);
    if (!op || !q) throw new Error('test sim has no opening');
    op.phase = 'search';
    op.siteFactors = SITE_FACTORS.map((id) => (id === 'warmth' ? 0.05 : 0.8));
    op.siteQ = 0.5; op.siteWord = 'fair';
    q.bb['fd.siteTempC'] = 23; // inside Lasius' 20-26 C band: worded "Mild" before this round
    const ui = buildFoundingUi(sim, FLAGS);
    const row = ui?.site?.rows.find((r) => r.id === 'warmth');
    expect(row).toBeDefined();
    expect(siteDots(row!.value)).toBe(0);
    expect(row!.word).toBe('Shaded');
  });
});
