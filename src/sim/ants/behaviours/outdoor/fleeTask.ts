// The `flee` task (GDD 02 §6.1 lists it as a reactive override; the release table of GDD 01 §3.5 and the
// combat module can still set it as a task). Outside: flee cycles as in flee.ts, then home; in the nest the ant
// hands itself back to the allocator.

import type { Behaviour } from '@/sim/types';
import { THINK_TRAVEL_TICKS } from '@/sim/balance/foraging';
import { perceiveNow } from '@/sim/ants/perception';
import { requestTask } from '@/sim/colony';
import { phaseOf, thinkIn } from './common';
import { fleeCheck } from './flee';
import type { Flavour } from './flavours';
import { K, PHASE } from './keys';
import { updateReturn } from './phaseTravel';
import { startReturn } from './transitions';

const FLEE: Flavour = {
  task: 'flee',
  scout: false,
  names: { [PHASE.fleeRun]: 'flee.run', [PHASE.fleeFreeze]: 'flee.freeze', [PHASE.return]: 'flee.run', [PHASE.deliver]: 'flee.freeze' },
};

export const fleeBehaviour: Behaviour = {
  task: 'flee',
  enter(sim, ant) {
    ant.bb[K.phase] = -1;
    ant.bb[K.resume] = PHASE.return;
    perceiveNow(sim, ant);
    thinkIn(sim, ant, 1);
  },
  update(sim, ant) {
    thinkIn(sim, ant, THINK_TRAVEL_TICKS);
    if (ant.nestId >= 0) { requestTask(sim, ant, 'idle', 'threat'); return; }
    if (fleeCheck(sim, ant, FLEE)) return;
    if (phaseOf(ant) !== PHASE.return) { startReturn(sim, ant, FLEE, false, 'threat'); return; }
    updateReturn(sim, ant, FLEE);
  },
  exit: () => {},
};
