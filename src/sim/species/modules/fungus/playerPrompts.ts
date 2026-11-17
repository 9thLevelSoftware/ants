// Possession by caste (GDD 07 §5.4.8, §6.4.12): what the E key should offer a possessed leafcutter when she aims at
// nothing in particular (the "self" class of the prompt). Local adapter: the shared prompt code
// (src/sim/ants/player/targeting.ts classify, case 'none') offers only lay-egg / put-down / groom and has no species
// hook yet, so nothing calls this until that hook exists (reported with the exact lines). Pure and tested here.
//   in a living garden's chamber:  process-leaf while fragments wait (small media, media; minims of a colony
//                                  without media); else tend-fungus (weed / harvest / tend), secondary "plant pulp"
//                                  or "take waste" (tend-fungus secondary) when that variant can start;
//   carrying a leaf fragment there: put-down (the fragment goes into the cache: absorbLyingFragments);
//   outside at a leaf site:         cut-leaf (media, majors; minims of a colony without a cutting caste).

import type { ActionId, Ant, Sim } from '@/sim/types';
import { canDo } from '@/sim/ants/actions/runner';
import { gardenHere } from './actions';
import { lotsLu } from './cache';

export interface SelfPrompt {
  primary: ActionId;
  secondary: ActionId | null;
}

const ok = (sim: Sim, ant: Ant, id: ActionId, secondary = false) => canDo(sim, ant, id, null, { secondary }).ok;

/** The leafcutter's own E-key choice for a possessed ant aiming at nothing, or null (the shared defaults apply). */
export function fungusSelfPrompt(sim: Sim, ant: Ant): SelfPrompt | null {
  const g = gardenHere(sim, ant);
  if (g && g.state !== 'dead') {
    if (ant.carry.kind !== 'none') return { primary: 'put-down', secondary: null };
    const second: ActionId | null = ok(sim, ant, 'tend-fungus', true) ? 'tend-fungus' : null;
    if (lotsLu(g.cache) > 1e-6 && ok(sim, ant, 'process-leaf')) return { primary: 'process-leaf', secondary: second };
    if (ok(sim, ant, 'tend-fungus')) return { primary: 'tend-fungus', secondary: second };
    return null;
  }
  if (ant.nestId < 0 && ant.carry.kind === 'none' && ok(sim, ant, 'cut-leaf')) return { primary: 'cut-leaf', secondary: null };
  return null;
}
