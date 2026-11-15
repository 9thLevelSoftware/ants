// `{key:action-id}` placeholders in codex lines: the key the player has bound to the action, so a rebound key never
// leaves a stale letter in the text (GDD 08 §7.3, the interface-time entry promises it).
import { defaultBindings } from '@/input/bindings';
import type { BindingSet } from '@/input/bindings';
import { buildControlsReference } from '../text/controls';

const KEY_TOKEN = /\{key:([a-z0-9-]+)\}/g;

/** Fills every `{key:action-id}` with the keyboard binding of the action; an unknown or unbound action is left as written. */
export function resolveKeyTokens(text: string, set: BindingSet = defaultBindings()): string {
  if (!text.includes('{key:')) return text;
  const keys = new Map(buildControlsReference(set).flatMap((g) => g.rows).map((r) => [r.id, r.keyboard]));
  return text.replace(KEY_TOKEN, (whole, id: string) => {
    const k = keys.get(id);
    return k === undefined || k === '' || k === 'none' ? whole : k;
  });
}
