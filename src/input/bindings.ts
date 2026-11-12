// The serialisable bindings object (stored in localStorage `foundress.bindings.v1` by the settings owner).
import { ACTIONS, actionDef } from './actions';
import { anyContextsOverlap } from './contexts';
import { KBM_SLOTS } from './defaults';
import type { Binding, HoldToggleMode } from './types';

export const BINDINGS_VERSION = 1;

/** Plain JSON. `kbm[id]` always has KBM_SLOTS entries (null = empty slot). */
export interface BindingSet {
  version: number;
  kbm: Record<string, (Binding | null)[]>;
  pad: Record<string, Binding | null>;
  /** Per action hold-or-toggle behaviour for actions whose ActionDef has holdToggle. */
  holdToggle: Record<string, HoldToggleMode>;
}

export function defaultBindings(): BindingSet {
  const set: BindingSet = { version: BINDINGS_VERSION, kbm: {}, pad: {}, holdToggle: {} };
  for (const a of ACTIONS) {
    const slots: (Binding | null)[] = [];
    for (let i = 0; i < KBM_SLOTS; i++) slots.push(a.kbm[i] ? { ...a.kbm[i] } : null);
    set.kbm[a.id] = slots;
    set.pad[a.id] = a.pad ? { ...a.pad } : null;
    if (a.holdToggle) set.holdToggle[a.id] = 'hold';
  }
  return set;
}

export function cloneBindings(b: BindingSet): BindingSet {
  return JSON.parse(JSON.stringify(b)) as BindingSet;
}

/** Structural equality of two bindings (what "the same input" means for conflicts). holdMs is ignored. */
export function sameBinding(a: Binding | null | undefined, b: Binding | null | undefined): boolean {
  if (!a || !b || a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'key': { const o = b as typeof a; return a.code === o.code && !!a.shift === !!o.shift; }
    case 'mouse': { const o = b as typeof a; return a.button === o.button && (a.gesture ?? 'press') === (o.gesture ?? 'press'); }
    case 'drag': return a.button === (b as typeof a).button;
    case 'wheel': { const o = b as typeof a; return a.dir === o.dir && !!a.shift === !!o.shift; }
    case 'pad': { const o = b as typeof a; return a.button === o.button && (a.mod ?? -1) === (o.mod ?? -1) && (a.gesture ?? 'press') === (o.gesture ?? 'press'); }
    case 'padAxis': { const o = b as typeof a; return a.axis === o.axis && a.dir === o.dir && (a.mod ?? -1) === (o.mod ?? -1); }
    case 'padStick': { const o = b as typeof a; return a.stick === o.stick && (a.mod ?? -1) === (o.mod ?? -1); }
  }
}

export function isPadBinding(b: Binding): boolean {
  return b.kind === 'pad' || b.kind === 'padAxis' || b.kind === 'padStick';
}

function isBinding(x: unknown): x is Binding {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
  switch (o.kind) {
    case 'key': return typeof o.code === 'string' && o.code.length > 0;
    case 'mouse': return num(o.button) && (o.gesture === undefined || ['click', 'dbl', 'hold'].includes(o.gesture as string));
    case 'drag': return num(o.button);
    case 'wheel': return o.dir === 1 || o.dir === -1;
    case 'pad': return num(o.button) && (o.gesture === undefined || ['tap', 'hold'].includes(o.gesture as string));
    case 'padAxis': return num(o.axis) && (o.dir === 1 || o.dir === -1);
    case 'padStick': return o.stick === 'left' || o.stick === 'right';
    default: return false;
  }
}

/** Serialise to a JSON string. */
export function serializeBindings(b: BindingSet): string {
  return JSON.stringify(b);
}

/**
 * Parse and validate stored bindings. Unknown actions are dropped, malformed slots fall back to the default for
 * that action, missing actions (added in a later version) get their defaults. Never throws.
 */
export function parseBindings(text: string | null | undefined): { bindings: BindingSet; warnings: string[] } {
  const warnings: string[] = [];
  const out = defaultBindings();
  if (!text) return { bindings: out, warnings };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    warnings.push('bindings: stored value is not JSON; using defaults');
    return { bindings: out, warnings };
  }
  if (!raw || typeof raw !== 'object') return { bindings: out, warnings: ['bindings: not an object; using defaults'] };
  const r = raw as Partial<BindingSet>;
  if (r.version !== BINDINGS_VERSION) warnings.push(`bindings: version ${String(r.version)} != ${BINDINGS_VERSION}; reading what matches`);
  for (const [id, slots] of Object.entries(r.kbm ?? {})) {
    if (!actionDef(id)) { warnings.push(`bindings: unknown action ${id} dropped`); continue; }
    if (!Array.isArray(slots)) { warnings.push(`bindings: ${id} kbm malformed`); continue; }
    const clean: (Binding | null)[] = [];
    for (let i = 0; i < KBM_SLOTS; i++) {
      const s = slots[i];
      if (s === null || s === undefined) clean.push(null);
      else if (isBinding(s) && !isPadBinding(s)) clean.push(s);
      else { warnings.push(`bindings: ${id} slot ${i} malformed`); clean.push(out.kbm[id][i]); }
    }
    out.kbm[id] = clean;
  }
  for (const [id, b] of Object.entries(r.pad ?? {})) {
    if (!actionDef(id)) continue;
    if (b === null) out.pad[id] = null;
    else if (isBinding(b) && isPadBinding(b)) out.pad[id] = b;
    else warnings.push(`bindings: ${id} pad malformed`);
  }
  for (const [id, mode] of Object.entries(r.holdToggle ?? {})) {
    if (actionDef(id)?.holdToggle && (mode === 'hold' || mode === 'toggle')) out.holdToggle[id] = mode;
  }
  // locked actions always keep their defaults
  for (const a of ACTIONS) if (a.locked) { out.kbm[a.id] = defaultBindings().kbm[a.id]; out.pad[a.id] = a.pad; }
  dropInputsOfLockedActions(out, warnings);
  return { bindings: out, warnings };
}

/** A stored set may give another action the input of a locked action (Esc / Start): clear such slots. */
function dropInputsOfLockedActions(set: BindingSet, warnings: string[]): void {
  for (const locked of ACTIONS) {
    if (!locked.locked) continue;
    const reserved = [...(set.kbm[locked.id] ?? []), set.pad[locked.id]];
    for (const other of ACTIONS) {
      if (other.locked || !anyContextsOverlap(locked.contexts, other.contexts)) continue;
      const slots = set.kbm[other.id] ?? [];
      for (let i = 0; i < slots.length; i++) {
        if (reserved.some((r) => sameBinding(r, slots[i]))) { slots[i] = null; warnings.push(`bindings: ${other.id} slot ${i} uses a reserved input`); }
      }
      if (reserved.some((r) => sameBinding(r, set.pad[other.id]))) { set.pad[other.id] = null; warnings.push(`bindings: ${other.id} pad uses a reserved input`); }
    }
  }
}

/** All bindings of one action: user KBM slots, pad slot, fixed extras. */
export function bindingsOf(set: BindingSet, id: string): Binding[] {
  const out: Binding[] = [];
  for (const b of set.kbm[id] ?? []) if (b) out.push(b);
  const p = set.pad[id];
  if (p) out.push(p);
  const fixed = actionDef(id)?.fixed;
  if (fixed) out.push(...fixed);
  return out;
}

const KEY_LABELS: Record<string, string> = {
  Space: 'Space', Escape: 'Esc', Enter: 'Enter', Tab: 'Tab', Backspace: 'Backspace', Delete: 'Delete',
  ShiftLeft: 'Shift', ShiftRight: 'Right Shift', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
  BracketLeft: '[', BracketRight: ']', Minus: '-', Equal: '=', Comma: ',', Period: '.', Slash: '/', Pause: 'Pause',
};
const MOUSE_LABELS = ['LMB', 'MMB', 'RMB', 'Mouse 4', 'Mouse 5'];
const PAD_LABELS = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Start', 'LS', 'RS', 'Dpad up', 'Dpad down', 'Dpad left', 'Dpad right', 'Home'];

/** US-layout label for a code (the UI may substitute navigator.keyboard.getLayoutMap()). */
export function keyLabel(code: string): string {
  if (KEY_LABELS[code]) return KEY_LABELS[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return code;
}

export function bindingLabel(b: Binding): string {
  switch (b.kind) {
    case 'key': return (b.shift ? 'Shift+' : '') + keyLabel(b.code);
    case 'mouse': {
      const n = MOUSE_LABELS[b.button] ?? `Mouse ${b.button + 1}`;
      return b.gesture === 'click' ? `${n} click` : b.gesture === 'dbl' ? `${n} double-click` : b.gesture === 'hold' ? `${n} hold` : n;
    }
    case 'drag': return `${MOUSE_LABELS[b.button] ?? 'Mouse'} drag`;
    case 'wheel': return (b.shift ? 'Shift+' : '') + (b.dir < 0 ? 'Wheel up' : 'Wheel down');
    case 'pad': {
      const n = PAD_LABELS[b.button] ?? `Button ${b.button}`;
      const mod = b.mod !== undefined ? `${PAD_LABELS[b.mod] ?? b.mod}+` : '';
      return mod + n + (b.gesture === 'hold' ? ' hold' : b.gesture === 'tap' ? ' tap' : '');
    }
    case 'padAxis': return `${b.mod !== undefined ? `${PAD_LABELS[b.mod]}+` : ''}Axis ${b.axis}${b.dir > 0 ? '+' : '-'}`;
    case 'padStick': return `${b.mod !== undefined ? `${PAD_LABELS[b.mod]}+` : ''}${b.stick === 'left' ? 'Left' : 'Right'} stick`;
  }
}
