// Screen navigation that lives in the UI layer (GDD 01 1.1, GDD 08 3.1). The game's mode (title / loading / playing /
// paused / epitaph) comes from the snapshot; the book screens that open on top of the title or the pause menu
// (new game, save/load, settings, credits ...) are a small stack held here. Everything in this file is pure.
import { signal } from '@preact/signals';
import type { UiScreen } from '../api';

export type OverlayId = 'new-game' | 'save-load' | 'settings' | 'credits' | 'lineage' | 'codex';
export type SettingsTabId = 'graphics' | 'audio' | 'controls' | 'accessibility' | 'gameplay';
export type SaveTabId = 'save' | 'load' | 'transfer';

export interface NavState {
  /** Overlays above the title / pause menu, bottom first. */
  stack: OverlayId[];
  settingsTab: SettingsTabId;
  saveTab: SaveTabId;
  /** Where Cancel / Back on the loading screen should land after the game returns to the title. */
  afterLoadingCancel: OverlayId | null;
}

export function initialNav(): NavState {
  return { stack: [], settingsTab: 'graphics', saveTab: 'load', afterLoadingCancel: null };
}

/** Overlays that may exist on top of each game mode. */
const ALLOWED: Record<string, readonly OverlayId[]> = {
  title: ['new-game', 'save-load', 'settings', 'credits', 'lineage', 'codex'],
  paused: ['save-load', 'settings', 'codex'],
};

export function allowedOverlays(screen: UiScreen): readonly OverlayId[] {
  return ALLOWED[screen] ?? [];
}

export function openOverlay(nav: NavState, id: OverlayId, opts: { settingsTab?: SettingsTabId; saveTab?: SaveTabId } = {}): NavState {
  const stack = nav.stack[nav.stack.length - 1] === id ? nav.stack : [...nav.stack, id];
  return { ...nav, stack, settingsTab: opts.settingsTab ?? nav.settingsTab, saveTab: opts.saveTab ?? nav.saveTab };
}

export function closeTop(nav: NavState): NavState {
  return { ...nav, stack: nav.stack.slice(0, -1) };
}

export function closeAll(nav: NavState): NavState {
  return { ...nav, stack: [] };
}

/** The overlay to draw for a game mode (the top of the stack if it is allowed there). */
export function activeOverlay(screen: UiScreen, nav: NavState): OverlayId | null {
  const top = nav.stack[nav.stack.length - 1];
  return top && allowedOverlays(screen).includes(top) ? top : null;
}

export type BaseScreen = 'boot' | 'unsupported' | 'title' | 'loading' | 'pause' | 'epitaph' | 'hud';

export function baseScreen(screen: UiScreen): BaseScreen {
  switch (screen) {
    case 'boot': return 'boot';
    case 'unsupported': return 'unsupported';
    case 'title': return 'title';
    case 'loading': return 'loading';
    case 'paused': return 'pause';
    case 'epitaph': return 'epitaph';
    case 'playing': return 'hud';
  }
}

/**
 * Transitions (GDD 01 1.1): called when the game's mode changes. Leaving the title or the pause menu drops the
 * overlays; Cancel on the loading screen returns to the title and, when generation was started from New Game,
 * re-opens New Game (GDD 08 3.6: "returns to new-game with all fields preserved").
 */
export function onModeChange(nav: NavState, from: UiScreen, to: UiScreen): NavState {
  if (from === to) return nav;
  if (from === 'loading' && to === 'title' && nav.afterLoadingCancel) {
    return { ...nav, stack: [nav.afterLoadingCancel], afterLoadingCancel: null };
  }
  const next: NavState = { ...nav, stack: [], afterLoadingCancel: to === 'loading' ? nav.afterLoadingCancel : null };
  return next;
}

export const nav = signal<NavState>(initialNav());

export function updateNav(f: (n: NavState) => NavState): void {
  nav.value = f(nav.value);
}
