// Binds the heavy half of the rivals module (see late.ts) and exports the `raid` behaviour. Imported by the one
// registration line in src/sim/ants/behaviours/outdoor/index.ts, which every Sim loads through the systems list.

import { raidBehaviour } from './behaviour';
import { rivalCheats } from './cheats';
import { rivalsHourly } from './hourly';
import { provideRivals } from './late';
import { rivalsTick } from './tick';

provideRivals({ tick: rivalsTick, hourly: rivalsHourly, behaviour: raidBehaviour, handlers: rivalCheats });

/** Behaviours of the rivals module (task `raid`: rival agents, rival queens, player raid parties). */
export const rivalBehaviours = [raidBehaviour];
