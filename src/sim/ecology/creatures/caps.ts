// Per-kind population caps (GDD 05 §2.2b, §2.7, I4, I5): the naturalist map maximum x the Predators setting for ant
// predators; aphid predators also follow the aphids on the map (1 per 300 / 200 / 250 aphids).

import type { CreatureKind, Sim } from '@/sim/types';
import {
  CREATURE_STATS, LACEWING_APHIDS_PER, LADYBIRD_APHIDS_PER, LADYBIRD_LARVA_APHIDS_PER,
} from '@/sim/balance/creatures';
import { conditions } from './conditions';
import { totalAphids } from './aphidPredators';

const PER_APHIDS: Partial<Record<CreatureKind, number>> = {
  ladybird: LADYBIRD_APHIDS_PER, 'ladybird-larva': LADYBIRD_LARVA_APHIDS_PER, 'lacewing-larva': LACEWING_APHIDS_PER,
};

export function capOf(sim: Sim, kind: CreatureKind): number {
  const st = CREATURE_STATS[kind];
  if (st.family === 'ant-predator') return Math.floor(st.cap * conditions(sim).predatorMult);
  const per = PER_APHIDS[kind];
  if (per) return Math.min(st.cap, Math.floor(totalAphids(sim) / per));
  return st.cap;
}
