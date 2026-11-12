// Settings persistence: localStorage `foundress.settings.v1` (an envelope with a schema version) and
// `foundress.bindings.v1` (the BindingSet). Every access is try/catch; when storage is missing, the settings last
// for the session and `status().available` is false so the Settings header can say so (GDD 08 §7.4).
import { parseBindings, serializeBindings } from '@/input/bindings';
import { BINDINGS_STORAGE_KEY } from '@/input/defaults';
import { SETTINGS_STORAGE_KEY, SETTINGS_WRITE_DEBOUNCE_MS } from '../save/constants';
import type { LocalKv } from '../save/localKv';
import { sanitizeSettings } from './schema';
import type { GameSettings } from './model';
import type { SettingsStore } from './store';

/** Schema version of the stored settings envelope. Bump with a migration in `migrateSettings`. */
export const SETTINGS_SCHEMA_VERSION = 1;

export interface SettingsPersistStatus {
  /** localStorage works (probe write succeeded). */
  available: boolean;
  /** What the load found: nothing stored, valid, or damaged (defaults were used). */
  loaded: 'none' | 'ok' | 'damaged';
  /** The last write failed (quota, blocked). */
  writeFailed: boolean;
  /** Text for the Settings header, '' when everything is fine. */
  notice: string;
}

interface Envelope {
  v: number;
  settings: unknown;
}

/** Upgrades the stored settings of an older schema version to the current one (a migration hook; none yet). */
export function migrateSettings(raw: unknown, from: number): unknown {
  let s = raw;
  for (let v = from; v < SETTINGS_SCHEMA_VERSION; v++) s = MIGRATIONS[v]?.(s) ?? s;
  return s;
}
const MIGRATIONS: Record<number, (s: unknown) => unknown> = {};

/** Reads stored settings (never throws). Bindings come from their own key. */
export function loadSettings(kv: LocalKv): { settings: GameSettings; loaded: SettingsPersistStatus['loaded'] } {
  const text = kv.get(SETTINGS_STORAGE_KEY);
  const bindingsText = kv.get(BINDINGS_STORAGE_KEY);
  let loaded: SettingsPersistStatus['loaded'] = 'none';
  let raw: unknown = {};
  if (text !== null) {
    try {
      const env = JSON.parse(text) as Partial<Envelope> | null;
      if (env && typeof env === 'object' && typeof env.v === 'number' && env.settings && typeof env.settings === 'object') {
        raw = migrateSettings(env.settings, env.v); // a newer v is read best-effort: sanitising drops what it does not know
        loaded = 'ok';
      } else loaded = 'damaged';
    } catch {
      loaded = 'damaged';
    }
  }
  const settings = sanitizeSettings(raw);
  if (bindingsText !== null) {
    const parsed = parseBindings(bindingsText);
    settings.bindings = parsed.bindings;
    if (loaded === 'none') loaded = 'ok';
  }
  return { settings, loaded };
}

export interface SettingsPersistence {
  status(): SettingsPersistStatus;
  /** Writes now (pagehide, tests). */
  flush(): void;
  /** Stops listening. */
  dispose(): void;
}

/**
 * Loads stored settings into the store (store.replace) and writes every later change, debounced. `apply` runs
 * after the load so the game can push the loaded values to the input, camera and renderer.
 */
export function attachSettingsPersistence(
  store: SettingsStore, kv: LocalKv,
  opts: { apply?: (loaded: GameSettings) => void; debounceMs?: number; setTimer?: (fn: () => void, ms: number) => unknown; clearTimer?: (h: unknown) => void } = {},
): SettingsPersistence {
  const setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  const debounce = opts.debounceMs ?? SETTINGS_WRITE_DEBOUNCE_MS;
  const st: SettingsPersistStatus = { available: kv.available, loaded: 'none', writeFailed: false, notice: '' };
  const updateNotice = () => {
    st.notice = !st.available ? 'Settings cannot be stored in this browser context' : st.writeFailed ? 'The last settings change could not be stored' : '';
  };

  const loaded = loadSettings(kv);
  st.loaded = loaded.loaded;
  if (loaded.loaded !== 'none') {
    store.replace(loaded.settings);
    opts.apply?.(store.get());
  }
  updateNotice();

  let lastBindings: string | null = kv.get(BINDINGS_STORAGE_KEY) !== null ? serializeBindings(store.get().bindings) : null;
  let timer: unknown = null;
  const write = () => {
    timer = null;
    if (!kv.available) return;
    const s = store.get();
    const { bindings, ...rest } = s;
    const ok1 = kv.set(SETTINGS_STORAGE_KEY, JSON.stringify({ v: SETTINGS_SCHEMA_VERSION, settings: rest } satisfies Envelope));
    const b = serializeBindings(bindings);
    let ok2 = true;
    if (b !== lastBindings) { ok2 = kv.set(BINDINGS_STORAGE_KEY, b); if (ok2) lastBindings = b; }
    st.writeFailed = !(ok1 && ok2);
    updateNotice();
  };
  const off = store.subscribe(() => {
    if (timer === null) timer = setTimer(write, debounce);
  });
  return {
    status: () => ({ ...st }),
    flush() { if (timer !== null) { clearTimer(timer); write(); } },
    dispose() { off(); if (timer !== null) { clearTimer(timer); timer = null; } },
  };
}

