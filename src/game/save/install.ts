// Wiring of the persistence layer into a running Game, without touching Game.ts: it fills in the SaveHooks the game
// already calls (save / load / listSaves / quitting), attaches the optional GameFacade methods the UI looks for
// (deleteSave, exportSave, importSave, storageAvailable, resetHints, hasLineage, getBindings, setBindings), starts the
// real-time autosave pump and loads the settings and the profile. Call once after `new Game(...)`:
//
//     const persistence = await installPersistence(game);
//
// Everything is optional: with no storage at all the game plays on and `persistence.manager.status()` says so.
import { createLogger } from '@/core/log';
import type { Game } from '../Game';
import { ProfileStore } from '../profile/profile';
import { attachSettingsPersistence, type SettingsPersistence } from '../settings/persist';
import type { GameSettings } from '../settings/model';
import { AUTOSAVE_PUMP_MAX_DT_S, AUTOSAVE_PUMP_MS } from './constants';
import { AutosaveDriver } from './autosaveDriver';
import { AutosavePolicy } from './autosavePolicy';
import { buildSavesDebug, type SavesDebug } from './debug';
import { exportSlotBytes, importInto, listSlotInfos, toSaveResult } from './facade';
import { GameHost, type GameHostOptions } from './gameHost';
import { createLocalKv, type LocalKv } from './localKv';
import { attachProfileEvents } from './profileEvents';
import type { LoaderDeps } from './loader';
import { SaveManager } from './manager';
import type { SaveStorage } from './storage';
import type { Sim } from '@/sim/types';
import { registerHintProfile } from '@/game/onboarding';

const log = createLogger('persistence');

export interface InstallOptions extends GameHostOptions {
  /** Storage back end (default IndexedDB with the in-memory fallback). */
  storage?: SaveStorage;
  fallback?: () => SaveStorage;
  /** localStorage wrapper (default: the real one behind try/catch). */
  kv?: LocalKv;
  /** Force autosave on or off. Default: on, except in `?test=1` unless the URL has `autosave=1` (GDD 06 §15 rule 8). */
  autosave?: boolean;
  /** `?nodownload=1`. Default: read from the URL. */
  noDownload?: boolean;
  /** Search string to read the flags from (default location.search). */
  search?: string;
  loader?: LoaderDeps;
  /** Pump period in ms (default AUTOSAVE_PUMP_MS); 0 = no timer (a test drives `driver.frame`). */
  pumpMs?: number;
  /** Expose `window.__persistence` and `window.__game.saves` (default: in test mode). */
  expose?: boolean;
}

export interface Persistence {
  game: Game;
  manager: SaveManager;
  driver: AutosaveDriver;
  policy: AutosavePolicy;
  settings: SettingsPersistence;
  profile: ProfileStore;
  kv: LocalKv;
  debug: SavesDebug;
  dispose(): void;
}

type HooksLike = {
  save: (slot: string) => Promise<unknown>;
  load: (slot: string) => Promise<unknown>;
  listSaves: () => Promise<unknown>;
  quitting: () => void;
  onAutosavePoint: unknown;
};

export async function installPersistence(game: Game, opts: InstallOptions = {}): Promise<Persistence> {
  const search = opts.search ?? (typeof location !== 'undefined' ? location.search : '');
  const flags = new URLSearchParams(search);
  const kv = opts.kv ?? createLocalKv();

  // ---- settings: load, apply to the game, then persist every change
  const settings = attachSettingsPersistence(game.settings, kv, { apply: (loaded) => applyLoadedSettings(game, loaded) });
  const unsubSettings = game.settings.subscribe((s, changed) => {
    if (changed.includes('bindings')) game.input.setBindings(s.bindings);
    if (changed.includes('gameplay.autosaveMin')) policy.setIntervalMinutes(s.gameplay.autosaveMin);
  });

  // ---- save manager, driver, policy
  const autosaveOn = opts.autosave ?? (!game.opts.testMode || flags.get('autosave') === '1');
  const policy = new AutosavePolicy({ enabled: autosaveOn });
  policy.setIntervalMinutes(game.settings.get().gameplay.autosaveMin);
  let driver!: AutosaveDriver;
  let adopted: Sim | null = null;
  const host = new GameHost(game, {
    thumbnailsInTest: opts.thumbnailsInTest,
    withoutQuitSave: (fn) => driver.withoutQuitSave(fn),
    onAdopted: (sim) => { adopted = sim; driver.attachSim(sim); policy.resetGame(); },
  });
  const manager = new SaveManager({
    host, storage: opts.storage, fallback: opts.fallback, loader: opts.loader, noDownload: opts.noDownload ?? flags.get('nodownload') === '1',
  });
  let profile!: ProfileStore;
  driver = new AutosaveDriver(manager, policy, host, (sim) => (profile ? attachProfileEvents(sim, profile) : []));
  // ---- notices (before init: the storage-unavailable notice is raised by it)
  const unsubEvents = manager.on((e) => {
    if (e.type === 'storage-unavailable' || e.type === 'autosave-disabled') game.toast(e.message);
    else if (e.type === 'save-result' && e.ok && e.key === 'quick' && !e.autosave) game.toast(e.message === 'Saved.' ? 'Quick saved.' : e.message);
  });

  await manager.init();

  // ---- profile (shares the storage the manager ended up with)
  profile = new ProfileStore({ storage: manager.currentStorage(), kv });
  await profile.load();
  registerHintProfile(profile); // onboarding: hint progress, Reset hints and the page-hide write share this profile

  // ---- the hooks Game already calls
  const hooks = game.saves as unknown as HooksLike;
  hooks.onAutosavePoint = null;
  hooks.save = async (slot) => toSaveResult(await manager.saveTo(slot));
  hooks.load = async (slot) => toSaveResult(await manager.load(slot, { fallbackToAuto: slot === 'quick' }));
  hooks.listSaves = () => listSlotInfos(manager);
  hooks.quitting = () => { driver.trigger('quit'); };

  // ---- optional GameFacade methods of the UI shell
  Object.assign(game, {
    storageAvailable: () => manager.status().availability !== 'unavailable',
    deleteSave: async (slot: string) => toSaveResult(await manager.delete(slot)),
    exportSave: (slot: string) => exportSlotBytes(manager, slot),
    importSave: (data: Uint8Array | string, target: string) => importInto(manager, data, target),
    resetHints: () => profile.resetHints(),
    hasLineage: () => profile.get().lineage.colonies.length > 0,
    /** Codex entries unlocked on this device (the Codex panel, GDD 06 §12; profile, not saves). */
    codexUnlocks: () => profile.get().codex,
    getBindings: () => game.settings.get().bindings,
    setBindings: (b: GameSettings['bindings']) => game.setSettings({ bindings: b }),
    /** Settings > header notice when settings cannot be stored (ui-shell). */
    settingsNotice: () => settings.status().notice,
  });

  // ---- real-time pump: interval autosave clock, play time, new-game detection
  let last = performance.now();
  const pump = () => {
    const now = performance.now();
    const dt = Math.min(AUTOSAVE_PUMP_MAX_DT_S, Math.max(0, (now - last) / 1000));
    last = now;
    try {
      const sim = game.sim;
      if (sim !== driver.attachedSim) {
        driver.attachSim(sim);
        if (sim && sim !== adopted) { policy.resetGame(); manager.playTimeS = 0; manager.noteNewGame(); void manager.clearPinned(); } // a new game started
        adopted = null;
      }
      driver.frame(dt);
    } catch (e) {
      log.warn('autosave pump failed', e);
    }
  };
  const pumpMs = opts.pumpMs ?? AUTOSAVE_PUMP_MS;
  const timer = pumpMs > 0 ? setInterval(pump, pumpMs) : null;
  const onHide = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') return;
    driver.trigger('hidden');
    settings.flush();
    void profile.flush();
  };
  const onPageHide = () => { driver.trigger('hidden'); settings.flush(); void profile.flush(); };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onHide);
  if (typeof window !== 'undefined') window.addEventListener('pagehide', onPageHide);
  if (game.sim) { driver.attachSim(game.sim); }

  const handle: Persistence = {
    game, manager, driver, policy, settings, profile, kv,
    debug: undefined as unknown as SavesDebug,
    dispose() {
      if (timer !== null) clearInterval(timer);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onHide);
      if (typeof window !== 'undefined') window.removeEventListener('pagehide', onPageHide);
      unsubSettings();
      unsubEvents();
      driver.dispose();
      settings.dispose();
      profile.dispose();
    },
  };
  handle.debug = buildSavesDebug(handle);
  if (opts.expose ?? game.opts.testMode) {
    const w = window as unknown as { __persistence?: Persistence; __game?: Record<string, unknown> };
    w.__persistence = handle;
    if (w.__game) w.__game.saves = handle.debug;
  }
  return handle;
}

/** Pushes loaded settings to the parts of the game that cache them (input, camera, renderer). */
function applyLoadedSettings(game: Game, loaded: GameSettings): void {
  const flagQuality = game.opts.quality;
  // An explicit ?quality= wins over the stored preset for this page.
  const graphics = flagQuality !== 'auto' ? { ...loaded.graphics, quality: flagQuality } : loaded.graphics;
  game.input.setBindings(loaded.bindings);
  game.setSettings({ gameplay: loaded.gameplay, camera: loaded.camera, controls: loaded.controls, graphics, audio: loaded.audio, accessibility: loaded.accessibility });
}
