import { describe, expect, it } from 'vitest';
import { createPrefsStore, defaultPrefs, mergePrefs, PREFS_STORAGE_KEY, sanitizePrefs, type StorageLike } from './prefs';
import { tokensCss } from './tokens';

function fakeStorage(initial: Record<string, string> = {}, failWrites = false): StorageLike & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { if (failWrites) throw new Error('quota'); data[k] = v; },
  };
}

describe('UI preferences', () => {
  it('defaults follow GDD 08 7.4 (UI scale 100 %, reduced motion System, autosave 5 min)', () => {
    const d = defaultPrefs();
    expect(d.accessibility.uiScale).toBe(1);
    expect(d.accessibility.reducedMotion).toBe('system');
    expect(d.gameplay.autosaveMinutes).toBe(5);
    expect(d.audio.ambience).toBeCloseTo(0.8);
    expect(d.audio.interface).toBeCloseTo(0.6);
  });

  it('sanitising keeps valid values and repairs malformed ones field by field', () => {
    const p = sanitizePrefs({ accessibility: { uiScale: 1.37, textScale: 2, font: 'comic', highContrast: 'yes', reducedMotion: 'on' }, audio: { music: 7 }, gameplay: { autosaveMinutes: 3 } });
    expect(p.accessibility.uiScale).toBe(1.4); // snapped to 0.1
    expect(p.accessibility.textScale).toBe(1);
    expect(p.accessibility.font).toBe('standard');
    expect(p.accessibility.highContrast).toBe(false);
    expect(p.accessibility.reducedMotion).toBe('on');
    expect(p.audio.music).toBe(1);
    expect(p.gameplay.autosaveMinutes).toBe(5);
    expect(sanitizePrefs(null)).toEqual(defaultPrefs());
  });

  it('merging patches one level deep and re-validates', () => {
    const m = mergePrefs(defaultPrefs(), { accessibility: { uiScale: 1.5 }, audio: { mono: true } });
    expect(m.accessibility.uiScale).toBe(1.5);
    expect(m.accessibility.font).toBe('standard');
    expect(m.audio.mono).toBe(true);
    expect(mergePrefs(m, { accessibility: { uiScale: 9 } }).accessibility.uiScale).toBe(1.5);
  });

  it('persists to storage and reloads', () => {
    const st = fakeStorage();
    const a = createPrefsStore(st);
    a.set({ accessibility: { uiScale: 0.8, highContrast: true } });
    expect(JSON.parse(st.data[PREFS_STORAGE_KEY]).accessibility.uiScale).toBe(0.8);
    const b = createPrefsStore(st);
    expect(b.prefs.value.accessibility.uiScale).toBe(0.8);
    expect(b.prefs.value.accessibility.highContrast).toBe(true);
    expect(b.persistent.value).toBe(true);
  });

  it('works without storage and flags it (Settings shows "cannot be stored")', () => {
    const none = createPrefsStore(null);
    expect(none.persistent.value).toBe(false);
    none.set({ audio: { mono: true } });
    expect(none.prefs.value.audio.mono).toBe(true);
    const broken = createPrefsStore(fakeStorage({}, true));
    expect(broken.persistent.value).toBe(true);
    broken.set({ audio: { mono: true } });
    expect(broken.persistent.value).toBe(false);
    expect(broken.prefs.value.audio.mono).toBe(true);
  });

  it('survives corrupt stored JSON', () => {
    const st = fakeStorage({ [PREFS_STORAGE_KEY]: '{not json' });
    const s = createPrefsStore(st);
    expect(s.prefs.value).toEqual(defaultPrefs());
    expect(s.persistent.value).toBe(false);
  });
});

describe('design tokens as CSS', () => {
  const css = tokensCss();
  it('emits the colour, spacing, radius, elevation and motion variables of GDD 08 2', () => {
    expect(css).toContain('--c-text: #EEE7D7;');
    expect(css).toContain('--c-panel: rgba(22, 19, 15, 0.9);');
    expect(css).toContain('--c-accent: #E2B04A;');
    expect(css).toContain('--s-9: 4rem;');
    expect(css).toContain('--r-m: 0.5rem;');
    expect(css).toContain('--e-3: rgba(10,8,6,.55);');
    expect(css).toContain('--m-standard: 240ms;');
    expect(css).toContain('--t-h1: max(11px, calc(1.75rem * var(--text-scale)));');
  });
  it('has the high-contrast and hyperlegible overrides', () => {
    expect(css).toContain(':root[data-contrast="high"]');
    expect(css).toContain('--c-panel: #000000;');
    expect(css).toContain(':root[data-font="hyperlegible"]');
  });
});
