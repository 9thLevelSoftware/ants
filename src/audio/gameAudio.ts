// Browser wiring for the game: one AudioSystem listening for gestures on window, delegated UI sounds on the
// document, tab visibility, the UI facade, and the `window.__foundressAudio` debug read-out (status, cue log,
// mix state) that headless checks use (GDD 08 App. B `audio.status()` / `audio.cueLog()`).
import { setAudioFacadeTarget } from './facade';
import { AudioSystem, type AudioAssets, type AudioSettingsSource } from './system';

export interface AudioDebugHandle {
  status(): string;
  cueLog(): unknown[];
  /** Short-term / momentary LUFS of the output tap (a monitor; null while silent). */
  loudness(): { shortTermLufs: number | null; momentaryLufs: number | null; running: boolean };
  debug(): Record<string, unknown>;
  enable(): void;
  ui(id: string): void;
}

declare global {
  interface Window { __foundressAudio?: AudioDebugHandle }
}

/**
 * `?test=1` silences audio (App. E 15). Scripted checks that need to hear the game (cue logs, loudness) add
 * `&audio=on`: the game stays in test mode (deterministic, stepped) and only the audio ignores the flag. The gesture
 * rule is unchanged: nothing starts before a click or key press.
 */
export function audioForcedOn(search: string): boolean {
  return /(?:^|[?&])audio=on(?:&|$)/.test(search);
}

export function createGameAudio(o: { assets: AudioAssets | null; settings: AudioSettingsSource; testMode: boolean }): AudioSystem {
  const hasDom = typeof window !== 'undefined' && typeof document !== 'undefined';
  const forced = hasDom && audioForcedOn(window.location.search);
  const sys = new AudioSystem({
    assets: o.assets, settings: o.settings, testMode: o.testMode && !forced,
    gestureTarget: hasDom ? window : null, uiRoot: hasDom ? document : null, visibility: hasDom ? document : null,
  });
  setAudioFacadeTarget(sys);
  if (hasDom) {
    window.__foundressAudio = {
      status: () => sys.status(),
      cueLog: () => JSON.parse(JSON.stringify(sys.cueLog(), (_k, v) => (v === -Infinity ? null : v))),
      loudness: () => sys.loudness(),
      debug: () => JSON.parse(JSON.stringify(sys.debug(), (_k, v) => (v === -Infinity ? null : v))),
      enable: () => sys.enable(),
      ui: (id) => sys.ui(id as never),
    };
  }
  return sys;
}
