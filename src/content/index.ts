// Content of the game: codex entries, journal, alert and hint wording, controls reference. Pure data and lookups.
import { getCodexEntry } from './codex';
import { buildControlsReference } from './text';
import type { ControlRow } from './text';
import { defaultBindings } from '@/input/bindings';
import type { BindingSet } from '@/input/bindings';

export * from './codex';
export * from './text';

/** The controls an entry page lists (Interface entries), with the bindings in `set` (the defaults when omitted). */
export function controlsForEntry(id: string, set: BindingSet = defaultBindings()): ControlRow[] {
  const wanted = getCodexEntry(id)?.controlActions ?? [];
  const rows = new Map(buildControlsReference(set).flatMap((g) => g.rows).map((r) => [r.id, r]));
  return wanted.map((a) => rows.get(a)).filter((r): r is ControlRow => r !== undefined);
}
