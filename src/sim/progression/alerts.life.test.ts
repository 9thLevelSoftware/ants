// Alert lifetime bookkeeping (quiet-time, GDD 05 I11): a card whose cause eases falls back a level, a card held by a
// condition leaves after the condition was last seen (or at its cap), and the marks survive a save.

import { describe, expect, it } from 'vitest';
import type { Diagnostic, DiagnosticStatus } from '@/sim/types';
import { createSim } from '@/sim/sim';
import { restore, snapshot } from '@/sim/save/snapshot';
import { TICKS_PER_HOUR } from '@/sim/time';
import { expireAlert, raiseAlert, touchAlert } from './alerts';
import { publishDiagnostic } from './index';
import { makeProgSim } from './testkit';

const diag = (id: string, status: DiagnosticStatus): Diagnostic => ({ id, system: 'test', status, label: id, value: 0.5, remedies: [], sinceTick: 0, focus: null, factors: [] });
const card = (sim: ReturnType<typeof makeProgSim>, kind: string) => sim.state.progression.alerts.find((a) => a.kind === kind);

describe('alert level falls back when the cause eases', () => {
  it('nest-crowded: warn = notice, bad = warning, back to warn = notice again on the same card, ok clears it', () => {
    const sim = makeProgSim();
    publishDiagnostic(sim, diag('diag-nest-space', 'warn'));
    publishDiagnostic(sim, diag('diag-nest-space', 'bad'));
    expect(card(sim, 'nest-crowded')?.level).toBe('warning');
    const id = card(sim, 'nest-crowded')!.id;
    publishDiagnostic(sim, diag('diag-nest-space', 'warn'));
    expect(card(sim, 'nest-crowded')?.level).toBe('notice');
    expect(card(sim, 'nest-crowded')?.id).toBe(id);
    expect(sim.state.progression.eventLog.some((r) => r.kind === 'alert.ease')).toBe(true);
    publishDiagnostic(sim, diag('diag-nest-space', 'ok'));
    expect(card(sim, 'nest-crowded')).toBeUndefined();
  });

  it('a lower raise from another source (no shared diagnostic) does not lower the card', () => {
    const sim = makeProgSim();
    const base = { kind: 'nest-crowded' as const, subjectId: 1, title: 't', cause: 'c', focus: null };
    raiseAlert(sim, { ...base, level: 'warning', diagnosticId: 'diag-nest-space' });
    raiseAlert(sim, { ...base, level: 'notice', diagnosticId: null });
    expect(card(sim, 'nest-crowded')?.level).toBe('warning');
  });
});

describe('held alerts (touchAlert / expireAlert)', () => {
  const req = { kind: 'human-event-warning' as const, level: 'warning' as const, subjectId: 3, title: '', cause: '', focus: null, diagnosticId: null };
  const life = { idleTicks: 10, maxTicks: 40 };

  it('stays while touched, leaves idleTicks after the last touch, and never outlives maxTicks', () => {
    const sim = makeProgSim();
    raiseAlert(sim, req);
    for (let i = 0; i < 30; i++) { sim.tick(); touchAlert(sim, req.kind, 3); expect(expireAlert(sim, req.kind, 3, life)).toBe(false); }
    for (let i = 0; i < 9; i++) { sim.tick(); expect(expireAlert(sim, req.kind, 3, life)).toBe(false); }
    sim.tick(); sim.tick();
    expect(expireAlert(sim, req.kind, 3, life)).toBe(true);
    expect(card(sim, req.kind)).toBeUndefined();
    // a card touched all the time still leaves at its cap
    raiseAlert(sim, { ...req, subjectId: 4 });
    for (let i = 0; i < TICKS_PER_HOUR; i++) { sim.tick(); touchAlert(sim, req.kind, 4); }
    expect(expireAlert(sim, req.kind, 4, life)).toBe(true);
  });

  it('the marks are saved: a loaded game expires the card on the same tick', () => {
    const sim = makeProgSim();
    raiseAlert(sim, req);
    for (let i = 0; i < 5; i++) sim.tick();
    touchAlert(sim, req.kind, 3);
    const b = createSim(restore(snapshot(sim)).state, sim.world);
    const outcome = (s: typeof sim): number => { for (let i = 0; i < 50; i++) { s.tick(); if (expireAlert(s, req.kind, 3, life)) return i; } return -1; };
    const a = outcome(sim);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(outcome(b)).toBe(a);
  });
});
