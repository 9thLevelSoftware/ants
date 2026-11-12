// The UI contract: the snapshot the UI reads (refreshed by src/game/uiBridge.ts a few times per second) and the
// GameFacade the UI calls. The UI never touches SimState. Extend both additively (new optional fields / methods).
import type { DirectivesPatch, MarkerKind, PossessRole, RunSpeed, SpeedLevel } from '@/sim/types';
import type { Vec3 } from '@/core';
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
}

export interface SaveSlotInfo {
  slot: string;
  label: string;
  savedAt: string;
  colonyDay: number;
  workers: number;
}

/** Outcome of GameFacade.newGame: it resolves (never rejects); a failure also shows the loading error panel. */
export interface NewGameResult {
  ok: boolean;
  /** A later newGame / quit superseded this one. */
  cancelled?: boolean;
  error?: string;
}

/** Everything the UI may ask of the game. Methods enqueue commands or change game-level state; they never throw. */
export interface GameFacade {
  newGame(opts?: NewGameOptions): Promise<NewGameResult>;
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
}
