// The heavy half of the rivals module, bound late (import-cycle hygiene, as combat's late.ts). Combat imports
// relationOf from this module's index, and the creature module imports combat, so the index must stay light: it
// may not import the ecology, colony, ant or nest barrels. wiring.ts (loaded through the one behaviour
// registration line in src/sim/ants/behaviours/outdoor/index.ts) provides the implementation.

import type { Behaviour, CommandHandlerMap, Sim } from '@/sim/types';

export interface RivalsImpl {
  tick(sim: Sim): void;
  hourly(sim: Sim): void;
  behaviour: Behaviour;
  handlers: Partial<CommandHandlerMap>;
}

let impl: RivalsImpl | null = null;

export function provideRivals(i: RivalsImpl): void {
  impl = i;
}

export function rivalsImpl(): RivalsImpl {
  if (!impl) throw new Error('rivals: src/sim/rivals/wiring.ts was not loaded (the outdoor behaviour list imports it)');
  return impl;
}
