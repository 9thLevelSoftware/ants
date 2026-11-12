// Independent verification of the text tables and the controls reference (reviewer's tests).
import { describe, expect, it } from 'vitest';
import gdd06 from '../../../docs/design/gdd/06-environment-progression.md?raw';
import gdd08 from '../../../docs/design/gdd/08-ui-ux-art-audio.md?raw';
import { ACTIONS, AXES, BUTTON_ACTIONS } from '@/input/actions';
import { cloneBindings, defaultBindings } from '@/input/bindings';
import { rebind } from '@/input/rebind';
import { AIM_IDS, ALERT_KINDS, HINT_IDS, MILESTONE_IDS } from '@/sim/types';
import {
  AIM_TEXT, ALERT_TEXT, HINT_TEXT, MILESTONE_TEXT, alertText, buildControlsReference, controlsMarkdown, formatText,
  milestoneText, templateTokens, FLIGHT_ENTRY, LOSS_ENTRY, WINTER_REPORT,
} from './index';

describe('milestones against GDD 06 section 8', () => {
  const rows = [...gdd06.matchAll(/^\| `(ms-[a-z0-9-]+)`[^|]*\| ([^|]+) \|/gm)].map((m) => ({ id: m[1], title: m[2].trim() }));

  it('parses the GDD table', () => {
    expect(rows.length).toBeGreaterThanOrEqual(58);
  });

  it('covers every GDD milestone id and keeps its title', () => {
    const ids = new Set<string>(MILESTONE_IDS);
    const diffs: string[] = [];
    for (const r of rows) {
      if (!ids.has(r.id)) { diffs.push(`${r.id}: not in MILESTONE_IDS`); continue; }
      const t = MILESTONE_TEXT[r.id as keyof typeof MILESTONE_TEXT];
      if (t.title !== r.title) diffs.push(`${r.id}: GDD "${r.title}" vs "${t.title}"`);
    }
    expect(diffs).toEqual([]);
  });
});

describe('hints and aims against GDD 08 section 9', () => {
  it('every hint that teaches a key names a real action or axis, and every hint id has text', () => {
    const ids = new Set([...ACTIONS.map((a) => a.id), ...AXES.map((a) => a.id)]);
    for (const id of HINT_IDS) {
      const h = HINT_TEXT[id];
      expect(h.verb.length, id).toBeGreaterThan(0);
      if (h.action !== null) expect(ids.has(h.action), `${id} -> ${h.action}`).toBe(true);
    }
  });

  it('keeps the verbs of the GDD hint table', () => {
    const rows = [...gdd08.matchAll(/^\| \d+ \| `(hint-[a-z-]+)` \|.*?\| `\[[^\]]*\] ([^`]+)` \|/gm)];
    expect(rows.length).toBeGreaterThan(10);
    const diffs: string[] = [];
    for (const [, id, verb] of rows) {
      const h = HINT_TEXT[id as keyof typeof HINT_TEXT];
      if (!h) { diffs.push(`${id}: missing`); continue; }
      // GDD writes "Pick up <item>": the table holds the verb phrase, the item is appended by the UI.
      const want = verb.replace(/ <.*>$/, '');
      if (h.verb !== want) diffs.push(`${id}: GDD "${want}" vs "${h.verb}"`);
    }
    expect(diffs).toEqual([]);
  });

  it('has a non-empty text for every aim id', () => {
    for (const id of AIM_IDS) expect(AIM_TEXT[id].text.trim().length, id).toBeGreaterThan(4);
  });
});

describe('plural and count wording (counts of 1 and 0)', () => {
  // A count token can be 1: the last queen alone is "Only 1 ants remain". These tests demonstrate wording that is
  // ungrammatical for n = 1; a fix can use a plural helper or reworded templates.
  const ONE_PLURAL = /\b1 (ants|workers|larvae|queens|winged ants|game hours|game days)\b/;

  it('alert titles and causes read correctly for a count of one', () => {
    const bad: string[] = [];
    const tokens = { n: 1, larvae: 1, h: 1, days: 1, p: '1', c: '1', pct: 1, winterDays: 1, x: 1 };
    for (const kind of ALERT_KINDS) {
      const a = alertText(kind, tokens);
      for (const f of [a.title, a.cause]) if (ONE_PLURAL.test(f)) bad.push(`${kind}: ${f}`);
    }
    expect(bad).toEqual([]);
  });

  it('journal reports read correctly for one', () => {
    const bad: string[] = [];
    for (const [name, tmpl] of [['flight', FLIGHT_ENTRY.text], ['loss', LOSS_ENTRY.text], ['winter', WINTER_REPORT.survived]] as const) {
      const t = formatText(tmpl, { n: 1, launched: 1, mated: 1, daughters: 1, cold: 1, starvation: 1, c: 1, p: 1 });
      if (/\b1 (ants|workers|queens|winged ants)\b/.test(t)) bad.push(`${name}: ${t}`);
    }
    expect(bad).toEqual([]);
  });
});

describe('format edge cases', () => {
  it('does not interpret replacement patterns in token values', () => {
    expect(formatText('a {x} b', { x: '$& $1 $$' })).toBe('a $& $1 $$ b');
  });

  it('does not expand tokens inside token values', () => {
    expect(formatText('{a}', { a: '{b}', b: 'no' })).toBe('{b}');
  });

  it('writes numbers as given, including 0, negative and NaN (callers own formatting)', () => {
    expect(formatText('{n}', { n: 0 })).toBe('0');
    expect(formatText('{n}', { n: -3 })).toBe('-3');
    expect(formatText('{n}', { n: NaN })).toBe('NaN');
  });

  it('keeps every template token resolvable: no template uses a token the sample cannot fill', () => {
    for (const kind of ALERT_KINDS) {
      const have = Object.keys(ALERT_TEXT[kind].sample);
      for (const f of ['title', 'cause'] as const) for (const t of templateTokens(ALERT_TEXT[kind][f])) expect(have, `${kind} {${t}}`).toContain(t);
    }
  });

  it('milestoneText of a template with a token but no tokens leaves the token visible (review aid)', () => {
    expect(milestoneText('ms-first-shaft').text).toContain('{depth_mm}');
  });
});

describe('controls reference edge cases', () => {
  it('lists each button action exactly once and each axis once', () => {
    const rows = buildControlsReference().flatMap((g) => g.rows);
    const ids = rows.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of BUTTON_ACTIONS) expect(ids, a.id).toContain(a.id);
    for (const a of AXES) expect(ids, a.id).toContain(a.id);
  });

  it('follows a rebinding in both the rows and the Markdown', () => {
    const set = cloneBindings(defaultBindings());
    const r = rebind(set, 'dig', 0, { kind: 'key', code: 'KeyN' }, 'swap');
    expect(r.status).toBe('applied');
    if (r.status !== 'applied') return;
    const row = buildControlsReference(r.bindings).flatMap((g) => g.rows).find((x) => x.id === 'dig')!;
    expect(row.keyboard).toContain('N');
    expect(controlsMarkdown(r.bindings)).not.toBe(controlsMarkdown());
  });

  it('writes "none" and not an empty cell for an unbound action', () => {
    const set = cloneBindings(defaultBindings());
    set.kbm['share-food'] = [null, null];
    set.pad['share-food'] = null;
    const row = buildControlsReference(set).flatMap((g) => g.rows).find((x) => x.id === 'share-food')!;
    expect(row.keyboard).toBe('none');
    expect(row.gamepad).toBe('none');
    for (const line of controlsMarkdown(set).split('\n')) if (line.startsWith('|')) expect(line).not.toMatch(/\|\s*\|/);
  });

  it('does not let a "|" in a label break a Markdown table row', () => {
    for (const line of controlsMarkdown().split('\n')) {
      if (!line.startsWith('|')) continue;
      expect(line.split('|').length, line).toBe(5); // leading, three cells, trailing
    }
  });

  it('is deterministic and does not mutate the binding set', () => {
    const set = defaultBindings();
    const before = JSON.stringify(set);
    const a = controlsMarkdown(set);
    const b = controlsMarkdown(set);
    expect(a).toBe(b);
    expect(JSON.stringify(set)).toBe(before);
  });
});
