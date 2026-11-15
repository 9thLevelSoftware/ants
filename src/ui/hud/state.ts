// UI-only HUD state (signals): which drawer is open, whether the colony pulse is pinned open, the roster's query, the
// inspect card's pin, and the hook registry for panels that later tasks own (colony health, nest overview, journal).
// Nothing here is game state; it is never persisted.
import { signal } from '@preact/signals';
import type { UiAlert, UiRosterQuery } from '../api';
import { defaultQuery } from '../panels/roster/rosterModel';
import type { HudBridge } from '@/game/uiBridge/install';

export type DrawerId = 'directives' | 'roster' | 'health' | 'nest';

/** The drawer that is open (one at a time, GDD 08 4.1), or null. */
export const openDrawer = signal<DrawerId | null>(null);

export function openPanel(id: DrawerId): void {
  openDrawer.value = id;
}
export function closePanel(id?: DrawerId): void {
  if (id === undefined || openDrawer.value === id) openDrawer.value = null;
}
export function togglePanel(id: DrawerId): void {
  openDrawer.value = openDrawer.value === id ? null : id;
}

/** The Roster's filters, sort and scroll window. The bridge answers it with `snapshot.roster`. */
export const rosterQuery = signal<UiRosterQuery>(defaultQuery());

/** The card the player pinned by clicking a target (GDD 08 section 1, layer C); null = follow the hover. */
export const inspectPin = signal<{ kind: string; id: number } | null>(null);
/** What the pointer hovers (set by picking through the game's highlight, or the debug hook). */
export const inspectHover = signal<{ kind: string; id: number } | null>(null);

/** Actions that need the running Game beyond the GameFacade (follow, anchor projection). Null in the demo page. */
export const hudBridge = signal<HudBridge | null>(null);

/** Entry points for panels that later tasks own. A hook that is not registered hides its affordance. */
export interface HudHooks {
  /** "Why?" on the colony pulse and click-through of an alert with a diagnostic (Colony health, key Y). */
  openHealth?(diagnosticId: string | null): void;
  /** Click-through: move the camera to the alert's focus. */
  jumpTo?(focus: NonNullable<UiAlert['focus']>): void;
  /** "+n more" chip and "Open in journal". */
  openJournal?(): void;
}
export const hudHooks: HudHooks = {};

export function registerHudHooks(h: HudHooks): void {
  Object.assign(hudHooks, h);
}
