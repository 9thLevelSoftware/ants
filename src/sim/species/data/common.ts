// Pieces shared by the species data files: action lists (GDD 01 §7.3 "Who", GDD 07 §5.x.1 "Actions") and
// small helpers. Pure data; every list is a plain array of canonical ActionIds (validate.ts rule 4).

import type { ActionId, CasteDef } from '@/sim/types';

/** No unlock gate (the caste can be reared from the start). */
export const NO_UNLOCK: CasteDef['unlock'] = { minWorkers: 0, minColonyAgeYears: 0 };

/** Actions every worker caste of every species has (GDD 01 §7.3). Species add or drop on top of this. */
export const WORKER_BASE_ACTIONS: ActionId[] = [
  'move', 'let-go', 'grip', 'pick-up', 'put-down', 'drop', 'dig-bite', 'seal-entrance', 'unseal-entrance',
  'feed-larva', 'trophallaxis-give', 'trophallaxis-receive', 'groom', 'antennate', 'sniff', 'lay-trail',
  'harvest-liquid', 'harvest-solid', 'bite', 'bite-hold', 'release-alarm', 'drag', 'dodge',
];

/** Aphid handling (formicines of the honeydew module; GDD 07 §6.1). */
export const APHID_TENDING_ACTIONS: ActionId[] = ['tend-aphid', 'carry-aphid', 'cull-aphid'];

/** Queen actions common to all species: founding and established (GDD 07 §5.1.1, added by the Stage 1A gate). */
export const QUEEN_BASE_ACTIONS: ActionId[] = [
  'dig-bite', 'seal-entrance', 'unseal-entrance', 'lay-egg', 'feed-larva', 'groom', 'pick-up', 'put-down', 'drop',
  'bite', 'harvest-liquid', 'trophallaxis-give', 'trophallaxis-receive', 'sniff', 'antennate', 'move', 'grip', 'let-go',
];

/** Winged gyne actions without the species' weapon (GDD 01 §7.3: sniff and antennate for all adults). */
export const GYNE_BASE_ACTIONS: ActionId[] = [
  'fly', 'mate', 'dealate', 'groom', 'trophallaxis-receive', 'sniff', 'antennate', 'move', 'grip', 'let-go',
];

/** Male actions (no weapon, no feeding of others). */
export const MALE_ACTIONS: ActionId[] = [
  'fly', 'mate', 'groom', 'trophallaxis-receive', 'sniff', 'antennate', 'move', 'grip', 'let-go',
];

/** `list` without the ids in `drop`, plus the ids in `add` (no duplicates). */
export function actions(list: readonly ActionId[], add: readonly ActionId[] = [], drop: readonly ActionId[] = []): ActionId[] {
  const out = list.filter((a) => !drop.includes(a));
  for (const a of add) if (!out.includes(a)) out.push(a);
  return out;
}

/** Default standard deviation of a queen's lifespan: 10 % of the mean (Lasius 560 / 60 in GDD 02). */
export function queenLifespan(years: { min: number; max: number }, daysPerYear = 28): { mean: number; sd: number } {
  const mean = ((years.min + years.max) / 2) * daysPerYear;
  return { mean, sd: Math.round(mean * 0.1) };
}
