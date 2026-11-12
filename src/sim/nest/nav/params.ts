// Tunable numbers of the nest navigation fields.
// TODO(integration): re-export from src/sim/balance once that module exists (kernel did not own it).

export const NAV_TUNING = {
  /** Distance fields kept built at once; least recently used ones are freed and rebuilt on demand. */
  maxFields: 32,
  /** Byte budget of all built distance arrays (8 KB per field per chunk). */
  maxBytes: 64 * 1024 * 1024,
  /** A field more than this many carve boxes behind is rebuilt instead of updated incrementally. */
  maxLogBoxes: 512,
} as const;
