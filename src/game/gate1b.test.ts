// Gate 1B application seams: loading progress from the worldgen report, the alert feed through progression's
// publisher (worded tokens, no lone-founding-queen false alarm), the queen's Colony orders after the hand-over, and
// the player words of possession refusals.
import { describe, expect, it } from 'vitest';
import { makeTestSim } from '@/sim/testing';
import { raiseAlert } from '@/sim/progression';
import { generationPhase, GENERATION_SHARE, loadingPhases } from './newGame/loading';
import { alertsOf } from './uiBridge';
import { TOASTS } from './possessionEvents';

describe('loading progress', () => {
  it('maps the worldgen fraction onto the first share of the bar and counts attempts from 1', () => {
    expect(generationPhase({ step: 'zones', fraction: 0, attempt: 0 })).toEqual({ label: '', progress: 0, attempt: 1 });
    expect(generationPhase({ step: 'validate', fraction: 1, attempt: 2 }).progress).toBeCloseTo(GENERATION_SHARE, 9);
    expect(generationPhase({ step: 'validate', fraction: 1, attempt: 2 }).attempt).toBe(3);
    expect(generationPhase({ step: 'zones', fraction: Number.NaN, attempt: 0 }).progress).toBe(0);
    const p = loadingPhases();
    expect(p.simulate.progress).toBeGreaterThanOrEqual(GENERATION_SHARE); // the bar never runs backwards after generation
    expect(p.render.progress).toBeGreaterThan(p.simulate.progress);
  });
});

describe('alert feed from progression', () => {
  it('words an alert raised with tokens only (no empty card)', () => {
    const sim = makeTestSim({ nest: 'small', workers: 6 });
    raiseAlert(sim, { kind: 'food-c-low', level: 'warning', title: '', cause: '', subjectId: 0, focus: null, diagnosticId: null, tokens: { days: 1 } });
    const a = alertsOf(sim).find((x) => x.kind === 'food-c-low');
    expect(a?.title.length).toBeGreaterThan(0);
  });

  it('hides last-ants for the lone founding queen until the hand-over, and shows it afterwards', () => {
    const sim = makeTestSim({ nest: 'small', workers: 6 });
    raiseAlert(sim, { kind: 'last-ants', level: 'critical', title: '', cause: '', subjectId: -1, focus: null, diagnosticId: null, tokens: { n: 1, cause: 'cold' } });
    const op = sim.state.player.opening;
    if (op) {
      op.done = false; op.phase = 'search';
      expect(alertsOf(sim).some((x) => x.kind === 'last-ants')).toBe(false);
      op.done = true; op.phase = 'done';
    }
    expect(alertsOf(sim).some((x) => x.kind === 'last-ants')).toBe(true);
  });
});

describe('possession refusal words', () => {
  it('never shows a raw reason id', () => {
    expect(TOASTS.possessRejected('dead')).toBe('That ant is dead');
    expect(TOASTS.possessRejected('not-colony')).toBe('That ant belongs to another colony');
    expect(TOASTS.possessRejected('something-new')).toBe('That ant cannot be taken');
  });
});
