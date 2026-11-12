// Presentation preferences the UI owns: accessibility (UI scale, text size, font, contrast, reduced motion, comfort
// options), the audio mix beyond master, and the gameplay rows that have no home in GameSettings yet. Persisted in
// localStorage `foundress.ui.v1` (try/catch; the session keeps working without storage). When the settings task
// brings these into `foundress.settings.v1` it can read/replace this store through getPrefs()/replacePrefs().
import { signal } from '@preact/signals';
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

export const PREFS_STORAGE_KEY = 'foundress.ui.v1';

/** The slice of Storage the store needs (tests pass a fake; null = no storage at all). */
export interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

function pickEnum<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}
const num = (v: unknown, lo: number, hi: number, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback);
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);

/** Validates untyped stored JSON against the defaults; anything malformed falls back per field. Never throws. */
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

export interface PrefsStore {
  prefs: ReturnType<typeof signal<UiPrefs>>;
  /** False once a write failed or storage is absent: Settings shows "cannot be stored in this browser context". */
  persistent: ReturnType<typeof signal<boolean>>;
  set(patch: PrefsPatch): UiPrefs;
  replace(p: UiPrefs): void;
}

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null; // accessing localStorage itself can throw in sandboxed frames
  }
}

export function createPrefsStore(storage: StorageLike | null = defaultStorage()): PrefsStore {
  let initial = defaultPrefs();
  let persistent = storage !== null;
  if (storage) {
    try {
      const text = storage.getItem(PREFS_STORAGE_KEY);
      if (text) initial = sanitizePrefs(JSON.parse(text));
    } catch {
      persistent = false;
    }
  }
  const prefs = signal(initial);
  const persistentSig = signal(persistent);
  const write = () => {
    if (!storage) return;
    try {
      storage.setItem(PREFS_STORAGE_KEY, JSON.stringify(prefs.value));
    } catch {
      persistentSig.value = false;
    }
  };
  return {
    prefs, persistent: persistentSig,
    set(patch) { prefs.value = mergePrefs(prefs.value, patch); write(); return prefs.value; },
    replace(p) { prefs.value = sanitizePrefs(p); write(); },
  };
}

/** The store the shell uses (tests make their own with createPrefsStore). */
export const uiPrefs = createPrefsStore();
