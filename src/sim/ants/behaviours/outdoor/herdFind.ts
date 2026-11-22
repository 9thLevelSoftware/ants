// Scouts find aphid herds by smell (econ-growth R10; GDD 05 §1.2 odour "herd 6 BU"). A herd's own food source
// holds no food (plants/links.ts: its honeydew comes by tending), so the generic smell and touch percepts, which
// list only sources with food, never showed it to a scout: no colony ever learnt of a herd it had not been given,
// and the Tier 2 carbohydrate base went untended. Discovery sets the colony's bit on the herd source, which makes
// the herd workable for the `tend` demand (GDD 02 §6.2).

//
// R38 item 2: the herd's sign (honeydew under the aphids, the ants already on it) reaches further the larger the
// herd (herdSignRadiusMm), and every worker of the colony that is outside notices it, on a trip or not
// (notice.ts noticeOutside, run by the behaviour runner for every autonomous worker).

import type { Ant, Herd, Sim } from '@/sim/types';
import { HERD_SIGN_BASE_BU, HERD_SIGN_MAX_BU, HERD_SIGN_PER_SQRT_APHID_BU } from '@/sim/balance/foraging';
import { clamp } from '@/core/math/scalar';
import { discoverSource, herdSourceOf, isDiscoveredBy } from '@/sim/ecology';
import { logDecision } from './common';

/** R38 item 2: plan distance within which a worker finds this herd, mm. */
export function herdSignRadiusMm(h: Herd, bu: number): number {
  const rBu = clamp(HERD_SIGN_BASE_BU + HERD_SIGN_PER_SQRT_APHID_BU * Math.sqrt(Math.max(0, h.a)), HERD_SIGN_BASE_BU, HERD_SIGN_MAX_BU);
  return rBu * bu;
}

/** Discovers every herd whose sign reaches the ant and its colony does not know yet; returns how many. */
export function discoverHerdsNear(sim: Sim, ant: Ant): number {
  let n = 0;
  const bu = sim.world.bu;
  for (const h of sim.stores.herds.list) {
    if (!h.alive || h.a < 1) continue;
    const s = herdSourceOf(sim, h);
    if (!s || isDiscoveredBy(sim, s, ant.colony)) continue;
    const r = herdSignRadiusMm(h, bu);
    const dx = ant.pos.x - s.pos.x, dz = ant.pos.z - s.pos.z;
    if (dx * dx + dz * dz > r * r) continue;
    if (discoverSource(sim, ant.colony, s.id, ant.id)) { n++; logDecision(sim, ant, 'job:herd-found', s.id); }
  }
  return n;
}

