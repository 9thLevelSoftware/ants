// Ruling R27 (winter stores): the carbohydrate a colony needs at the first tick of winter is the lapse's own C need
// (every winter day at the winter rate of its cluster now: the arithmetic of the winter notice, system.ts storeDays)
// plus WINTER_STORES_SPRING_GD game days of the adults' C need for the cold first days of spring, when the nest is
// too cold to lay or forage much (round-4 long runs: royal chamber 1-3 C on spring day 1, 7-12 C on day 4). The life
// tool's viable verdict checks it at Winter 1; the autumn stock target (viab-economy R6, economy.ts) aims for it.

import type { Colony, Sim } from '@/sim/types';
import { seasonLength } from '@/sim/time';
import { WINTER_STORES_SPRING_GD } from '@/sim/balance/lifecycle';
import { difficultyValue } from '@/sim/balance/difficulty';
import { censusOf } from '../census';
import { coreOf } from '../core';
import { clusterOf } from './climate';
import { dayNeedC, metFactor } from './model';

export interface WinterStoresNeed {
  /** The lapse's C need: winter days x the winter day's C need at the cluster temperature now, loads. */
  lapseC: number;
  /** WINTER_STORES_SPRING_GD x the adults' C need per gd (worker upkeep + queen, the colony cycle's), loads. */
  springC: number;
  /** lapseC + springC. */
  needC: number;
}

/** R27's carbohydrate need for the coming winter (0 for a species without a lapse). */
export function winterStoresNeed(sim: Sim, col: Colony): WinterStoresNeed {
  const def = sim.getSpecies(col.species);
  if (!def || def.winter.mode === 'active') return { lapseC: 0, springC: 0, needC: 0 };
  const cen = censusOf(sim, col.id);
  const queen = sim.stores.ants.get(col.queenId);
  const params = {
    tColdStress: def.winter.tColdStress, baseLoss: def.winter.wintBaseLoss, metBase: def.winter.wintMetBase,
    q10: def.winter.wintQ10, lossMult: difficultyValue(sim, 'winterLossMult'), queenDeathP: 0,
  };
  const fMet = metFactor(params, clusterOf(sim, col).tNow);
  // eggs hatch at Begin (begin.ts), so they winter as larvae
  const lapseC = seasonLength(sim.state) * dayNeedC(cen.workers, cen.eggs + cen.larvae, !!queen && queen.alive, fMet);
  const acc = coreOf(col).acc;
  const springC = WINTER_STORES_SPRING_GD * ((acc['inst.upkeepC'] ?? 0) + (acc['inst.queenC'] ?? 0));
  return { lapseC, springC, needC: lapseC + springC };
}
