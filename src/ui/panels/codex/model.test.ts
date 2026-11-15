// Codex model: locked / unlocked, search that never reaches into locked text, category counts, the neutral line for
// missing prose (task ui-panels, GDD 08 7.3).
import { describe, expect, it } from 'vitest';
import { ALL_CODEX_ENTRIES, getCodexEntry } from '@/content/codex';
import { categoryCounts, codexRows, fieldNote, isUnlocked, NO_PROSE_LINE, NO_UNLOCKS, observedLine, SPIDER_ENTRIES } from './model';

const seen = (...ids: string[]) => ({ seen: Object.fromEntries(ids.map((i) => [i, { label: 'Spring · Day 2 · Year 1' }])) });

describe('unlocking', () => {
  it('the manual is always open; other entries open once seen in this game or on this device', () => {
    const manual = ALL_CODEX_ENTRIES.find((e) => e.alwaysUnlocked)!;
    expect(isUnlocked(manual, NO_UNLOCKS)).toBe(true);
    const other = ALL_CODEX_ENTRIES.find((e) => !e.alwaysUnlocked)!;
    expect(isUnlocked(other, NO_UNLOCKS)).toBe(false);
    expect(isUnlocked(other, seen(other.id))).toBe(true);
    expect(isUnlocked(other, { seen: {}, device: { [other.id]: { label: 'x' } } })).toBe(true);
  });
  it('observed lines name the date or say not yet observed', () => {
    const e = ALL_CODEX_ENTRIES.find((x) => !x.alwaysUnlocked)!;
    expect(observedLine(e, NO_UNLOCKS)).toBe('Not yet observed');
    expect(observedLine(e, seen(e.id))).toBe('Observed: Spring · Day 2 · Year 1');
  });
});

describe('filtering', () => {
  it('lists a category in content order with its lock state', () => {
    const rows = codexRows({ category: 'behaviours', text: '' }, NO_UNLOCKS);
    expect(rows.length).toBeGreaterThan(3);
    expect(rows.every((r) => r.entry.category === 'behaviours')).toBe(true);
    expect(rows.every((r) => r.unlocked === !!r.entry.alwaysUnlocked)).toBe(true);
  });
  it('search matches titles of every entry and text only of unlocked ones', () => {
    const e = ALL_CODEX_ENTRIES.find((x) => x.id === 'cx-trophallaxis')!;
    expect(e.title.toLowerCase()).not.toContain('toxins');
    expect(e.body.toLowerCase()).toContain('toxins');
    const locked = codexRows({ category: 'all', text: 'toxins' }, NO_UNLOCKS).map((r) => r.entry.id);
    const open = codexRows({ category: 'all', text: 'toxins' }, seen(e.id)).map((r) => r.entry.id);
    expect(locked).not.toContain(e.id);
    expect(open).toContain(e.id);
    expect(codexRows({ category: 'all', text: e.title.slice(0, 6) }, NO_UNLOCKS).map((r) => r.entry.id)).toContain(e.id);
  });
  it('search ignores case and surrounding spaces and finds nothing for nonsense', () => {
    const e = ALL_CODEX_ENTRIES.find((x) => x.id === 'cx-trophallaxis')!;
    expect(codexRows({ category: 'all', text: `  ${e.title.toUpperCase()} ` }, NO_UNLOCKS).map((r) => r.entry.id)).toContain(e.id);
    expect(codexRows({ category: 'all', text: 'zzqqxx' }, NO_UNLOCKS)).toEqual([]);
  });
  it('category counts add up to the whole codex and count only open entries', () => {
    const none = categoryCounts(NO_UNLOCKS);
    expect(none.reduce((a, c) => a + c.total, 0)).toBe(ALL_CODEX_ENTRIES.length);
    const nine = none.length;
    expect(nine).toBe(9);
    const e = ALL_CODEX_ENTRIES.find((x) => !x.alwaysUnlocked && x.category === 'weather')!;
    const w = (u: ReturnType<typeof seen>) => categoryCounts(u).find((c) => c.id === 'weather')!.observed;
    expect(w(seen(e.id))).toBe(w(seen()) + 1);
  });
});

describe('prose', () => {
  it('every entry has a field note, and an empty one shows the neutral line', () => {
    for (const e of ALL_CODEX_ENTRIES) expect(fieldNote(e), e.id).not.toBe(NO_PROSE_LINE);
    expect(fieldNote({ body: '  ' })).toBe(NO_PROSE_LINE);
  });
  it('the spider entries exist, so the comfort ring has something to replace', () => {
    for (const id of SPIDER_ENTRIES) expect(getCodexEntry(id)?.id).toBe(id);
  });
});
