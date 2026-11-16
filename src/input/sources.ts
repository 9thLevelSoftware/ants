// Raw device state between frames: keys, mouse buttons (click / double click / hold / drag), wheel, pad buttons.
// Events arrive at any time; `latch(now)` moves what happened since the last frame into the frame snapshot that
// the action layer (inputState.ts) reads. Pure: timestamps are passed in, no DOM.
import { CLICK_MAX_MS, CLICK_SLOP_PX, DBL_CLICK_MS, WHEEL_LINE_PX, WHEEL_PAGE_PX, WHEEL_PX_PER_NOTCH } from './defaults';
import { buttonThreshold } from './gamepad';
import type { PadSnapshot } from './types';

export interface MouseButtonState {
  x0: number; y0: number; t0: number;
  dragging: boolean;
  /** holdMs values whose hold gesture already fired during this press. */
  holdsFired: number[];
}

export interface PadButtonState {
  downAt: number;
  /** Another button went down while this one was held: it served as a modifier, so its tap does not fire. */
  usedAsMod: boolean;
  holdsFired: number[];
}

/** A live analogue binding that needs `mod` held: deflecting one of `axes` past `deadZone` uses the button. */
export interface PadAxisModifier {
  mod: number;
  axes: readonly number[];
  deadZone: number;
}

/** Everything the action layer needs for one frame. */
export interface FrameSnapshot {
  now: number;
  dt: number;
  keyDownEdges: { code: string; shift: boolean }[];
  /** Pulses: one-frame events, e.g. 'click:2', 'dbl:0', 'hold:0:400', 'press:0', 'padhold:8:500', 'padpress:3', 'wheel:-1'. */
  pulses: Map<string, number>;
  /** Pad buttons released this frame without having served as a modifier, with how long they were held. */
  padTaps: { button: number; ms: number }[];
  drag: Map<number, { dx: number; dy: number }>;
  lockedDx: number; lockedDy: number;
  /** Wheel notches this frame (positive = scroll down), split by whether Shift was held. */
  wheel: number; wheelShift: number;
  kbmActivity: boolean;
}

export function emptyFrame(): FrameSnapshot {
  return { now: 0, dt: 0, keyDownEdges: [], pulses: new Map(), padTaps: [], drag: new Map(), lockedDx: 0, lockedDy: 0, wheel: 0, wheelShift: 0, kbmActivity: false };
}

export class RawSources {
  /** Held keys with the Shift state at the moment they went down. */
  readonly keys = new Map<string, { shift: boolean }>();
  readonly mouse = new Map<number, MouseButtonState>();
  readonly padButtons = new Map<number, PadButtonState>();
  pad: PadSnapshot | null = null;
  /** After focus loss the pad is ignored until every input returns to neutral (no phantom presses). */
  padSuppressed = false;
  /** Orbit-by-toggle (hold-to-toggle for the drag): buttons whose press starts / ends an orbit; set by the input state. */
  toggleDragButtons: ReadonlySet<number> = new Set();
  /** Toggle-drag buttons that are orbiting right now (their mouse movement feeds the drag axis without a held button). */
  readonly latchedDrag = new Set<number>();

  private pendingDown: { code: string; shift: boolean }[] = [];
  private pendingPulses = new Map<string, number>();
  private pendingPadTaps: { button: number; ms: number }[] = [];
  private pendingDrag = new Map<number, { dx: number; dy: number }>();
  private pendingLocked = { dx: 0, dy: 0 };
  private pendingWheel = 0;
  private pendingWheelShift = 0;
  private wheelPulseAcc = 0;
  private wheelShiftPulseAcc = 0;
  private activity = false;
  private lastClick = new Map<number, { t: number; x: number; y: number }>();
  private lastNow = -1;

  private pulse(name: string, n = 1): void {
    this.pendingPulses.set(name, (this.pendingPulses.get(name) ?? 0) + n);
  }

  get shiftHeld(): boolean {
    return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
  }

  keyDown(code: string, shift: boolean, repeat: boolean): void {
    this.activity = true;
    if (repeat && this.keys.has(code)) return; // auto-repeat never makes a new edge
    this.keys.set(code, { shift });
    this.pendingDown.push({ code, shift });
  }

  keyUp(code: string): void {
    this.keys.delete(code);
  }

  /** `locked`: pointer lock active, so a press is also an immediate click (no click-slop delay, GDD 01 5.6). */
  mouseDown(button: number, x: number, y: number, now: number, locked: boolean): void {
    this.activity = true;
    this.mouse.set(button, { x0: x, y0: y, t0: now, dragging: false, holdsFired: [] });
    if (this.toggleDragButtons.has(button) && !locked) {
      if (this.latchedDrag.has(button)) this.latchedDrag.delete(button);
      else this.latchedDrag.add(button);
    }
    this.pulse(`press:${button}`);
    if (locked) this.pulse(`click:${button}`);
  }

  mouseMove(x: number, y: number, dx: number, dy: number, locked: boolean): void {
    this.activity = true;
    if (locked) {
      this.pendingLocked.dx += dx;
      this.pendingLocked.dy += dy;
      return;
    }
    for (const [button, s] of this.mouse) {
      if (!s.dragging && Math.hypot(x - s.x0, y - s.y0) >= CLICK_SLOP_PX) s.dragging = true;
      if (!s.dragging) continue;
      const d = this.pendingDrag.get(button) ?? { dx: 0, dy: 0 };
      d.dx += dx;
      d.dy += dy;
      this.pendingDrag.set(button, d);
    }
    for (const button of this.latchedDrag) {
      if (this.mouse.get(button)?.dragging) continue; // already fed above
      const d = this.pendingDrag.get(button) ?? { dx: 0, dy: 0 };
      d.dx += dx;
      d.dy += dy;
      this.pendingDrag.set(button, d);
    }
  }

  mouseUp(button: number, x: number, y: number, now: number, locked: boolean): void {
    const s = this.mouse.get(button);
    this.mouse.delete(button);
    if (!s || locked) return;
    const isClick = !s.dragging && now - s.t0 <= CLICK_MAX_MS && Math.hypot(x - s.x0, y - s.y0) < CLICK_SLOP_PX;
    if (!isClick) return;
    this.pulse(`click:${button}`);
    const prev = this.lastClick.get(button);
    if (prev && now - prev.t <= DBL_CLICK_MS && Math.hypot(x - prev.x, y - prev.y) < CLICK_SLOP_PX) {
      this.pulse(`dbl:${button}`);
      this.lastClick.delete(button);
    } else {
      this.lastClick.set(button, { t: now, x, y });
    }
  }

  /** deltaMode 0 pixels, 1 lines, 2 pages (converted to pixels, GDD 01 5.6). `shiftRoute`: send to the Shift accumulator. */
  wheel(deltaY: number, deltaMode: number, shiftRoute: boolean): void {
    this.activity = true;
    const px = deltaY * (deltaMode === 1 ? WHEEL_LINE_PX : deltaMode === 2 ? WHEEL_PAGE_PX : 1);
    const notches = px / WHEEL_PX_PER_NOTCH;
    if (shiftRoute) this.pendingWheelShift += notches;
    else this.pendingWheel += notches;
  }

  setPad(pad: PadSnapshot | null): void {
    this.pad = pad;
  }

  /** Synthesise release of everything held (window blur, hidden tab, text field focus). */
  releaseAll(): void {
    this.keys.clear();
    this.mouse.clear();
    this.padButtons.clear();
    this.latchedDrag.clear();
    this.pendingDown = [];
    this.pendingPulses.clear();
    this.pendingPadTaps = [];
    this.pendingDrag.clear();
    this.pendingLocked = { dx: 0, dy: 0 };
    this.pendingWheel = this.pendingWheelShift = this.wheelPulseAcc = this.wheelShiftPulseAcc = 0;
    this.padSuppressed = true;
  }

  padButtonDown(button: number): boolean {
    if (this.padSuppressed || !this.pad) return false;
    return (this.pad.buttons[button] ?? 0) > buttonThreshold(button);
  }

  /**
   * Track pad buttons: tap / hold gestures need press times and modifier use. A held button also counts as used
   * when a modified axis binding on it reads past the dead zone (LB + right stick = zoom must not fire the LB tap).
   */
  private updatePad(now: number, holdThresholds: readonly number[], axisMods: readonly PadAxisModifier[]): void {
    const pad = this.pad;
    if (this.padSuppressed) {
      const neutral = !pad || (pad.buttons.every((v, i) => v <= buttonThreshold(i)) && pad.axes.every((a) => Math.abs(a) < 0.3));
      if (neutral) this.padSuppressed = false;
      return;
    }
    if (!pad) { this.padButtons.clear(); return; }
    for (let b = 0; b < pad.buttons.length; b++) {
      const down = (pad.buttons[b] ?? 0) > buttonThreshold(b);
      const st = this.padButtons.get(b);
      if (down && !st) {
        for (const other of this.padButtons.values()) other.usedAsMod = true;
        this.padButtons.set(b, { downAt: now, usedAsMod: false, holdsFired: [] });
        this.pulse(`padpress:${b}`);
      } else if (!down && st) {
        this.padButtons.delete(b);
        if (!st.usedAsMod) this.pendingPadTaps.push({ button: b, ms: now - st.downAt });
      } else if (down && st) {
        for (const h of holdThresholds) {
          if (now - st.downAt >= h && !st.holdsFired.includes(h)) { st.holdsFired.push(h); this.pulse(`padhold:${b}:${h}`); }
        }
      }
    }
    for (const m of axisMods) {
      const st = this.padButtons.get(m.mod);
      if (st && m.axes.some((a) => Math.abs(pad.axes[a] ?? 0) > m.deadZone)) st.usedAsMod = true;
    }
  }

  private updateMouseHolds(now: number, holdThresholds: readonly number[]): void {
    for (const [button, s] of this.mouse) {
      if (s.dragging) continue;
      for (const h of holdThresholds) {
        if (now - s.t0 >= h && !s.holdsFired.includes(h)) { s.holdsFired.push(h); this.pulse(`hold:${button}:${h}`); }
      }
    }
  }

  /** Close the frame: returns everything that happened since the previous latch. */
  latch(now: number, mouseHolds: readonly number[], padHolds: readonly number[], axisMods: readonly PadAxisModifier[] = []): FrameSnapshot {
    this.updateMouseHolds(now, mouseHolds);
    this.updatePad(now, padHolds, axisMods);
    // whole wheel notches become pulses for press-type wheel bindings (trackpads accumulate fractions)
    this.wheelPulseAcc += this.pendingWheel;
    this.wheelShiftPulseAcc += this.pendingWheelShift;
    for (const [acc, name] of [['wheelPulseAcc', 'wheel'], ['wheelShiftPulseAcc', 'wheelshift']] as const) {
      while (this[acc] >= 1) { this[acc] -= 1; this.pulse(`${name}:1`); }
      while (this[acc] <= -1) { this[acc] += 1; this.pulse(`${name}:-1`); }
    }
    const frame: FrameSnapshot = {
      now,
      dt: this.lastNow < 0 ? 0 : Math.max(0, (now - this.lastNow) / 1000),
      keyDownEdges: this.pendingDown,
      pulses: this.pendingPulses,
      padTaps: this.pendingPadTaps,
      drag: this.pendingDrag,
      lockedDx: this.pendingLocked.dx,
      lockedDy: this.pendingLocked.dy,
      wheel: this.pendingWheel,
      wheelShift: this.pendingWheelShift,
      kbmActivity: this.activity,
    };
    this.lastNow = now;
    this.pendingDown = [];
    this.pendingPulses = new Map();
    this.pendingPadTaps = [];
    this.pendingDrag = new Map();
    this.pendingLocked = { dx: 0, dy: 0 };
    this.pendingWheel = 0;
    this.pendingWheelShift = 0;
    this.activity = false;
    return frame;
  }
}
