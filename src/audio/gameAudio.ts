// Browser wiring for the game: one AudioSystem listening for gestures on window, delegated UI sounds on the
// document, tab visibility, the UI facade, and the `window.__foundressAudio` debug read-out (status, cue log,
// mix state) that headless checks use (GDD 08 App. B `audio.status()` / `audio.cueLog()`).
import { setAudioFacadeTarget } from './facade';
import { AudioSystem, type AudioAssets, type AudioSettingsSource } from './system';

export interface AudioDebugHandle {
  status(): string;
  cueLog(): unknown[];
  debug(): Record<string, unknown>;
  enable(): void;
  ui(id: string): void;
}

declare global {
  interface Window { __foundressAudio?: AudioDebugHandle }
}

export function createGameAudio(o: { assets: AudioAssets | null; settings: AudioSettingsSource; testMode: boolean }): AudioSystem {
  const hasDom = typeof window !== 'undefined' && typeof document !== 'undefined';
  const sys = new AudioSystem({
    assets: o.assets, settings: o.settings, testMode: o.testMode,
    gestureTarget: hasDom ? window : null, uiRoot: hasDom ? document : null, visibility: hasDom ? document : null,
  });
  setAudioFacadeTarget(sys);
  if (hasDom) {
    window.__foundressAudio = {
      status: () => sys.status(),
      cueLog: () => JSON.parse(JSON.stringify(sys.cueLog(), (_k, v) => (v === -Infinity ? null : v))),
      debug: () => JSON.parse(JSON.stringify(sys.debug(), (_k, v) => (v === -Infinity ? null : v))),
      enable: () => sys.enable(),
      ui: (id) => sys.ui(id as never),
    };
  }
  return sys;
}
