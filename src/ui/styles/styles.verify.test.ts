// Reviewer tests (ui-shell verify): contrast over every token pair the screens actually use, the scale rule at the
// sizes the acceptance checks name, and preference sanitising against hostile stored data.
import { describe, expect, it } from 'vitest';
import { compositeOver, contrastRatio, contrastReport, parseHex, tokenColor, type Rgb } from './contrast';
import { computeScale } from './scale';
import { defaultSettings, SettingsStore, type SettingsPatch } from '@/game/settings/settings';
import { createPrefsStore, prefsFromSettings, sanitizePrefs, type SettingsSource } from './prefs';
import { COLORS, MIN_TEXT_PX, tokensCss, type ColorToken } from './tokens';

const WHITE: Rgb = [255, 255, 255];
const STATUS: ColorToken[] = ['status-ok', 'status-watch', 'status-warn', 'status-bad'];

describe('Appendix E check 3 (contrast report)', () => {
  it('text, text-2, text-3 and every status colour reach 4.5:1 on --c-panel at 0.90 over white; border-strong and focus 3:1', () => {
    const panel = compositeOver(COLORS.panel, WHITE);
    for (const t of ['text', 'text-2', 'text-3', ...STATUS] as ColorToken[]) {
      expect(contrastRatio(parseHex(COLORS[t].hex), panel), t).toBeGreaterThanOrEqual(4.5);
    }
    for (const t of ['border-strong', 'focus'] as ColorToken[]) {
      expect(contrastRatio(parseHex(COLORS[t].hex), panel), t).toBeGreaterThanOrEqual(3);
    }
  });

  it('every row of the report passes in both normal and high-contrast mode', () => {
    for (const hc of [false, true]) {
      const failing = contrastReport(hc).filter((r) => !r.pass).map((r) => `${r.pair} ${r.ratio.toFixed(2)}`);
      expect(failing, `highContrast=${hc}`).toEqual([]);
    }
  });

  it('status words used as text on a raised card inside a book (e.g. "Good / Fair / Poor" on locality cards) stay >= 4.5:1', () => {
    // raised card (alpha 0.94) painted over the book panel (alpha 0.90) over a white sky
    for (const hc of [false, true]) {
      const book = compositeOver(tokenColor('panel', hc), WHITE);
      const card = compositeOver(tokenColor('panel-raised', hc), book);
      for (const t of [...STATUS, 'text-3', 'link', 'accent'] as ColorToken[]) {
        expect(contrastRatio(parseHex(tokenColor(t, hc).hex), card), `${t} hc=${hc}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('text on the accent fill (primary buttons, selected segments) is >= 4.5:1, also in high contrast', () => {
    for (const hc of [false, true]) {
      const ratio = contrastRatio(parseHex(tokenColor('on-accent', hc).hex), parseHex(tokenColor('accent', hc).hex));
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('Appendix E check 2 and the scale rule (GDD 08 2.3)', () => {
  it('UI scale 150 % at 1280 x 720: root font 24 px and compact layout (1280 / 1.5 = 853 dp)', () => {
    const s = computeScale({ viewportW: 1280, viewportH: 720, uiScale: 1.5, textScale: 1 });
    expect(s.rootPx).toBeCloseTo(24, 1);
    expect(s.layout).toBe('compact');
    expect(s.dpW).toBeCloseTo(853.3, 0);
  });

  it('1920 x 1080 at 100 % keeps the 1280 x 720 dp layout (auto scale 1.5)', () => {
    const s = computeScale({ viewportW: 1920, viewportH: 1080, uiScale: 1, textScale: 1 });
    expect(s.autoScale).toBeCloseTo(1.5);
    expect(s.dpW).toBeCloseTo(1280);
    expect(s.dpH).toBeCloseTo(720);
    expect(s.layout).toBe('standard');
  });

  it('80 % at 1280 x 720 is standard with a 12.8 px root', () => {
    const s = computeScale({ viewportW: 1280, viewportH: 720, uiScale: 0.8, textScale: 1 });
    expect(s.rootPx).toBeCloseTo(12.8);
    expect(s.layout).toBe('standard');
  });

  it('auto scale is clamped to 0.75..2.5 and a tiny window is too-small', () => {
    expect(computeScale({ viewportW: 320, viewportH: 200, uiScale: 1, textScale: 1 }).autoScale).toBe(0.75);
    expect(computeScale({ viewportW: 7680, viewportH: 4320, uiScale: 1, textScale: 1 }).autoScale).toBe(2.5);
    expect(computeScale({ viewportW: 400, viewportH: 250, uiScale: 1, textScale: 1 }).layout).toBe('too-small');
  });

  it('out-of-range settings snap into 80..150 % in 10 % steps; unknown text scales fall back to 100 %', () => {
    expect(computeScale({ viewportW: 1280, viewportH: 720, uiScale: 3, textScale: 1 }).uiScale).toBe(1.5);
    expect(computeScale({ viewportW: 1280, viewportH: 720, uiScale: 0.1, textScale: 1 }).uiScale).toBe(0.8);
    expect(computeScale({ viewportW: 1280, viewportH: 720, uiScale: 1.04, textScale: 1 }).uiScale).toBe(1);
    expect(computeScale({ viewportW: 1280, viewportH: 720, uiScale: 1, textScale: 2 }).textScale).toBe(1);
  });

  it('every type token is clamped to the 11 px floor in the generated CSS', () => {
    const css = tokensCss();
    for (const k of ['display', 'h1', 'h2', 'h3', 'body', 'small', 'caption', 'numeric-l']) {
      expect(css).toMatch(new RegExp(`--t-${k}: max\\(${MIN_TEXT_PX}px,`));
    }
  });
});

describe('stored preferences are hostile input', () => {
  it('NaN, strings, nulls and arrays fall back to defaults per field', () => {
    const p = sanitizePrefs({ accessibility: { uiScale: NaN, textScale: '1.3', font: 42, highContrast: 'yes' }, audio: { music: Infinity, effects: -5 }, gameplay: null });
    expect(p.accessibility.uiScale).toBe(1);
    expect(p.accessibility.textScale).toBe(1);
    expect(p.accessibility.font).toBe('standard');
    expect(p.accessibility.highContrast).toBe(false);
    expect(p.audio.music).toBe(0.5);
    expect(p.audio.effects).toBe(0);
    expect(p.gameplay.autosaveMinutes).toBe(5);
    expect(sanitizePrefs([1, 2, 3]).accessibility.uiScale).toBe(1);
  });

  it('a settings object with hostile values still yields a valid view; a source that throws keeps working', () => {
    const hostile = defaultSettings();
    (hostile.accessibility as unknown as Record<string, unknown>).uiScale = NaN;
    (hostile.accessibility as unknown as Record<string, unknown>).textScale = '130 percent';
    (hostile.audio as unknown as Record<string, unknown>).music = Infinity;
    expect(prefsFromSettings(hostile).accessibility.uiScale).toBe(1);
    expect(prefsFromSettings(hostile).accessibility.textScale).toBe(1);
    expect(prefsFromSettings(hostile).audio.music).toBe(0.5);

    const throwing: SettingsSource = { getSettings: () => { throw new Error('SecurityError'); }, setSettings: () => { throw new Error('SecurityError'); } };
    const s = createPrefsStore(throwing);
    expect(s.prefs.value.accessibility.uiScale).toBe(1);
    expect(() => s.set({ accessibility: { uiScale: 1.2 } })).not.toThrow();
  });

  it('a settings storage that cannot be written is reported by the game notice and the value stays for the session', () => {
    const store = new SettingsStore(defaultSettings());
    let notice = '';
    const game: SettingsSource = { getSettings: () => store.get(), setSettings: (p: SettingsPatch) => { store.set(p); notice = 'The last settings change could not be stored'; }, settingsNotice: () => notice };
    const s = createPrefsStore(game);
    expect(s.persistent.value).toBe(true);
    s.set({ gameplay: { minimap: true } });
    expect(s.persistent.value).toBe(false);
    expect(s.prefs.value.gameplay.minimap).toBe(true);
  });
});
