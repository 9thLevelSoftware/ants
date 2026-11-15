// Gamepad movement inside an open drawer (GDD 08 section 8): the D-pad and the left stick move focus to the nearest
// control in that direction (sliders get the arrow first, as in the shell's navigation). The shell's own poller (screens/
// gamepadNav.ts) does A (activate) and B (back) whenever the screen router is mounted and only knows book and pause
// layers for movement, so this adds the drawer; without the router (the HUD demo) it also does A and B itself.
import { PAD as INPUT_PAD } from '@/input/defaults';
import { focusableIn } from '../components/focus';
import { handleBack } from '../components/logic/escapeStack';
import { pickSpatial, type Dir } from '../components/logic/spatialNav';

const PAD = { A: INPUT_PAD.A, B: INPUT_PAD.B, UP: INPUT_PAD.DUP, DOWN: INPUT_PAD.DDOWN, LEFT: INPUT_PAD.DLEFT, RIGHT: INPUT_PAD.DRIGHT };
const STICK = 0.6;
const REPEAT_MS = 260;
const KEYS: Record<Dir, string> = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };

const rectOf = (el: HTMLElement) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };

/** Moves focus one step inside `layer`; true when something changed. */
export function moveInLayer(layer: HTMLElement, dir: Dir): boolean {
  const cur = document.activeElement as HTMLElement | null;
  // a horizontal slider takes left / right from the pad; up / down leave it for the next control
  const onSlider = !!cur && cur.getAttribute('role') === 'slider' && (dir === 'up' || dir === 'down');
  if (cur && layer.contains(cur) && !onSlider) {
    const ev = new KeyboardEvent('keydown', { key: KEYS[dir], bubbles: true, cancelable: true });
    cur.dispatchEvent(ev);
    if (ev.defaultPrevented) return true;
  }
  const items = focusableIn(layer);
  if (items.length === 0) return false;
  if (!cur || !items.includes(cur)) { items[0].focus(); return true; }
  const i = pickSpatial(rectOf(cur), items.map(rectOf), dir);
  if (i < 0) return false;
  items[i].focus();
  return true;
}

/** Polls the first connected pad while a drawer is open. Returns the uninstaller. */
export function startDrawerPad(getLayer: () => HTMLElement | null): () => void {
  if (typeof navigator === 'undefined' || !('getGamepads' in navigator)) return () => {};
  let raf = 0, prev: boolean[] = [], lastStick = 0;
  const poll = (now: number) => {
    raf = requestAnimationFrame(poll);
    const pad = Array.from(navigator.getGamepads?.() ?? []).find((p): p is Gamepad => !!p && p.connected);
    const layer = getLayer();
    if (!pad || !layer) { prev = []; return; }
    const down = pad.buttons.map((b) => b.pressed);
    const edge = (i: number) => !!down[i] && !prev[i];
    if (edge(PAD.UP)) moveInLayer(layer, 'up');
    if (edge(PAD.DOWN)) moveInLayer(layer, 'down');
    if (edge(PAD.LEFT)) moveInLayer(layer, 'left');
    if (edge(PAD.RIGHT)) moveInLayer(layer, 'right');
    const shell = !!document.querySelector('[data-testid="ui-root"]');
    if (!shell) {
      if (edge(PAD.A)) (document.activeElement as HTMLElement | null)?.click();
      if (edge(PAD.B)) handleBack();
      // a book screen over the HUD (Journal, Codex): LB / RB switch its tabs, as the shell's navigation does
      if (layer.matches('.ui-book')) {
        if (edge(INPUT_PAD.LB)) window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyQ', key: 'Q', bubbles: true, cancelable: true }));
        if (edge(INPUT_PAD.RB)) window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', key: 'E', bubbles: true, cancelable: true }));
      }
    }
    const ax = pad.axes[0] ?? 0, ay = pad.axes[1] ?? 0;
    if (now - lastStick > REPEAT_MS && Math.max(Math.abs(ax), Math.abs(ay)) > STICK) {
      lastStick = now;
      moveInLayer(layer, Math.abs(ax) > Math.abs(ay) ? (ax > 0 ? 'right' : 'left') : (ay > 0 ? 'down' : 'up'));
    }
    prev = down;
  };
  raf = requestAnimationFrame(poll);
  return () => cancelAnimationFrame(raf);
}
