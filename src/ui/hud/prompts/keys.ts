// The key cap text of a hint, from the player's CURRENT bindings (GDD 08 2.7: never a hard-coded key). Axes are
// written from their components (`move` -> "W A S D"), the speed keys as a range ("1-4"), a hint whose key is not a
// rebindable action (the marker tools) from its fixed text. Pure: no DOM.
import { bindingLabel, type Binding, type BindingSet } from '@/input';

const first = (set: BindingSet, id: string): Binding | null => (set.kbm[id] ?? []).find((b): b is Binding => !!b) ?? null;
const label = (set: BindingSet, id: string): string | null => {
  const b = first(set, id);
  return b ? bindingLabel(b) : null;
};

/** "1-4" when the labels are consecutive digits, else the labels joined with a slash. */
function range(labels: string[]): string {
  const digits = labels.map((l) => (/^\d$/.test(l) ? Number(l) : NaN));
  if (labels.length > 1 && digits.every((d, i) => !Number.isNaN(d) && (i === 0 || d === (digits[i - 1] ?? 0) + 1))) return `${labels[0]}-${labels[labels.length - 1]}`;
  return labels.join(' / ');
}

/**
 * The text of the key cap for `action` (a button action id, an axis id, or `speed-1` for the four speed keys), or null
 * when the hint has no key or the action is unbound. `fixedKey` is used when `action` is null.
 */
export function keyCapText(set: BindingSet, action: string | null, fixedKey?: string): string | null {
  if (action === null) return fixedKey ?? null;
  if (action === 'move') {
    const parts = ['up', 'left', 'down', 'right'].map((d) => label(set, `move.${d}`)).filter((l): l is string => !!l);
    return parts.length > 0 ? parts.join(' ') : null;
  }
  if (action === 'orbit') return label(set, 'orbit.drag') ?? label(set, 'orbit.left');
  if (action === 'speed-1') {
    const parts = ['speed-1', 'speed-2', 'speed-4', 'speed-8'].map((id) => label(set, id));
    const used = parts.filter((l): l is string => !!l);
    return used.length > 0 ? range(used) : null;
  }
  return label(set, action);
}
