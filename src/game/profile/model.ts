// The device profile `foundress.profile.v1` (00-index D1.19, GDD 06 §10/§12, GDD 08 App. A): hints seen, codex
// unlocks, lineage. Not part of any save. The record types are the sim's DeviceProfile (src/sim/types/progression).
import type { DeviceProfile, HintId, HintState } from '@/sim/types';

/** Caps of the lineage store (GDD 06 §12.1). Oldest ended entries are trimmed first. */
export const LIN_MAX_COLONIES = 200;
export const LIN_MAX_DAUGHTERS = 2000;
export const LIN_MAX_FLIGHTS = 2000;
/** At most this many daughters are stored individually per flight (the rest are summarised in the count). */
export const LIN_MAX_DAUGHTERS_PER_FLIGHT = 12;

/** Schema version of the stored profile envelope. */
export const PROFILE_SCHEMA_VERSION = 1;
/** IndexedDB `profile` store key (and localStorage fallback key). */
export const PROFILE_KEY = 'foundress.profile.v1';

export function emptyProfile(): DeviceProfile {
  return { hints: {}, codex: {}, lineage: { colonies: [], flights: [], daughters: [], settings: {} } };
}

/** Progress order of a hint: learned and dismissed are final, so a merge never moves a hint backwards. */
export const HINT_RANK: Record<HintState, number> = { pending: 0, shown: 1, dismissed: 2, learned: 3 };

export type ProfilePart = 'hints' | 'codex' | 'lineage';

export type StoredHint = { uses: number; state: HintState };
export type { DeviceProfile, HintId, HintState };
