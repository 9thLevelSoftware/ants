// The quiet-time observer (tools/sim/quietRun.ts) reports the stay of an alert that never clears: closed at the end
// of the run, and counted from the start of the run for one already standing then.

import { describe, expect, it } from 'vitest';
import { raiseAlert } from '@/sim/progression/alerts';
import { TICKS_PER_SECOND } from '@/sim/time';
import { QuietObserver } from '../../../../tools/sim/quietRun';
import { humanSim, patioWorld } from './testkit';

const card = { level: 'warning' as const, title: 't', cause: 'c', focus: null, diagnosticId: null };

describe('quietRun longest stay', () => {
  it('an alert raised in the run and never cleared reports its stay at the end', () => {
    const sim = humanSim(patioWorld({ surface: 'concrete', sizeMm: 3000 }));
    const obs = new QuietObserver(sim);
    raiseAlert(sim, { ...card, kind: 'food-c-low', subjectId: 1 });
    for (let i = 0; i < 10 * TICKS_PER_SECOND; i++) { sim.tick(); obs.tick(); }
    expect(obs.kinds['food-c-low'].longestS).toBe(0);
    obs.finish();
    expect(obs.kinds['food-c-low'].longestS).toBeCloseTo(10, 0);
  });

  it('an alert already standing at the start counts from the start of the run', () => {
    const sim = humanSim(patioWorld({ surface: 'concrete', sizeMm: 3000 }));
    raiseAlert(sim, { ...card, kind: 'food-c-low', subjectId: 1 });
    const obs = new QuietObserver(sim);
    for (let i = 0; i < 4 * TICKS_PER_SECOND; i++) { sim.tick(); obs.tick(); }
    obs.finish();
    expect(obs.kinds['food-c-low'].longestS).toBeCloseTo(4, 0);
  });
});
