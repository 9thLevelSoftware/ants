// Gamepad reach for the colony view's tool UI (task ui-panels, acceptance 4): the marker palette, its option row and the
// overlay buttons. The drawers and book screens already have D-pad movement (hud/drawerPad.ts); outside them the game owns
// the pad (A places, B cancels, the D-pad moves the cutaway), so reaching the tool UI needs a deliberate switch:
//  - a tap of View (a hold of 500 ms is the game's colony-view toggle) moves the focus onto the tool UI and parks the
//    game's own pad bindings; a second tap, or B, gives the focus back;
//  - while it is there: D-pad / left stick move to the nearest control, A chooses (the shell's poller does the click; the
//    demo, which has no shell, does it here), sliders and segmented controls get the arrow first;
//  - Y opens Colony health, X Nest overview, a click of the left stick the Journal, of the right stick the Codex. A pad
//    button the player bound to one of those actions (Settings > Controls) opens it from anywhere.
// The poller that used to call these is gone: src/ui/nav drives the pad now and calls enterTools / leaveTools; the helpers and
// the `padToolsFocus` signal stay here.
import { signal } from '@preact/signals';
import { currentBindings } from '../../components';
import { pickSpatial, type Dir } from '../../components/logic/spatialNav';
import { boundPadFires } from '../../hud/hudPad';
import { hudBridge, togglePanel } from '../../hud/state';
import { openBook, type BookId } from './state';

/** The tool UI: the palette and its options (`.pn-panel`) and the overlay buttons, which are chips in the observer view. */
export const TOOLS_SELECTOR = '.pn-panel, .ov-controls';
const ITEM = 'button:not([disabled]), [role="slider"], input:not([type="hidden"]):not([disabled])';
/** A View press shorter than this is a tap; longer is the colony-view hold of the input layer. */
export const VIEW_TAP_MS = 450;
const STICK = 0.6;
const REPEAT_MS = 260;
const KEYS: Record<Dir, string> = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };

/** True while the pad's focus is on the tool UI (the palette shows the button legend then). */
export const padToolsFocus = signal(false);

/** A press of View that ended as a tap: shorter than the hold, without LB (LB + View is the alert feed). */
export function isViewTap(heldMs: number, lbWasDown: boolean): boolean {
  return !lbWasDown && heldMs >= 0 && heldMs < VIEW_TAP_MS;
}

/** The direction a stick deflection asks for, or null inside the dead zone. */
export function stickDir(ax: number, ay: number): Dir | null {
  if (Math.max(Math.abs(ax), Math.abs(ay)) <= STICK) return null;
  return Math.abs(ax) > Math.abs(ay) ? (ax > 0 ? 'right' : 'left') : (ay > 0 ? 'down' : 'up');
}

const visible = (el: HTMLElement): boolean => !el.closest('[inert], [hidden]') && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';

/** Every control of the tool UI that can take the pad's focus, in document order. */
export function toolItems(): HTMLElement[] {
  const out: HTMLElement[] = [];
  document.querySelectorAll<HTMLElement>(TOOLS_SELECTOR).forEach((root) => root.querySelectorAll<HTMLElement>(ITEM).forEach((el) => { if (visible(el)) out.push(el); }));
  return out;
}

const rectOf = (el: HTMLElement) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };
const inTools = (el: Element | null): boolean => !!el && !!el.closest(TOOLS_SELECTOR);
/** A Select's list is a child of the tool UI's DOM; while it is open the shell's navigation owns the pad. */
const inList = (el: Element | null): boolean => !!el && !!el.closest('.ui-select-list');

function setSuspended(on: boolean): void { hudBridge.peek()?.suspendGameKeys(on); }

/** Puts the focus on the tool UI: the chosen tool when there is one, else the first control. */
export function enterTools(): boolean {
  const items = toolItems();
  if (items.length === 0) return false;
  (items.find((el) => el.matches('.pn-tool.is-active, .ov-btn.is-on')) ?? items[0]).focus({ preventScroll: true });
  if (!inTools(document.activeElement)) return false;
  padToolsFocus.value = true;
  setSuspended(true);
  return true;
}

/** Leaves the tool UI. The game's pad bindings come back unless a drawer or a book already holds them. */
export function leaveTools(blur = true): void {
  const a = document.activeElement as HTMLElement | null;
  if (blur && a && inTools(a)) a.blur();
  padToolsFocus.value = false;
  const now = document.activeElement;
  if (!(now && (now.closest('.fd-drawer, .fd-alerts, .fd-pulse, .ui-book')))) setSuspended(false);
}

/** One step of focus in `dir`; the focused control gets the arrow first (a slider or a segmented control uses it). */
export function moveInTools(dir: Dir): boolean {
  const cur = document.activeElement as HTMLElement | null;
  if (!cur || !inTools(cur)) return false;
  const ev = new KeyboardEvent('keydown', { key: KEYS[dir], bubbles: true, cancelable: true });
  cur.dispatchEvent(ev);
  if (ev.defaultPrevented) return true;
  const items = toolItems();
  const i = pickSpatial(rectOf(cur), items.map(rectOf), dir);
  if (i < 0) return false;
  items[i].focus({ preventScroll: true });
  return true;
}

const toggleBook = (id: BookId): void => { openBook.value = openBook.peek() === id ? null : id; };

/** What the quick buttons open (and the actions a bound pad button opens from anywhere). */
const OPENERS: { action: string; open: () => void }[] = [
  { action: 'why-view', open: () => { openBook.value = null; togglePanel('health'); } },
  { action: 'nest-overview', open: () => { openBook.value = null; togglePanel('nest'); } },
  { action: 'journal', open: () => toggleBook('journal') },
  { action: 'codex', open: () => toggleBook('codex') },
];

interface Buttons { down: (i: number) => boolean; edge: (i: number) => boolean }

/** A pad button the player bound to Colony health, Nest overview, Journal or Codex opens it; true when one did. */
export function openBoundPanel(pad: Buttons): boolean {
  for (const o of OPENERS) {
    if (boundPadFires(currentBindings.value.pad[o.action as never], pad)) { o.open(); return true; }
  }
  return false;
}
