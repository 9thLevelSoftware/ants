// Ruling R28 (Nov 18): what counts as a loud hour for the quiet share (GDD 05 §6 I11, GDD 08 §6.1). A warning is loud
// for ALERT_LOUD_S of sim time after it is raised or its level rises; a critical alert for as long as it stands.

import { describe, expect, it } from 'vitest';
import type { AlertRequest } from '@/sim/progression/alerts';
import { raiseAlert } from '@/sim/progression/alerts';
import type { Sim } from '@/sim/types';
import { restore, snapshot } from '@/sim/save/snapshot';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '@/sim/time';
import { quietTick, quietTracker } from './threat';
import { creatureScene, quietHistory, setClock } from './testkit';

function scene(): Sim {
  const sim = creatureScene({ seed: 3, sizeBu: 128 });
  setClock(sim, 'summer', 3, 6);
  quietHistory(sim, 0);
  return sim;
}

function req(level: 'warning' | 'critical'): AlertRequest {
  return {
    kind: 'food-c-low', level, subjectId: -1, title: 't', cause: 'c', focus: null, diagnosticId: 'diag.food-c',
  } as AlertRequest;
}

/** Runs the quiet sampler for `ticks` ticks (the alert list stays as it is unless `each` changes it). */
function run(sim: Sim, ticks: number, each?: (t: number) => void): void {
  for (let t = 0; t < ticks; t++) { each?.(t); quietTick(sim); sim.state.tick++; }
}

/** Loud hours among the counted daytime hours closed so far. */
function loudHours(sim: Sim): number {
  const q = quietTracker(sim);
  return q.counted - q.quiet;
}

describe('R28: a loud hour', () => {
  it('a warning standing for a game day (re-raised every minute) makes one loud hour, not every daytime hour', () => {
    const sim = scene();
    run(sim, 10); // the sampler's first hour starts
    expect(raiseAlert(sim, req('warning'))).toBeGreaterThan(0);
    run(sim, TICKS_PER_DAY, (t) => { if (t % 600 === 0) raiseAlert(sim, req('warning')); });
    expect(sim.state.progression.alerts.some((a) => a.level === 'warning' && a.count > 10)).toBe(true);
    expect(quietTracker(sim).counted).toBeGreaterThan(8);
    expect(loudHours(sim)).toBe(1);
  });

  it('an escalation to critical is loud until it clears; the warning it eases back to is not loud again', () => {
    const sim = scene();
    run(sim, 10);
    raiseAlert(sim, req('warning'));
    run(sim, 3 * TICKS_PER_HOUR);
    const before = loudHours(sim);
    expect(before).toBe(1);
    raiseAlert(sim, req('critical'));
    run(sim, 4 * TICKS_PER_HOUR);
    expect(loudHours(sim) - before).toBeGreaterThanOrEqual(4);
    // the same diagnostic eases it to a warning: not a raise, not a rise
    raiseAlert(sim, req('warning'));
    expect(sim.state.progression.alerts[0].level).toBe('warning');
    const atEase = loudHours(sim);
    run(sim, 4 * TICKS_PER_HOUR);
    expect(loudHours(sim) - atEase).toBeLessThanOrEqual(1); // the hour the critical ended in
  });

  it('save -> load mid-warning: the loaded sim counts the same hours', () => {
    const a = scene();
    run(a, 10);
    raiseAlert(a, req('warning'));
    run(a, 120); // 12 s into the warning's 30 s
    const b = restore(snapshot(a)) as unknown as Sim;
    const bSim = creatureScene({ seed: 3, sizeBu: 128 });
    bSim.state = b.state;
    run(a, 3 * TICKS_PER_HOUR);
    run(bSim, 3 * TICKS_PER_HOUR);
    expect(quietTracker(bSim)).toEqual(quietTracker(a));
    expect(loudHours(a)).toBe(1);
  });
});
