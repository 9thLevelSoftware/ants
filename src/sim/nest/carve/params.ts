// Tunable numbers of the carve grid (values that worked in the nest spike, docs/research/spike-nest.md §4).
// Lengths are given in voxels or BU so the grid behaves the same for every species.
// TODO(integration): re-export from src/sim/balance once that module exists (kernel did not own it).

export const CARVE_TUNING = {
  /** Width of the linear openness ramp written by brushes, in voxels (2 voxels = 1 BU). */
  rampVoxels: 2,
  /** A breach record is skipped when an existing one at least as large lies within this fraction of r. */
  breachDedupeFraction: 0.4,
  /** Brushes whose centre is deeper than r + this (BU) below the substrate surface skip breach checks. */
  breachCheckMarginBU: 2,
  /** At most this many breach records are added by a single brush. */
  maxBreachRecordsPerBrush: 4,
} as const;
