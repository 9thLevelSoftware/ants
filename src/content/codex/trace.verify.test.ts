// Adversarial check of the fact trace (acceptance 2): the implementer's test only checks that a cited claim index
// exists. Here every number written as digits in a traced sentence must occur in at least one claim quoted for that
// sentence. Mismatches are listed so a reviewer can judge them (rounding, unit conversion, number words).
import { describe, expect, it } from 'vitest';
import { getCodexEntry } from './index';
import { PROVENANCE } from './provenance';
import { SAMPLE_25, SAMPLE_25_TRACE, splitSentences } from './sample25';

const NUM = /\d[\d,]*(?:\.\d+)?/g;
const canon = (n: string): string => n.replace(/,/g, '').replace(/^0+(?=\d)/, '');

describe('sample trace: numbers of a sentence occur in the claims it cites', () => {
  it('lists the sentences whose digits are not in any cited quote', () => {
    const misses: string[] = [];
    let checked = 0;
    for (const id of SAMPLE_25) {
      const parts = splitSentences(getCodexEntry(id)!.body);
      const claims = PROVENANCE[id].claims;
      SAMPLE_25_TRACE[id].forEach((t, i) => {
        if (typeof t === 'string') return;
        const nums = (parts[i].match(NUM) ?? []).map(canon);
        if (nums.length === 0) return;
        const quoted = t.map((k) => claims[k].q).join(' ').replace(/,/g, '');
        for (const n of nums) {
          checked++;
          if (!quoted.includes(n)) misses.push(`${id} s${i}: ${n} not in cited quotes :: ${parts[i].slice(0, 90)}`);
        }
      });
    }
    expect(checked).toBeGreaterThan(60);
    // Tolerance: conversions (m to cm, mm to in) and rounding are legitimate; more than a handful means weak tracing.
    console.log(`trace number check: ${checked} numbers, ${misses.length} not found verbatim\n${misses.join('\n')}`);
    expect(misses.length).toBeLessThanOrEqual(Math.ceil(checked * 0.15));
  });
});
