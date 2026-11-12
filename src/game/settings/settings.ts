// Game settings as one plain in-memory object with a small interface (GDD 01 §6.8, GDD 08 §7.4). Persistence
// (localStorage, schema versions) is the `save` task's src/game/settings/persist*; it plugs in through
// SettingsStore.replace() and subscribe(). Nothing here touches storage.
import { defaultInputSettings, type InputSettings } from '@/input';
import type { GraphicsOverrides, QualitySetting } from '@/render/app';

export interface GameplaySettings {
  /** Possession start sets 1x (off: clamp to 4x), GDD 01 §8. */
  dropTo1xOnPossess: boolean;
  /** Window blur / hidden tab pauses (GDD 01 §5.8, GDD 06 §4.3 PAUSE_WHEN_HIDDEN_DEFAULT). */
  pauseOnBlur: boolean;
  /** Possess the nearest nestmate after the death hold (GDD 01 §3.7). */
  autoRepossessOnDeath: boolean;
  /** Pause after a load (GDD 01 §1.2 LOAD_RESUME_SPEED; default off). */
  pauseOnLoad: boolean;
  /** Pause when a drawer opens (GDD 01 §8). */
  pauseWhenPanelOpen: boolean;
}

export interface CameraSettings {
  autoFollow: 'off' | 'gentle' | 'strong';
  /** Degrees added to every possession FOV (-10..+20). */
  fovOffset: number;
  worldUpLock: boolean;
  reducedMotion: boolean;
}

export interface GraphicsSettings {
  quality: QualitySetting;
  overrides: GraphicsOverrides;
}

export interface GameSettings {
  gameplay: GameplaySettings;
  camera: CameraSettings;
  controls: InputSettings;
  graphics: GraphicsSettings;
  /** Audio is a later task; kept so the settings shape is complete. */
  audio: { master: number; muted: boolean };
}

export function defaultSettings(): GameSettings {
  return {
    gameplay: { dropTo1xOnPossess: true, pauseOnBlur: true, autoRepossessOnDeath: false, pauseOnLoad: false, pauseWhenPanelOpen: false },
    camera: { autoFollow: 'gentle', fovOffset: 0, worldUpLock: false, reducedMotion: false },
    controls: defaultInputSettings(),
    graphics: { quality: 'auto', overrides: {} },
    audio: { master: 0.8, muted: false },
  };
}

/** A deep partial for patches. */
export type SettingsPatch = { [K in keyof GameSettings]?: Partial<GameSettings[K]> };

export class SettingsStore {
  private value: GameSettings;
  private listeners = new Set<(s: GameSettings) => void>();

  constructor(initial: GameSettings = defaultSettings()) {
    this.value = initial;
  }

  get(): GameSettings {
    return this.value;
  }

  /** Shallow-merges each section of the patch and notifies listeners. */
  set(patch: SettingsPatch): GameSettings {
    const next = { ...this.value };
    for (const k of Object.keys(patch) as (keyof GameSettings)[]) {
      const p = patch[k];
      if (p) (next as Record<string, unknown>)[k] = { ...this.value[k], ...p };
    }
    this.value = next;
    for (const fn of this.listeners) fn(this.value);
    return this.value;
  }

  /** Replace everything (a persistence layer loading saved settings). */
  replace(s: GameSettings): void {
    this.value = s;
    for (const fn of this.listeners) fn(this.value);
  }

  subscribe(fn: (s: GameSettings) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}
