// The opening's UI contract: a plain read-out the founding flow (src/game/flows/founding) publishes every frame, and
// the actions the founding screens call. The UI never reads SimState; the flow words nothing (the screens do).
import { signal } from '@preact/signals';

export interface FoundingSiteRow {
  id: string;
  /** "Diggability" ... */
  label: string;
  /** 0..1 */
  value: number;
  /** Filled dots (0..5) to draw: the simulation's own rounding (factorDots), the one its words are chosen by. */
  dots: number;
  word: string;
}

export interface FoundingUi {
  phase: string;
  /** Intro card facts (shown while phase is `intro-card`). */
  intro: { common: string; binomial: string; locality: string; place: string; season: string; day: number; clock: string; weather: string; tempC: number };
  /** The queen's meters (null after hand-over or death). */
  queen: { reserves: number; desiccation: number; health: number; reservesFalling: boolean; drying: boolean } | null;
  /** Site read-out; `chamberQ` from the dig on (the actual chamber's Q). */
  site: { active: boolean; rows: FoundingSiteRow[]; q: number; word: string | null; chamberQ: number | null } | null;
  readiness: { r: number; depth: number; volume: number; ready: boolean } | null;
  /** Glyph prompts of the opening script: input action id (binding lookup) and its short label. */
  prompts: { action: string; text: string }[];
  clutch: { eggs: number; limit: number; batches: number; expected: [number, number] | null; reservesAtFirst: number | null; safeEggs: number | null; risk: 'ok' | 'amber' | 'red' } | null;
  canBeginLapse: boolean;
  lapse: {
    progress: number; stage: string; counters: Record<string, number>; date: string; skipping: boolean; reducedMotion: boolean;
  } | null;
  /** The final card ("Workers: N. Reserves: x %."), shown at the end of the lapse until Continue. */
  outcome: { workers: number; reserves: number } | null;
  /** Hand-over banner with the first aims. */
  handover: { aims: string[] } | null;
  failure: { cause: string; text: string; retriesLeft: number } | null;
}

export interface FoundingActions {
  skipIntro(): void;
  beginLapse(): void;
  skipLapse(): void;
  closeOutcome(): void;
  stayWithQueen(): void;
  takeWorker(): void;
  retry(): void;
  acceptFailure(): void;
}

/** What the founding screens show now; null outside an opening. */
export const foundingUi = signal<FoundingUi | null>(null);

/** Set by the founding flow when a game starts. */
export const foundingActions = signal<FoundingActions | null>(null);

export function publishFounding(ui: FoundingUi | null): void {
  foundingUi.value = ui;
}
