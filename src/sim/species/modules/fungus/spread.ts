// Escovopsis spread between gardens (GDD 07 §6.4.4): each game day, each garden within escSpreadBu of an infected
// one is seeded (i = escOutbreakI) with p = escSpreadP x i; a quarantined source (an `avoid` marker on its chamber)
// spreads at escQuarantineMult of that. Distance is between chamber centres (the tunnel distance of the GDD is
// approximated by the straight line: a nest field query per pair per step is too dear for what it adds).

import { rngFloat } from '@/core/rng';
import type { Colony, Sim } from '@/sim/types';
import { chamberById } from '@/sim/colony/census';
import type { FungusParams } from './params';
import { isQuarantined } from './quarantine';

export function spreadInfection(sim: Sim, col: Colony, P: FungusParams, dtGd: number): void {
  const mod = col.fungus!;
  const live = mod.gardens.filter((g) => g.state !== 'dead');
  if (live.length < 2) return;
  const rng = sim.stream('rng.colony');
  const r2 = (P.escSpreadBu * sim.world.bu) ** 2;
  for (const src of live) {
    if (src.infection <= 0) continue;
    const a = chamberById(sim, src.chamberId);
    if (!a) continue;
    const q = isQuarantined(sim, col, src.chamberId) ? P.escQuarantineMult : 1;
    for (const dst of live) {
      if (dst === src || dst.infection > 0) continue;
      const b = chamberById(sim, dst.chamberId);
      if (!b) continue;
      const d2 = (a.center.x - b.center.x) ** 2 + (a.center.y - b.center.y) ** 2 + (a.center.z - b.center.z) ** 2;
      if (d2 > r2) continue;
      if (rngFloat(rng) < P.escSpreadP * src.infection * q * dtGd) dst.infection = P.escOutbreakI;
    }
  }
}
