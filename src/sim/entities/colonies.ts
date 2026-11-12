// Colony creation. Colonies are never removed from state.colonies (so colonies[0] stays the player's);
// destroyColony only flags them dead.

import { tsCreate } from '@/core/timeSeries';
import type { Colony, ColonySpeciesId, Directives } from '@/sim/types';
import { TASK_COUNT } from '@/sim/types';
import {
  ALATE_INVESTMENT_DEFAULT, CASTE_EMPHASIS_DEFAULT, GRANARY_HYGIENE_DEFAULT, GYNE_SHARE_DEFAULT,
  LEAF_SELECTIVITY_DEFAULT, PROTEIN_SHARE_DEFAULT, YIELD_PER_FORAGER_DEFAULT,
} from '@/sim/balance';
import { seasonLengthOf } from '@/sim/time';
import { getSpecies } from '@/sim/species';
import { allocId, type EntityCtx } from './context';
import { applyInit } from './util';

export function defaultDirectives(): Directives {
  return {
    allocation: 'auto', taskShares: {}, diet: 'auto',
    alateInvestment: ALATE_INVESTMENT_DEFAULT, gyneShare: GYNE_SHARE_DEFAULT, alatePolicy: 'ask',
    stockTarget: 'normal', stayIn: false, stayInUntil: -1, sealInCold: true, stance: 'defensive',
    casteEmphasis: CASTE_EMPHASIS_DEFAULT, granaryHygiene: GRANARY_HYGIENE_DEFAULT,
    leafSelectivity: LEAF_SELECTIVITY_DEFAULT, satelliteAuto: true, hideFrass: false,
    hitchhikerEscort: true, externalHeap: false,
  };
}

export interface CreateColonyOptions {
  species: ColonySpeciesId;
  isPlayer: boolean;
  fidelity?: 'full' | 'abstract';
  init?: Partial<Colony>;
}

export function createColony(ctx: EntityCtx, o: CreateColonyOptions): Colony {
  const t = ctx.state.tick;
  const mods = getSpecies(o.species)?.economyModules ?? [];
  const col: Colony = {
    id: allocId(ctx.state), alive: true, species: o.species, isPlayer: o.isPlayer, fidelity: o.fidelity ?? 'full',
    queenId: -1, queens: [], nestIds: [],
    stores: { c: 0, p: 0, toxin: 0, inCrops: { c: 0, p: 0 }, cap: { c: 0, p: 0 } },
    ledger: {
      inDeliveryC: 0, inDeliveryP: 0, inRecycledC: 0, inRecycledP: 0, outWorkersC: 0, outQueenC: 0, outQueenP: 0,
      outLarvaeC: 0, outLarvaeP: 0, outSpoiledC: 0, outSpoiledP: 0, outRationC: 0, transitC: 0, transitP: 0,
      dayStartTick: t,
    },
    needs: { rateC: 0, rateP: 0, needC: 0, needP: 0, sP: PROTEIN_SHARE_DEFAULT, proteinDeficit: false },
    starvationStage: 'fed', starvationSinceTick: -1, directives: defaultDirectives(),
    alloc: {
      demand: new Float32Array(TASK_COUNT), target: new Int16Array(TASK_COUNT),
      actual: new Int16Array(TASK_COUNT), lastTick: -1,
    },
    groupCounts: { forage: 0, nurse: 0, dig: 0, defend: 0 }, livingAnts: 0,
    yieldPerForager: YIELD_PER_FORAGER_DEFAULT, news: [], knownSourceIds: [],
    exploredBits: new Uint8Array(0), // sized by the scouting module on first use
    orphanedAtTick: -1, foundedTick: t,
    repro: { alateRearing: 0, targetAlates: 0, shortfall: 0, lastLaunchTick: -1, flights: [], active: null },
    rival: null,
    danger: new Float32Array(0), // sized by the creatures module on first use (ruling 3)
    counters: {
      eggsLaid: 0, eclosions: 0, deaths: 0, broodDeaths: 0, trips: 0, tripSuccesses: 0, tripTicks: 0,
      intakeTodayC: 0, intakeTodayP: 0, useTodayC: 0, useTodayP: 0,
    },
    honeydew: mods.includes('honeydew-ranching')
      ? { herdClaims: [], yieldHistory: tsCreate(seasonLengthOf(ctx.state.config)) } : null,
    wood: mods.includes('wood-nesting') ? { sites: [], frassVisibility: 0, queenMove: null } : null,
    granary: mods.includes('granary')
      ? { granaries: [], pasteLoads: 0, pasteHalfLifeTicks: 0, middens: [], seedlings: [] } : null,
    fungus: mods.includes('fungus-garden') ? { gardens: [], rejected: [], gardenLess: false, gardenLessTick: -1 } : null,
    lineage: null,
  };
  applyInit(col, o.init);
  ctx.stores.colonies.add(col);
  ctx.emit({ type: 'entity-created', entity: 'colony', id: col.id });
  return col;
}

/** Marks a colony destroyed (kept in the array; stores report it as missing). */
export function destroyColony(ctx: EntityCtx, id: number, cause: string): boolean {
  if (!ctx.stores.colonies.markDead(id)) return false;
  ctx.emit({ type: 'entity-removed', entity: 'colony', id, cause });
  return true;
}
