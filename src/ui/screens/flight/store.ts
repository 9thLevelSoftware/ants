// The nuptial flight's screens (GDD 06 §11.5-§11.6, GDD 08): the release prompt (policy `ask`), the launch prompt
// (fly as a young queen / watch / continue), the possessed flight's read-out and the end card. Published by the
// flight flow (src/game/flows/flight); the UI words everything.
import { signal } from '@preact/signals';

export interface FlightUi {
  /** `ask` policy: conditions are good, release? (p = the day's launch chance). */
  ask: { p: number } | null;
  /** A launch is assembling: the take-off prompt. */
  launch: { gynes: number; males: number; secondsLeft: number } | null;
  /** The possessed flight in progress. */
  flying: {
    phase: string; energy: number; mating: number; mated: boolean; heightBu: number; lekDistBu: number; seconds: number; windMs: number;
  } | null;
  /** The flight just ended: what happened, and the daughters it produced. */
  ended: {
    outcome: string; possessed: boolean; founded: boolean; launched: number; mated: number; daughters: number; witnessedDaughterId: string | null;
  } | null;
}

export interface FlightActions {
  release(): void;
  wait(): void;
  flyAsQueen(): void;
  watch(): void;
  landNow(): void;
  closeEnded(): void;
  /** Opens the Lineage screen (the daughter offer). */
  openLineage(): void;
}

export const flightUi = signal<FlightUi | null>(null);
export const flightActions = signal<FlightActions | null>(null);

export function publishFlight(ui: FlightUi | null): void {
  flightUi.value = ui;
}
