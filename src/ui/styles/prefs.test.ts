import { describe, expect, it } from 'vitest';
import { defaultSettings, SettingsStore, type SettingsPatch } from '@/game/settings/settings';
import { createPrefsStore, defaultPrefs, mergePrefs, prefsFromSettings, sanitizePrefs, settingsPatchFromPrefs, type PrefsPatch, type SettingsSource } from './prefs';
import { tokensCss } from './tokens';

/** A game's settings as the facade exposes them: the real SettingsStore (it validates), plus a settable notice. */
function fakeGame(notice = ''): SettingsSource & { store: SettingsStore; notice: string; writes: SettingsPatch[] } {
  const store = new SettingsStore(defaultSettings());
  const g = {
    store, notice, writes: [] as SettingsPatch[],
    getSettings: () => store.get(),
    setSettings: (p: SettingsPatch) => { g.writes.push(p); store.set(p); },
    settingsNotice: () => g.notice,
  };
  return g;
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

  it('reads the game settings in the units the components use (percent -> factor, minimap word -> boolean, ui bus)', () => {
    const g = fakeGame();
    g.store.set({ accessibility: { uiScale: 150, textScale: 115 }, gameplay: { autosaveMin: 10, minimap: 'always' }, audio: { ui: 0.25 } });
    const s = createPrefsStore(g);
    expect(s.prefs.value.accessibility.uiScale).toBe(1.5);
    expect(s.prefs.value.accessibility.textScale).toBe(1.15);
    expect(s.prefs.value.gameplay.autosaveMinutes).toBe(10);
    expect(s.prefs.value.gameplay.minimap).toBe(true);
    expect(s.prefs.value.audio.interface).toBe(0.25);
  });

  it('writes land in the game settings (foundress.settings.v1 object), in the game units: the one store', () => {
    const g = fakeGame();
    const s = createPrefsStore(g);
    s.set({ accessibility: { uiScale: 1.5, textScale: 1.3, comfortMitesCentipedes: true, soundCueIndicators: true, spiderComfort: 'abstract' } });
    s.set({ gameplay: { autosaveMinutes: 2, minimap: true }, audio: { interface: 0.4, giants: 0.1 } });
    const t = g.store.get();
    expect(t.accessibility).toMatchObject({ uiScale: 150, textScale: 130, comfortMites: true, comfortCentipedes: true, soundCues: true, spiderComfort: 'abstract' });
    expect(t.gameplay).toMatchObject({ autosaveMin: 2, minimap: 'always' });
    expect(t.audio).toMatchObject({ ui: 0.4, giants: 0.1 });
    // and nothing the patch did not name was touched
    expect(t.accessibility.font).toBe('standard');
    expect(t.audio.master).toBe(1);
    expect(s.prefs.value.accessibility.uiScale).toBe(1.5);
  });

  it('every row survives the round trip view -> settings -> view', () => {
    const wanted: PrefsPatch = {
      accessibility: { uiScale: 0.8, textScale: 1.15, font: 'hyperlegible', highContrast: true, reducedMotion: 'on', spiderComfort: 'marker', comfortMitesCentipedes: true, overlayPalette: 'pattern-only', soundCueIndicators: true, flashReduction: false },
      audio: { ambience: 0.1, effects: 0.2, giants: 0.3, interface: 0.4, music: 0.5, musicMode: 'frequent', muteWhenHidden: false, mono: true },
      gameplay: { autosaveMinutes: 0, prompts: 'never', hints: false, minimap: true, focusLine: 'always', milestoneNotices: 'quiet' },
    };
    const g = fakeGame();
    const s = createPrefsStore(g);
    s.set(wanted);
    expect(s.prefs.value).toEqual(mergePrefs(defaultPrefs(), wanted));
    expect(prefsFromSettings(g.store.get())).toEqual(s.prefs.value);
    // an empty patch writes nothing
    expect(settingsPatchFromPrefs({})).toEqual({});
  });

  it('follows changes the game makes by itself (loaded from storage, debug hook) on refresh', () => {
    const g = fakeGame();
    const s = createPrefsStore(g);
    expect(s.prefs.value.accessibility.uiScale).toBe(1);
    g.store.set({ accessibility: { uiScale: 150 } });
    expect(s.prefs.value.accessibility.uiScale).toBe(1); // not until the shell re-reads
    s.refresh();
    expect(s.prefs.value.accessibility.uiScale).toBe(1.5);
    const before = s.prefs.value;
    s.refresh();
    expect(s.prefs.value).toBe(before); // unchanged settings keep the same object (no re-render)
  });

  it('shows the game storage notice: not persistent while the game says settings cannot be stored', () => {
    const g = fakeGame('Settings cannot be stored in this browser context');
    const s = createPrefsStore(g);
    expect(s.persistent.value).toBe(false);
    expect(s.notice.value).toContain('cannot be stored');
    s.set({ audio: { mono: true } });
    expect(s.prefs.value.audio.mono).toBe(true); // still applied for the session
    g.notice = '';
    s.refresh();
    expect(s.persistent.value).toBe(true);
    expect(s.notice.value).toBe('');
  });

  it('works before a game exists (boot screens) and flags it; attaching adopts the game values', () => {
    const none = createPrefsStore(null);
    expect(none.persistent.value).toBe(false);
    none.set({ audio: { mono: true } });
    expect(none.prefs.value.audio.mono).toBe(true);
    const g = fakeGame();
    none.attach(g);
    expect(none.prefs.value.audio.mono).toBe(false);
    expect(none.persistent.value).toBe(true);
  });

  it('a game that throws on read or write leaves the view as it was', () => {
    const g = fakeGame();
    const s = createPrefsStore(g);
    g.getSettings = () => { throw new Error('boom'); };
    g.setSettings = () => { throw new Error('boom'); };
    expect(s.set({ audio: { mono: true } }).audio.mono).toBe(false);
    expect(() => s.refresh()).not.toThrow();
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
