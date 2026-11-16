// KeyHint / KeyCap (GDD 08 2.7): shows the CURRENT binding of an action, never a hard-coded key. The binding set
// lives in a signal the shell updates when bindings change; `device` chooses the keyboard / mouse or gamepad glyph.
import { signal } from '@preact/signals';
import { defaultBindings, hintText, type BindingSet } from '@/input';
import { inputDevice, padStyle } from '../nav/device';
import { cx } from './cx';

/** The bindings KeyHints read. The Settings screen and the game keep it current via setCurrentBindings. */
export const currentBindings = signal<BindingSet>(defaultBindings());

export function setCurrentBindings(set: BindingSet): void {
  currentBindings.value = set;
}

export type GlyphDevice = 'kbm' | 'pad';

/**
 * Text of the key cap of `actionId` (a button action, or an axis such as `move`, `orbit`, `zoom`) for the device: the
 * keyboard / mouse binding, or the pad glyph in the style of the last pad used. Null when unbound for that device.
 * With no device given it follows the last-used device (GDD 01 5.8): read inside a component it re-renders on change.
 */
export function hintLabel(set: BindingSet, actionId: string, device: GlyphDevice = inputDevice.value): string | null {
  const text = hintText(set, actionId, device, padStyle.value);
  // an action with no pad binding (quick save lives in the menu) still shows its key rather than "unbound"
  return text ?? (device === 'pad' ? hintText(set, actionId, 'kbm') : null);
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
  /** Default: the device the player used last. */
  device?: GlyphDevice;
  class?: string;
  /** Use these bindings instead of the shared signal (tests, demo). */
  bindings?: BindingSet;
}

export function KeyHint({ action, children, device, class: cls, bindings }: KeyHintProps) {
  const dev = device ?? inputDevice.value;
  const set = bindings ?? currentBindings.value;
  const label = hintLabel(set, action, dev);
  const isPadLabel = dev === 'pad' && hintText(set, action, 'pad') !== null;
  return (
    <span class={cx('ui-keyhint', cls)}>
      {label ? <KeyCap label={label} kind={isPadLabel ? 'pad' : label.startsWith('LMB') || label.startsWith('RMB') || label.startsWith('MMB') ? 'mouse' : 'key'} /> : <KeyCap label="unbound" class="is-unbound" />}
      {children && <span class="ui-keyhint-text">{children}</span>}
    </span>
  );
}
