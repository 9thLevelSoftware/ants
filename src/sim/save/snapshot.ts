// Snapshot / restore of the pure simulation state (the game layer adds `meta`, gzip and storage).
// Take snapshots between ticks: queued commands and undelivered events are runtime data and not included.

import { decode, encode } from '@/core/serialize';
import type { Sim, SimState } from '@/sim/types';
import { migrateState } from './migrate';
import { SAVE_VERSION } from './version';

/** Format tag of a sim snapshot. */
const SNAPSHOT_FORMAT = 'foundress-sim';

interface SnapshotEnvelope {
  format: string;
  version: number;
  state: SimState;
}

/**
 * Binary snapshot of the simulation state (export/import files). Costs about 0.2 ms per ant (≈9 MB raw, ~0.5 s at
 * 2500 ants); autosave to IndexedDB should store a structured clone of `state` instead (architecture §7).
 */
export function snapshot(sim: Sim | { state: SimState }): Uint8Array {
  const env: SnapshotEnvelope = { format: SNAPSHOT_FORMAT, version: SAVE_VERSION, state: sim.state };
  return encode(env);
}

/** Decodes (and migrates) a snapshot. Rebuild the runtime with createSim(state, world?). */
export function restore(bytes: Uint8Array): { state: SimState } {
  const env = decode(bytes) as Partial<SnapshotEnvelope> | null;
  if (!env || typeof env !== 'object' || env.format !== SNAPSHOT_FORMAT || typeof env.version !== 'number' || !env.state) {
    throw new Error('not a FOUNDRESS simulation snapshot');
  }
  const state = migrateState(env.state as unknown as Record<string, unknown>, env.version) as unknown as SimState;
  return { state };
}
