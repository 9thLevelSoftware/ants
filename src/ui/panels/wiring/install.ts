// Wires the panels once (called from the HUD's wiring effect): the stylesheet, the Game seam, the request flags that make the
// bridge build the panels' slices only while a panel is open, the pause-while-a-book-is-open rule, the alert click-through
// hooks (GDD 08 6.2, App. E check 11), the tool-state follower, and the test-mode debug surface.
import { effect, untracked } from '@preact/signals';
import { hudRequests } from '@/game/uiBridge/requests';
import { installPanelsBridge } from '@/game/uiBridge/panels/bridge';
import { hudBridge, openDrawer, openPanel, registerHudHooks } from '../../hud/state';
import { facade, snapshot } from '../../store';
import { startToolState } from '../markers/toolState';
import { installPanelsDebug } from './debug';
import { installPanelsStyles } from './styles';
import { padToolsFocus } from './toolsPad';
import { healthExpanded, journalTab, openBook, panelsBridge } from './state';

/** Click-through of an alert or the pulse's "Why?" to Colony health, and the jump of the camera (GDD 08 6.2). */
export function openHealthAt(diagnosticId: string | null): void {
  healthExpanded.value = diagnosticId;
  openBook.value = null;
  openPanel('health');
}

export function openJournalLog(): void {
  journalTab.value = 'log';
  openDrawer.value = null;
  openBook.value = 'journal';
}

export function installPanels(): () => void {
  installPanelsStyles();
  const stops: (() => void)[] = [];
  stops.push(effect(() => {
    const f = facade.value;
    panelsBridge.value = f ? installPanelsBridge(f) : null;
  }));
  stops.push(startToolState());
  stops.push(effect(() => { document.documentElement.classList.toggle('pn-pad-focus', padToolsFocus.value); }));
  registerHudHooks({
    openHealth: openHealthAt,
    jumpTo: (focus) => panelsBridge.peek()?.jumpTo(focus),
    openJournal: openJournalLog,
  });
  // the bridge builds a panel's slice only while it is open; a refresh is asked for on opening
  let raf = 0;
  const refresh = (): void => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; facade.peek()?.refreshUi?.(); }); };
  stops.push(effect(() => {
    const d = openDrawer.value, b = openBook.value;
    hudRequests.panels.health = d === 'health';
    hudRequests.panels.nest = d === 'nest';
    hudRequests.panels.journal = b === 'journal';
    untracked(refresh);
  }));
  // a book screen pauses the simulation and gives the speed back on closing (GDD 08 7.1); game keys wait while it is open
  let paused = false;
  stops.push(effect(() => {
    const open = openBook.value !== null;
    const f = facade.peek(), sp = snapshot.peek().speed;
    if (open && !paused && sp && !sp.paused) { paused = true; f?.togglePause(); }
    else if (!open && paused) { paused = false; if (snapshot.peek().speed?.paused) f?.togglePause(); }
    hudBridge.peek()?.suspendGameKeys(open);
    if (open) openDrawer.value = null;
  }));
  // the screen ends (title, epitaph): nothing stays open
  stops.push(effect(() => {
    const mode = snapshot.value.mode;
    if (mode !== 'playing' && mode !== 'paused') { openBook.value = null; }
  }));
  const params = new URLSearchParams(location.search);
  if (params.get('test') === '1' || document.documentElement.dataset.hudDemo === '1' || document.documentElement.dataset.panelsDemo === '1') stops.push(installPanelsDebug());
  return () => { stops.forEach((s) => s()); if (raf) cancelAnimationFrame(raf); hudRequests.panels.health = hudRequests.panels.nest = hudRequests.panels.journal = false; };
}
