// Reviewer tests (ui-shell verify): seed rules, the New Game request, preset values against GDD 08 3.7, the text
// export round trip, save descriptions and the routing transitions of GDD 01 1.1 / GDD 08 3.1.
import { describe, expect, it } from 'vitest';
import { ARCHETYPE_DEFS } from '@/worldgen/tuning/archetypes';
import { seedFromText } from '@/worldgen/params';
import { allowedOverlays, initialNav, onModeChange, openOverlay, type NavState } from './nav';
import { applyPreset, buildRequest, defaultForm, isCustom, presetRules, setRule } from './newgame/form';
import { fnv1a32, formatSeedCode, nextSeedText, resolveSeed } from './newgame/seed';
import { agoText, newestSave } from './saves/describe';
import { base64ToBytes, checkImportText, exportText } from './saves/saveText';
import type { SaveSlotInfo } from '../api';

describe('seed field (GDD 08 3.7)', () => {
  it('accepts the 8-hex code in any case, with or without the hyphen, with surrounding spaces', () => {
    for (const t of ['4F7A21C9', '4f7a-21c9', '  4F7A-21C9  ']) {
      const r = resolveSeed(t);
      expect(r.value, t).toBe(0x4f7a21c9);
      expect(r.mode).toBe('hex');
      expect(r.code).toBe('4F7A-21C9');
    }
  });
  it('anything else is FNV-1a 32 of the text, the same function the generator uses for free text', () => {
    for (const t of ['oak-17', '4F7A--21C9', '4F7A21C', 'Garden ant ✓']) {
      expect(resolveSeed(t).mode, t).toBe('hash');
      expect(resolveSeed(t).value).toBe(fnv1a32(t.trim()));
      expect(resolveSeed(t).value).toBe(seedFromText(t));
    }
  });
  it('codes are always 8 hex digits, values are uint32', () => {
    expect(formatSeedCode(0)).toBe('0000-0000');
    expect(formatSeedCode(-1)).toBe('FFFF-FFFF');
    expect(formatSeedCode(2 ** 32 + 5)).toBe('0000-0005');
  });
  it('Try another seed increments by one and wraps at the top', () => {
    expect(nextSeedText('4F7A-21C9')).toBe('4F7A-21CA');
    expect(nextSeedText('FFFF-FFFF')).toBe('0000-0000');
    expect(resolveSeed(nextSeedText('oak')).value).toBe((fnv1a32('oak') + 1) >>> 0);
  });
});

describe('New Game request', () => {
  it('carries the displayed seed, and only the rules that differ from the preset', () => {
    const f = defaultForm('4F7A-21C9');
    const r = buildRequest(f);
    expect(r.seed).toBe(0x4f7a21c9);
    expect(r.customRules).toBeUndefined();
    const g = setRule(f, 'rivals', 0);
    expect(isCustom(g)).toBe(true);
    expect(buildRequest(g).customRules).toEqual({ rivals: 0 });
    // choosing a preset again clears the custom state
    expect(isCustom(applyPreset(g, 'naturalist'))).toBe(false);
  });
  it('"Random" locality resolves deterministically from the seed to a tier-1 archetype the species can live in', () => {
    const f = { ...defaultForm('0000-0001'), archetype: 'random' as const };
    const a = buildRequest(f).archetype!;
    expect(buildRequest(f).archetype).toBe(a);
    expect(ARCHETYPE_DEFS[a].tier).toBe(1);
    expect(ARCHETYPE_DEFS[a].fit['lasius-niger']).toBeGreaterThan(0);
  });
  it('preset rule values agree with the GDD 08 3.7 table for predators, rivals, leniency and collapse', () => {
    const table = {
      gentle: { predators: 'few', rivals: 2, foundingLeniency: 'lenient', collapse: false, seasonLengthDays: 7 },
      naturalist: { predators: 'normal', rivals: 3, foundingLeniency: 'normal', collapse: true, seasonLengthDays: 7 },
      harsh: { predators: 'many', rivals: 4, foundingLeniency: 'strict', collapse: true, seasonLengthDays: 7 },
    } as const;
    for (const id of ['gentle', 'naturalist', 'harsh'] as const) expect(presetRules(id)).toMatchObject(table[id]);
  });
});

describe('text export (GDD 08 7.6, Appendix E check 13)', () => {
  it('round-trips binary across the 32 KiB chunk boundary', () => {
    const bytes = new Uint8Array(0x8000 * 2 + 7);
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 131 + 7) & 255;
    const text = exportText(bytes);
    expect(text.startsWith('FOUNDRESS1:')).toBe(true);
    const c = checkImportText(text);
    expect(c.ok).toBe(true);
    if (c.ok) expect(Array.from(base64ToBytes(c.text.slice('FOUNDRESS1:'.length)))).toEqual(Array.from(bytes));
  });
  it('tolerates the line breaks and spaces a mail client or chat adds', () => {
    const text = exportText(new Uint8Array([1, 2, 3, 4, 5, 250]));
    const wrapped = `  ${text.slice(0, 15)}\n${text.slice(15, 18)} \r\n${text.slice(18)}\n`;
    const c = checkImportText(wrapped);
    expect(c.ok).toBe(true);
    if (c.ok) expect(c.text).toBe(text);
  });
  it('refuses empty, foreign and damaged text with a message', () => {
    for (const t of ['', '   ', 'FOUNDRESS1:', 'SAVE:abcd', 'FOUNDRESS1:ab$d', 'FOUNDRESS1:abcde']) {
      const c = checkImportText(t);
      expect(c.ok, t).toBe(false);
      if (!c.ok) expect(c.error.length).toBeGreaterThan(10);
    }
  });
});

describe('save descriptions', () => {
  const s = (slot: string, savedAt: string): SaveSlotInfo => ({ slot, label: slot, savedAt, colonyDay: 1, workers: 1 });
  it('Continue picks the newest valid timestamp and ignores unreadable ones', () => {
    expect(newestSave([])).toBeNull();
    expect(newestSave([s('a', 'garbage'), s('b', '2026-01-01T00:00:00Z')])?.slot).toBe('b');
    expect(newestSave([s('b', '2026-01-01T00:00:00Z'), s('a', 'garbage')])?.slot).toBe('b');
    expect(newestSave([s('a', '2026-01-01T00:00:00Z'), s('b', '2026-03-01T00:00:00Z'), s('c', '2026-02-01T00:00:00Z')])?.slot).toBe('b');
  });
  it('"Saved ... ago" text', () => {
    expect(agoText(0)).toBe('just now');
    expect(agoText(30)).toBe('30 s ago');
    expect(agoText(180)).toBe('3 min ago');
    expect(agoText(3 * 3600)).toBe('3 h ago');
  });
});

describe('routing transitions (GDD 01 1.1, GDD 08 3.1)', () => {
  it('Settings and Save/Load open over the pause menu; New Game only over the title', () => {
    expect(allowedOverlays('paused')).toEqual(expect.arrayContaining(['settings', 'save-load']));
    expect(allowedOverlays('title')).toEqual(expect.arrayContaining(['new-game', 'save-load', 'settings', 'credits']));
  });
  it('a failed load that goes back to the title does not reopen New Game left over from an earlier cancelled start', () => {
    // New Game -> Begin -> loading -> Cancel -> title (New Game reopened, memory cleared)
    let n: NavState = { ...openOverlay(initialNav(), 'new-game'), afterLoadingCancel: 'new-game' };
    n = onModeChange(n, 'title', 'loading');
    n = onModeChange(n, 'loading', 'title');
    expect(n.stack).toEqual(['new-game']);
    // the player then leaves New Game and uses Continue; that load fails and Back returns to the title
    n = { ...n, stack: [] };
    n = onModeChange(n, 'title', 'loading');
    n = onModeChange(n, 'loading', 'title');
    expect(n.stack).toEqual([]);
  });
});
