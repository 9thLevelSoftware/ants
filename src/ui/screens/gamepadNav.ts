// Gamepad menu navigation (GDD 08 section 8): D-pad / left stick move focus to the nearest focusable in that
// direction, A activates, B goes back, LB / RB switch tabs, LT / RT scroll. It only polls while a gamepad is
// connected, so a keyboard-only session never runs a loop. Components that handle arrow keys themselves (sliders,
// radio groups, tabs, listboxes) get the arrow as a synthetic key first; only when they leave it unhandled does
// the focus move spatially.
import { focusableIn } from '../components/focus';
import { handleBack } from '../components/logic/escapeStack';
import { pickSpatial, type Dir, type Rect } from '../components/logic/spatialNav';

const PAD = { A: 0, B: 1, LB: 4, RB: 5, LT: 6, RT: 7, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
const STICK_THRESHOLD = 0.6;
const REPEAT_MS = 260;

function activeLayer(): HTMLElement | null {
  const modals = document.querySelectorAll<HTMLElement>('.ui-modal');
  if (modals.length) return modals[modals.length - 1];
  const select = document.querySelector<HTMLElement>('.ui-select-list');
  if (select) return select;
  return document.querySelector<HTMLElement>('.ui-book, .ui-pausecard, .ui-screen:not([inert])');
}

function rectOf(el: HTMLElement): Rect {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

const KEYS: Record<Dir, string> = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };

/** Moves focus one step in `dir`; returns true when something changed. */
export function moveFocus(dir: Dir): boolean {
  const cur = document.activeElement as HTMLElement | null;
  if (cur && cur !== document.body) {
    const ev = new KeyboardEvent('keydown', { key: KEYS[dir], bubbles: true, cancelable: true });
    cur.dispatchEvent(ev);
    if (ev.defaultPrevented) return true;
  }
  const layer = activeLayer();
  if (!layer) return false;
  const items = focusableIn(layer);
  if (items.length === 0) return false;
  if (!cur || !items.includes(cur)) { items[0].focus(); return true; }
  const i = pickSpatial(rectOf(cur), items.map(rectOf), dir);
  if (i < 0) return false;
  items[i].focus();
  return true;
}

function pressKey(code: string): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code.replace('Key', ''), bubbles: true, cancelable: true }));
}

export function startGamepadNav(): () => void {
  if (typeof window === 'undefined' || !('getGamepads' in navigator)) return () => {};
  let raf = 0;
  let prev: boolean[] = [];
  let lastStick = 0;
  const poll = (now: number) => {
    const pad = Array.from(navigator.getGamepads?.() ?? []).find((p): p is Gamepad => !!p && p.connected);
    if (!pad) { raf = 0; return; }
    const down = pad.buttons.map((b) => b.pressed);
    const edge = (i: number) => !!down[i] && !prev[i];
    if (edge(PAD.UP)) moveFocus('up');
    if (edge(PAD.DOWN)) moveFocus('down');
    if (edge(PAD.LEFT)) moveFocus('left');
    if (edge(PAD.RIGHT)) moveFocus('right');
    if (edge(PAD.A)) (document.activeElement as HTMLElement | null)?.click();
    if (edge(PAD.B)) handleBack();
    if (edge(PAD.LB)) pressKey('KeyQ');
    if (edge(PAD.RB)) pressKey('KeyE');
    if (down[PAD.LT] || down[PAD.RT]) {
      const sc = (activeLayer()?.querySelector('.ui-scroll') ?? null) as HTMLElement | null;
      sc?.scrollBy({ top: (down[PAD.RT] ? 1 : -1) * 14, behavior: 'auto' });
    }
    const [ax, ay] = [pad.axes[0] ?? 0, pad.axes[1] ?? 0];
    if (now - lastStick > REPEAT_MS && Math.max(Math.abs(ax), Math.abs(ay)) > STICK_THRESHOLD) {
      lastStick = now;
      moveFocus(Math.abs(ax) > Math.abs(ay) ? (ax > 0 ? 'right' : 'left') : (ay > 0 ? 'down' : 'up'));
    }
    prev = down;
    raf = requestAnimationFrame(poll);
  };
  const start = () => { if (!raf) { prev = []; raf = requestAnimationFrame(poll); } };
  window.addEventListener('gamepadconnected', start);
  // a pad that was already connected before the page loaded
  if (Array.from(navigator.getGamepads?.() ?? []).some((p) => p?.connected)) start();
  return () => {
    window.removeEventListener('gamepadconnected', start);
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  };
}
