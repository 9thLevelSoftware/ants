// The colony's list of claimed herds (Colony.honeydew.herdClaims, GDD 07 §6.1.1). It mirrors Herd.tenderColony:
// a herd id is in the list of exactly the colony that claims it, and only while the herd lives.

import type { Colony } from '@/sim/types';

export function addClaim(col: Colony | undefined, herdId: number): void {
  const m = col?.honeydew;
  if (m && !m.herdClaims.includes(herdId)) m.herdClaims.push(herdId);
}

export function removeClaim(col: Colony | undefined, herdId: number): void {
  const m = col?.honeydew;
  if (m && m.herdClaims.includes(herdId)) m.herdClaims = m.herdClaims.filter((x) => x !== herdId);
}
