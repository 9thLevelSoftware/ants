// Capturing a gamepad binding while a rebinding row is listening (GDD 01 5.7, GDD 08 7.5). Pure: the row feeds one
// pad snapshot per frame and gets a Binding back when the player has pressed something.
//
// - A button action takes the first button pressed. LB and RB may serve as a modifier: hold one, press another
//   button (-> `{ button, mod }`); release the modifier without pressing anything else and the modifier itself is
//   the binding.
// - A stick component takes the first stick pushed past the threshold (`padStick`), a half-axis component (zoom in /
//   out) the first stick direction (`padAxis`), both optionally behind a held LB / RB.
// - Whatever is held when listening starts (the A that opened the row) is ignored until it has been released.
import { PAD, PAD_AXIS } from './defaults';
import { buttonThreshold } from './gamepad';
import type { Binding, PadSnapshot } from './types';

export type PadCaptureKind = 'button' | 'stick' | 'axis';

/** Buttons that may be held as a modifier of another binding. */
export const MODIFIER_BUTTONS: readonly number[] = [PAD.LB, PAD.RB];
/** Buttons that can never be captured (Home belongs to the system). */
const NEVER = new Set<number>([PAD.HOME]);

const STICK_PUSH = 0.6;

export class PadCapture {
  private armed = false;
  private mod = -1;
  private modUsed = false;
  private prevDown = new Set<number>();

  constructor(readonly kind: PadCaptureKind = 'button') {}

  /** Feed the player pad for this frame (null = no pad). Returns the captured binding once, then keeps returning null. */
  feed(p: PadSnapshot | null): Binding | null {
    if (!p) return null;
    const down = new Set<number>();
    for (let i = 0; i < p.buttons.length; i++) if (!NEVER.has(i) && (p.buttons[i] ?? 0) > buttonThreshold(i)) down.add(i);
    const sticks = this.stickState(p);
    if (!this.armed) {
      if (down.size === 0 && !sticks.any) this.armed = true;
      this.prevDown = down;
      return null;
    }
    const result = this.decide(down, sticks);
    this.prevDown = down;
    return result;
  }

  private stickState(p: PadSnapshot): { any: boolean; left: boolean; right: boolean; axis: { axis: number; dir: 1 | -1 } | null } {
    const mag = (a: number) => Math.hypot(p.axes[a] ?? 0, p.axes[a + 1] ?? 0);
    const left = mag(PAD_AXIS.LX) > STICK_PUSH, right = mag(PAD_AXIS.RX) > STICK_PUSH;
    let axis: { axis: number; dir: 1 | -1 } | null = null;
    let best = STICK_PUSH;
    for (let a = 0; a < 4; a++) {
      const v = p.axes[a] ?? 0;
      if (Math.abs(v) > best) { best = Math.abs(v); axis = { axis: a, dir: v < 0 ? -1 : 1 }; }
    }
    return { any: left || right, left, right, axis };
  }

  private decide(down: Set<number>, sticks: ReturnType<PadCapture['stickState']>): Binding | null {
    const mods = [...down].filter((b) => MODIFIER_BUTTONS.includes(b));
    const modNow = this.mod >= 0 && down.has(this.mod) ? this.mod : mods.length ? mods[0] : -1;
    const withMod = <T extends Binding>(b: T): T => (modNow >= 0 && (b.kind === 'pad' || b.kind === 'padAxis' || b.kind === 'padStick') ? ({ ...b, mod: modNow } as T) : b);

    if (this.kind === 'stick') {
      if (sticks.left || sticks.right) return withMod({ kind: 'padStick', stick: sticks.left ? 'left' : 'right' });
      return this.modifierOnly(down, modNow, false);
    }
    if (this.kind === 'axis') {
      if (sticks.axis) return withMod({ kind: 'padAxis', axis: sticks.axis.axis, dir: sticks.axis.dir });
      return this.modifierOnly(down, modNow, false);
    }
    // button action: a new press of a non-modifier button, or a modifier released without a partner
    for (const b of down) {
      if (this.prevDown.has(b) || MODIFIER_BUTTONS.includes(b)) continue;
      this.modUsed = true;
      return withMod({ kind: 'pad', button: b });
    }
    if (sticks.axis && modNow >= 0 && !this.modUsed) {
      this.modUsed = true;
      return { kind: 'padAxis', axis: sticks.axis.axis, dir: sticks.axis.dir, mod: modNow };
    }
    return this.modifierOnly(down, modNow, true);
  }

  /** A modifier pressed and released on its own is itself the binding (LB alone = previous ant). */
  private modifierOnly(down: Set<number>, modNow: number, allow: boolean): Binding | null {
    if (modNow >= 0) { this.mod = modNow; return null; }
    if (allow && this.mod >= 0 && !this.modUsed) {
      const b = this.mod;
      this.mod = -1;
      return { kind: 'pad', button: b };
    }
    this.mod = -1;
    this.modUsed = false;
    void down;
    return null;
  }
}
