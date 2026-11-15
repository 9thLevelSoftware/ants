// `window.__panels`: the panels' verification surface (test mode and the demo page only), next to `window.__hud`. Reads and
// the UI's own open / close state; nothing that changes the game.
import { snapshot } from '../../store';
import { openDrawer, type DrawerId } from '../../hud/state';
import { overlays } from '../../overlays/state';
import { toolState } from '../markers/toolState';
import { HIGHLIGHT_CLASS } from './highlight';
import { codexSelection, healthExpanded, journalTab, openBook, panelsBridge, type BookId } from './state';

export function installPanelsDebug(): () => void {
  const api = {
    /** Which panel screens are open (the ids of GDD 08 section 3: colony-health, nest, journal, codex). */
    screen: () => ({
      drawer: openDrawer.peek(), book: openBook.peek(), screens: [
        ...(openDrawer.peek() === 'health' ? ['colony-health'] : []), ...(openDrawer.peek() === 'nest' ? ['nest'] : []),
        ...(openDrawer.peek() === 'directives' ? ['directives'] : []), ...(openDrawer.peek() === 'roster' ? ['roster'] : []),
        ...(openBook.peek() ? [openBook.peek() as string] : []),
      ],
    }),
    open: (id: DrawerId | BookId) => { if (id === 'journal' || id === 'codex') openBook.value = id; else openDrawer.value = id; return api.screen(); },
    close: () => { openBook.value = null; openDrawer.value = null; return api.screen(); },
    expanded: () => healthExpanded.peek(),
    expand: (id: string | null) => { healthExpanded.value = id; return healthExpanded.peek(); },
    journalTab: (t?: 'aims' | 'milestones' | 'graphs' | 'log') => { if (t) journalTab.value = t; return journalTab.peek(); },
    codexSelection: () => codexSelection.peek(),
    overlays: () => ({ ...overlays.peek() }),
    tool: () => toolState.peek(),
    highlighted: () => Array.from(document.querySelectorAll(`.${HIGHLIGHT_CLASS}`)).map((el) => (el as HTMLElement).dataset.testid ?? (el as HTMLElement).dataset.group ?? (el as HTMLElement).dataset.tool ?? el.className),
    health: () => snapshot.peek().health ?? null,
    nest: () => snapshot.peek().nest ?? null,
    journal: () => snapshot.peek().journal ?? null,
    get bridge() { return panelsBridge.peek(); },
  };
  (window as unknown as { __panels?: typeof api }).__panels = api;
  return () => { delete (window as unknown as { __panels?: typeof api }).__panels; };
}
