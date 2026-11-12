// Codex data (task codex-content, acceptance 1): every id of the design index has an entry with a title and a body of
// 60 to 140 words, and no entry breaks the wording rules (GDD 08: no first-person ant speech, no jokes, no avoided words).
import { describe, expect, it } from 'vitest';
import { allCodexIds, SPECIES_IDS } from '@/sim/types/ids';
import {
  ALL_CODEX_ENTRIES, CODEX_BODY_MAX_WORDS, CODEX_BODY_MIN_WORDS, CODEX_CATEGORY_IDS, codexCategories, codexCategoryCounts,
  entryAppliesTo, getCodexEntry, hasCodexEntry, listCodexEntries, relatedEntries,
} from './index';
import { AVOIDED_WORDS, wordCount, wordingProblems } from './banned';
import { controlsForEntry } from '../index';

/** Exact lower-case phrases that may appear although a rule would flag them: the mandated title of the orders entry. */
const ALLOW: Record<string, readonly string[]> = { 'cx-interface-orders': ['orders without a commander'] };

const IDS = allCodexIds();

describe('codex entries cover the design index', () => {
  it('has exactly one entry for every codex id, and no others', () => {
    const have = ALL_CODEX_ENTRIES.map((e) => e.id);
    expect(new Set(have).size).toBe(have.length);
    expect(have.filter((id) => !IDS.includes(id))).toEqual([]);
    expect(IDS.filter((id) => !have.includes(id))).toEqual([]);
  });

  it('gives every id a non-empty title and a body within the word bounds', () => {
    for (const id of IDS) {
      const e = getCodexEntry(id);
      expect(e, id).toBeDefined();
      expect(e!.title.trim().length, `${id} title`).toBeGreaterThan(0);
      const n = wordCount(e!.body);
      expect(n, `${id} body has ${n} words`).toBeGreaterThanOrEqual(CODEX_BODY_MIN_WORDS);
      expect(n, `${id} body has ${n} words`).toBeLessThanOrEqual(CODEX_BODY_MAX_WORDS);
    }
  });

  it('leaves no placeholder text', () => {
    for (const e of ALL_CODEX_ENTRIES) {
      for (const text of [e.title, e.body, e.inGame ?? '']) {
        expect(text, e.id).not.toMatch(/\b(TODO|TBD|FIXME|lorem|placeholder|XXX)\b/i);
        expect(text, e.id).not.toMatch(/\{[a-z_]+\}/);
      }
    }
  });

  it('uses valid categories, tags and related ids', () => {
    for (const e of ALL_CODEX_ENTRIES) {
      expect(CODEX_CATEGORY_IDS, e.id).toContain(e.category);
      expect(e.species.length, e.id).toBeGreaterThan(0);
      for (const r of e.related ?? []) expect(hasCodexEntry(r), `${e.id} -> ${r}`).toBe(true);
      expect(e.related ?? [], e.id).not.toContain(e.id);
    }
  });
});

describe('codex wording rules', () => {
  it('has no avoided words, first-person speech, jokes, dialogue or institutions', () => {
    for (const e of ALL_CODEX_ENTRIES) {
      const allow = ALLOW[e.id] ?? [];
      for (const [field, text] of [['title', e.title], ['body', e.body], ['inGame', e.inGame ?? '']] as const) {
        const problems = wordingProblems(text, allow);
        expect(problems, `${e.id} ${field}`).toEqual([]);
      }
    }
  });

  it('flags what it is meant to flag', () => {
    expect(wordingProblems('We found it!').map((p) => p.rule).sort()).toEqual(['first-person', 'joke']);
    expect(wordingProblems('The queen said "go".').length).toBeGreaterThan(0);
    for (const w of ['The enemy fell.', 'A great victory.', 'A truce was kept.', 'The soldiers marched.', 'A battle began.']) {
      expect(wordingProblems(w).some((p) => p.rule === 'avoided-word'), w).toBe(true);
    }
    expect(wordingProblems('Rival workers drove the colony off the boundary.')).toEqual([]);
    expect(AVOIDED_WORDS).toContain('war');
  });

  it('writes the rival relation wording of GDD 08 §6.4 in the rival entries', () => {
    const slabs = getCodexEntry('cx-pavement-wars')!;
    expect(slabs.title).toBe('Boundary disputes on the slabs');
    expect(slabs.inGame).toContain('Territorial dispute');
    expect(getCodexEntry('cx-formica')!.body).toContain('boundary contests');
  });
});

describe('codex honesty about the game (directions K, GDD 06 §10)', () => {
  it('says that real colonies are larger than the game\'s in every species entry', () => {
    for (const id of SPECIES_IDS) {
      const e = getCodexEntry(`cx-species-${id}`)!;
      expect(e.inGame, id).toMatch(/cap|1,500|1,200/);
    }
  });

  it('labels queen directives as an abstraction', () => {
    const e = getCodexEntry('cx-interface-orders')!;
    expect(e.body).toMatch(/simplification for play/);
    expect(e.body).toMatch(/No queen gives orders/);
    expect(getCodexEntry('cx-interface-markers')!.body).toMatch(/abstraction/);
  });

  it('labels brood raiding as a mechanic of the game with thin evidence', () => {
    const e = getCodexEntry('cx-cofounding')!;
    expect(e.inGame).toMatch(/Brood raiding/);
    expect(e.inGame).toMatch(/not documented for the black garden ant/);
  });

  it('does not state as fact what the dossiers mark as unsupported', () => {
    // GDD 06 §10 draft claims that the fact-check removed or downgraded (see the report's contradiction list).
    expect(getCodexEntry('cx-queen-reserves')!.body).not.toMatch(/half her weight|roughly half/);
    expect(getCodexEntry('cx-claustral-founding')!.body).toMatch(/assumption, not a measurement/);
    expect(getCodexEntry('cx-callow')!.body).not.toMatch(/about an hour/);
    expect(getCodexEntry('cx-nuptial-flight')!.body).not.toMatch(/\bhumidity\b/);
    expect(getCodexEntry('cx-seed-classes')!.body).toMatch(/soft edge/);
  });
});

describe('codex lookup API', () => {
  it('finds an entry by id and returns undefined otherwise', () => {
    expect(getCodexEntry('cx-trophallaxis')?.title).toBe('Mouth to mouth');
    expect(getCodexEntry('cx-nope')).toBeUndefined();
    expect(hasCodexEntry('cx-nope')).toBe(false);
  });

  it('lists in rail order and filters by category, species and text', () => {
    const all = listCodexEntries();
    expect(all.length).toBe(IDS.length);
    const rank = (c: string) => CODEX_CATEGORY_IDS.indexOf(c as (typeof CODEX_CATEGORY_IDS)[number]);
    for (let i = 1; i < all.length; i++) expect(rank(all[i].category)).toBeGreaterThanOrEqual(rank(all[i - 1].category));
    expect(listCodexEntries({ category: 'species' }).map((e) => e.id)).toEqual(SPECIES_IDS.map((s) => `cx-species-${s}`));
    const atta = listCodexEntries({ species: 'AT' });
    expect(atta.some((e) => e.id === 'cx-fungus-garden')).toBe(true);
    expect(atta.some((e) => e.id === 'cx-wood-moisture')).toBe(false);
    expect(atta.some((e) => e.species.includes('ALL'))).toBe(true);
    expect(listCodexEntries({ text: 'MOUTH TO MOUTH' }).map((e) => e.id)).toContain('cx-trophallaxis');
    expect(listCodexEntries({ category: 'interface', species: 'LN' }).length).toBe(4);
  });

  it('counts entries per category and names the categories as GDD 08 §7.3 does', () => {
    const counts = codexCategoryCounts();
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(IDS.length);
    expect(codexCategories().map((c) => c.title)).toEqual([
      'Species', 'Castes and anatomy', 'Behaviours', 'Creatures', 'Plants and food', 'Habitats and materials',
      'Weather and seasons', 'Human activity', 'Interface (manual)',
    ]);
    for (const c of CODEX_CATEGORY_IDS) expect(counts[c], c).toBeGreaterThan(0);
  });

  it('resolves related entries and species applicability', () => {
    expect(relatedEntries('cx-honeydew').map((e) => e.id)).toContain('cx-aphid-tending');
    expect(relatedEntries('cx-nope')).toEqual([]);
    expect(entryAppliesTo(getCodexEntry('cx-wood-moisture')!, 'CP')).toBe(true);
    expect(entryAppliesTo(getCodexEntry('cx-wood-moisture')!, 'LN')).toBe(false);
    expect(entryAppliesTo(getCodexEntry('cx-dew')!, 'MB')).toBe(true);
  });

  it('marks the manual entries that are always unlocked, and names the controls they list', () => {
    const always = ALL_CODEX_ENTRIES.filter((e) => e.alwaysUnlocked).map((e) => e.id).sort();
    expect(always).toEqual(['cx-interface-markers', 'cx-interface-time', 'cx-interface-why']);
    expect(getCodexEntry('cx-interface-orders')!.alwaysUnlocked).toBeUndefined();
    for (const e of listCodexEntries({ category: 'interface' })) expect(e.controlActions?.length, e.id).toBeGreaterThan(0);
    const rows = controlsForEntry('cx-interface-time');
    expect(rows.map((r) => r.id)).toEqual(['pause-toggle', 'speed-1', 'speed-2', 'speed-4', 'speed-8', 'skip-ahead']);
    expect(rows[0].keyboard).toBe('P or Pause');
    expect(controlsForEntry('cx-nope')).toEqual([]);
  });

  it('keeps ids stable: the interface entries are the manual (GDD 08 §9.4)', () => {
    expect(listCodexEntries({ category: 'interface' }).map((e) => e.id).sort()).toEqual([
      'cx-interface-markers', 'cx-interface-orders', 'cx-interface-time', 'cx-interface-why',
    ]);
  });
});
