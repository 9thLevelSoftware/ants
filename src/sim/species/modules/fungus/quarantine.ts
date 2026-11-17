// Quarantine (GDD 07 §6.4.4): an `avoid` marker on an infected fungus chamber. No fungus pieces leave it, its waste
// goes straight to a midden (not through other gardens) and it spreads at a tenth of the rate.

import type { Colony, Sim } from '@/sim/types';
import { chamberById } from '@/sim/colony/census';

/** Whether an avoid marker of the colony covers this chamber's centre. */
export function isQuarantined(sim: Sim, col: Colony, chamberId: number): boolean {
  const ch = chamberById(sim, chamberId);
  if (!ch) return false;
  for (const m of sim.state.markers) {
    if (!m.alive || m.kind !== 'avoid' || m.colony !== col.id) continue;
    const dx = m.pos.x - ch.center.x, dy = m.pos.y - ch.center.y, dz = m.pos.z - ch.center.z;
    const r = m.radius + Math.max(ch.radii.x, ch.radii.z);
    if (dx * dx + dy * dy + dz * dz <= r * r) return true;
  }
  return false;
}
