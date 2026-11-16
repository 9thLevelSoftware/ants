// Shapes of the onboarding hint engine (GDD 08 §9). Plain data and small interfaces: the engine is pure TypeScript
// (no DOM, no three) so its rules are tested in Node; `facts.ts` reads the game, `src/ui/hud/prompts` draws the view.
import type { AimId, HintId, HintState } from '@/sim/types';

/** The verbs a hint teaches, as counted uses. One key can complete several hints. */
export type UseKey =
  | 'move' | 'look' | 'antennate' | 'dig' | 'readiness' | 'seal' | 'lay' | 'timelapse' | 'cycle' | 'observer' | 'pickup'
  | 'trail' | 'share' | 'colony-view' | 'marker' | 'speed' | 'scent' | 'why' | 'directives' | 'photo' | 'overlay' | 'reserves';

/** Who draws a hint. `engine`: the hint card (src/ui/hud/prompts). `founding`: the opening's own overlay. `prompt`: the context prompt chip. */
export type Presenter = 'engine' | 'founding' | 'prompt';

/** Where the hint card sits (the UI maps these to HUD regions that do not cover the subject). */
export type HintAnchor = 'top' | 'bottom' | 'time' | 'pulse' | 'panel';

/** Plain facts about the running game, refreshed a few times per real second (`facts.ts`). Nothing here is sim state. */
export interface Facts {
  /** A game is being played right now (not title, loading, pause menu, epitaph). */
  active: boolean;
  /** The pause menu is open: the clock stands still. */
  menuOpen: boolean;
  hudHidden: boolean;
  view: 'possess' | 'observer' | 'colony' | 'photo';
  /** The opening (founding) sequence is running: intro card to hand-over. */
  foundingInProgress: boolean;
  openingPhase: string | null;
  /** A time-lapse (first brood, winter) is playing. */
  timelapse: boolean;
  /** The possessed ant is fighting right now (events extend this by a quiet time). */
  fighting: boolean;
  criticalAlert: boolean;
  /** Any warning or critical alert is up. */
  alertActive: boolean;
  speedPaused: boolean;
  /** The player is steering the possessed ant. */
  moving: boolean;
  possessed: null | { isQueen: boolean; underground: boolean; carryingFood: boolean; trailOn: boolean; colonyOrders: boolean };
  workers: number;
  /** Game days since the first worker hatched (milestone `ms-first-worker`); -1 while none has. */
  daysSinceFirstWorker: number;
  /** A pick-up prompt line / a share-food prompt line is showing. */
  promptPickup: boolean;
  promptShare: boolean;
  /** The first food was delivered / the first trail exists (milestones of the sim). */
  firstFood: boolean;
  firstTrail: boolean;
  /** The colony's worst diagnostic is `warn` or `bad`. */
  diagWarn: boolean;
  /** Markers placed plus the player's dig plans (grows when the player places one). */
  markerTotal: number;
  /** UI state: the open drawer, whether the scent view / another overlay is on. */
  drawer: string | null;
  overlayScent: boolean;
  overlayOther: boolean;
  /** Hints the opening overlay is drawing right now, and the context prompt chip is drawing right now. */
  externalShown: HintId[];
  /** Setting `gameplay.hints`. */
  hintsOn: boolean;
}

/** What a trigger may ask the engine besides the facts. */
export interface TriggerContext {
  /** Real seconds since the verb was last performed (Infinity: never in this game). */
  sinceUse(key: UseKey): number;
  /** Per-game flag set by a sim event (`firstDelivery`, `trailExists`, ...). */
  flag(name: string): boolean;
  /** The hint is learned or dismissed. */
  resolved(id: HintId): boolean;
  /** The engine clock, real seconds. */
  clock: number;
}

/** How a hint is completed ("performing the action counts as learning"). */
export interface LearnRule {
  key: UseKey;
  /** Uses needed (default HINT_LEARN_USES). */
  uses: number;
  /** The uses are seconds of continuous action (cumulative movement), not events. */
  seconds?: boolean;
}

export interface HintDef {
  id: HintId;
  /** Order of the first-fifteen-minutes table (GDD 08 §9.2 `#`); also the priority, lower first. */
  order: number;
  presenter: Presenter;
  /** The engine draws it as a fallback when its own presenter is not showing it (hint-cycle after the hand-over banner is gone). */
  engineFallback?: boolean;
  anchor: HintAnchor;
  /** The trigger: true while the hint would help. */
  when(f: Facts, c: TriggerContext): boolean;
  /** Hints that must be learned or dismissed first. */
  after?: HintId[];
  /** Real seconds `when` must hold before the hint shows (default HINT_DELAY_REAL_S). */
  delayS?: number;
  learn: LearnRule;
  /** Completed after being on screen this long with no action (a gauge: nothing to press). */
  passiveS?: number;
  /** About the opening: may show while it runs (when the founding overlay does not already show it). */
  opening?: boolean;
  /** About the time-lapse: may show during one. */
  timelapse?: boolean;
  /** Aims this step of the journey opens and closes (the simulation does it; kept here as the design table and checked by the e2e). */
  aims?: { opens?: AimId[]; closes?: AimId[] };
}

/** The hint progress store: the device profile (`src/game/profile`) or a stand-in. */
export interface HintStore {
  /** Loaded and usable (false: hints wait, nothing shows). */
  ready(): boolean;
  get(id: HintId): { uses: number; state: HintState } | undefined;
  markShown(id: HintId): void;
  /** Adds `n` uses; `learnAt` uses make the hint learned. */
  recordUse(id: HintId, learnAt: number, n: number): void;
  learn(id: HintId): void;
  dismiss(id: HintId): void;
  /** Every hint pending again ("Reset hints"). */
  reset(): void;
  /** Called after any change of the hint states (also a reset from Settings); returns the unsubscribe function. */
  subscribe(fn: () => void): () => void;
}

/** What the card draws. `seq` changes with every new hint so the card can restart its entrance. */
export interface HintView {
  id: HintId;
  seq: number;
  anchor: HintAnchor;
  /** Compact form: key cap only, faded (after HINT_IDLE_REAL_S without the action). */
  compact: boolean;
  /** Text after the key cap, from the words table. */
  verb: string;
  /** Input action whose CURRENT binding the key cap shows; null: no key. */
  action: string | null;
  hold: boolean;
  /** Key text shown when `action` is null (the marker tools' Shift+1, which is not a rebindable action). */
  fixedKey?: string;
}

/** One line of the engine log (the e2e reads it to prove order and once-only). */
export interface HintLogEntry {
  /** Engine clock, real seconds. */
  at: number;
  event: 'shown' | 'learned' | 'dismissed' | 'compact' | 'full-again' | 'hidden' | 'retired';
  id: HintId;
  presenter: Presenter;
  /** Why (a short word), for hidden / retired. */
  note?: string;
}

/** A sim event as the engine sees it: the `type` and the payload fields (loosely typed on purpose). */
export type EngineEvent = { type: string } & Record<string, unknown>;

export interface EventContext {
  possessedId: number;
  colonyId: number;
}
