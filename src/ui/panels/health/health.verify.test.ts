// Adversarial checks of Colony health (task ui-panels review, GDD 08 4.4): the value words of diagnostics the real sim
// publishes, the cause chain on edge inputs (duplicate causes, a factor that names itself, weights that do not sum to 1,
// non-finite weights), and the remedy table against the remedy ids the sim actually emits.
import { describe, expect, it } from 'vitest';
import { REMEDY_WORD } from '@/content/text/words';
import { makeTestSim } from '@/sim/testing';
import { healthOf } from '@/game/uiBridge/panels';
import type { UiDiagnostic } from '../../api';
import { factorTree, rankRows, remedyLink, valueWord } from './model';

function diag(id: string, status: UiDiagnostic['status'], o: Partial<UiDiagnostic> = {}): UiDiagnostic {
  return { id, system: 'colony', status, label: id, value: 0.6, sinceTick: 0, sinceLabel: 'Summer Day 4, 09:00', factors: [], remedies: [], focus: null, history: [], historyId: null, ...o };
}
const f = (cause: string, weight: number, diagId: string | null = null, detail = '') => ({ cause, weight, detail, diagId });

/** A real test colony after a few game hours, so the colony module has published its diagnostics. */
function liveHealth() {
  const sim = makeTestSim({ nest: 'small', workers: 12, seed: 3 });
  for (let i = 0; i < 1500; i++) sim.tick();
  return healthOf(sim);
}

describe('value words of what the sim publishes', () => {
  const h = liveHealth();
  const byBase = (id: string) => h.rows.find((r) => r.id === id || r.id.startsWith(`${id}:`));

  it('the live colony publishes diagnostics at all', () => {
    expect(h.rows.length).toBeGreaterThan(3);
  });

  // GDD 08 4.4: "value with unit". diag-mortality publishes deaths per game day per ant (owner GDD 02), not a ratio of
  // normal, so "0.0 of normal" says the opposite of what the number means.
  it('diag-mortality (deaths per ant per game day) is not worded as a ratio of normal', () => {
    const m = byBase('diag-mortality');
    expect(m, 'mortality is published').toBeTruthy();
    expect(valueWord(m!)).not.toMatch(/of normal$/);
  });

  // diag-nest-space publishes the fullest load against capacity (crowding > 1 = overfull): "1.4 of normal" reads as healthy.
  it('diag-nest-space (load against capacity) is not worded as a ratio of normal', () => {
    const n = byBase('diag-nest-space');
    expect(n, 'nest space is published').toBeTruthy();
    expect(valueWord(n!)).not.toMatch(/of normal$/);
  });

  it('every remedy id the sim emits has words and an action (no "advice" fallback for a known control)', () => {
    const ids = [...new Set(h.rows.flatMap((r) => r.remedies))];
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      expect(REMEDY_WORD[id], `words for ${id}`).toBeTruthy();
      expect(remedyLink(id).action.kind, `action for ${id}`).not.toBe('advice');
    }
  });

  // diag-rivals (src/sim/rivals/report.ts) and diag-combat-losses (src/sim/combat/diagnostics.ts) emit these two when not ok.
  // Both name a control that exists (Directives > Stores and safety > Stance; the rally marker tool).
  it('the rivals / combat remedies are worded and open their control', () => {
    for (const id of ['remedy.stance.cautious', 'remedy.marker.rally']) {
      expect(REMEDY_WORD[id], `words for ${id}`).toBeTruthy();
      expect(remedyLink(id).action.kind, `action for ${id}`).not.toBe('advice');
    }
  });

  it('no row value prints NaN or Infinity', () => {
    for (const r of h.rows) expect(valueWord(r)).not.toMatch(/NaN|Infinity/);
  });
});

describe('cause chain edge cases', () => {
  it('a factor whose diagId names its own diagnostic is cut as a cycle, never recursed', () => {
    const d = diag('a', 'bad', { factors: [f('self', 1, 'a')] });
    const t = factorTree(d, [d]);
    expect(t.lines[0].cut).toBe('cycle');
    expect(t.lines[0].chain).toBeNull();
  });

  it('a two-diagnostic loop is expanded once and then cut', () => {
    const a = diag('a', 'bad', { factors: [f('x', 1, 'b')] });
    const b = diag('b', 'warn', { factors: [f('y', 1, 'a')] });
    const t = factorTree(a, [a, b]);
    expect(t.lines[0].chain?.lines[0].cut).toBe('cycle');
  });

  it('the depth limit stops at 3 levels on a long chain', () => {
    const rows = ['a', 'b', 'c', 'd', 'e'].map((id, i, all) => diag(id, 'warn', { factors: [f(`c${id}`, 1, all[i + 1] ?? null)] }));
    const t = factorTree(rows[0], rows);
    const l2 = t.lines[0].chain!.lines[0];
    const l3 = l2.chain!.lines[0];
    expect(l3.cut).toBe('depth');
    expect(l3.chain).toBeNull();
  });

  it('per-subject ids are found from the base id of a factor', () => {
    const a = diag('a', 'bad', { factors: [f('dig', 1, 'diag-dig-progress')] });
    const p = diag('diag-dig-progress:42', 'warn');
    expect(factorTree(a, [a, p]).lines[0].diag?.id).toBe('diag-dig-progress:42');
  });

  it('non-finite weights do not reach the bars', () => {
    const d = diag('a', 'bad', { factors: [f('x', Number.NaN), f('y', 0.5)] });
    for (const l of factorTree(d, [d]).lines) expect(Number.isFinite(l.pct)).toBe(true);
  });

  it('ranking is stable for equal status and since: by id', () => {
    expect(rankRows([diag('b', 'warn'), diag('a', 'warn')]).map((r) => r.id)).toEqual(['a', 'b']);
  });
});
