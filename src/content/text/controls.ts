// The controls reference, generated from the bindings table (src/input/actions.ts) and a BindingSet, so the manual,
// the in-game "Show controls" list and the key hints can never disagree with the actual bindings. Pure: no DOM.
// `docs/MANUAL.md` (section 13) embeds the default-bindings output between two marker comments; `controls.test.ts`
// compares them.
import { ACTIONS, AXES, BUTTON_ACTIONS } from '@/input/actions';
import { bindingLabel, defaultBindings } from '@/input/bindings';
import type { BindingSet } from '@/input/bindings';
import type { ActionDef, Binding, InputContext } from '@/input/types';

export interface ControlRow {
  /** Action id (button action) or axis id. */
  id: string;
  label: string;
  /** Keyboard and mouse bindings in display form, "none" when unbound. */
  keyboard: string;
  /** Gamepad binding in display form, "none" when unbound. */
  gamepad: string;
  /** Raw contexts of the action (GDD 01 §0). */
  contexts: readonly InputContext[];
}

export type ControlGroupId = 'anywhere' | 'views' | 'ant-observer' | 'ant' | 'observer' | 'colony' | 'photo' | 'timelapse' | 'menus';

export interface ControlGroup {
  id: ControlGroupId;
  title: string;
  rows: ControlRow[];
}

const GROUP_TITLE: Record<ControlGroupId, string> = {
  anywhere: 'Anywhere in play',
  views: 'In every play view',
  'ant-observer': 'Controlling an ant or observing',
  ant: 'Controlling an ant',
  observer: 'Observer view',
  colony: 'Colony view',
  photo: 'Photo mode',
  timelapse: 'During a time-lapse',
  menus: 'Menus and panels',
};
const GROUP_ORDER: readonly ControlGroupId[] = ['anywhere', 'views', 'ant-observer', 'ant', 'observer', 'colony', 'photo', 'timelapse', 'menus'];

/** The group of an action, from the contexts in which it is live (GDD 01 §5). */
export function groupOf(contexts: readonly InputContext[]): ControlGroupId {
  const has = (c: InputContext) => contexts.includes(c);
  if (has('G')) return 'anywhere';
  if (has('P') && has('O') && has('C')) return 'views';
  if (has('P') && has('O')) return 'ant-observer';
  if (has('P')) return 'ant';
  if (has('O')) return 'observer';
  if (has('C')) return 'colony';
  if (has('Ph')) return 'photo';
  if (has('TL')) return 'timelapse';
  return 'menus';
}

const NONE = 'none';

/** Gamepad axis halves in words (standard mapping: axes 0/1 left stick, 2/3 right stick; negative = left / up). */
function padAxisLabel(b: Extract<Binding, { kind: 'padAxis' }>): string {
  const stick = b.axis < 2 ? 'left' : 'right';
  const vertical = b.axis % 2 === 1;
  const dir = vertical ? (b.dir < 0 ? 'up' : 'down') : b.dir < 0 ? 'left' : 'right';
  const mod = b.mod === undefined ? '' : `${bindingLabel({ kind: 'pad', button: b.mod })}+`;
  return `${mod}${stick} stick ${dir}`;
}

/** Display text of one binding (the input layer's label, with gamepad axes written out). */
export function describeBinding(b: Binding): string {
  return b.kind === 'padAxis' ? padAxisLabel(b) : bindingLabel(b);
}

const isPadBinding = (b: Binding): boolean => b.kind === 'pad' || b.kind === 'padAxis';

/** Keyboard and mouse bindings: the user's slots and the fixed ones that are not gamepad chords. */
function keyboardOf(set: BindingSet, a: ActionDef): Binding[] {
  const out: Binding[] = [];
  for (const b of set.kbm[a.id] ?? []) if (b) out.push(b);
  if (a.fixed) out.push(...a.fixed.filter((b) => !isPadBinding(b)));
  return out;
}

/** Gamepad bindings: the slot and the fixed gamepad chords (photo mode takes either stick click first). */
function padBindingsOf(set: BindingSet, a: ActionDef): Binding[] {
  const out: Binding[] = [];
  const slot = set.pad[a.id];
  if (slot) out.push(slot);
  if (a.fixed) out.push(...a.fixed.filter(isPadBinding));
  return out;
}

const joinOr = (labels: string[]): string => (labels.length === 0 ? NONE : labels.join(' or '));

function buttonRow(set: BindingSet, a: ActionDef): ControlRow {
  return {
    id: a.id,
    label: a.label,
    keyboard: joinOr(keyboardOf(set, a).map(describeBinding)),
    gamepad: joinOr(padBindingsOf(set, a).map(describeBinding)),
    contexts: a.contexts,
  };
}

function axisRow(set: BindingSet, axisId: string, label: string, contexts: InputContext[]): ControlRow {
  const comps = ACTIONS.filter((a) => a.axis === axisId);
  const comp = (name: string) => comps.find((a) => a.id === `${axisId}.${name}`);
  const kb = (name: string): string[] => {
    const a = comp(name);
    return a ? keyboardOf(set, a).map(describeBinding) : [];
  };
  const padOf = (name: string): string[] => {
    const a = comp(name);
    const p = a ? set.pad[a.id] : null;
    return p ? [describeBinding(p)] : [];
  };
  const keyParts: string[] = [];
  const pads: string[] = [];
  const hasDirections = ['up', 'down', 'left', 'right'].every((n) => comp(n));
  if (hasDirections) {
    const dirs = ['up', 'left', 'down', 'right'].map((n) => kb(n));
    if (dirs.every((d) => d.length === 1)) keyParts.push(dirs.map((d) => d[0]).join(' '));
    else keyParts.push(['up', 'left', 'down', 'right'].map((n) => `${n} ${joinOr(kb(n))}`).join(', '));
  } else if (comp('left') && comp('right')) {
    keyParts.push(`left ${joinOr(kb('left'))}, right ${joinOr(kb('right'))}`);
  }
  if (kb('drag').length > 0) keyParts.push(joinOr(kb('drag')));
  if (comp('in') && comp('out')) {
    keyParts.push(`in ${joinOr(kb('in'))}, out ${joinOr(kb('out'))}`);
    const pin = padOf('in');
    const pout = padOf('out');
    if (pin.length > 0 || pout.length > 0) pads.push(`in ${joinOr(pin)}, out ${joinOr(pout)}`);
  }
  pads.push(...padOf('stick'));
  return {
    id: axisId,
    label,
    keyboard: keyParts.length > 0 ? keyParts.join('; ') : NONE,
    gamepad: pads.length > 0 ? pads.join('; ') : NONE,
    contexts,
  };
}

/** The whole reference: every button action and every axis, grouped, in the order of the bindings table. */
export function buildControlsReference(set: BindingSet = defaultBindings()): ControlGroup[] {
  const groups = new Map<ControlGroupId, ControlRow[]>(GROUP_ORDER.map((g) => [g, []]));
  for (const a of BUTTON_ACTIONS) groups.get(groupOf(a.contexts))!.push(buttonRow(set, a));
  for (const axis of AXES) groups.get(groupOf(axis.contexts))!.push(axisRow(set, axis.id, axis.label, axis.contexts));
  return GROUP_ORDER.map((id) => ({ id, title: GROUP_TITLE[id], rows: groups.get(id)! })).filter((g) => g.rows.length > 0);
}

/** The reference as Markdown (one table per group), the text embedded in docs/manual/controls.md. */
export function controlsMarkdown(set: BindingSet = defaultBindings()): string {
  const lines: string[] = [];
  for (const g of buildControlsReference(set)) {
    lines.push(`#### ${g.title}`, '', '| Action | Keyboard and mouse | Gamepad |', '| --- | --- | --- |');
    for (const r of g.rows) lines.push(`| ${r.label} | ${r.keyboard} | ${r.gamepad} |`);
    lines.push('');
  }
  return lines.join('\n').trimEnd() + '\n';
}

/** Marker comments that delimit the generated table in docs/manual/controls.md. */
export const CONTROLS_TABLE_START = '<!-- controls-table:start -->';
export const CONTROLS_TABLE_END = '<!-- controls-table:end -->';
