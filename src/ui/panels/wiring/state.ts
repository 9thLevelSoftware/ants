// UI-only state of the panels (signals): which book screen is open, the Journal tab, the codex selection, the expanded
// Colony health row, and the seam to the Game (the panels bridge). Nothing here is game state and nothing is persisted.
import { signal } from '@preact/signals';
import type { PanelsBridge } from './bridgeTypes';

export type BookId = 'journal' | 'codex';
export type JournalTab = 'aims' | 'milestones' | 'graphs' | 'log';

/** The book screen open over the HUD (Journal, Codex); the sim is paused while one is open. */
export const openBook = signal<BookId | null>(null);
export const journalTab = signal<JournalTab>('aims');

/** Codex: the selected entry id and the category / search text of the list. */
export const codexSelection = signal<string | null>(null);

/** Colony health: the diagnostic whose cause chain is expanded (one at a time). */
export const healthExpanded = signal<string | null>(null);

/** The Game's seam (tool state, camera jumps, designate). Null in a page without a game. */
export const panelsBridge = signal<PanelsBridge | null>(null);

/** Nest overview: the selected chamber id, -1 none. */
export const nestSelection = signal<number>(-1);
