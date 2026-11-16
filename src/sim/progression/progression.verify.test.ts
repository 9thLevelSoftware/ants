// Adversarial review tests of the progression module (reviewer, not the implementer). Tests marked "BUG" fail on
// the current implementation and demonstrate a defect for the fixer; the rest are regression tests that pass.

import { describe, expect, it } from 'vitest';
import type { Diagnostic, DiagnosticFactor, DiagnosticStatus, Sim } from '@/sim/types';
import { ALERT_COOLDOWN_GAME_H, ALERTS_ACTIVE_MAX, DIAG_VALUE_MAX, LOSS_WINDOW_GD } from '@/sim/balance';
import { killAnt } from '@/sim/entities';
import { calendarTickAt, daysToTicks, TICKS_PER_HOUR, ticksPerYear } from '@/sim/time';
import { causeChain, journalEntries, publishDiagnostic, raiseAlert } from './index';
import { MILESTONE_FIXTURES, addWorkers } from './fixtures';
import { makeProgSim, pollOnce } from './testkit';

function diag(id: string, status: DiagnosticStatus, factors: Partial<DiagnosticFactor>[] = [], value = 0.5): Diagnostic {
  return {
    id, system: 'test', status, label: id, value, remedies: [], sinceTick: 0, focus: null,
    factors: factors.map((f) => ({ cause: f.cause ?? 'x', weight: f.weight ?? 1, detail: f.detail ?? '', diagId: f.diagId ?? null })),
  };
}

function run(sim: Sim, ticks: number): void {
  for (let i = 0; i < ticks; i++) sim.tick();
}

function workersOf(sim: Sim) {
  const col = sim.state.colonies[0];
  return sim.stores.ants.list.filter((a) => a.alive && a.colony === col.id && a.caste === 'worker');
}

/** Moves the calendar to day 1 of spring of the given year (00:30). */
function toSpringOfYear(sim: Sim, year: number): void {
  const cfg = sim.state.config;
  sim.state.env.calendar.startTick = calendarTickAt('spring', 1, 0.5, cfg) + (year - 1) * ticksPerYear(cfg) - sim.state.tick;
}

describe('alert engine: throttling must not hide a condition that persists', () => {
  it('BUG: a diagnostic that flaps back to warn inside the cooldown and then stays warn gets an alert once the cooldown is over', () => {
    const sim = makeProgSim();
    const id = 'diag-dig-progress:7';
    publishDiagnostic(sim, diag(id, 'warn'));
    sim.tick();
    publishDiagnostic(sim, diag(id, 'ok'));
    sim.tick();
    // back to warn within the notice cooldown: logged only (as specified) ...
    publishDiagnostic(sim, diag(id, 'warn'));
    sim.tick();
    expect(sim.state.progression.alerts.some((a) => a.kind === 'dig-stalled')).toBe(false);
    // ... and the module keeps publishing `warn` (as the colony does every DIAGNOSTICS_EVERY ticks) well past the
    // cooldown. The condition holds for hours, yet no alert is ever raised: there is no status change left to raise it.
    const hours = ALERT_COOLDOWN_GAME_H.notice + 2;
    for (let t = 0; t < hours * TICKS_PER_HOUR; t += 100) {
      publishDiagnostic(sim, diag(id, 'warn'));
      run(sim, 100);
    }
    expect(sim.state.progression.alerts.some((a) => a.kind === 'dig-stalled' && a.subjectId === 7)).toBe(true);
  });
});

describe('alert levels follow the GDD 08 §6.5 catalogue', () => {
  it('BUG: diag-nest-flood at warn raises nest-flooding at its catalogue level (critical)', () => {
    const sim = makeProgSim();
    publishDiagnostic(sim, diag('diag-nest-flood', 'warn', [{ cause: 'water', detail: 'lower chambers taking water' }]));
    const a = sim.state.progression.alerts.find((x) => x.kind === 'nest-flooding');
    expect(a).toBeDefined();
    expect(a!.level).toBe('critical');
  });

  it('BUG: the active-alert cap never drops the alert it is raising (no raise event for an alert that is not stored)', () => {
    const sim = makeProgSim();
    for (let i = 0; i < ALERTS_ACTIVE_MAX; i++) {
      raiseAlert(sim, { kind: 'nest-attacked', level: 'critical', subjectId: i, title: 't', cause: 'c', focus: null, diagnosticId: null });
    }
    const id = raiseAlert(sim, { kind: 'source-found', level: 'notice', subjectId: 1, title: 't', cause: 'c', focus: null, diagnosticId: null });
    expect(sim.state.progression.alerts).toHaveLength(ALERTS_ACTIVE_MAX);
    // either refused (-1) or stored; returning the id of an alert that was dropped at once is wrong
    expect(id === -1 || sim.state.progression.alerts.some((a) => a.id === id)).toBe(true);
  });
});

describe('winters survived (ms-first-winter-survived, ms-winter-3)', () => {
  it('BUG: spring and the Winter Report of the same winter (both at doy 1 of the next year, GDD 06 §6.2) count one winter', () => {
    const sim = makeProgSim();
    for (const year of [2, 3]) {
      toSpringOfYear(sim, year);
      // GDD 06 §6.2: the winter ends at doy 1 00:00 of the next year; the season turns at the same moment
      sim.emit({ type: 'time.season', season: 'spring', year });
      sim.tick();
      sim.emit({ type: 'overwinter.report', report: { workersLost: 0, cold: 0, starvation: 0, storesUsedC: 1, storesUsedP: 0 } });
      sim.tick();
      pollOnce(sim);
    }
    expect(sim.state.progression.milestones['ms-first-winter-survived']).toBeDefined();
    expect(sim.state.progression.engine!.mem.winters).toBe(2);
    expect(sim.state.progression.milestones['ms-winter-3']).toBeUndefined();
  });

  it('the report alone counts one winter per year, and a repeat in the same year does not add one', () => {
    const sim = makeProgSim();
    toSpringOfYear(sim, 2);
    for (let i = 0; i < 2; i++) {
      sim.emit({ type: 'overwinter.report', report: {} });
      sim.tick();
    }
    pollOnce(sim);
    expect(sim.state.progression.engine!.mem.winters).toBe(1);
    // missing report keys become 0 tokens, never NaN
    const entry = journalEntries(sim, ['winter-report'])[0];
    expect(Object.values(entry.tokens!).every((v) => v === 0)).toBe(true);
  });
});

describe('aims', () => {
  it('BUG: aim-first-protein still opens after ms-first-food when aim-first-food waited in the queue and was never shown', () => {
    const sim = makeProgSim({ workers: 4 });
    // three opening aims still open (as the founding script leaves them) fill every slot
    for (const id of ['aim-find-site', 'aim-dig-chamber', 'aim-seal'] as const) {
      sim.state.progression.aims.push({ id, state: 'open', openedTick: 0, doneTick: -1 });
    }
    sim.state.player.opening!.phase = 'handover';
    pollOnce(sim);
    expect(sim.state.progression.engine!.aimQueue).toContain('aim-first-food');
    MILESTONE_FIXTURES['ms-first-food'](sim); // answered while still waiting: never opened (correct, GDD 06 §5.13)
    pollOnce(sim);
    for (const a of sim.state.progression.aims) a.state = 'done';
    pollOnce(sim);
    pollOnce(sim);
    const ids = sim.state.progression.aims.map((a) => a.id);
    expect(ids).toContain('aim-first-trail'); // "after ms-first-food": opens
    // "after aim-first-food": the question was answered by ms-first-food, so the follow-up must still come
    expect(ids).toContain('aim-first-protein');
  });

  it('BUG: an aim opened by another module (founding hand-over) gets its "opened" journal entry', () => {
    const sim = makeProgSim({ workers: 4 });
    // what colony/founding/handover.ts openAim does
    sim.state.progression.aims.push({ id: 'aim-first-food', state: 'open', openedTick: sim.state.tick, doneTick: -1 });
    sim.emit({ type: 'aim.opened', id: 'aim-first-food' });
    sim.tick();
    pollOnce(sim);
    const opened = journalEntries(sim, ['aim']).filter((e) => e.key === 'aim-first-food' && e.refs.length === 0);
    expect(opened).toHaveLength(1);
  });
});

describe('diagnostics registry edge cases (regression)', () => {
  it('NaN / -Infinity values and weights are cleaned; all-zero weights stay zero; factors without diagId get null', () => {
    const sim = makeProgSim();
    publishDiagnostic(sim, diag('diag-a', 'warn', [{ cause: 'p', weight: NaN }, { cause: 'q', weight: -Infinity }], -Infinity));
    const a = sim.state.progression.diagnostics.find((d) => d.id === 'diag-a')!;
    expect(a.value).toBe(-DIAG_VALUE_MAX);
    expect(a.factors.every((f) => f.weight === 0 && f.diagId === null)).toBe(true);
    publishDiagnostic(sim, diag('diag-b', 'ok', [], NaN));
    expect(sim.state.progression.diagnostics.find((d) => d.id === 'diag-b')!.value).toBe(0);
    expect(JSON.parse(JSON.stringify(sim.state.progression.diagnostics))).toEqual(sim.state.progression.diagnostics);
  });

  it('cause chains: an unknown id gives [], a self-citing diagnostic gives one link, the depth limit holds', () => {
    const sim = makeProgSim();
    expect(causeChain(sim, 'diag-missing')).toEqual([]);
    publishDiagnostic(sim, diag('diag-self', 'warn', [{ cause: 'me', diagId: 'diag-self' }]));
    expect(causeChain(sim, 'diag-self').map((l) => l.diagId)).toEqual(['diag-self']);
    for (let i = 0; i < 8; i++) publishDiagnostic(sim, diag(`diag-c${i}`, 'warn', [{ cause: `c${i}`, diagId: `diag-c${i + 1}` }]));
    publishDiagnostic(sim, diag('diag-c8', 'warn'));
    const chain = causeChain(sim, 'diag-c0');
    expect(chain.length).toBeLessThanOrEqual(4);
    expect(chain.map((l) => l.depth)).toEqual(chain.map((_l, i) => i));
  });

  // publishDiagnostic treats a negative sinceTick as "not given" on the first publish, but on a repeat with the same
  // status Math.min(prev, -1) stores -1, so the Colony health "since" and the ranking break.
  it('BUG: sinceTick is the tick of the status change when the publisher gives none, kept while the status holds', () => {
    const sim = makeProgSim();
    run(sim, 50);
    publishDiagnostic(sim, { ...diag('diag-s', 'warn'), sinceTick: -1 });
    const t0 = sim.state.tick;
    run(sim, 30);
    publishDiagnostic(sim, { ...diag('diag-s', 'warn'), sinceTick: -1 });
    expect(sim.state.progression.diagnostics.find((d) => d.id === 'diag-s')!.sinceTick).toBe(t0);
  });
});

describe('deaths and last ants (regression)', () => {
  it('last-ants: critical at <= 3 living ants, cleared above, never raised for 0', () => {
    const sim = makeProgSim({ workers: 4 }); // 4 workers + queen
    // an established colony: the test world's opening record is still at its intro card, and last-ants is never
    // raised while the opening runs (founding-close request 2; int-1B review)
    sim.state.player.opening!.phase = 'done'; sim.state.player.opening!.done = true;
    pollOnce(sim);
    expect(sim.state.progression.alerts.some((a) => a.kind === 'last-ants')).toBe(false);
    for (const a of workersOf(sim).slice(0, 2)) killAnt(sim, a.id, 'cold');
    pollOnce(sim);
    const a = sim.state.progression.alerts.find((x) => x.kind === 'last-ants');
    expect(a?.level).toBe('critical');
    expect(a?.tokens?.n).toBe(3);
    addWorkers(sim, 4);
    pollOnce(sim);
    expect(sim.state.progression.alerts.some((x) => x.kind === 'last-ants')).toBe(false);
  });

  it('a loss entry needs 5 deaths inside 0.25 GD: deaths spread wider write none', () => {
    const sim = makeProgSim({ workers: 12 });
    const ws = workersOf(sim);
    for (const a of ws.slice(0, 4)) killAnt(sim, a.id, 'predation');
    run(sim, daysToTicks(LOSS_WINDOW_GD) + 20);
    killAnt(sim, ws[4].id, 'predation');
    pollOnce(sim);
    expect(journalEntries(sim, ['loss'])).toHaveLength(0);
    expect(sim.state.progression.deaths.recent).toHaveLength(5);
  });
});
