// KeyHint / KeyCap (GDD 08 2.7): shows the CURRENT binding of an action, never a hard-coded key. The binding set
// lives in a signal the shell updates when bindings change; `device` chooses the keyboard / mouse or gamepad glyph.
import { signal } from '@preact/signals';
import { bindingLabel, defaultBindings, type Binding, type BindingSet } from '@/input';
import { cx } from './cx';

/** The bindings KeyHints read. The Settings screen and the game keep it current via setCurrentBindings. */
export const currentBindings = signal<BindingSet>(defaultBindings());

export function setCurrentBindings(set: BindingSet): void {
  currentBindings.value = set;
}

export type GlyphDevice = 'kbm' | 'pad';

/** Label of the first binding of `actionId` for the device, or null when unbound. */
export function hintLabel(set: BindingSet, actionId: string, device: GlyphDevice = 'kbm'): string | null {
  if (device === 'pad') {
    const b = set.pad[actionId];
    return b ? bindingLabel(b) : null;
  }
  const b = (set.kbm[actionId] ?? []).find((x): x is Binding => !!x);
  return b ? bindingLabel(b) : null;
}

export interface KeyCapProps {
  label: string;
  /** pad buttons are round, keys are rounded rectangles */
  kind?: 'key' | 'pad' | 'mouse';
  class?: string;
}

export function KeyCap({ label, kind = 'key', class: cls }: KeyCapProps) {
  return <kbd class={cx('ui-keycap', `is-${kind}`, cls)}>{label}</kbd>;
}

export interface KeyHintProps {
  action: string;
  /** Text after the key, e.g. "Interact". */
  children?: string;
  device?: GlyphDevice;
  class?: string;
  /** Use these bindings instead of the shared signal (tests, demo). */
  bindings?: BindingSet;
}

export function KeyHint({ action, children, device = 'kbm', class: cls, bindings }: KeyHintProps) {
  const label = hintLabel(bindings ?? currentBindings.value, action, device);
  return (
    <span class={cx('ui-keyhint', cls)}>
      {label ? <KeyCap label={label} kind={device === 'pad' ? 'pad' : label.startsWith('LMB') || label.startsWith('RMB') || label.startsWith('MMB') ? 'mouse' : 'key'} /> : <KeyCap label="unbound" class="is-unbound" />}
      {children && <span class="ui-keyhint-text">{children}</span>}
    </span>
  );
}
