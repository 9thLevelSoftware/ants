// Colony health model: ranking presentation, factor lines with the "Other" rule, nested cause chains (depth 3, cycles
// cut), remedy mapping (task ui-panels, GDD 08 4.4).
import { describe, expect, it } from 'vitest';
import { REMEDY_WORD } from '@/content/text/words';
import type { UiDiagnostic } from '../../api';
import { DIAG_VALUE_WORD } from '@/content/text/words';
import { DIAGNOSTIC_IDS } from '@/sim/types';
import { factorTree, statusKind, findDiag, overallOf, rankRows, remedyLink, remedySelector, rowName, valueWord } from './model';

function diag(id: string, status: UiDiagnostic['status'], o: Partial<UiDiagnostic> = {}): UiDiagnostic {
  return { id, system: 'colony', status, label: id, value: 0.6, sinceTick: 0, sinceLabel: 'Summer Day 4, 09:00', factors: [], remedies: [], focus: null, history: [], historyId: null, ...o };
}
const f = (cause: string, weight: number, diagId: string | null = null, detail = '') => ({ cause, weight, detail, diagId });

describe('ranking', () => {
  it('sorts bad, warn, info, ok, then newest first, then id', () => {
    const rows = [diag('c', 'ok', { sinceTick: 5 }), diag('b', 'warn', { sinceTick: 1 }), diag('a', 'bad', { sinceTick: 0 }), diag('d', 'warn', { sinceTick: 9 }), diag('e', 'info')];
    expect(rankRows(rows).map((r) => r.id)).toEqual(['a', 'd', 'b', 'e', 'c']);
  });
  it('does not change the order of its input', () => {
    const rows = [diag('x', 'ok'), diag('y', 'bad')];
    rankRows(rows);
    expect(rows.map((r) => r.id)).toEqual(['x', 'y']);
  });
  it('overall is the worst status, ok for none', () => {
    expect(overallOf([])).toBe('ok');
    expect(overallOf([diag('a', 'ok'), diag('b', 'warn'), diag('c', 'info')])).toBe('warn');
    expect(overallOf([diag('a', 'bad'), diag('b', 'warn')])).toBe('bad');
  });
  it('row names carry the status word, the value and the since stamp (never colour alone)', () => {
    const n = rowName(diag('diag-brood-growth', 'bad', { label: 'Brood growth' }));
    expect(n).toBe('Brood growth, Failing, 0.6 of normal, since Summer Day 4, 09:00');
  });
  it('values carry the unit of their own diagnostic and never print NaN', () => {
    expect(valueWord(diag('diag-brood-growth', 'ok', { value: 1 }))).toBe('1.0 of normal');
    expect(valueWord(diag('diag-food-intake-p', 'ok', { value: 12.4 }))).toBe('12 of need');
    expect(valueWord(diag('diag-nest-space', 'ok', { value: 0.1 }))).toBe('10 % full');
    expect(valueWord(diag('diag-mortality', 'ok', { value: 0.004 }))).toBe('0.4 % of ants lost per game day');
    expect(valueWord(diag('diag-combat-losses', 'warn', { value: 3 }))).toBe('3 workers lost today');
    expect(valueWord(diag('diag-dig-progress:42', 'ok', { value: 0.5 }))).toBe('50 % of full speed');
    expect(valueWord(diag('diag-released-ant', 'info', { value: 3 }))).toBe('');
    expect(valueWord(diag('a', 'ok', { value: 0.6 }))).toBe('0.6');
    expect(valueWord(diag('a', 'ok', { value: Number.NaN }))).toBe('no reading');
  });
  it('a value that means nothing to the player is left out of the row name', () => {
    expect(rowName(diag('diag-released-ant', 'info', { label: 'Returned to work: idle', value: 3 }))).toBe('Returned to work: idle, Note, since Summer Day 4, 09:00');
  });
});

describe('status shapes and value table', () => {
  it('a diagnostic note shares the circle outline of Good (GDD 08 2.6)', () => {
    expect(statusKind('info')).toBe('ok');
    expect(statusKind('warn')).toBe('warn');
  });
  it('every id of the value table is a real diagnostic id', () => {
    for (const id of Object.keys(DIAG_VALUE_WORD)) expect(DIAGNOSTIC_IDS as readonly string[], id).toContain(id);
  });
});

describe('factor lines', () => {
  it('ranks by weight, words the cause from the content table and rounds percent', () => {
    const d = diag('diag-brood-growth', 'bad', { factors: [f('nurses', 0.3, null, '3 of 12 nurses'), f('protein', 0.6, null, 'larva-time with protein'), f('temperature', 0.1)] });
    const t = factorTree(d, [d]);
    expect(t.lines.map((l) => [l.cause, l.pct])).toEqual([['protein', 60], ['nurses', 30], ['temperature', 10]]);
    expect(t.lines[0].label).toBe('Protein');
    expect(t.lines[1].detail).toBe('3 of 12 nurses');
    expect(t.otherPct).toBe(0);
  });
  it('shows at most 5 factors and sums the rest as Other (n %)', () => {
    const d = diag('x', 'warn', { factors: ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((c, i) => f(c, [0.3, 0.25, 0.2, 0.1, 0.07, 0.05, 0.03][i])) });
    const t = factorTree(d, [d]);
    expect(t.lines).toHaveLength(5);
    expect(t.otherPct).toBe(8);
  });
  it('drops factors that limit nothing', () => {
    const d = diag('x', 'warn', { factors: [f('a', 1), f('b', 0), f('c', 0.001)] });
    expect(factorTree(d, [d]).lines.map((l) => l.cause)).toEqual(['a']);
  });
  it('words an unknown cause from its id', () => {
    const d = diag('x', 'warn', { factors: [f('some-new-cause', 1)] });
    expect(factorTree(d, [d]).lines[0].label).toBe('Some new cause');
  });
});

describe('cause chains', () => {
  it('nests the diagnostic a factor refers to', () => {
    const intake = diag('diag-food-intake-p', 'bad', { factors: [f('foragers', 1, null, '2 of 8 foragers')] });
    const brood = diag('diag-brood-growth', 'warn', { factors: [f('protein', 1, 'diag-food-intake-p')] });
    const t = factorTree(brood, [brood, intake]);
    expect(t.lines[0].diag?.id).toBe('diag-food-intake-p');
    expect(t.lines[0].chain?.lines[0].cause).toBe('foragers');
    expect(t.lines[0].cut).toBeNull();
  });
  it('cuts a cycle at the first repeat', () => {
    const a = diag('a', 'bad', { factors: [f('x', 1, 'b')] });
    const b = diag('b', 'bad', { factors: [f('y', 1, 'a')] });
    const t = factorTree(a, [a, b]);
    const inner = t.lines[0].chain!;
    expect(inner.lines[0].cut).toBe('cycle');
    expect(inner.lines[0].chain).toBeNull();
  });
  it('stops at depth 3', () => {
    const d = ['a', 'b', 'c', 'd', 'e'].map((id, i, all) => diag(id, 'warn', { factors: [f('x', 1, all[i + 1] ?? null)] }));
    let t = factorTree(d[0], d);
    let depth = 1;
    while (t.lines[0].chain) { t = t.lines[0].chain; depth++; }
    expect(depth).toBe(3);
    expect(t.lines[0].cut).toBe('depth');
  });
  it('finds a per-subject record by its base id', () => {
    const rows = [diag('diag-dig-progress:42', 'warn')];
    expect(findDiag(rows, 'diag-dig-progress')?.id).toBe('diag-dig-progress:42');
    expect(findDiag(rows, 'diag-missing')).toBeNull();
  });
});

describe('remedies', () => {
  it('every remedy the colony publishes has words and a known action', () => {
    for (const id of Object.keys(REMEDY_WORD)) {
      const r = remedyLink(id);
      expect(r.label.length).toBeGreaterThan(3);
      if (!id.startsWith('remedy.possessed.')) expect(r.action.kind, id).not.toBe('advice');
    }
  });
  it('slider remedies point at their group, diet and stock at their sections', () => {
    const a = remedyLink('remedy.slider.nurse').action;
    expect(a.kind).toBe('directives');
    if (a.kind === 'directives') expect(remedySelector(a)).toBe('[data-group="nurse"]');
    const d = remedyLink('remedy.diet.protein').action;
    if (d.kind === 'directives') expect(remedySelector(d)).toBe('[data-testid="dir-diet"]');
  });
  it('dig remedies plan a chamber of that type; marker remedies pick the tool', () => {
    expect(remedyLink('remedy.dig.nursery').action).toEqual({ kind: 'plan', chamberType: 'nursery' });
    expect(remedyLink('remedy.marker.forage').action).toEqual({ kind: 'tool', tool: 'forage' });
    expect(remedyLink('remedy.possess.forage').action).toEqual({ kind: 'possess', role: 'forager' });
  });
  it('an unknown remedy is plain advice with readable words', () => {
    const r = remedyLink('remedy.new.thing');
    expect(r.action.kind).toBe('advice');
    expect(r.label).toBe('New thing');
  });
});
