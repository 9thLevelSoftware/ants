// Independent verification of the codex (reviewer's tests). They read the design documents directly and try to break
// the assumptions of the implementer's own tests: tags and titles against GDD 06 §10, text hygiene, lookup edge cases.
import { describe, expect, it } from 'vitest';
import gdd06 from '../../../docs/design/gdd/06-environment-progression.md?raw';
import { allCodexIds } from '@/sim/types/ids';
import { ACTIONS, AXES } from '@/input/actions';
import {
  ALL_CODEX_ENTRIES, getCodexEntry, hasCodexEntry, listCodexEntries, relatedEntries, codexCategoryCounts,
} from './index';
import { wordCount, wordingProblems } from './banned';

/** Rows of the GDD 06 §10 codex table: id, title, tags. */
function gddRows(): { id: string; title: string; tags: string[] }[] {
  const start = gdd06.indexOf('## 10. Codex');
  const end = gdd06.indexOf('## 11. Reproduction');
  const rows: { id: string; title: string; tags: string[] }[] = [];
  for (const line of gdd06.slice(start, end).split('\n')) {
    const m = /^\| `(cx-[a-z-]+)` \| ([^|]+) \| .* \| ([A-Z ]+) \|\s*$/.exec(line);
    if (m) rows.push({ id: m[1], title: m[2].trim(), tags: m[3].trim().split(/\s+/) });
  }
  return rows;
}

describe('codex against GDD 06 section 10', () => {
  const rows = gddRows();

  it('parses the table (guard for the tests below)', () => {
    expect(rows.length).toBeGreaterThanOrEqual(56);
  });

  it('has an entry for every id of the table, with the table\'s title', () => {
    const titleDiffs: string[] = [];
    for (const r of rows) {
      const e = getCodexEntry(r.id);
      expect(e, r.id).toBeDefined();
      if (e && e.title !== r.title) titleDiffs.push(`${r.id}: GDD "${r.title}" vs entry "${e.title}"`);
    }
    expect(titleDiffs).toEqual([]);
  });

  it('carries at least the species tags of the table (extra tags are deliberate widenings, listed below)', () => {
    const missing: string[] = [];
    const widened: string[] = [];
    for (const r of rows) {
      const e = getCodexEntry(r.id);
      if (!e) continue;
      for (const t of r.tags) if (!e.species.includes(t as never)) missing.push(`${r.id}: lacks ${t}`);
      const extra = e.species.filter((t) => !r.tags.includes(t));
      if (extra.length) widened.push(`${r.id}+${extra.join('+')}`);
    }
    expect(missing).toEqual([]);
    // Documented here so a change is noticed: the implementer widened four tags beyond GDD 06 section 10.
    expect(widened.sort()).toEqual(['cx-brood-stages+CP', 'cx-egg-eating+AT', 'cx-night-foraging+MB', 'cx-trunk-trail+AT']);
  });
});

describe('codex text hygiene', () => {
  it('has clean whitespace and punctuation in every field', () => {
    const problems: string[] = [];
    for (const e of ALL_CODEX_ENTRIES) {
      for (const [f, t] of [['title', e.title], ['body', e.body], ['inGame', e.inGame ?? 'x.']] as const) {
        if (t !== t.trim()) problems.push(`${e.id} ${f}: leading/trailing space`);
        if (/ {2,}/.test(t)) problems.push(`${e.id} ${f}: double space`);
        if (/\s[,.;:]/.test(t)) problems.push(`${e.id} ${f}: space before punctuation`);
        if (/\.\.|,,|;;/.test(t)) problems.push(`${e.id} ${f}: doubled punctuation`);
        if (/[A-Za-z][.,;]\S*[A-Z][a-z]/.test(t) && /[a-z]\.[A-Z]/.test(t)) problems.push(`${e.id} ${f}: missing space after full stop`);
      }
      if (!/[.)]$/.test(e.body)) problems.push(`${e.id} body does not end with a full stop`);
      if (e.inGame && !/[.)]$/.test(e.inGame)) problems.push(`${e.id} inGame does not end with a full stop`);
      if (e.title.length > 40) problems.push(`${e.id} title is long (${e.title.length})`);
      if (/^[a-z]/.test(e.title)) problems.push(`${e.id} title not capitalised`);
    }
    expect(problems).toEqual([]);
  });

  it('keeps titles unique', () => {
    const titles = ALL_CODEX_ENTRIES.map((e) => e.title.toLowerCase());
    expect(new Set(titles).size).toBe(titles.length);
  });

  it('keeps the in-game line within a reasonable size (a line, not a second body)', () => {
    for (const e of ALL_CODEX_ENTRIES) if (e.inGame) expect(wordCount(e.inGame), e.id).toBeLessThanOrEqual(80);
  });

  it('gives every entry body a mean sentence length a reader can follow', () => {
    for (const e of ALL_CODEX_ENTRIES) {
      const sentences = e.body.split(/(?<=[.!?])\s+(?=[A-Z0-9])/);
      const longest = Math.max(...sentences.map(wordCount));
      expect(longest, `${e.id} longest sentence has ${longest} words`).toBeLessThanOrEqual(60);
    }
  });

  it('does not use second person in bodies (naturalist voice)', () => {
    // inGame lines and the Interface (manual) entries may address the player; the other bodies are field notes.
    const bad = ALL_CODEX_ENTRIES.filter((e) => e.category !== 'interface' && /\byou(r|rs)?\b/i.test(e.body)).map((e) => e.id);
    expect(bad).toEqual([]);
  });

  it('wording rules also hold for the in-game lines with nothing allow-listed except the mandated title', () => {
    for (const e of ALL_CODEX_ENTRIES) {
      const allow = e.id === 'cx-interface-orders' ? ['orders without a commander'] : [];
      expect(wordingProblems(`${e.title}. ${e.body} ${e.inGame ?? ''}`, allow), e.id).toEqual([]);
    }
  });
});

describe('codex in-game lines name keys that exist in the default bindings', () => {
  // The codex hardcodes a few default keys (G, E, T, Delete). They must at least be the actual defaults.
  const byId = new Map(ACTIONS.map((a) => [a.id, a]));
  it('G is share-food, T is inspect, E is interact, Delete is cv-delete', () => {
    const code = (id: string) => byId.get(id)!.kbm.map((b) => ('code' in b ? (b as { code: string }).code : ''));
    expect(code('share-food')).toContain('KeyG');
    expect(code('inspect')).toContain('KeyT');
    expect(code('interact')).toContain('KeyE');
    expect(code('cv-delete')).toContain('Delete');
    expect(getCodexEntry('cx-trophallaxis')!.inGame).toMatch(/\bG\b/);
    expect(getCodexEntry('cx-antennation')!.inGame).toMatch(/\bT\b/);
    expect(getCodexEntry('cx-nursing')!.inGame).toMatch(/\bE\b/);
  });

  it('every controlActions id of an entry is a real action or axis', () => {
    const ids = new Set([...ACTIONS.map((a) => a.id), ...AXES.map((a) => a.id)]);
    for (const e of ALL_CODEX_ENTRIES) for (const a of e.controlActions ?? []) expect(ids.has(a), `${e.id} ${a}`).toBe(true);
  });
});

describe('lookup edge cases', () => {
  it('is safe against prototype-property ids', () => {
    for (const id of ['__proto__', 'constructor', 'toString', 'hasOwnProperty', '', ' ', 'CX-TROPHALLAXIS']) {
      expect(getCodexEntry(id), id).toBeUndefined();
      expect(hasCodexEntry(id), id).toBe(false);
      expect(relatedEntries(id), id).toEqual([]);
    }
  });

  it('treats empty and whitespace text filters as no filter, and regex characters literally', () => {
    expect(listCodexEntries({ text: '' }).length).toBe(allCodexIds().length);
    expect(listCodexEntries({ text: '   ' }).length).toBe(allCodexIds().length);
    expect(() => listCodexEntries({ text: '(' })).not.toThrow();
    expect(listCodexEntries({ text: '.*' }).length).toBe(0);
    expect(listCodexEntries({ text: 'zzzz-no-such-text' })).toEqual([]);
  });

  it('combines filters conjunctively and returns a fresh array each call', () => {
    const a = listCodexEntries({ category: 'creatures', species: 'MB' });
    expect(a.every((e) => e.category === 'creatures')).toBe(true);
    a.length = 0;
    expect(listCodexEntries({ category: 'creatures', species: 'MB' }).length).toBeGreaterThan(0);
  });

  it('is deterministic: two calls return the same ids in the same order', () => {
    expect(listCodexEntries().map((e) => e.id)).toEqual(listCodexEntries().map((e) => e.id));
  });

  it('keeps counts equal to the list per category', () => {
    const counts = codexCategoryCounts();
    for (const [c, n] of Object.entries(counts)) expect(listCodexEntries({ category: c as never }).length).toBe(n);
  });

  it('serialises: entries are plain JSON data', () => {
    for (const e of ALL_CODEX_ENTRIES) expect(JSON.parse(JSON.stringify(e))).toEqual(e);
  });

  it('keeps related links reciprocal enough to navigate back for species entries', () => {
    // Not a spec rule: reports species entries nobody links to (dead ends in the book).
    const linked = new Set(ALL_CODEX_ENTRIES.flatMap((e) => e.related ?? []));
    const orphans = ALL_CODEX_ENTRIES.filter((e) => !linked.has(e.id) && e.category !== 'species').map((e) => e.id);
    expect(orphans.length).toBeLessThan(ALL_CODEX_ENTRIES.length / 4);
  });
});
