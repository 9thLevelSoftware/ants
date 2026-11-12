// In-nest behaviours (beh-nest, GDD 02 §10.4-10.11, §10.14; GDD 03 §7.7): nurse, queen-care, store, dig, haul,
// idle (and the established queen, who has task `idle`), rest, guard. The behaviour runner
// (src/sim/ants/behaviourRunner.ts) looks them up by task. Their state lives in ant.state / stateTick / bb; the
// nursery job board is a per-tick derived cache (board.ts). Tunables: src/sim/balance/nestwork.ts.

import type { Behaviour, System } from '@/sim/types';
import { digBehaviour } from './dig';
import { guardBehaviour } from './guard';
import { haulBehaviour } from './haul';
import { idleBehaviour, restBehaviour } from './idle';
import { nurseBehaviour } from './nurse';
import { queenCareBehaviour } from './queenCare';
import { storeBehaviour } from './store';

export const behaviours: Behaviour[] = [
  nurseBehaviour, queenCareBehaviour, storeBehaviour, digBehaviour, haulBehaviour, idleBehaviour, restBehaviour,
  guardBehaviour,
];

/** Extra systems of these behaviours (none: the nursery board is rebuilt on demand). */
export const systems: System[] = [];

export { registerGuardEngage, type GuardEngage } from './guard';
