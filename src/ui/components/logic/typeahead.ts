// Type-ahead for listboxes (GDD 08 2.7 Select): typing characters jumps to the next option whose label starts with
// the typed prefix. The buffer clears after a pause (the component owns the timer; this module is pure).
export const TYPEAHEAD_RESET_MS = 700;

export interface TypeaheadState {
  buffer: string;
  at: number;
}

/** Next index for the key typed at time `now`, plus the new state. Returns index -1 when nothing matches. */
export function typeaheadNext(
  labels: readonly string[], current: number, key: string, now: number, state: TypeaheadState,
): { index: number; state: TypeaheadState } {
  if (key.length !== 1 || key === ' ') return { index: -1, state };
  const buffer = (now - state.at > TYPEAHEAD_RESET_MS ? '' : state.buffer) + key.toLowerCase();
  const next = { buffer, at: now };
  const n = labels.length;
  // a repeated single letter cycles through the options starting with it; a longer prefix searches from current
  const start = buffer.length === 1 || [...buffer].every((c) => c === buffer[0]) ? current + 1 : current;
  const prefix = [...buffer].every((c) => c === buffer[0]) ? buffer[0] : buffer;
  for (let k = 0; k < n; k++) {
    const i = (start + k + n) % n;
    if (labels[i].toLowerCase().startsWith(prefix)) return { index: i, state: next };
  }
  return { index: -1, state: next };
}
