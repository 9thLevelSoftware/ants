// The overwintering screens' contract (GDD 06 §6.2-§6.5, GDD 08 time-lapse overlay): the winter flow
// (src/game/flows/overwinter) publishes a plain read-out; the screens call the actions. The UI words everything.
import { signal } from '@preact/signals';
import type { WinterRecord } from '@/sim/types';

export interface WinterLapseUi {
  /** 0..1 of the presentation. */
  progress: number;
  /** Winter day shown (1-based) of `days`. */
  day: number;
  days: number;
  workers: number;
  larvae: number;
  c: number;
  p: number;
  /** Cluster temperature of the day, C, and whether it was a frost night. */
  tMean: number;
  frost: boolean;
  /** Beat of the day ('' none): frost, rain, flood, disease, starvation. */
  beat: string;
  frostSoFar: number;
  reducedMotion: boolean;
  /** Reduced motion: the still shown (0..OVERWINTER_STILLS-1). */
  still: number;
  skipping: boolean;
}

export interface WinterUi {
  phase: 'banner' | 'lapse' | 'report';
  species: string;
  /** Banner: delays left and the seconds before it begins on its own. */
  banner: { delaysLeft: number; secondsLeft: number } | null;
  lapse: WinterLapseUi | null;
  report: WinterRecord | null;
}

export interface WinterActions {
  begin(): void;
  delay(): void;
  skip(): void;
  close(): void;
}

export const winterUi = signal<WinterUi | null>(null);
export const winterActions = signal<WinterActions | null>(null);

export function publishWinter(ui: WinterUi | null): void {
  winterUi.value = ui;
}
