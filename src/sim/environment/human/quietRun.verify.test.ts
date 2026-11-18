// Reviewer test for the quiet-time observer (tools/sim/quietRun.ts): the "windows failing" count it reports (and the
// report's §5 table quotes for Gentle and Harsh) must be taken against the run's own QUIET_SHARE_MIN
// (Gentle 0.75 / Naturalist 0.60 / Harsh 0.40, balance/difficulty `quietShareMin`), not a fixed 0.60.
// Synthetic hour records, no long run.

import { describe, expect, it } from 'vitest';
import { QuietObserver } from '../../../../tools/sim/quietRun';
import { humanSim, patioWorld } from './testkit';

/** 4 game days of counted daytime hours, one loud hour in every `every`: every full 3-gd window has share 1 - 1/every. */
function observerWithShare(preset: 'gentle' | 'harsh', every: number) {
  const sim = humanSim(patioWorld({ surface: 'concrete', sizeMm: 3000 }), preset);
  const obs = new QuietObserver(sim);
  for (let h = 0; h < 96; h++) {
    const code = h % every === 0 ? 0 : 1;
    obs.hourRecords.push({ h, code, by: code === 0 ? { threat: 0, alerts: { x: 1 } } : null, alertShare: code === 0 ? 1 : 0, outsideShare: 0 });
  }
  return obs.result(0);
}

describe('quietRun windows failing (review)', () => {
  it('gentle: windows at 0.67 fail the 0.75 target', () => {
    const r = observerWithShare('gentle', 3);
    expect(r.windows.n).toBeGreaterThan(0);
    expect(r.windows.min).toBeLessThan(0.75);
    expect(r.windows.failing).toBe(r.windows.n);
  });

  it('harsh: windows at 0.50 pass the 0.40 target', () => {
    const r = observerWithShare('harsh', 2);
    expect(r.windows.min).toBeGreaterThanOrEqual(0.4);
    expect(r.windows.failing).toBe(0);
  });
});
