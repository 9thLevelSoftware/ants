// Rebinding rules (GDD 01 5.7, GDD 08 7.5): conflicts per context, reserved keys, swap / unbind-other, resets.
import { ACTIONS, actionDef, requiredActionIds, requiredPadActionIds } from './actions';
import { cloneBindings, defaultBindings, isPadBinding, sameBinding, type BindingSet } from './bindings';
import { anyContextsOverlap } from './contexts';
import { KBM_SLOTS } from './defaults';
import type { Binding, InputContext } from './types';

/** A slot is a KBM slot index (0..KBM_SLOTS-1) or the gamepad slot. */
export type Slot = number | 'pad';

export interface Conflict {
  actionId: string;
  slot: Slot;
}

export type RefusalReason = 'reserved' | 'locked' | 'wrong-kind' | 'modifier';

/**
 * Keys the game never binds: Esc is the menu fallback; F11/F12 belong to the browser; Ctrl, Alt and Meta are not
 * offered at all (Ctrl+W would close the tab while W is held). Keyboard events carrying Ctrl/Alt/Meta are ignored
 * by the input state for the same reason.
 */
const RESERVED_CODES = new Set([
  'Escape', 'F11', 'F12', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight', 'OSLeft', 'OSRight', 'ContextMenu',
]);

export function isReservedCode(code: string): boolean {
  return RESERVED_CODES.has(code);
}

/** Can `binding` go into `slot` of `actionId` at all (ignoring conflicts)? */
export function checkBinding(actionId: string, slot: Slot, binding: Binding): { ok: true } | { ok: false; reason: RefusalReason } {
  const a = actionDef(actionId);
  if (!a || a.locked) return { ok: false, reason: 'locked' };
  const comp = a.axis ? actionId.split('.')[1] : null;
  if (slot === 'pad') {
    if (!isPadBinding(binding)) return { ok: false, reason: 'wrong-kind' };
    if (comp === 'stick' ? binding.kind !== 'padStick' : binding.kind === 'padStick') return { ok: false, reason: 'wrong-kind' };
    return { ok: true };
  }
  if (isPadBinding(binding)) return { ok: false, reason: 'wrong-kind' };
  if (comp === 'drag' ? binding.kind !== 'drag' : binding.kind === 'drag') return { ok: false, reason: 'wrong-kind' };
  if (comp === 'stick') return { ok: false, reason: 'wrong-kind' };
  if (binding.kind === 'key') {
    if (isReservedCode(binding.code)) return { ok: false, reason: 'reserved' };
    // Shift as a modifier of Shift makes no sense
    if (binding.shift && binding.code.startsWith('Shift')) return { ok: false, reason: 'modifier' };
  }
  return { ok: true };
}

function contextsOf(id: string): InputContext[] {
  return actionDef(id)?.contexts ?? [];
}

/** Other actions in overlapping contexts that already use `binding` (GDD 01 5.7: never silent). */
export function findConflicts(set: BindingSet, actionId: string, binding: Binding): Conflict[] {
  const mine = contextsOf(actionId);
  const out: Conflict[] = [];
  for (const other of ACTIONS) {
    if (other.id === actionId || !anyContextsOverlap(mine, other.contexts)) continue;
    const slots = set.kbm[other.id] ?? [];
    for (let i = 0; i < slots.length; i++) if (sameBinding(slots[i], binding)) out.push({ actionId: other.id, slot: i });
    if (sameBinding(set.pad[other.id], binding)) out.push({ actionId: other.id, slot: 'pad' });
  }
  return out;
}

/** Every conflict in a whole set (used by tests and the Settings screen to flag rows). */
export function allConflicts(set: BindingSet): { a: string; b: string; binding: Binding }[] {
  const out: { a: string; b: string; binding: Binding }[] = [];
  for (const a of ACTIONS) {
    const mine = [...(set.kbm[a.id] ?? []), set.pad[a.id]];
    for (const b of mine) {
      if (!b) continue;
      for (const c of findConflicts(set, a.id, b)) if (a.id < c.actionId) out.push({ a: a.id, b: c.actionId, binding: b });
    }
  }
  return out;
}

function getSlot(set: BindingSet, id: string, slot: Slot): Binding | null {
  return slot === 'pad' ? set.pad[id] ?? null : set.kbm[id]?.[slot] ?? null;
}

function setSlot(set: BindingSet, id: string, slot: Slot, b: Binding | null): void {
  if (slot === 'pad') set.pad[id] = b;
  else {
    if (!set.kbm[id]) set.kbm[id] = new Array<Binding | null>(KBM_SLOTS).fill(null);
    set.kbm[id][slot] = b;
  }
}

export type ConflictResolution = 'swap' | 'unbind-other' | 'cancel';

export type RebindResult =
  | { status: 'applied'; bindings: BindingSet; conflicts: Conflict[] }
  | { status: 'conflict'; conflicts: Conflict[] }
  | { status: 'refused'; reason: RefusalReason }
  | { status: 'cancelled' };

/**
 * Put `binding` (or null to clear) into a slot. With conflicts and no resolution the result is 'conflict' and
 * nothing changes; the UI then asks Swap / Unbind other / Cancel and calls again with the answer.
 * Swap: each conflicting action receives this slot's previous binding (or is cleared if there was none).
 * Returns a new BindingSet; the input is never mutated.
 */
export function rebind(set: BindingSet, actionId: string, slot: Slot, binding: Binding | null, resolution?: ConflictResolution): RebindResult {
  if (binding === null) {
    if (actionDef(actionId)?.locked) return { status: 'refused', reason: 'locked' };
    const next = cloneBindings(set);
    setSlot(next, actionId, slot, null);
    return { status: 'applied', bindings: next, conflicts: [] };
  }
  const check = checkBinding(actionId, slot, binding);
  if (!check.ok) return { status: 'refused', reason: check.reason };
  const conflicts = findConflicts(set, actionId, binding);
  // an input owned by a locked action (Esc / Start = menu) is reserved: no resolution may take it away
  if (conflicts.some((c) => actionDef(c.actionId)?.locked)) return { status: 'refused', reason: 'reserved' };
  if (conflicts.length && !resolution) return { status: 'conflict', conflicts };
  if (resolution === 'cancel') return { status: 'cancelled' };
  const next = cloneBindings(set);
  const previous = getSlot(set, actionId, slot);
  for (const c of conflicts) setSlot(next, c.actionId, c.slot, resolution === 'swap' ? previous : null);
  setSlot(next, actionId, slot, binding);
  return { status: 'applied', bindings: next, conflicts };
}

/** Reset every action that is live in `ctx` to its defaults. */
export function resetContext(set: BindingSet, ctx: InputContext): BindingSet {
  const def = defaultBindings();
  const next = cloneBindings(set);
  for (const a of ACTIONS) {
    if (!a.contexts.includes(ctx)) continue;
    next.kbm[a.id] = def.kbm[a.id];
    next.pad[a.id] = def.pad[a.id];
    if (a.holdToggle) next.holdToggle[a.id] = def.holdToggle[a.id];
  }
  return next;
}

export function resetAll(): BindingSet {
  return defaultBindings();
}

/**
 * Required actions that currently have no KBM binding, or (for those a gamepad needs) no pad binding. Settings
 * refuses to close while any exist.
 */
export function unboundRequired(set: BindingSet): string[] {
  const out = requiredActionIds().filter((id) => !(set.kbm[id] ?? []).some((b) => b));
  for (const id of requiredPadActionIds()) if (!set.pad[id] && !out.includes(id)) out.push(id);
  return out;
}

export function setHoldToggle(set: BindingSet, actionId: string, mode: 'hold' | 'toggle'): BindingSet {
  if (!actionDef(actionId)?.holdToggle) return set;
  const next = cloneBindings(set);
  next.holdToggle[actionId] = mode;
  return next;
}
