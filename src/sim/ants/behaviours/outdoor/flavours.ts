// The three outdoor tasks share one engine (engine.ts); a flavour names its phases ('<task>.<state>', GDD 02
// §10.1-10.3) and says which sources it works.

import type { FoodSource, Task } from '@/sim/types';
import type { StateNames } from './common';
import { TEND_SITE_RANGE_BU } from '@/sim/balance/foraging';
import { PHASE } from './keys';

export interface Flavour {
  readonly task: Task;
  readonly names: StateNames;
  /** Scouts explore and report; foragers and tenders wait for activation. */
  readonly scout: boolean;
  /** Sources this task works (undefined = any food source). */
  readonly accept?: (s: FoodSource) => boolean;
  /** Departures choose only sources within this straight-line distance of the entrance, BU (undefined = any). */
  readonly rangeBu?: number;
}

const shared = { [PHASE.rest]: 'rest', [PHASE.fleeRun]: 'flee.run', [PHASE.fleeFreeze]: 'flee.freeze' };

export const FORAGE: Flavour = {
  task: 'forage',
  scout: false,
  names: {
    ...shared,
    [PHASE.wait]: 'forage.wait', [PHASE.outbound]: 'forage.outbound', [PHASE.search]: 'forage.search',
    [PHASE.queue]: 'forage.queue', [PHASE.collect]: 'forage.collect', [PHASE.return]: 'forage.return',
    [PHASE.deliver]: 'forage.deliver',
    // a forager never explores; these keep the names valid if a phase is ever reached
    [PHASE.depart]: 'forage.outbound', [PHASE.explore]: 'forage.search', [PHASE.investigate]: 'forage.search',
    [PHASE.assess]: 'forage.collect',
  },
};

export const SCOUT: Flavour = {
  task: 'scout',
  scout: true,
  names: {
    ...shared,
    [PHASE.depart]: 'scout.depart', [PHASE.explore]: 'scout.explore', [PHASE.investigate]: 'scout.investigate',
    [PHASE.assess]: 'scout.assess', [PHASE.collect]: 'scout.collect', [PHASE.queue]: 'scout.collect',
    [PHASE.return]: 'scout.return', [PHASE.deliver]: 'scout.report',
    [PHASE.wait]: 'scout.depart', [PHASE.outbound]: 'scout.explore', [PHASE.search]: 'scout.investigate',
  },
};

/**
 * Tier 1 tending: the static honeydew-film sites (GDD 05 §0) are drunk like any liquid source; herds, soliciting
 * aphids (`tend-aphid`) and guarding them (`tend.guard-herd`) arrive with the Tier 2 plants module (hook:
 * engine.ts tendGuardHook).
 */
export const TEND: Flavour = {
  task: 'tend',
  scout: false,
  accept: (s) => s.kind === 'honeydew',
  rangeBu: TEND_SITE_RANGE_BU,
  names: {
    ...shared,
    [PHASE.wait]: 'tend.wait', [PHASE.outbound]: 'tend.outbound', [PHASE.search]: 'tend.outbound',
    [PHASE.queue]: 'tend.solicit', [PHASE.collect]: 'tend.solicit', [PHASE.return]: 'tend.return',
    [PHASE.deliver]: 'tend.deliver',
    [PHASE.depart]: 'tend.outbound', [PHASE.explore]: 'tend.outbound', [PHASE.investigate]: 'tend.outbound',
    [PHASE.assess]: 'tend.solicit',
  },
};
