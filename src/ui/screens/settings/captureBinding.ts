// Turning a pressed input into a Binding while a KeybindRow is listening (GDD 08 7.5), and the plain-words messages
// for conflicts and refusals. Pure: the row feeds it event-like data and decides what to do with the answer.
import { actionDef, axisDef, bindingLabel, type ActionDef, type Binding, type Conflict, type RefusalReason, type Slot } from '@/input';

export type Captured =
  | { kind: 'binding'; binding: Binding }
  /** A modifier-only press: wait for its key-up before binding it (so Shift+X can still be captured). */
  | { kind: 'pending'; code: string }
  | { kind: 'refused'; message: string }
  | { kind: 'ignore' };

export interface KeyEventLike {
  code: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}

const SHIFTS = new Set(['ShiftLeft', 'ShiftRight']);
const BLOCKED_MODS = new Set(['ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight', 'OSLeft', 'OSRight']);

export function captureKey(e: KeyEventLike): Captured {
  if (e.code === 'Escape') return { kind: 'ignore' }; // cancels listening elsewhere
  if (BLOCKED_MODS.has(e.code) || e.ctrlKey || e.altKey || e.metaKey) {
    return { kind: 'refused', message: 'Ctrl, Alt and Meta cannot be bound. Shift can.' };
  }
  if (SHIFTS.has(e.code)) return { kind: 'pending', code: e.code };
  const binding: Binding = e.shiftKey ? { kind: 'key', code: e.code, shift: true } : { kind: 'key', code: e.code };
  return { kind: 'binding', binding };
}

/** Mouse buttons are accepted where the action allows them; axis `.drag` slots take a drag binding. */
export function captureMouse(actionId: string, button: number): Binding {
  const isDrag = actionId.endsWith('.drag');
  return isDrag ? { kind: 'drag', button } : { kind: 'mouse', button };
}

export function captureWheel(deltaY: number, shift: boolean): Binding {
  const dir = deltaY < 0 ? -1 : 1;
  return shift ? { kind: 'wheel', dir, shift: true } : { kind: 'wheel', dir };
}

export const REFUSAL_TEXT: Record<RefusalReason, string> = {
  reserved: 'That input is reserved: Esc opens the menu, and F11 and F12 belong to the browser.',
  locked: 'This action cannot be changed.',
  'wrong-kind': 'That kind of input does not work for this action.',
  modifier: 'Shift cannot be bound together with itself.',
};

const CONTEXT_NAMES: Record<string, string> = {
  G: 'everywhere', P: 'Possession', O: 'Observer', C: 'Colony view', Ph: 'Photo mode', TL: 'Time-lapse', UI: 'Menus',
};

export function contextName(code: string): string {
  return CONTEXT_NAMES[code] ?? code;
}

/** Name of an action in plain words: axis components read "Move right", not "Move (right)". */
export function actionLabel(def: ActionDef): string {
  if (def.axis) {
    const comp = def.id.split('.')[1];
    const axis = axisDef(def.axis)?.label ?? def.axis;
    return comp === 'stick' ? `${axis} (gamepad stick)` : comp === 'drag' ? `${axis} (mouse drag)` : `${axis} ${comp}`;
  }
  return def.label;
}

/** "D is already Move right." naming the first conflicting action (GDD 08 7.5). */
export function conflictMessage(binding: Binding, conflicts: readonly Conflict[]): string {
  const first = conflicts[0];
  const def = first ? actionDef(first.actionId) : undefined;
  const name = def ? actionLabel(def) : first?.actionId ?? 'another action';
  const where = def && def.contexts[0] !== 'G' ? ` (${contextName(def.contexts[0])})` : '';
  const more = conflicts.length > 1 ? ` and ${conflicts.length - 1} more` : '';
  return `${bindingLabel(binding)} is already ${name}${where}${more}.`;
}

export function slotLabel(slot: Slot): string {
  return slot === 'pad' ? 'gamepad' : slot === 0 ? 'primary' : 'secondary';
}
