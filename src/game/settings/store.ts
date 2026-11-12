// The settings store: one plain object, validated on every change, with change notifications that name what changed.
// Persistence (localStorage) is persist.ts and plugs in through subscribe() / replace(); nothing here touches storage.
import { changedPaths, sanitizeSettings } from './schema';
import { defaultSettings, SETTINGS_SECTIONS, type GameSettings, type SettingsPatch, type SettingsSection } from './model';

export type SettingsListener = (settings: GameSettings, changed: string[]) => void;

export class SettingsStore {
  private value: GameSettings;
  private listeners = new Set<SettingsListener>();

  constructor(initial: GameSettings = defaultSettings()) {
    this.value = sanitizeSettings(initial);
  }

  get(): GameSettings {
    return this.value;
  }

  /** Shallow-merges each section of the patch, validates and clamps the result, notifies listeners. */
  set(patch: SettingsPatch): GameSettings {
    const merged: Record<string, unknown> = {};
    for (const k of SETTINGS_SECTIONS) {
      const p = (patch as Record<string, unknown>)[k];
      merged[k] = p && typeof p === 'object' ? { ...(this.value[k] as object), ...(p as object) } : this.value[k];
    }
    return this.apply(sanitizeSettings(merged, this.value));
  }

  /** Replace everything (a persistence layer loading saved settings). Invalid parts fall back to the defaults. */
  replace(s: unknown): void {
    this.apply(sanitizeSettings(s));
  }

  /** Back to the defaults, for one section or all of them. */
  reset(section?: SettingsSection): GameSettings {
    if (!section) return this.apply(defaultSettings());
    return this.apply({ ...this.value, [section]: defaultSettings()[section] });
  }

  private apply(next: GameSettings): GameSettings {
    const changed = changedPaths(this.value, next);
    this.value = next;
    if (changed.length > 0) for (const fn of [...this.listeners]) fn(this.value, changed);
    return this.value;
  }

  /** Listener gets the new settings and the dotted paths that changed (`audio.master`, `bindings`). */
  subscribe(fn: SettingsListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}
