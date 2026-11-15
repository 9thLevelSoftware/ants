// Diagnostics registry and alert engine (GDD 08 §4.4, §6; GDD 02 §14; task criterion 4): a status change gives one
// alert at the right level, flapping inside the cooldown is logged only, cause chains come back in order, values
// are finite, records are ranked for the Colony health view.

import { describe, expect, it } from 'vitest';
import type { Diagnostic, DiagnosticFactor, DiagnosticStatus, Sim } from '@/sim/types';
import { ALERT_COOLDOWN_GAME_H, DIAG_VALUE_MAX } from '@/sim/balance';
import { TICKS_PER_HOUR } from '@/sim/time';
import {
  causeChain, causeTree, clearAlert, colonyHealth, publishDiagnostic, raiseAlert, worstCauseChain,
} from './index';
import { refreshDiagnostics } from './diagnostics';
import { makeProgSim, recordEvents } from './testkit';

function diag(id: string, status: DiagnosticStatus, factors: Partial<DiagnosticFactor>[] = [], value = 0.5): Diagnostic {
  return {
    id, system: 'test', status, label: id, value, remedies: [], sinceTick: 0, focus: null,
    factors: factors.map((f) => ({ cause: f.cause ?? 'x', weight: f.weight ?? 1, detail: f.detail ?? '', diagId: f.diagId ?? null })),
  };
}

function advance(sim: Sim, ticks: number): void {
  for (let i = 0; i < ticks; i++) sim.tick();
}

describe('status change -> alert', () => {
  it('ok publishes no alert; warn raises one at the catalogue level; bad escalates the same card', () => {
    const sim = makeProgSim();
    const ev = recordEvents(sim, ['alert', 'diagnostic-changed']);
    publishDiagnostic(sim, diag('diag-nest-space', 'ok'));
    sim.tick();
    expect(sim.state.progression.alerts).toHaveLength(0);
    publishDiagnostic(sim, diag('diag-nest-space', 'warn', [{ cause: 'crowding', detail: 'general chamber at 140 %' }]));
    publishDiagnostic(sim, diag('diag-nest-space', 'warn', [{ cause: 'crowding' }])); // same status: nothing new
    sim.tick();
    const raises = ev.filter((e) => e.type === 'alert' && e.op === 'raise');
    expect(raises).toHaveLength(1);
    const a = sim.state.progression.alerts[0];
    expect(a.kind).toBe('nest-crowded');
    expect(a.level).toBe('notice');
    expect(a.diagnosticId).toBe('diag-nest-space');
    expect(a.cause).toBe('general chamber at 140 %');
    publishDiagnostic(sim, diag('diag-nest-space', 'bad', [{ cause: 'crowding' }]));
    sim.tick();
    expect(sim.state.progression.alerts).toHaveLength(1);
    expect(sim.state.progression.alerts[0].level).toBe('warning');
    expect(ev.filter((e) => e.type === 'diagnostic-changed')).toHaveLength(3);
  });

  it('flapping inside the cooldown is logged, not re-raised; after the cooldown it raises again', () => {
    const sim = makeProgSim();
    const ev = recordEvents(sim, ['alert']);
    const flip = (s: DiagnosticStatus): void => { publishDiagnostic(sim, diag('diag-dig-progress:7', s)); sim.tick(); };
    flip('warn');
    flip('ok');
    for (let i = 0; i < 5; i++) { flip('warn'); flip('ok'); }
    expect(ev.filter((e) => e.type === 'alert' && e.op === 'raise')).toHaveLength(1);
    expect(sim.state.progression.eventLog.filter((r) => r.kind === 'alert.cooldown')).toHaveLength(5);
    advance(sim, ALERT_COOLDOWN_GAME_H.notice * TICKS_PER_HOUR);
    flip('warn');
    expect(ev.filter((e) => e.type === 'alert' && e.op === 'raise')).toHaveLength(2);
    expect(sim.state.progression.alerts[0].subjectId).toBe(7);
  });

  it('GDD 08 E4 (sim side): five raises of one key make one card with count 5 and one raise event', () => {
    const sim = makeProgSim();
    const ev = recordEvents(sim, ['alert']);
    for (let i = 0; i < 5; i++) {
      raiseAlert(sim, { kind: 'food-c-low', level: 'warning', subjectId: 2, title: 'Carbohydrate stores low', cause: `${i}`, focus: null, diagnosticId: 'diag-stores' });
      advance(sim, 100);
    }
    expect(sim.state.progression.alerts).toHaveLength(1);
    expect(sim.state.progression.alerts[0].count).toBe(5);
    expect(ev.filter((e) => e.type === 'alert' && e.op === 'raise')).toHaveLength(1);
    expect(ev.filter((e) => e.type === 'alert' && e.op === 'update')).toHaveLength(4);
  });

  it('critical alerts have no cooldown; a module repeat counts up; acknowledge keeps the card', () => {
    const sim = makeProgSim();
    const req = { kind: 'nest-flooding' as const, level: 'critical' as const, subjectId: 3, title: 'Nest flooding', cause: 'water', focus: null, diagnosticId: null };
    const id = raiseAlert(sim, req);
    expect(raiseAlert(sim, req)).toBe(id);
    expect(sim.state.progression.alerts[0].count).toBe(2);
    clearAlert(sim, 'nest-flooding', 3);
    expect(raiseAlert(sim, req)).toBeGreaterThan(id);
    sim.enqueue({ type: 'acknowledgeAlert', alertId: sim.state.progression.alerts[0].id });
    sim.applyPendingCommands();
    expect(sim.state.progression.alerts[0].acknowledged).toBe(true);
  });
});

describe('cause chains', () => {
  it('follow the heaviest chained factor, in order, and cut cycles', () => {
    const sim = makeProgSim();
    publishDiagnostic(sim, diag('diag-stores', 'warn', [{ cause: 'protein', weight: 0.7, diagId: 'diag-food-intake-p' }, { cause: 'upkeep', weight: 0.3 }]));
    publishDiagnostic(sim, diag('diag-food-intake-p', 'warn', [{ cause: 'foragers', weight: 0.6, diagId: 'diag-workforce' }, { cause: 'distance', weight: 0.4 }]));
    publishDiagnostic(sim, diag('diag-workforce', 'warn', [{ cause: 'too-few-adults', weight: 1, diagId: 'diag-stores' }]));
    const chain = causeChain(sim, 'diag-stores');
    expect(chain.map((l) => l.diagId)).toEqual(['diag-stores', 'diag-food-intake-p', 'diag-workforce']);
    expect(chain.map((l) => l.factor?.cause ?? null)).toEqual(['protein', 'foragers', null]);
    const tree = causeTree(sim, 'diag-stores');
    expect(tree[0].factor.cause).toBe('protein');
    expect(tree[0].children[0].children[0].factor.cause).toBe('too-few-adults');
    expect(tree[0].children[0].children[0].children).toHaveLength(0); // cycle back to diag-stores cut
  });

  it('the worst diagnostic gives the extinction cause chain', () => {
    const sim = makeProgSim();
    publishDiagnostic(sim, diag('diag-food-intake-c', 'bad', [{ cause: 'sources', weight: 1, diagId: 'diag-carb-sources' }]));
    publishDiagnostic(sim, diag('diag-carb-sources', 'warn', [{ cause: 'distance', weight: 1 }]));
    expect(worstCauseChain(sim)).toEqual(['diag-food-intake-c', 'diag-carb-sources', 'distance']);
  });
});

describe('registry hygiene and ranking', () => {
  it('stores finite values (Infinity from a zero capacity) and normalised weights', () => {
    const sim = makeProgSim();
    publishDiagnostic(sim, diag('diag-nest-space', 'ok', [{ cause: 'a', weight: 2 }, { cause: 'b', weight: 2 }], Infinity));
    const d = sim.state.progression.diagnostics.find((x) => x.id === 'diag-nest-space')!;
    expect(d.value).toBe(DIAG_VALUE_MAX);
    expect(d.factors.map((f) => f.weight)).toEqual([0.5, 0.5]);
    // a module writing straight into the list is cleaned by the diagnostics system and its change detected
    sim.tick();
    const ev = recordEvents(sim, ['diagnostic-changed']);
    sim.state.progression.diagnostics.push({ ...diag('diag-hygiene', 'warn'), value: NaN });
    refreshDiagnostics(sim);
    sim.tick();
    expect(sim.state.progression.diagnostics.find((x) => x.id === 'diag-hygiene')!.value).toBe(0);
    expect(ev).toHaveLength(1);
  });

  it('keeps sinceTick while the status holds and ranks bad -> warn -> info -> ok, newest first', () => {
    const sim = makeProgSim();
    publishDiagnostic(sim, { ...diag('diag-stores', 'warn'), sinceTick: 10 });
    publishDiagnostic(sim, { ...diag('diag-stores', 'warn'), sinceTick: 50 });
    expect(sim.state.progression.diagnostics.find((x) => x.id === 'diag-stores')!.sinceTick).toBe(10);
    publishDiagnostic(sim, { ...diag('diag-workforce', 'ok'), sinceTick: 5 });
    publishDiagnostic(sim, { ...diag('diag-egg-laying', 'bad'), sinceTick: 7 });
    publishDiagnostic(sim, { ...diag('diag-hygiene', 'info'), sinceTick: 8 });
    publishDiagnostic(sim, { ...diag('diag-brood-growth', 'warn'), sinceTick: 20 });
    const h = colonyHealth(sim);
    expect(h.overall).toBe('bad');
    expect(h.rows.map((r) => r.id)).toEqual(['diag-egg-laying', 'diag-brood-growth', 'diag-stores', 'diag-hygiene', 'diag-workforce']);
  });
});
