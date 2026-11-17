// Larval feeding for a leafcutter (GDD 07 §5.4.2 `larvaFood: staphylae`): GDD 01's `feed-larva` asks an Atta nurse
// to carry a `staphylae` item. In this module the staphylae the gardeners collect go into the colony pool (P and C
// in the larva's ratio; leaves are never pool food, and this species takes no prey), so the nurse's crop holds
// fungus food: an Atta nurse may also feed from her crop while the colony has a living garden (GDD 07 §5.4.12
// "hyphae vs staphylae split collapsed into one food"). Wraps the primitive's check once at load.

import type { ActionDef } from '@/sim/ants/actions/types';
import { ACTION_DEFS } from '@/sim/ants/actions/defs';
import { hasLiveGarden } from './economy';

const WRAPPED = '__fungusFeedRule';

export function registerFeedRule(): void {
  const base = ACTION_DEFS['feed-larva'] as (ActionDef & { [WRAPPED]?: true }) | undefined;
  if (!base || base[WRAPPED]) return;
  const wrapped: ActionDef & { [WRAPPED]: true } = {
    ...base,
    [WRAPPED]: true,
    check(sim, ant, t, secondary) {
      const why = base.check(sim, ant, t, secondary);
      if (why !== 'no-reserve') return why;
      const col = sim.stores.colonies.get(ant.colony);
      if (!col?.fungus || !hasLiveGarden(col)) return why;
      const reserve = (ant.queen?.founding?.reserveLoads ?? 0) > 0;
      return reserve || ant.cropC + ant.cropP > 1e-9 ? null : 'crop-empty';
    },
  };
  ACTION_DEFS['feed-larva'] = wrapped;
}
