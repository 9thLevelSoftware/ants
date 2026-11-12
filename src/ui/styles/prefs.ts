// The UI's view of the player's settings (GDD 08 7.4, App. A): accessibility (UI scale, text size, font, contrast,
// reduced motion, comfort options), the audio buses and the gameplay rows. There is ONE settings object, the game's
// `GameSettings` (stored under `foundress.settings.v1`); this file owns no storage. `uiPrefs` is a view of it in the
// units the components use (scale as a factor, booleans for the on/off rows), read and written through the
// facade's getSettings / setSettings, so the game's consumers (autosave, audio, comfort options) see every change.
import { signal, type Signal } from '@preact/signals';
import type { GameSettings, SettingsPatch } from '@/game/settings/model';
import { SCALE } from './tokens';
import { snapUiScale } from './scale';

export type FontChoice = 'standard' | 'hyperlegible';
export type MotionChoice = 'system' | 'on' | 'off';
export type SpiderComfort = 'off' | 'softened' | 'abstract' | 'marker';
export type OverlayPalette = 'okabe-ito' | 'high-contrast' | 'pattern-only';
export type MusicMode = 'off' | 'sparse' | 'frequent';
export type PromptsMode = 'always' | 'learning' | 'never';
export type FocusLineMode = 'auto' | 'always' | 'never';
export type MilestoneNotices = 'full' | 'quiet' | 'off';
export type AutosaveMinutes = 0 | 2 | 5 | 10;

export interface UiPrefs {
  accessibility: {
    uiScale: number;
    textScale: number;
    font: FontChoice;
    highContrast: boolean;
    reducedMotion: MotionChoice;
    spiderComfort: SpiderComfort;
    comfortMitesCentipedes: boolean;
    overlayPalette: OverlayPalette;
    soundCueIndicators: boolean;
    flashReduction: boolean;
  };
  audio: {
    /** 0..1 each (GDD 08 7.4 defaults 80/90/90/60/50 %; master lives in GameSettings.audio). */
    ambience: number;
    effects: number;
    giants: number;
    interface: number;
    music: number;
    musicMode: MusicMode;
    muteWhenHidden: boolean;
    mono: boolean;
  };
  gameplay: {
    autosaveMinutes: AutosaveMinutes;
    prompts: PromptsMode;
    hints: boolean;
    minimap: boolean;
    focusLine: FocusLineMode;
    milestoneNotices: MilestoneNotices;
  };
}

export function defaultPrefs(): UiPrefs {
  return {
    accessibility: {
      uiScale: 1, textScale: 1, font: 'standard', highContrast: false, reducedMotion: 'system', spiderComfort: 'off',
      comfortMitesCentipedes: false, overlayPalette: 'okabe-ito', soundCueIndicators: false, flashReduction: true,
    },
    audio: { ambience: 0.8, effects: 0.9, giants: 0.9, interface: 0.6, music: 0.5, musicMode: 'sparse', muteWhenHidden: true, mono: false },
    gameplay: { autosaveMinutes: 5, prompts: 'learning', hints: true, minimap: false, focusLine: 'auto', milestoneNotices: 'full' },
  };
}

export type PrefsPatch = { [K in keyof UiPrefs]?: Partial<UiPrefs[K]> };

/** The slice of the GameFacade the store needs (the real game, the demo's mock, or a test double). */
export interface SettingsSource {
  getSettings(): GameSettings;
  setSettings(patch: SettingsPatch): void;
  /** '' when settings are stored fine; else the Settings header notice (storage unavailable, write failed). */
  settingsNotice?(): string;
}

export const NO_STORAGE_NOTICE = 'Settings cannot be stored in this browser context. They last until you close the page.';

function pickEnum<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}
const num = (v: unknown, lo: number, hi: number, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback);
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);

/** Validates untyped data against the defaults; anything malformed falls back per field. Never throws. */
export function sanitizePrefs(raw: unknown): UiPrefs {
  const d = defaultPrefs();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as { accessibility?: Record<string, unknown>; audio?: Record<string, unknown>; gameplay?: Record<string, unknown> };
  const ac = r.accessibility ?? {}, au = r.audio ?? {}, gp = r.gameplay ?? {};
  const da = d.accessibility, dau = d.audio, dg = d.gameplay;
  return {
    accessibility: {
      uiScale: snapUiScale(num(ac.uiScale, SCALE.uiMin, SCALE.uiMax, da.uiScale)),
      textScale: SCALE.textScales.includes(ac.textScale as number) ? (ac.textScale as number) : da.textScale,
      font: pickEnum(ac.font, ['standard', 'hyperlegible'], da.font),
      highContrast: bool(ac.highContrast, da.highContrast),
      reducedMotion: pickEnum(ac.reducedMotion, ['system', 'on', 'off'], da.reducedMotion),
      spiderComfort: pickEnum(ac.spiderComfort, ['off', 'softened', 'abstract', 'marker'], da.spiderComfort),
      comfortMitesCentipedes: bool(ac.comfortMitesCentipedes, da.comfortMitesCentipedes),
      overlayPalette: pickEnum(ac.overlayPalette, ['okabe-ito', 'high-contrast', 'pattern-only'], da.overlayPalette),
      soundCueIndicators: bool(ac.soundCueIndicators, da.soundCueIndicators),
      flashReduction: bool(ac.flashReduction, da.flashReduction),
    },
    audio: {
      ambience: num(au.ambience, 0, 1, dau.ambience), effects: num(au.effects, 0, 1, dau.effects), giants: num(au.giants, 0, 1, dau.giants),
      interface: num(au.interface, 0, 1, dau.interface), music: num(au.music, 0, 1, dau.music),
      musicMode: pickEnum(au.musicMode, ['off', 'sparse', 'frequent'], dau.musicMode),
      muteWhenHidden: bool(au.muteWhenHidden, dau.muteWhenHidden), mono: bool(au.mono, dau.mono),
    },
    gameplay: {
      autosaveMinutes: ([0, 2, 5, 10] as const).includes(gp.autosaveMinutes as 0) ? (gp.autosaveMinutes as AutosaveMinutes) : dg.autosaveMinutes,
      prompts: pickEnum(gp.prompts, ['always', 'learning', 'never'], dg.prompts),
      hints: bool(gp.hints, dg.hints), minimap: bool(gp.minimap, dg.minimap),
      focusLine: pickEnum(gp.focusLine, ['auto', 'always', 'never'], dg.focusLine),
      milestoneNotices: pickEnum(gp.milestoneNotices, ['full', 'quiet', 'off'], dg.milestoneNotices),
    },
  };
}

/** Merges a patch (one level per section) and re-validates the result. */
export function mergePrefs(base: UiPrefs, patch: PrefsPatch): UiPrefs {
  return sanitizePrefs({
    accessibility: { ...base.accessibility, ...patch.accessibility },
    audio: { ...base.audio, ...patch.audio },
    gameplay: { ...base.gameplay, ...patch.gameplay },
  });
}


/** GameSettings -> the view the components use. Malformed values (a hostile or newer settings object) are repaired. */
export function prefsFromSettings(s: GameSettings): UiPrefs {
  const a = s.accessibility, au = s.audio, g = s.gameplay;
  return sanitizePrefs({
    accessibility: {
      uiScale: a.uiScale / 100, textScale: a.textScale / 100, font: a.font, highContrast: a.highContrast, reducedMotion: a.reducedMotion,
      spiderComfort: a.spiderComfort, comfortMitesCentipedes: a.comfortMites || a.comfortCentipedes, overlayPalette: a.overlayPalette,
      soundCueIndicators: a.soundCues, flashReduction: a.flashReduction,
    },
    audio: { ambience: au.ambience, effects: au.effects, giants: au.giants, interface: au.ui, music: au.music, musicMode: au.musicMode, muteWhenHidden: au.muteWhenHidden, mono: au.mono },
    gameplay: { autosaveMinutes: g.autosaveMin, prompts: g.prompts, hints: g.hints, minimap: g.minimap === 'always', focusLine: g.focusLine, milestoneNotices: g.milestoneNotices },
  });
}

/** A view patch (already validated) -> the GameSettings patch that carries it; only the named rows are touched. */
export function settingsPatchFromPrefs(p: PrefsPatch): SettingsPatch {
  const out: SettingsPatch = {};
  const a = p.accessibility;
  if (a) {
    const acc: NonNullable<SettingsPatch['accessibility']> = {};
    if (a.uiScale !== undefined) acc.uiScale = Math.round(snapUiScale(a.uiScale) * 100);
    if (a.textScale !== undefined) acc.textScale = Math.round(a.textScale * 100);
    if (a.font !== undefined) acc.font = a.font;
    if (a.highContrast !== undefined) acc.highContrast = a.highContrast;
    if (a.reducedMotion !== undefined) acc.reducedMotion = a.reducedMotion;
    if (a.spiderComfort !== undefined) acc.spiderComfort = a.spiderComfort;
    if (a.comfortMitesCentipedes !== undefined) { acc.comfortMites = a.comfortMitesCentipedes; acc.comfortCentipedes = a.comfortMitesCentipedes; }
    if (a.overlayPalette !== undefined) acc.overlayPalette = a.overlayPalette;
    if (a.soundCueIndicators !== undefined) acc.soundCues = a.soundCueIndicators;
    if (a.flashReduction !== undefined) acc.flashReduction = a.flashReduction;
    out.accessibility = acc;
  }
  const au = p.audio;
  if (au) {
    const audio: NonNullable<SettingsPatch['audio']> = {};
    if (au.ambience !== undefined) audio.ambience = au.ambience;
    if (au.effects !== undefined) audio.effects = au.effects;
    if (au.giants !== undefined) audio.giants = au.giants;
    if (au.interface !== undefined) audio.ui = au.interface;
    if (au.music !== undefined) audio.music = au.music;
    if (au.musicMode !== undefined) audio.musicMode = au.musicMode;
    if (au.muteWhenHidden !== undefined) audio.muteWhenHidden = au.muteWhenHidden;
    if (au.mono !== undefined) audio.mono = au.mono;
    out.audio = audio;
  }
  const g = p.gameplay;
  if (g) {
    const gameplay: NonNullable<SettingsPatch['gameplay']> = {};
    if (g.autosaveMinutes !== undefined) gameplay.autosaveMin = g.autosaveMinutes;
    if (g.prompts !== undefined) gameplay.prompts = g.prompts;
    if (g.hints !== undefined) gameplay.hints = g.hints;
    if (g.minimap !== undefined) gameplay.minimap = g.minimap ? 'always' : 'never';
    if (g.focusLine !== undefined) gameplay.focusLine = g.focusLine;
    if (g.milestoneNotices !== undefined) gameplay.milestoneNotices = g.milestoneNotices;
    out.gameplay = gameplay;
  }
  return out;
}

export interface PrefsStore {
  prefs: Signal<UiPrefs>;
  /** False when settings cannot be stored (no source, storage missing, last write failed): Settings says so. */
  persistent: Signal<boolean>;
  /** The notice text for the Settings header, '' when everything is stored. */
  notice: Signal<string>;
  /** Applies a patch to the settings (through the source) and updates the view. Returns the new view. */
  set(patch: PrefsPatch): UiPrefs;
  /** Points the store at the game's settings (null = none yet: the view is kept in memory and not stored). */
  attach(source: SettingsSource | null): void;
  /** Re-reads the source, because the game may change settings by itself (loaded from storage, a debug hook). */
  refresh(): void;
}

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function createPrefsStore(initial: SettingsSource | null = null): PrefsStore {
  let source: SettingsSource | null = null;
  const prefs = signal<UiPrefs>(defaultPrefs());
  const persistent = signal(false);
  const notice = signal(NO_STORAGE_NOTICE);

  const refresh = () => {
    if (!source) { persistent.value = false; notice.value = NO_STORAGE_NOTICE; return; }
    let next: UiPrefs;
    try {
      next = prefsFromSettings(source.getSettings());
    } catch {
      return; // a game that cannot answer keeps the last view
    }
    if (!sameJson(next, prefs.value)) prefs.value = next;
    const text = source.settingsNotice?.() ?? '';
    if (notice.value !== text) notice.value = text;
    if (persistent.value !== (text === '')) persistent.value = text === '';
  };

  const store: PrefsStore = {
    prefs, persistent, notice, refresh,
    attach(next) { source = next; refresh(); },
    set(patch) {
      const merged = mergePrefs(prefs.value, patch);
      if (!source) { prefs.value = merged; return merged; }
      try {
        source.setSettings(settingsPatchFromPrefs(patch));
      } catch {
        // the view below is re-read from the game, so a refused write simply leaves the old value
      }
      refresh();
      return prefs.value;
    },
  };
  store.attach(initial);
  return store;
}

/** The store the shell uses; styles/index.ts attaches it to the game's facade (tests make their own). */
export const uiPrefs = createPrefsStore();
