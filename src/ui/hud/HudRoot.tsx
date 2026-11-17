// The in-game HUD (GDD 08 3.4): time cluster, colony pulse, alerts feed, possessed-ant panel, context prompts, inspect
// card, toasts, and the Directives and Roster drawers. Mounted by App.tsx while the game is playing or paused. Layout
// never covers the middle of the screen: HUD chips hug the corners, drawers dock right. H hides the layer-A chips (the
// game toggles `hudHidden`); a hidden HUD keeps only critical alerts.
import { Component, type ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { effect, untracked } from '@preact/signals';
import { hudRequests } from '@/game/uiBridge/requests';
import { installHudBridge } from '@/game/uiBridge/install';
import { facade, snapshot } from '../store';
import { installEnvironment } from '../styles';
import { installMenuKeys } from '../screens/menuKeys';
import { Directives } from '../panels/directives/Directives';
import { InspectCard } from '../panels/inspect/InspectCard';
import { startInspectRequests } from '../panels/inspect/inspectState';
import { Roster } from '../panels/roster/Roster';
import { HealthDrawer } from '../panels/health/HealthDrawer';
import { NestDrawer } from '../panels/nest/NestDrawer';
import { installPanels } from '../panels/wiring/install';
import { openBook } from '../panels/wiring/state';
import { PanelsLayer } from '../panels/wiring/PanelsLayer';
import { AlertsFeed } from './AlertsFeed';
import { startFeed } from './alerts/store';
import { ColonyPulse } from './ColonyPulse';
import { installHudDebug } from './debugHook';
import { watchKeepOut } from './keepOut';
import { ENTERED_SELECTOR, keepChipsOutOfTabOrder, onChipClick, onChipMouseDown, onLeaveKey } from './focusPolicy';
import { installHudKeys } from './hotkeys';
import { installNav } from '../nav';
import { PossessedPanel } from './PossessedPanel';
import { ContextPrompts } from './ContextPrompts';
import { hudHiddenSlice, screenSlice, viewSlice } from './slices';
import { KeyHint } from '../components/KeyHint';
import { hudBridge, openDrawer, rosterQuery } from './state';
import { installHudStyles } from './styles';
import { TimeCluster } from './TimeCluster';
import { Toasts } from './Toasts';
import { SoundCuePips } from './SoundCuePips';

/** Wires everything the HUD needs once: styles, keys, feed, requests, bridge, gamepad, debug hook. */
function useHudWiring(): void {
  useEffect(() => {
    // the shell's stylesheet first, so the HUD's rules come after it in the cascade (equal specificity: the later wins)
    const stops: (() => void)[] = [
      installEnvironment(window, () => { const q = facade.value?.getSettings?.().graphics.quality; return q === 'high' || q === 'ultra'; }),
    ];
    installHudStyles();
    stops.push(installMenuKeys(window), installHudKeys(), installNav(), startFeed(), startInspectRequests(), installPanels());
    const params = new URLSearchParams(location.search);
    if (params.get('test') === '1' || document.documentElement.dataset.hudDemo === '1') stops.push(installHudDebug());
    // the roster request follows the open drawer; any change of the query refreshes the snapshot (at most once a frame)
    let raf = 0;
    stops.push(effect(() => {
      const open = openDrawer.value === 'roster';
      const q = rosterQuery.value;
      hudRequests.roster = open ? q : null;
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; facade.peek()?.refreshUi?.(); });
    }));
    // the Directives data costs a pass over the colony: it is built only while that drawer is open, and at once on opening
    stops.push(effect(() => {
      const open = openDrawer.value === 'directives';
      hudRequests.directivesOpen = open;
      // untracked: building the snapshot reads signals of its own, and this effect must not subscribe to (and then loop on) them
      if (open) untracked(() => facade.peek()?.refreshUi?.());
    }));
    stops.push(effect(() => {
      const f = facade.value;
      if (!f) { hudBridge.value = null; return; }
      hudBridge.value = installHudBridge(f);
    }));
    stops.push(effect(() => { void snapshot.value; hudBridge.peek()?.settle(); }));
    return () => { stops.forEach((s) => s()); cancelAnimationFrame(raf); hudRequests.roster = null; hudRequests.directivesOpen = false; };
  }, []);
  // keys belong to the drawer, the alerts feed or the pulse while focus is inside it (the game's Tab cycles ants, its arrows orbit the camera)
  useEffect(() => {
    const inside = (t: EventTarget | null): boolean => !!(t as Element | null)?.closest?.(ENTERED_SELECTOR);
    const onIn = (e: FocusEvent) => { if (inside(e.target)) hudBridge.peek()?.suspendGameKeys(true); };
    const onOut = (e: FocusEvent) => { if (inside(e.target) && !inside(e.relatedTarget)) hudBridge.peek()?.suspendGameKeys(false); };
    document.addEventListener('focusin', onIn);
    document.addEventListener('focusout', onOut);
    const stop = effect(() => { if (openDrawer.value === null) hudBridge.peek()?.suspendGameKeys(false); });
    return () => { document.removeEventListener('focusin', onIn); document.removeEventListener('focusout', onOut); stop(); };
  }, []);
  // the drawer closes when play stops (pause menu, title, epitaph)
  useEffect(() => effect(() => {
    if (screenSlice.value !== 'playing' && screenSlice.value !== 'paused') openDrawer.value = null;
  }), []);
  // "pause when a panel opens" (setting, off by default): pause on open, resume on close if this pause was ours
  useEffect(() => {
    let ours = false;
    return effect(() => {
      const open = openDrawer.value !== null;
      const f = facade.peek(), sp = snapshot.peek().speed;
      if (open && !ours && f?.getSettings?.().gameplay.pauseWhenPanelOpen && sp && !sp.paused) { ours = true; f.togglePause(); }
      else if (!open && ours) { ours = false; if (snapshot.peek().speed?.paused) f?.togglePause(); }
    });
  }, []);
}

/** Renders its children once: the HUD reads its own signals, so a re-render of App at every snapshot must not reach it. */
class Once extends Component<{ children?: ComponentChildren }> {
  shouldComponentUpdate(): boolean { return false; }
  render() { return this.props.children; }
}

function HudLayer() {
  const screen = screenSlice.value;
  const hidden = hudHiddenSlice.value;
  const photo = viewSlice.value === 'photo';
  const drawer = openDrawer.value;
  const stops = useRef<(() => void)[]>([]);
  // for as long as the HUD root exists: chips stay out of the tab order, prompts know which regions to avoid
  const root = (el: HTMLDivElement | null) => {
    stops.current.forEach((s) => s());
    stops.current = el ? [keepChipsOutOfTabOrder(el), watchKeepOut(el)] : [];
  };
  useHudWiring();
  if ((screen !== 'playing' && screen !== 'paused') || photo) return null; // photo mode shows the world alone
  return (
    <div
      ref={root} class={`ui-root fd-root${drawer ? ' has-drawer' : ''}`} data-testid="hud-root" data-hidden={hidden ? '1' : undefined}
      onMouseDown={onChipMouseDown} onClick={onChipClick} onKeyDown={onLeaveKey}
    >
      {!hidden && <TimeCluster />}
      {!hidden && drawer === null && <ColonyPulse />}
      {(!hidden ? drawer === null : true) && <AlertsFeed />}
      {!hidden && <PossessedPanel />}
      {!hidden && <InspectCard />}
      {!hidden && <ContextPrompts />}
      <Toasts />
      <SoundCuePips />
      {hidden && <div class="fd-hiddenhint fd-chip" data-testid="hidden-hint"><KeyHint action="hide-hud">HUD hidden</KeyHint></div>}
      {drawer === 'directives' && <Directives />}
      {drawer === 'roster' && <Roster />}
      {drawer === 'health' && <HealthDrawer />}
      {drawer === 'nest' && <NestDrawer />}
      <PanelsLayer />
    </div>
  );
}

/** The HUD (mounted by App.tsx). */
export function HudRoot() {
  return <Once><HudLayer /></Once>;
}
