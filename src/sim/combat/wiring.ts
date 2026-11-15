// Binds the late dependencies of combat (see late.ts). Imported for its side effect by the fight behaviour
// (src/sim/ants/behaviours/outdoor/fight.ts), which the systems list loads for every Sim.

import { processAntDeath } from '@/sim/ants/lifecycle';
import { ACTION_DEFS } from '@/sim/ants/actions/defs';
import { begin } from '@/sim/ants/actions/runner';
import { switchTask } from '@/sim/colony/allocation';
import { isWaitingForager, requestTask } from '@/sim/colony';
import { registerGuardEngage } from '@/sim/ants/behaviours/nest/guard';
import { provideDeps } from './late';
import { installActionAdapters } from './dodge';

provideDeps({
  processAntDeath, actionDefs: ACTION_DEFS, begin: (sim, ant, id, t) => begin(sim, ant, id, t), switchTask, requestTask,
  isWaitingForager, registerGuardEngage,
});

// the primitives combat adds to the library (dodge, sting) are usable from the first tick on
installActionAdapters();
