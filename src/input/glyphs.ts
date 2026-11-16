// On-screen key hints (GDD 08 2.7 KeyCap): what to print for an action's CURRENT binding, for the device the player
// used last. Pure text: the UI draws it. Axis actions (move, look, zoom, pan, fly ...) have no single binding of
// their own (they are made of components), so they get their own wording here.
import { actionDef, axisDef } from './actions';
import { bindingLabel, keyLabel, type BindingSet } from './bindings';
import { PAD } from './defaults';
import type { Binding, InputDevice } from './types';

/** Glyph family of the pad: Xbox-style letters by default, PlayStation shapes when the pad id says so (GDD 08 2.7). */
export type PadStyle = 'xbox' | 'playstation';

/** "054c" is Sony's USB vendor id; Chrome puts it in the pad id ("... Vendor: 054c Product: 09cc"). */
export function padStyleOf(id: string | null | undefined): PadStyle {
  if (!id) return 'xbox';
  return /054c|playstation|dualshock|dualsense|sony/i.test(id) ? 'playstation' : 'xbox';
}

const XBOX: Record<number, string> = {
  [PAD.A]: 'A', [PAD.B]: 'B', [PAD.X]: 'X', [PAD.Y]: 'Y', [PAD.LB]: 'LB', [PAD.RB]: 'RB', [PAD.LT]: 'LT', [PAD.RT]: 'RT',
  [PAD.VIEW]: 'View', [PAD.START]: 'Menu', [PAD.LS]: 'LS', [PAD.RS]: 'RS',
  [PAD.DUP]: 'D-pad ↑', [PAD.DDOWN]: 'D-pad ↓', [PAD.DLEFT]: 'D-pad ←', [PAD.DRIGHT]: 'D-pad →', [PAD.HOME]: 'Home',
};
const PLAYSTATION: Record<number, string> = {
  ...XBOX,
  [PAD.A]: '✕', [PAD.B]: '○', [PAD.X]: '□', [PAD.Y]: '△', [PAD.LB]: 'L1', [PAD.RB]: 'R1', [PAD.LT]: 'L2', [PAD.RT]: 'R2',
  [PAD.VIEW]: 'Create', [PAD.START]: 'Options', [PAD.LS]: 'L3', [PAD.RS]: 'R3',
};

/** The printed name of a standard-mapping button. */
export function padButtonGlyph(button: number, style: PadStyle = 'xbox'): string {
  return (style === 'playstation' ? PLAYSTATION : XBOX)[button] ?? `Button ${button}`;
}

const STICK_NAME: Record<string, string> = { left: 'Left stick', right: 'Right stick' };

function axisWord(axis: number, dir: number, style: PadStyle): string {
  const stick = axis < 2 ? (style === 'playstation' ? 'L-stick' : 'LS') : style === 'playstation' ? 'R-stick' : 'RS';
  const vertical = axis % 2 === 1;
  const arrow = vertical ? (dir < 0 ? '↑' : '↓') : dir < 0 ? '←' : '→';
  return `${stick} ${arrow}`;
}

/** A pad binding as printed on a key cap ("A", "LB + D-pad ↑", "Hold View", "Right stick"). */
export function padBindingGlyph(b: Binding, style: PadStyle = 'xbox'): string {
  switch (b.kind) {
    case 'pad': {
      const mod = b.mod !== undefined ? `${padButtonGlyph(b.mod, style)} + ` : '';
      const main = padButtonGlyph(b.button, style);
      return b.gesture === 'hold' ? `${mod}Hold ${main}` : mod + main;
    }
    case 'padAxis': return `${b.mod !== undefined ? `${padButtonGlyph(b.mod, style)} + ` : ''}${axisWord(b.axis, b.dir, style)}`;
    case 'padStick': return `${b.mod !== undefined ? `${padButtonGlyph(b.mod, style)} + ` : ''}${STICK_NAME[b.stick] ?? 'Stick'}`;
    default: return bindingLabel(b);
  }
}

const ARROW_KEY: Record<string, string> = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };
const keyGlyph = (code: string): string => ARROW_KEY[code] ?? keyLabel(code);

function firstKey(set: BindingSet, id: string): Binding | null {
  return (set.kbm[id] ?? []).find((x): x is Binding => !!x) ?? null;
}

function keyboardAxisHint(set: BindingSet, axisId: string): string | null {
  const key = (c: string): Binding | null => firstKey(set, `${axisId}.${c}`);
  const dirs = ['up', 'left', 'down', 'right'].map(key);
  if (dirs.every((d) => d && d.kind === 'key')) return dirs.map((d) => keyGlyph((d as Extract<Binding, { kind: 'key' }>).code)).join(' ');
  const drag = key('drag');
  if (drag) return bindingLabel(drag);
  const kin = key('in'), kout = key('out');
  if (kin && kout) return `${bindingLabel(kin)} ${bindingLabel(kout)}`;
  const left = key('left'), right = key('right');
  if (left && right) return `${bindingLabel(left)} ${bindingLabel(right)}`;
  return null;
}

function padAxisHint(set: BindingSet, axisId: string, style: PadStyle): string | null {
  const stick = set.pad[`${axisId}.stick`];
  if (stick) return padBindingGlyph(stick, style);
  const pin = set.pad[`${axisId}.in`], pout = set.pad[`${axisId}.out`];
  if (pin && pout) {
    // a zoom held on one modifier and one stick axis reads "LB + RS ↕"; two separate buttons read "RT / LT"
    if (pin.kind === 'padAxis' && pout.kind === 'padAxis' && pin.axis === pout.axis) {
      return `${pin.mod !== undefined ? `${padButtonGlyph(pin.mod, style)} + ` : ''}${pin.axis < 2 ? (style === 'playstation' ? 'L-stick' : 'LS') : style === 'playstation' ? 'R-stick' : 'RS'} ↕`;
    }
    return `${padBindingGlyph(pin, style)} / ${padBindingGlyph(pout, style)}`;
  }
  return null;
}

/**
 * The text for the key cap of `actionId` (a button action or an axis id such as `move`) on `device`, or null when
 * nothing is bound for that device.
 */
export function hintText(set: BindingSet, actionId: string, device: InputDevice = 'kbm', style: PadStyle = 'xbox'): string | null {
  if (axisDef(actionId) && !actionDef(actionId)) return device === 'pad' ? padAxisHint(set, actionId, style) : keyboardAxisHint(set, actionId);
  if (device === 'pad') {
    const b = set.pad[actionId];
    return b ? padBindingGlyph(b, style) : null;
  }
  const b = firstKey(set, actionId);
  return b ? bindingLabel(b) : null;
}
