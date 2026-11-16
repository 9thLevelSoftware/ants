// Frame-by-frame reading of one gamepad for the menu navigation layer: button edges and hold times, the d-pad and the
// left stick as repeating "move" events, trigger levels. Pure (no DOM, no clock of its own): the controller passes
// the snapshot and the time. The game's own input state (src/input) has a richer reader for play; this one is the
// small, fixed vocabulary of menus (GDD 08 8).
import { PAD } from '@/input/defaults';
import { buttonThreshold } from '@/input/gamepad';
import type { PadSnapshot } from '@/input/types';

export type Dir = 'up' | 'down' | 'left' | 'right';

/** A deflection of the left stick counts as a menu move past this (stronger than the game's dead zone). */
export const NAV_STICK_THRESHOLD = 0.6;
/** Auto-repeat of a held direction: first after `FIRST`, then every `EVERY` real ms. */
export const NAV_REPEAT_FIRST_MS = 380;
export const NAV_REPEAT_EVERY_MS = 130;

export interface PadFrame {
  connected: boolean;
  /** Button is down this frame / went down this frame / went up this frame. */
  down(button: number): boolean;
  edge(button: number): boolean;
  release(button: number): boolean;
  /** How long the button has been down, real ms (0 when up). */
  heldMs(button: number): number;
  /** Duration of the press that ended this frame (a release edge), else -1. */
  releasedAfterMs(button: number): number;
  /** The direction to move focus this frame (d-pad or left stick, with auto-repeat), or null. */
  move: Dir | null;
  /** Left / right stick, raw (-1..1; y down is positive as in the Gamepad API). */
  ls: { x: number; y: number };
  rs: { x: number; y: number };
  /** Any button, stick or trigger input this frame (for last-used-device tracking). */
  anyInput: boolean;
  /** A button that went down this frame and is not Home, or -1. */
  anyEdge: number;
  /** Pad id string (for glyph style). */
  id: string;
}

const NONE: PadFrame = {
  connected: false, down: () => false, edge: () => false, release: () => false, heldMs: () => 0, releasedAfterMs: () => -1,
  move: null, ls: { x: 0, y: 0 }, rs: { x: 0, y: 0 }, anyInput: false, anyEdge: -1, id: '',
};

function stickDir(x: number, y: number): Dir | null {
  if (Math.max(Math.abs(x), Math.abs(y)) <= NAV_STICK_THRESHOLD) return null;
  return Math.abs(x) > Math.abs(y) ? (x > 0 ? 'right' : 'left') : y > 0 ? 'down' : 'up';
}

export class PadReader {
  private prev: boolean[] = [];
  private downAt: number[] = [];
  private lastRelease: number[] = [];
  private dir: Dir | null = null;
  private dirNext = 0;

  /** Forget everything (the pad vanished, or the layer that owned it changed). */
  reset(): void {
    this.prev = [];
    this.downAt = [];
    this.lastRelease = [];
    this.dir = null;
  }

  update(p: PadSnapshot | null, nowMs: number): PadFrame {
    if (!p) { this.reset(); return NONE; }
    const n = p.buttons.length;
    const down: boolean[] = new Array<boolean>(n);
    for (let i = 0; i < n; i++) down[i] = (p.buttons[i] ?? 0) > buttonThreshold(i);
    const edge: boolean[] = [], rel: boolean[] = [];
    let anyEdge = -1, anyInput = false;
    for (let i = 0; i < n; i++) {
      const was = !!this.prev[i];
      edge[i] = down[i] && !was;
      rel[i] = !down[i] && was;
      if (edge[i]) { this.downAt[i] = nowMs; if (i !== PAD.HOME && anyEdge < 0) anyEdge = i; }
      this.lastRelease[i] = rel[i] ? nowMs - (this.downAt[i] ?? nowMs) : -1;
      if (down[i]) anyInput = true;
    }
    const ls = { x: p.axes[0] ?? 0, y: p.axes[1] ?? 0 };
    const rs = { x: p.axes[2] ?? 0, y: p.axes[3] ?? 0 };
    if (Math.hypot(ls.x, ls.y) > 0.3 || Math.hypot(rs.x, rs.y) > 0.3) anyInput = true;

    // direction: d-pad first, then the left stick; a held direction repeats after a delay
    const pad = (b: number) => !!down[b];
    const d: Dir | null = pad(PAD.DUP) ? 'up' : pad(PAD.DDOWN) ? 'down' : pad(PAD.DLEFT) ? 'left' : pad(PAD.DRIGHT) ? 'right' : stickDir(ls.x, ls.y);
    let move: Dir | null = null;
    if (d === null) this.dir = null;
    else if (d !== this.dir) { this.dir = d; this.dirNext = nowMs + NAV_REPEAT_FIRST_MS; move = d; }
    else if (nowMs >= this.dirNext) { this.dirNext = nowMs + NAV_REPEAT_EVERY_MS; move = d; }

    this.prev = down;
    const released = this.lastRelease;
    return {
      connected: true, id: p.id,
      down: (b) => !!down[b], edge: (b) => !!edge[b], release: (b) => !!rel[b],
      heldMs: (b) => (down[b] ? nowMs - (this.downAt[b] ?? nowMs) : 0),
      releasedAfterMs: (b) => released[b] ?? -1,
      move, ls, rs, anyInput, anyEdge,
    };
  }
}
