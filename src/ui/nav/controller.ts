// The pad's one poller for everything that is DOM: menus, books, dialogs, drawers, the alert feed, the colony view's
// tool UI, and the shortcuts that open them from play. One reader, one decision per frame about who owns the pad:
// a menu layer (src/ui/nav/layers.ts) or the game. The game's own input state (src/input) plays the ant; while a
// layer owns the pad the game is suspended through the HUD bridge (as it already is for keyboard focus in a panel).
//
// Menu vocabulary (GDD 08 8): D-pad / left stick move focus spatially, A activates, B backs out, LB / RB switch tabs,
// LT / RT scroll, X / Y are the secondary / tertiary action of a row, Start backs out of everything.
import { effect, signal } from '@preact/signals';
import { INTERACT_HOLD_MS, PAD } from '@/input/defaults';
import { PlayerPadPicker, readGamepads } from '@/input/padSource';
import type { Binding } from '@/input';
import { currentBindings } from '../components';
import { handleBack } from '../components/logic/escapeStack';
import { enterFeed, HUD_ACTIONS } from '../hud/hotkeys';
import { dismissHintNow } from '../hud/prompts/OnboardingPrompts';
import { hudBridge, openDrawer } from '../hud/state';
import { openBook } from '../panels/wiring/state';
import { enterTools, leaveTools, padToolsFocus, VIEW_TAP_MS as TOOLS_VIEW_TAP_MS } from '../panels/wiring/toolsPad';
import { foundingActions, foundingUi } from '../screens/founding/store';
import { updateNav } from '../screens/nav';
import { facade, snapshot } from '../store';
import { noteKbm, notePad } from './device';
import { focusFirst, isTextField, moveFocusIn, scrollerOf } from './focusMove';
import { activeLayer, type LiveLayer } from './layers';
import { PadReader, type PadFrame } from './padReader';
import { modifiedCombos, shortcutsOf, ShortcutMatcher, type PadShortcut } from './shortcuts';

/** While > 0 the pad belongs to a rebinding row that is listening for a button (the controller keeps its hands off). */
export const padCaptureHolds = signal(0);

/** A View press shorter than this (times the hold-duration setting) is a tap; longer is the game's colony-view hold. */
const VIEW_TAP_MS = TOOLS_VIEW_TAP_MS;
/** Scroll speed of LT / RT, CSS px per real second. */
const SCROLL_PX_S = 700;
/** The actions the UI handles itself, with a pad binding from the current bindings. */
const PANEL_ACTIONS = ['directives', 'roster', 'why-view', 'nest-overview', 'journal', 'codex', 'scent-view', 'overlay-cycle'] as const;
const EXTRA_ACTIONS = ['dismiss-hint', 'alert-focus', 'controls-reminder'] as const;
const SKIP_HOLD_MS_DEFAULT = 1000;

/** Binding of a menu action from the current bindings: a plain button, else the GDD default. */
function uiButton(action: string, fallback: number): number {
  const b = currentBindings.value.pad[action] as Binding | null | undefined;
  return b && b.kind === 'pad' && b.mod === undefined && !b.gesture ? b.button : fallback;
}

/** Releases whatever the game thinks is held and ignores the pad until it is neutral again (a press the UI consumed). */
export function swallowGamePad(): void {
  const hb = hudBridge.peek();
  if (!hb) return;
  hb.suspendGameKeys(true);
  hb.suspendGameKeys(false);
}

function holdScale(): number {
  const ms = facade.peek()?.getSettings?.().controls?.holdMs ?? 600;
  return Math.min(2.5, Math.max(0.5, ms / 600));
}

/** Opens Settings > Controls from play (the `controls-reminder` action): pause first, then put the screen on top. */
export function showControlsReminder(): void {
  const f = facade.peek();
  if (!f) return;
  if (snapshot.peek().mode === 'playing') f.openPauseMenu();
  // the shell drops its overlay stack when the mode changes: add ours once the pause screen is up
  const stop = effect(() => {
    if (snapshot.value.screen !== 'paused') return;
    queueMicrotask(() => { stop(); setTimeout(() => updateNav((n) => ({ ...n, stack: [...n.stack, 'settings'], settingsTab: 'controls' })), 60); });
  });
}

/** What B does for a layer that has no back handler of its own. */
function leaveRegion(layer: LiveLayer): void {
  if (layer.spec.id === 'tools') { leaveTools(); return; }
  (document.activeElement as HTMLElement | null)?.blur();
}

export class NavController {
  private reader = new PadReader();
  private picker = new PlayerPadPicker();
  private matcher = new ShortcutMatcher();
  private lastNow = 0;
  private viewPressLb = false;
  private hadPad = false;
  private tendAt = 0;
  private skipArmed = false;
  private skipAt = 0;

  /** The player's pad among the connected ones (the first to produce input, as the game's tracker chooses). */
  pickPad(pads: ReturnType<typeof readGamepads>) {
    return this.picker.pick(pads);
  }

  /** One frame. Exposed so a test can drive it with its own clock. */
  step(nowMs: number, pad = this.pickPad(readGamepads())): void {
    const dt = this.lastNow ? Math.min(0.1, (nowMs - this.lastNow) / 1000) : 0;
    this.lastNow = nowMs;
    const f = this.reader.update(pad, nowMs);
    if (!f.connected) {
      if (this.hadPad) { this.hadPad = false; this.matcher.reset(); noteKbm(nowMs + 1000); } // the pad left: hints go back to the keyboard
      return;
    }
    this.hadPad = true;
    if (f.anyInput) notePad(f.id, nowMs);
    if (padCaptureHolds.peek() > 0) return; // a rebinding row is listening for the next button
    const layer = activeLayer();
    if (layer) { this.matcher.reset(); this.driveLayer(layer, f, dt); return; }
    if (snapshot.peek().mode === 'playing') this.play(f, nowMs);
  }

  // ------------------------------------------------------------------ a menu layer owns the pad
  private driveLayer(layer: LiveLayer, f: PadFrame, dt: number): void {
    const root = layer.root;
    const a = document.activeElement as HTMLElement | null;
    const inside = !!a && root.contains(a);
    if (f.move) moveFocusIn(root, f.move, layer.spec.initial);
    if (f.edge(uiButton('ui-confirm', PAD.A))) {
      if (inside && a) { if (!isTextField(a) && a.getAttribute('role') !== 'slider') a.click(); else if (isTextField(a)) a.focus(); }
      else focusFirst(root, layer.spec.initial);
    }
    if (f.edge(uiButton('ui-back', PAD.B))) this.back(layer, false);
    if (f.edge(PAD.START)) this.back(layer, true);
    const prev = uiButton('ui-tab-prev', PAD.LB), next = uiButton('ui-tab-next', PAD.RB);
    if (f.edge(prev)) this.tab(layer, -1);
    if (f.edge(next)) this.tab(layer, 1);
    if (layer.spec.id === 'tools' && this.toolsQuickButtons(f)) return;
    const secondary = uiButton('ui-secondary', PAD.X), tertiary = uiButton('ui-tertiary', PAD.Y);
    if (inside && a && f.edge(secondary)) a.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', shiftKey: true, bubbles: true, cancelable: true }));
    if (inside && a && f.edge(tertiary)) a.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', ctrlKey: true, bubbles: true, cancelable: true }));
    const up = f.down(uiButton('ui-scroll-up', PAD.LT)), down = f.down(uiButton('ui-scroll-down', PAD.RT));
    if (up !== down && dt > 0) scrollerOf(root)?.scrollBy({ top: (down ? 1 : -1) * SCROLL_PX_S * dt, behavior: 'auto' });
  }

  /** The colony view's tool UI keeps its quick buttons (its legend says so): Y Colony health, X Nest overview, LS Journal, RS Codex. */
  private toolsQuickButtons(f: PadFrame): boolean {
    const quick: [number, string][] = [[PAD.Y, 'why-view'], [PAD.X, 'nest-overview'], [PAD.LS, 'journal'], [PAD.RS, 'codex']];
    for (const [button, action] of quick) if (f.edge(button)) { HUD_ACTIONS[action]?.(); return true; }
    return false;
  }

  private back(layer: LiveLayer, fromStart: boolean): void {
    const a = document.activeElement as HTMLElement | null;
    if (layer.spec.onBack?.() === true) { if (fromStart) swallowGamePad(); return; }
    if (a && isTextField(a) && layer.root.contains(a)) { a.blur(); return; } // GDD 01 5.8: back leaves a text field first
    const region = layer.spec.kind === 'region' || layer.spec.kind === 'overlay';
    if (region) { leaveRegion(layer); return; }
    if (handleBack()) { if (fromStart) swallowGamePad(); return; }
    // nothing registered: the pause menu resumes (Start is also the game's own menu press, which would resume too)
    if (!fromStart && snapshot.peek().mode === 'paused') facade.peek()?.closePauseMenu();
  }

  private tab(layer: LiveLayer, dir: -1 | 1): void {
    if (layer.spec.onTab?.(dir) === true) return;
    // the tab components listen for Q / E (GDD 08 8): send them
    const code = dir < 0 ? 'KeyQ' : 'KeyE';
    window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code.replace('Key', ''), bubbles: true, cancelable: true }));
  }

  // ------------------------------------------------------------------ the game owns the pad
  private play(f: PadFrame, nowMs: number): void {
    const snap = snapshot.peek();
    this.opening(f, nowMs);
    // View tap: into the colony view's tool UI or the photo panel (the game's own View tap is `release` in possession)
    if (f.edge(PAD.VIEW)) this.viewPressLb = f.down(PAD.LB) || f.down(PAD.RB);
    const vt = f.releasedAfterMs(PAD.VIEW);
    if (f.release(PAD.VIEW) && vt >= 0 && vt < VIEW_TAP_MS * holdScale() && !this.viewPressLb && !openDrawer.peek() && !openBook.peek()) {
      if (padToolsFocus.peek()) leaveTools();
      else if (snap.view === 'photo') this.enterPhotoPanel();
      else enterTools();
    }
    const view = snap.view;
    const pad = currentBindings.value.pad as Record<string, Binding | null>;
    const ids = view === 'photo' ? [] : [...PANEL_ACTIONS, ...EXTRA_ACTIONS];
    for (const id of this.matcher.fired(shortcutsOf(pad, ids), f, holdScale(), this.combosOf(pad))) this.run(id);
  }

  private combosCache: { pad: Record<string, Binding | null>; combos: PadShortcut[] } | null = null;
  private combosOf(pad: Record<string, Binding | null>): PadShortcut[] {
    if (this.combosCache?.pad !== pad) this.combosCache = { pad, combos: modifiedCombos(pad) };
    return this.combosCache.combos;
  }

  private run(id: string): void {
    if (id === 'dismiss-hint') { dismissHintNow(); return; }
    if (id === 'alert-focus') { enterFeed(); return; }
    if (id === 'controls-reminder') { showControlsReminder(); return; }
    HUD_ACTIONS[id]?.();
  }

  private enterPhotoPanel(): void {
    const root = document.querySelector<HTMLElement>('.ph-root');
    if (root) focusFirst(root, '.ph-panel button, .ph-panel [role="slider"], .ph-panel input');
  }

  /** The opening's pad controls that are DOM-side: any button skips the intro card, a held `tl-skip` button skips the time-lapse. */
  private opening(f: PadFrame, nowMs: number): void {
    const ui = foundingUi.peek(), a = foundingActions.peek();
    if (!ui || !a) { this.skipArmed = false; return; }
    if (ui.phase === 'intro-card') { if (f.anyEdge >= 0) a.skipIntro(); return; }
    // the brood is tended (the lapse begins) by holding the interact button once the queen has laid: the pad has no pointer
    if (ui.phase === 'lay' && ui.canBeginLapse) {
      const ib = currentBindings.value.pad['interact'] as Binding | null | undefined;
      const button = ib && ib.kind === 'pad' && ib.mod === undefined ? ib.button : PAD.A;
      if (f.edge(button)) this.tendAt = nowMs + INTERACT_HOLD_MS * 1.5 * holdScale();
      if (!f.down(button)) this.tendAt = 0;
      if (this.tendAt && nowMs >= this.tendAt) { this.tendAt = 0; a.beginLapse(); return; }
    } else this.tendAt = 0;
    if (ui.phase !== 'timelapse') { this.skipArmed = false; return; }
    const b = currentBindings.value.pad['tl-skip'] as Binding | null | undefined;
    const button = b && b.kind === 'pad' && b.mod === undefined ? b.button : PAD.A;
    const toggle = currentBindings.value.holdToggle['tl-skip'] === 'toggle';
    if (f.edge(button)) { this.skipArmed = true; this.skipAt = nowMs + SKIP_HOLD_MS_DEFAULT * holdScale(); }
    if (!f.down(button)) this.skipArmed = false;
    if (this.skipArmed && (toggle || nowMs >= this.skipAt)) { this.skipArmed = false; a.skipLapse(); }
  }
}

let installed: NavController | null = null;

/** The running controller (debug API, tests). */
export function navController(): NavController | null {
  return installed;
}

/**
 * Starts polling. With no pad connected it checks four times a second (a pad shows up only after a button press, and
 * a test injects one at any time); with a pad it runs on every animation frame. Returns the uninstaller.
 */
export function startNavController(win: Window = window): () => void {
  const ctl = new NavController();
  installed = ctl;
  let raf = 0, timer = 0, stopped = false;
  const loop = (now: number): void => {
    raf = 0;
    if (stopped) return;
    const pads = readGamepads(win);
    const pad = ctl.pickPad(pads);
    ctl.step(now, pad);
    if (pad) raf = win.requestAnimationFrame(loop);
    else timer = win.setTimeout(() => { timer = 0; raf = win.requestAnimationFrame(loop); }, 250);
  };
  raf = win.requestAnimationFrame(loop);
  const onConnect = () => { if (!raf && !stopped) { win.clearTimeout(timer); timer = 0; raf = win.requestAnimationFrame(loop); } };
  win.addEventListener('gamepadconnected', onConnect);
  return () => {
    stopped = true;
    win.removeEventListener('gamepadconnected', onConnect);
    if (raf) win.cancelAnimationFrame(raf);
    if (timer) win.clearTimeout(timer);
    if (installed === ctl) installed = null;
  };
}
