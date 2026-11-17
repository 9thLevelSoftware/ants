// Pad shortcuts that act while NO menu layer owns the pad (the game is being played): open the panels, dismiss a hint,
// enter the alert feed, show the controls. They are the pad half of actions the UI handles itself (the keyboard half
// is in src/ui/hud/hotkeys.ts): the pad binding of each action comes from the CURRENT bindings, so rebinding works.
import { ACTIONS, actionDef, anyContextsOverlap, defaultBindings, type Binding } from '@/input';
import type { PadFrame } from './padReader';

/** A pad binding of a UI-handled action together with the action id. */
export interface PadShortcut { id: string; binding: Extract<Binding, { kind: 'pad' }> }

/** The pad bindings (plain button, optional modifier, optional hold / tap gesture) among `ids`. */
export function shortcutsOf(pad: Record<string, Binding | null | undefined>, ids: readonly string[]): PadShortcut[] {
  const out: PadShortcut[] = [];
  for (const id of ids) {
    const b = pad[id];
    if (b && b.kind === 'pad') out.push({ id, binding: b });
  }
  return out;
}

/**
 * Every pad combination of the game (any action, any context) that holds a modifier. The shortcuts above yield to
 * these too: LB + D-pad left is the game's speed-down, so it must not also toggle the scent view that D-pad left
 * alone is. Only combinations in contexts that overlap the shortcut's own count (the lists are small).
 */
export function modifiedCombos(pad: Record<string, Binding | null | undefined>): PadShortcut[] {
  return shortcutsOf(pad, ACTIONS.map((a) => a.id)).filter((s) => s.binding.mod !== undefined);
}

let defaults: PadShortcut[] | null = null;
function defaultCombos(): PadShortcut[] {
  return (defaults ??= modifiedCombos(defaultBindings().pad));
}

function contextsOverlap(a: string, b: string): boolean {
  const da = actionDef(a), db = actionDef(b);
  return !!da && !!db && anyContextsOverlap(da.contexts, db.contexts);
}

/**
 * Which shortcuts fire this frame. A press with a modifier fires when the button goes down with the modifier held; a
 * hold fires once when the button has been down for `holdMs`; a tap when it is released sooner than `holdMs`. A plain
 * binding yields to another binding on the same button whose modifier is held (RB + D-pad up is Colony orders, not the
 * scent view that D-pad up alone would be), and so does it to the game's own combinations (`combos`: the modified
 * bindings of every action, from the current bindings; the default table when not given).
 */
export class ShortcutMatcher {
  private holdFired = new Set<number>();

  fired(list: readonly PadShortcut[], f: PadFrame, holdScale = 1, combos: readonly PadShortcut[] = defaultCombos()): string[] {
    const out: string[] = [];
    for (const { id, binding: b } of list) {
      if (b.mod === undefined) {
        const yields = [...list, ...combos].some((o) => o.id !== id && o.binding.button === b.button && o.binding.mod !== undefined && f.down(o.binding.mod) && contextsOverlap(id, o.id));
        if (yields) continue;
      } else if (!f.down(b.mod)) continue;
      const lim = (b.holdMs ?? 250) * holdScale;
      if (b.gesture === 'hold') {
        if (f.down(b.button) && f.heldMs(b.button) >= lim && !this.holdFired.has(b.button)) { this.holdFired.add(b.button); out.push(id); }
      } else if (b.gesture === 'tap') {
        const ms = f.releasedAfterMs(b.button);
        if (f.release(b.button) && ms >= 0 && ms < lim) out.push(id);
      } else if (f.edge(b.button)) out.push(id);
    }
    for (const b of [...this.holdFired]) if (!f.down(b)) this.holdFired.delete(b);
    return out;
  }

  reset(): void { this.holdFired.clear(); }
}
