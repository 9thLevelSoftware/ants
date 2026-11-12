// The UI contract: the snapshot the UI reads (refreshed by src/game/uiBridge.ts a few times per second) and the
// GameFacade the UI calls. The UI never touches SimState. Extend both additively (new optional fields / methods).
import type { DirectivesPatch, MarkerKind, PossessRole, RunSpeed, SpeedLevel } from '@/sim/types';
import type { Vec3 } from '@/core';
import type { BindingSet } from '@/input';
import type { CustomRules, StartSeasonRule } from '@/sim/types';
import type { NewGameOptions } from '@/game/newGame/options';
import type { GameMode, ViewId } from '@/game/time/speedRules';
import type { GameSettings, SettingsPatch } from '@/game/settings/settings';

export type { NewGameOptions, GameMode, ViewId, GameSettings, SettingsPatch };

/** Screens the shell routes on: the game modes plus the two boot outcomes. */
export type UiScreen = 'boot' | 'unsupported' | GameMode;

export interface UiLoading {
  /** Phase name shown to the player (worldgen wording). */
  phase: string;
  /** 0..1 */
  progress: number;
  attempt: number;
  maxAttempts: number;
  /** Set when generation or loading failed; the screen shows it with Back. */
  error: string | null;
  /**
   * ui-shell: whether this is world generation or loading a save (the wording and summary differ). Absent = the UI
   * infers it from the call it made itself (newGame vs load / import).
   */
  kind?: 'generate' | 'load';
}

export interface UiTime {
  tick: number;
  year: number;
  season: string;
  dayOfSeason: number;
  hour: number;
  minute: number;
  /** "Spring · Day 3 · 07:40" */
  label: string;
}

export interface UiSpeed {
  /** 0 = paused. */
  level: SpeedLevel;
  paused: boolean;
  /** Running speed chosen (kept while paused). */
  requested: RunSpeed;
  /** Achieved game s per real s. */
  effective: number;
  /** The sim cannot keep up with the requested speed. */
  lagging: boolean;
  belowRealTime: boolean;
  /** Levels the player may pick now (GDD 01 §8). */
  allowed: SpeedLevel[];
  /** Real-time ticking off (test mode: only __game.step advances). */
  manualClock: boolean;
}

export interface UiColony {
  workers: number;
  queenAlive: boolean;
  /** All adults including the queen. */
  adults: number;
  brood: { egg: number; larva: number; pupa: number };
  stores: { c: number; p: number };
}

export interface UiPossessed {
  id: number;
  caste: string;
  task: string;
  /** 0..1 */
  health: number;
  cropC: number;
  cropP: number;
  cropCap: number;
  carrying: string;
  trailOn: boolean;
  action: string | null;
  underground: boolean;
}

export interface UiPrompt {
  primary: string | null;
  secondary: string | null;
  extras: string[];
}

export interface UiAlert {
  id: number;
  kind: string;
  level: string;
  title: string;
}

export interface UiToast {
  id: number;
  text: string;
}

export interface UiSnapshot {
  /** Increments on every refresh. */
  rev: number;
  screen: UiScreen;
  mode: GameMode;
  view: ViewId;
  loading: UiLoading | null;
  time: UiTime | null;
  speed: UiSpeed | null;
  colony: UiColony | null;
  possessed: UiPossessed | null;
  prompt: UiPrompt | null;
  alerts: UiAlert[];
  toasts: UiToast[];
  hudHidden: boolean;
  /** Uncaught error text for the error overlay, null when none. */
  error: string | null;
  /** Epitaph card (T1 minimal), null outside the epitaph. */
  epitaph: { ageDays: number; peakWorkers: number; cause: string } | null;
  /**
   * ui-shell: how long ago the newest save of any kind was written (null = never saved this game). Drives the pause
   * menu's "Saved 3 min ago" line and the 60 s unsaved-progress warning (GDD 08 3.5). Absent = unknown.
   */
  lastSave?: { agoS: number; kind: 'auto' | 'quick' | 'manual'; timeLabel?: string } | null;
}

export function emptySnapshot(screen: UiScreen = 'boot'): UiSnapshot {
  return {
    rev: 0, screen, mode: 'title', view: 'observer', loading: null, time: null, speed: null, colony: null, possessed: null,
    prompt: null, alerts: [], toasts: [], hudHidden: false, error: null, epitaph: null,
  };
}

/** Result of a save/load call. Persistence is the `save` task; until then calls report 'unavailable'. */
export interface SaveResult {
  ok: boolean;
  status: 'ok' | 'unavailable' | 'failed';
  message?: string;
  /** Finer word of the save layer (src/game/save/types.ts SaveCode): 'quota', 'world-mismatch', 'corrupt', ... */
  code?: string;
  /** Saved to the in-memory fallback only: lost when the page closes (storage unavailable). */
  volatile?: boolean;
}

export interface SaveSlotInfo {
  slot: string;
  label: string;
  savedAt: string;
  colonyDay: number;
  workers: number;
  // ui-shell additions (all optional): what the slot card of GDD 08 7.6 shows
  kind?: 'auto' | 'quick' | 'manual';
  /** Autosave ring generation label, e.g. "Season change". */
  trigger?: string;
  species?: string;
  archetype?: string;
  /** Resolved seed code, e.g. "4F7A-21C9". */
  seedCode?: string;
  /** "Summer · Day 5 · Year 2" */
  dateLabel?: string;
  /** Adult ants (workers and queen) at save time. */
  population?: number;
  playTimeS?: number;
  version?: string;
  /** JPEG data URL captured at save time. */
  thumbnail?: string | null;
  /** The stored data failed validation: show "damaged" (save task). */
  damaged?: boolean;
  /** Autosave ring write counter (largest = newest); 0 for other slots (save task). */
  generation?: number;
  /** A pinned autosave generation (`final`) is kept until a new game starts (save task). */
  pinned?: boolean;
}

/** Result of building an export file (the UI does the download or the text fallback). */
export interface ExportResult {
  ok: boolean;
  bytes?: Uint8Array;
  message?: string;
}

/** What the New Game screen sends on top of NewGameOptions (the game ignores fields it does not know yet). */
export interface NewGameExtras {
  /** 'natural' = the species' own founding day (GDD 08 3.7). */
  startSeason?: StartSeasonRule;
  /** Overrides on top of the difficulty preset (GDD 08 3.7 custom rules). */
  customRules?: Partial<CustomRules>;
  /** Onboarding hints on or off for this colony. */
  hints?: boolean;
  /** The seed as the player typed it (the resolved uint32 goes in `seed`). */
  seedText?: string;
}
export type NewGameRequest = NewGameOptions & NewGameExtras;

/** Outcome of GameFacade.newGame: it resolves (never rejects); a failure also shows the loading error panel. */
export interface NewGameResult {
  ok: boolean;
  /** A later newGame / quit superseded this one. */
  cancelled?: boolean;
  error?: string;
}

/** Everything the UI may ask of the game. Methods enqueue commands or change game-level state; they never throw. */
export interface GameFacade {
  newGame(opts?: NewGameRequest): Promise<NewGameResult>;
  /** Cancel a running generation / leave the game and show the title. */
  quitToTitle(): void;
  openPauseMenu(): void;
  closePauseMenu(): void;
  setSpeed(level: SpeedLevel): void;
  togglePause(): void;
  possess(target: number | PossessRole): void;
  release(): void;
  setView(view: ViewId): void;
  setDirectives(patch: DirectivesPatch): void;
  placeMarker(kind: MarkerKind, pos: Vec3, radius?: number): void;
  removeMarker(markerId: number): void;
  setHudHidden(hidden: boolean): void;
  dismissToast(id: number): void;
  // save / load hooks (the save task implements them)
  save(slot: string): Promise<SaveResult>;
  load(slot: string): Promise<SaveResult>;
  listSaves(): Promise<SaveSlotInfo[]>;
  // settings
  getSettings(): GameSettings;
  setSettings(patch: SettingsPatch): void;
  // ui-shell additions (optional: the screens degrade when the game does not provide them yet)
  /** Current key bindings (Settings > Controls). */
  getBindings?(): BindingSet;
  /** Replace the bindings; the owner persists them (`foundress.bindings.v1`). */
  setBindings?(bindings: BindingSet): void;
  /** False when IndexedDB is unavailable: the Save tab is disabled and Export / Import remain (GDD 08 7.6). */
  storageAvailable?(): boolean;
  deleteSave?(slot: string): Promise<SaveResult>;
  /** The `.foundress` bytes of a slot. */
  exportSave?(slot: string): Promise<ExportResult>;
  /** Import `.foundress` bytes or the `FOUNDRESS1:` text into `target` (a slot id, or 'now' = load without storing). */
  importSave?(data: Uint8Array | string, target: string): Promise<SaveResult>;
  /** '' when settings are stored; else the Settings header notice ("Settings cannot be stored in this browser context"). */
  settingsNotice?(): string;
  /** Forget which onboarding hints were learned (Settings > Gameplay). */
  resetHints?(): void;
  /** True when the lineage store has records (the Title shows Lineage only then). */
  hasLineage?(): boolean;
}
