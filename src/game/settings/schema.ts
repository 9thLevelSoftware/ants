// Validation and clamping of settings: anything read from storage, pasted, or patched in passes through here, so
// the game never sees an out-of-range number, an unknown enum value or a missing field. Pure.
import { parseBindings, serializeBindings, type BindingSet } from '@/input/bindings';
import { PLAYER_QUALITY_IDS } from '@/render/app/quality';
import type { GraphicsOverrides, QualitySetting } from '@/render/app';
import { defaultSettings, SETTINGS_SECTIONS, type GameSettings, type SettingsSection } from './model';

type Spec =
  | { kind: 'bool' }
  | { kind: 'num'; min: number; max: number; step?: number }
  | { kind: 'enum'; values: readonly (string | number)[] }
  | { kind: 'quality' }
  | { kind: 'overrides' };

const bool: Spec = { kind: 'bool' };
const num = (min: number, max: number, step?: number): Spec => ({ kind: 'num', min, max, step });
const oneOf = (...values: (string | number)[]): Spec => ({ kind: 'enum', values });

/** One validator per field of every section except `bindings`. Fields missing here are dropped on load. */
const SPECS: Record<Exclude<SettingsSection, 'bindings'>, Record<string, Spec>> = {
  gameplay: {
    dropTo1xOnPossess: bool, pauseOnBlur: bool, autoRepossessOnDeath: bool, pauseOnLoad: bool, pauseWhenPanelOpen: bool,
    prompts: oneOf('always', 'learning', 'never'), hints: bool, autoSlowCritical: oneOf('pause', 'slow', 'off'),
    autoSlowWarning: oneOf('slow', 'off'), autosaveMin: oneOf(0, 2, 5, 10), minimap: oneOf('never', 'always'),
    focusLine: oneOf('auto', 'always', 'never'), milestoneNotices: oneOf('full', 'quiet', 'off'),
  },
  camera: { autoFollow: oneOf('off', 'gentle', 'strong'), fovOffset: num(-10, 20), worldUpLock: bool, reducedMotion: bool },
  controls: {
    mouseLook: oneOf('drag', 'locked'), leftButton: oneOf('bite', 'orbit'), orbitSensDrag: num(0.02, 2), orbitSensLocked: num(0.02, 2),
    mouseSensitivity: num(0.2, 3), invertX: bool, invertY: bool, stickYawRate: num(30, 720), stickPitchRate: num(30, 720),
    stickResponse: num(1, 3), deadZone: num(0.05, 0.35), holdMs: num(300, 1500),
  },
  graphics: { quality: { kind: 'quality' }, overrides: { kind: 'overrides' } },
  audio: {
    master: num(0, 1), ambience: num(0, 1), effects: num(0, 1), giants: num(0, 1), ui: num(0, 1), music: num(0, 1), muted: bool,
    musicMode: oneOf('off', 'sparse', 'frequent'), distantVoices: bool, muteWhenHidden: bool, mono: bool, alarmShimmer: bool,
  },
  accessibility: {
    uiScale: num(80, 150, 10), textScale: oneOf(100, 115, 130), font: oneOf('standard', 'hyperlegible'), highContrast: bool,
    reducedMotion: oneOf('system', 'on', 'off'), shake: num(0, 100), spiderComfort: oneOf('off', 'softened', 'abstract', 'marker'),
    comfortMites: bool, comfortCentipedes: bool, overlayPalette: oneOf('okabe-ito', 'high-contrast', 'pattern-only'),
    soundCues: bool, flashReduction: bool,
  },
};

const OVERRIDE_SPECS: Record<keyof GraphicsOverrides, Spec> = {
  resolutionScale: num(0.5, 1, 0.05), dynamicResolution: bool, targetFps: oneOf(30, 60), depthOfField: oneOf('off', 'subtle', 'full'),
  haze: bool, shadows: oneOf('off', 'low', 'high'), density: num(0.25, 1), reducedMotion: bool,
};

const QUALITIES: readonly string[] = ['auto', 'test', ...PLAYER_QUALITY_IDS];

/** Validates one value; returns `undefined` when it is unusable (the caller keeps the default). */
function check(spec: Spec, v: unknown): unknown {
  switch (spec.kind) {
    case 'bool': return typeof v === 'boolean' ? v : undefined;
    case 'num': {
      if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
      let x = Math.min(spec.max, Math.max(spec.min, v));
      if (spec.step) x = Math.min(spec.max, Math.max(spec.min, Math.round((x - spec.min) / spec.step) * spec.step + spec.min));
      return Math.round(x * 1e6) / 1e6;
    }
    case 'enum': return spec.values.includes(v as string | number) ? v : undefined;
    case 'quality': return typeof v === 'string' && QUALITIES.includes(v) ? (v as QualitySetting) : undefined;
    case 'overrides': {
      const out: Record<string, unknown> = {};
      if (v && typeof v === 'object') {
        for (const [k, s] of Object.entries(OVERRIDE_SPECS)) {
          const c = check(s, (v as Record<string, unknown>)[k]);
          if (c !== undefined) out[k] = c;
        }
      }
      return out as GraphicsOverrides;
    }
  }
}

function sanitizeBindings(raw: unknown): BindingSet {
  if (raw === undefined || raw === null) return parseBindings(null).bindings;
  try {
    return parseBindings(JSON.stringify(raw)).bindings;
  } catch {
    return parseBindings(null).bindings;
  }
}

/**
 * Builds a complete, valid GameSettings from anything: unknown sections and fields are dropped, invalid values fall
 * back to `base` (the defaults, or the current settings when sanitising a patch), numbers are clamped.
 */
export function sanitizeSettings(raw: unknown, base: GameSettings = defaultSettings()): GameSettings {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const out = defaultSettings() as unknown as Record<string, Record<string, unknown>>;
  const baseRec = base as unknown as Record<string, Record<string, unknown>>;
  for (const section of SETTINGS_SECTIONS) {
    if (section === 'bindings') continue;
    const rawSection = src[section] && typeof src[section] === 'object' ? (src[section] as Record<string, unknown>) : {};
    const target: Record<string, unknown> = {};
    for (const [field, spec] of Object.entries(SPECS[section])) {
      // the value itself, else the fallback (current settings / defaults), else the default: each one validated
      target[field] = check(spec, rawSection[field]) ?? check(spec, baseRec[section][field]) ?? out[section][field];
    }
    out[section] = target;
  }
  (out as unknown as GameSettings).bindings = src.bindings === undefined ? base.bindings : sanitizeBindings(src.bindings);
  return out as unknown as GameSettings;
}

/** Dotted paths (`audio.master`) whose value differs between two settings. */
export function changedPaths(a: GameSettings, b: GameSettings): string[] {
  const out: string[] = [];
  for (const section of SETTINGS_SECTIONS) {
    if (section === 'bindings') {
      if (serializeBindings(a.bindings) !== serializeBindings(b.bindings)) out.push('bindings');
      continue;
    }
    const sa = a[section] as unknown as Record<string, unknown>, sb = b[section] as unknown as Record<string, unknown>;
    for (const k of Object.keys(SPECS[section])) {
      if (JSON.stringify(sa[k]) !== JSON.stringify(sb[k])) out.push(`${section}.${k}`);
    }
  }
  return out;
}
