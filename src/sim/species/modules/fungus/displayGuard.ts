// Display lumps (display.ts) are a picture of the garden record, not things: nobody may pick one up (a possessed ant
// was offered "Pick up fungus-piece" on the garden mass). Wraps the shared `pick-up` primitive's check once at load,
// as feedRule.ts does for feed-larva. The prompt itself still lists the lump (refused); keeping it out of the
// candidates needs the targeting module (reported).

import type { ActionDef } from '@/sim/ants/actions/types';
import { ACTION_DEFS } from '@/sim/ants/actions/defs';
import { isDisplayLump } from './display';

const WRAPPED = '__fungusDisplayGuard';

export function registerDisplayGuard(): void {
  const base = ACTION_DEFS['pick-up'] as (ActionDef & { [WRAPPED]?: true }) | undefined;
  if (!base || base[WRAPPED]) return;
  const wrapped: ActionDef & { [WRAPPED]: true } = {
    ...base,
    [WRAPPED]: true,
    check(sim, ant, t, secondary) {
      if (t.kind === 'item') {
        const it = sim.stores.items.get(t.id);
        if (it && isDisplayLump(it, it.colony)) return 'no-target';
      }
      return base.check(sim, ant, t, secondary);
    },
  };
  ACTION_DEFS['pick-up'] = wrapped;
}
