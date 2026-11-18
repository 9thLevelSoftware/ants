// Reviewer tests for the quiet-time "ease" rule in raiseAlert (progression/alerts.ts): a repeat raise of an active key
// at a lower level lowers the card ONLY when it comes from the same diagnostic (the report's and the doc comment's
// contract: "a lower level from the same diagnostic eases it"). A different raiser that shares the key must not
// lower a card another raiser holds at a higher level, or "what an alert means" changes (task rule).

import { describe, expect, it } from 'vitest';
import { expireAlert, raiseAlert, touchAlert } from './alerts';
import { makeProgSim } from './testkit';

const base = { kind: 'raid-seen' as const, subjectId: 7, title: 't', cause: 'c', focus: null };
const card = (sim: ReturnType<typeof makeProgSim>) => sim.state.progression.alerts.find((a) => a.kind === base.kind && a.subjectId === base.subjectId);

describe('raiseAlert ease rule (review)', () => {
  it('a lower raise from ANOTHER diagnostic does not lower a card held by a different diagnostic', () => {
    const sim = makeProgSim();
    raiseAlert(sim, { ...base, level: 'critical', diagnosticId: 'diag-defence' });
    raiseAlert(sim, { ...base, level: 'warning', diagnosticId: 'diag-rivals' });
    expect(card(sim)?.level).toBe('critical');
  });

  it('the same diagnostic eases, then escalates again with a fresh (unacknowledged) card', () => {
    const sim = makeProgSim();
    raiseAlert(sim, { ...base, level: 'critical', diagnosticId: 'diag-defence' });
    card(sim)!.acknowledged = true;
    raiseAlert(sim, { ...base, level: 'warning', diagnosticId: 'diag-defence' });
    expect(card(sim)?.level).toBe('warning');
    raiseAlert(sim, { ...base, level: 'critical', diagnosticId: 'diag-defence' });
    expect(card(sim)?.level).toBe('critical');
    expect(card(sim)?.acknowledged).toBe(false);
    expect(sim.state.progression.alerts.filter((a) => a.kind === base.kind)).toHaveLength(1);
  });

  it('a lower raise with no diagnostic never eases', () => {
    const sim = makeProgSim();
    raiseAlert(sim, { ...base, level: 'critical', diagnosticId: null });
    raiseAlert(sim, { ...base, level: 'warning', diagnosticId: null });
    expect(card(sim)?.level).toBe('critical');
  });
});

describe('expireAlert edge cases (review)', () => {
  it('maxTicks 0 means no cap: a card touched every tick stays', () => {
    const sim = makeProgSim();
    raiseAlert(sim, { ...base, level: 'warning', diagnosticId: null });
    for (let i = 0; i < 500; i++) {
      sim.tick();
      touchAlert(sim, base.kind, base.subjectId);
      expect(expireAlert(sim, base.kind, base.subjectId, { idleTicks: 10, maxTicks: 0 })).toBe(false);
    }
  });

  it('a stale touch from before the card was raised does not keep a new card alive', () => {
    const sim = makeProgSim();
    touchAlert(sim, base.kind, base.subjectId); // no card yet
    for (let i = 0; i < 50; i++) sim.tick();
    raiseAlert(sim, { ...base, level: 'warning', diagnosticId: null });
    for (let i = 0; i < 10; i++) sim.tick();
    expect(expireAlert(sim, base.kind, base.subjectId, { idleTicks: 10, maxTicks: 0 })).toBe(true);
  });

  it('no active card: expireAlert is a no-op returning false', () => {
    const sim = makeProgSim();
    expect(expireAlert(sim, base.kind, base.subjectId, { idleTicks: 0, maxTicks: 0 })).toBe(false);
  });
});
