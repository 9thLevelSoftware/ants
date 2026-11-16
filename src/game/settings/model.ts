// The settings model (GDD 08 §7.4, App. A `foundress.settings.v1`, GDD 01 §6.8): plain data, defaults, patch type.
// Sections: gameplay, camera, controls, graphics, audio, accessibility. Key bindings are a separate object
// (`bindings`, stored under `foundress.bindings.v1`). Additive evolution only: new optional-by-default fields get a
// default here and a validator in schema.ts; nothing is ever renamed or removed.
import { defaultBindings, type BindingSet } from '@/input/bindings';
import { defaultInputSettings, type InputSettings } from '@/input/defaults';
import type { GraphicsOverrides, QualitySetting } from '@/render/app';

export type PromptsMode = 'always' | 'learning' | 'never';
export type MinimapMode = 'never' | 'always';
export type FocusLineMode = 'auto' | 'always' | 'never';
export type MilestoneNotices = 'full' | 'quiet' | 'off';
export type AutoSlowCritical = 'pause' | 'slow' | 'off';
export type AutoSlowWarning = 'slow' | 'off';

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
  /** Context prompts: always (full) / while learning (compact after 3 uses) / never (GDD 01 `promptsMode`). */
  prompts: PromptsMode;
  /** Hints and aims shown (GDD 08 §9). */
  hints: boolean;
  /** Auto-slow on a `critical` alert (GDD 08 §5.1). */
  autoSlowCritical: AutoSlowCritical;
  /** Auto-slow on a `warning` alert. */
  autoSlowWarning: AutoSlowWarning;
  /** Autosave interval in real minutes: 2, 5, 10 or 0 (off) (GDD 08 §7.4). */
  autosaveMin: number;
  minimap: MinimapMode;
  focusLine: FocusLineMode;
  milestoneNotices: MilestoneNotices;
}

export interface CameraSettings {
  autoFollow: 'off' | 'gentle' | 'strong';
  /** Degrees added to every possession FOV (-10..+20). */
  fovOffset: number;
  worldUpLock: boolean;
  /** Resolved reduced-motion flag the camera reads (the UI derives it from accessibility.reducedMotion). */
  reducedMotion: boolean;
}

export type ControlsSettings = InputSettings & {
  /** Hold duration for hold-activated buttons, ms (GDD 08 §7.4: 300-1500). */
  holdMs: number;
};

export interface GraphicsSettings {
  quality: QualitySetting;
  overrides: GraphicsOverrides;
}

export interface AudioSettings {
  /** 0..1 volumes (GDD 08 §7.4 buses). */
  master: number;
  ambience: number;
  effects: number;
  giants: number;
  ui: number;
  music: number;
  muted: boolean;
  musicMode: 'off' | 'sparse' | 'frequent';
  distantVoices: boolean;
  muteWhenHidden: boolean;
  mono: boolean;
  /** Alarm shimmer, the audible stand-in for alarm pheromone (GDD 08 §13.5: "Settings can disable"). */
  alarmShimmer: boolean;
}

export interface AccessibilitySettings {
  /** UI scale percent, 80-150 step 10. */
  uiScale: number;
  /** Text size percent: 100, 115 or 130. */
  textScale: number;
  font: 'standard' | 'hyperlegible';
  highContrast: boolean;
  /** `system` follows prefers-reduced-motion. */
  reducedMotion: 'system' | 'on' | 'off';
  /** Camera shake and sway, percent 0-100. */
  shake: number;
  spiderComfort: 'off' | 'softened' | 'abstract' | 'marker';
  comfortMites: boolean;
  comfortCentipedes: boolean;
  overlayPalette: 'okabe-ito' | 'high-contrast' | 'pattern-only';
  soundCues: boolean;
  flashReduction: boolean;
}

export interface GameSettings {
  gameplay: GameplaySettings;
  camera: CameraSettings;
  controls: ControlsSettings;
  graphics: GraphicsSettings;
  audio: AudioSettings;
  accessibility: AccessibilitySettings;
  /** Keyboard / mouse / gamepad bindings (persisted separately as `foundress.bindings.v1`). */
  bindings: BindingSet;
}

export function defaultSettings(): GameSettings {
  return {
    gameplay: {
      dropTo1xOnPossess: true, pauseOnBlur: true, autoRepossessOnDeath: false, pauseOnLoad: false, pauseWhenPanelOpen: false,
      prompts: 'always', hints: true, autoSlowCritical: 'slow', autoSlowWarning: 'off', autosaveMin: 5, minimap: 'never',
      focusLine: 'auto', milestoneNotices: 'full',
    },
    camera: { autoFollow: 'gentle', fovOffset: 0, worldUpLock: false, reducedMotion: false },
    controls: { ...defaultInputSettings(), holdMs: 600 },
    graphics: { quality: 'auto', overrides: {} },
    audio: {
      master: 1, ambience: 0.8, effects: 0.9, giants: 0.9, ui: 0.6, music: 0.5, muted: false, musicMode: 'sparse',
      distantVoices: false, muteWhenHidden: true, mono: false, alarmShimmer: true,
    },
    accessibility: {
      uiScale: 100, textScale: 100, font: 'standard', highContrast: false, reducedMotion: 'system', shake: 100,
      spiderComfort: 'off', comfortMites: false, comfortCentipedes: false, overlayPalette: 'okabe-ito', soundCues: false,
      flashReduction: true,
    },
    bindings: defaultBindings(),
  };
}

/** A deep partial for patches: each section is shallow-merged. */
export type SettingsPatch = { [K in keyof GameSettings]?: Partial<GameSettings[K]> };

export type SettingsSection = keyof GameSettings;
export const SETTINGS_SECTIONS: readonly SettingsSection[] = ['gameplay', 'camera', 'controls', 'graphics', 'audio', 'accessibility', 'bindings'];
