// The garden step (every GARDEN_STEP_TICKS, colony-economy phase; GDD 07 §6.4.2-6.4.4, §6.4.8, §6.4.9): records
// follow the chambers, the leaf cache and pulp age, each garden is integrated with its chamber's climate, gardeners
// and substrate, Escovopsis breaks out and spreads, states change (events), standing staphylae accumulate, the
// pool is topped up from the harvested staphylae, and a colony whose gardens are all dead becomes garden-less.

import { rngFloat } from '@/core/rng';
import type { Ant, Colony, GardenRecord, Sim, System } from '@/sim/types';
import { chamberById } from '@/sim/colony/census';
import { deposit } from '@/sim/colony/stores';
import { GARDEN_STEP_TICKS, FL_P_SHARE, STAPH_POOL_BUFFER_GD, YIELD_STANDING_GD } from '@/sim/balance/species-leafcutter';
import { TICKS_PER_DAY, ticksPerYear } from '@/sim/time';
import { paramsOfColony, type FungusParams } from './params';
import { stepGarden, type GardenStepOut } from './dynamics';
import { killGarden, nextState } from './states';
import { plantSubstrate, pruneBins, substrateInputs } from './substrate';
import { fungusColonies, liveGardens, syncGardens, totalGarden } from './state';
import { ageCache } from './cache';
import { gardenWorkers, isFoundingGarden } from './work';
import { gardenLessStep } from './gardenLess';
import { checkRejection, recordHealth } from './rejection';
import { spreadInfection } from './spread';
import { feedQueenFungus } from './queenFeed';
import { gardenRh, gardenTempC } from './chamberClimate';

export function atColonies(sim: Sim): { col: Colony; P: FungusParams }[] {
  return fungusColonies(sim, paramsOfColony);
}

/** Colony age, game years. */
export function ageYears(sim: Sim, col: Colony): number {
  return Math.max(0, sim.state.tick - col.foundedTick) / ticksPerYear(sim.state.config);
}

/** Difficulty multiplier on the Escovopsis hazard (GDD 06 diseaseMult; 1 until the difficulty block has it). */
function diseaseMult(sim: Sim): number {
  const v = (sim.state.config.difficulty.params as unknown as Record<string, number | undefined>).diseaseMult;
  return typeof v === 'number' && Number.isFinite(v) ? v : 1;
}

/** Outbreak hazard per garden per game day (GDD 07 §6.4.4). */
export function outbreakHazard(P: FungusParams, g: GardenRecord, ageYr: number, rh: number, mult: number): number {
  const ftend = g.ftend ?? 1;
  return P.escLambda * (1 + P.escAgeFactor * ageYr) * (1 + P.escContamFactor * (g.contamination ?? 0))
    * (1 + P.escTendFactor * (1 - ftend)) * (rh > P.escHumidRh ? P.escHumidFactor : 1) * mult;
}

/** The cause a garden is dying of: the largest health loss of its last steps, infection first when it is heavy. */
function causeOf(g: GardenRecord, o: GardenStepOut): string {
  if (g.infection >= 0.5) return 'infection';
  const pairs: [string, number][] = [
    ['heat', o.lossHeat], ['cold', o.lossCold], ['dry', o.lossDry], ['poison', o.lossPoison], ['infection', o.lossInfection],
    ['starvation', o.lossStarvation],
  ];
  pairs.sort((a, b) => b[1] - a[1]);
  return pairs[0][1] > 0 ? pairs[0][0] : (g.lastCause ?? 'starvation');
}

const stateOf = (g: GardenRecord): GardenRecord['state'] => g.state;

/** Tops the pool up from the harvested staphylae to STAPH_POOL_BUFFER_GD of the colony's need (P first). */
export function releaseStaphylae(col: Colony): number {
  const mod = col.fungus!;
  const have = mod.staphylae ?? 0;
  if (have <= 1e-9) return 0;
  const wantP = col.needs.rateP * STAPH_POOL_BUFFER_GD - col.stores.p;
  const wantC = col.needs.rateC * STAPH_POOL_BUFFER_GD - col.stores.c;
  const want = Math.max(wantP / FL_P_SHARE, wantC / (1 - FL_P_SHARE), 0);
  const x = Math.min(have, want);
  if (x <= 1e-9) return 0;
  const got = deposit(col, x * (1 - FL_P_SHARE), x * FL_P_SHARE, 0, 'delivery');
  if (got.c + got.p <= 0) return 0;
  mod.staphylae = have - x;
  return x;
}

/** One garden step of a colony over dtGd game days. */
export function stepColonyGardens(sim: Sim, col: Colony, P: FungusParams, dtGd: number): void {
  const mod = col.fungus!;
  syncGardens(sim, col, P);
  const workers = gardenWorkers(sim, col);
  const age = ageYears(sim, col);
  const mult = diseaseMult(sim);
  const rng = sim.stream('rng.colony');
  const queen = sim.stores.ants.get(col.queenId);
  for (const g of mod.gardens) {
    ageCache(sim, col, g, P);
    pruneBins(g, sim.state.tick);
    if (g.state === 'dead') continue;
    const tempC = gardenTempC(sim, g.chamberId);
    const rh = gardenRh(sim, g.chamberId);
    const w = workers.get(g.chamberId) ?? { gardeners: 0, weeders: 0 };
    const founding = isFoundingGarden(sim, col, g);
    if (g.supply) plantSubstrate(P, g, g.supply, g.supply.luPerGd * dtGd, sim.state.tick);
    const sub = substrateInputs(g, sim.state.tick);
    g.substrate = sub.subIn1Gd;
    const out = stepGarden(P, g, {
      tempC, rh, gardeners: w.gardeners, weeders: w.weeders, ...sub, founding,
      queenInChamber: !!queen && queen.alive && queenNear(sim, queen, g),
    }, dtGd);
    g.lastCause = causeOf(g, out);
    // the relocation clock (GDD 07 §6.4.2: fclim below relocateFclim for relocateWaitGd)
    if ((g.fclim ?? 1) < P.relocateFclim) { if ((g.climBadSince ?? -1) < 0) g.climBadSince = sim.state.tick; }
    else g.climBadSince = -1;
    // standing staphylae: the yield waits on the hyphae for the harvesters; what is not taken is lost
    const cap = P.yieldPerGu * g.biomass * YIELD_STANDING_GD;
    g.yieldStanding = Math.min(cap, (g.yieldStanding ?? 0) + out.yieldFl);
    // a fresh outbreak (the founding garden had its one roll at planting)
    if (!founding && g.infection <= 0 && rngFloat(rng) < outbreakHazard(P, g, age, rh, mult) * dtGd) {
      g.infection = P.escOutbreakI;
    }
    const before: GardenRecord['state'] = g.state, wasVisible = g.infection >= P.escVisibleI;
    const next = nextState(P, g);
    if (next === 'dead') killGarden(g, sim.state.tick);
    else g.state = next;
    const now = stateOf(g); // read afresh (the checks above narrowed g.state)
    if (now !== before) {
      sim.emit({ type: 'garden-state', chamberId: g.chamberId, state: now, cause: now === 'dead' ? (g.lastCause ?? 'unknown') : before });
      if (now === 'infected') sim.emit({ type: 'garden-infected', chamberId: g.chamberId, visible: g.infection >= P.escVisibleI });
      if (now === 'dead') col.fungus!.lostCause = g.lastCause ?? 'unknown';
    } else if (now === 'infected' && !wasVisible && g.infection >= P.escVisibleI) {
      sim.emit({ type: 'garden-infected', chamberId: g.chamberId, visible: true });
    }
    if (now !== 'dead' && recordHealth(sim, g, P)) checkRejection(sim, col, g, P);
  }
  spreadInfection(sim, col, P, dtGd);
  gardenLessStep(sim, col, P, dtGd);
  feedQueenFungus(sim, col, dtGd);
  releaseStaphylae(col);
  mod.lastStepTick = sim.state.tick;
}

/** The queen is with this garden: in its chamber, or (founding) within the chamber's ellipsoid reach. */
function queenNear(sim: Sim, q: Ant, g: GardenRecord): boolean {
  if (q.chamberId === g.chamberId) return true;
  const ch = chamberById(sim, g.chamberId);
  if (!ch) return false;
  const dx = (q.pos.x - ch.center.x) / Math.max(1, ch.radii.x * 1.5);
  const dy = (q.pos.y - ch.center.y) / Math.max(1, ch.radii.y * 2.5);
  const dz = (q.pos.z - ch.center.z) / Math.max(1, ch.radii.z * 1.5);
  return dx * dx + dy * dy + dz * dz <= 1;
}

/** Whether the colony still has a live garden. */
export function hasLiveGarden(col: Colony): boolean {
  return !!col.fungus && liveGardens(col.fungus).length > 0;
}

/** Σ G of the colony, GU. */
export function gardenMass(col: Colony): number {
  return col.fungus ? totalGarden(col.fungus) : 0;
}

export const gardenEconomySystem: System = {
  name: 'fungus-garden', phase: 'colony-economy', every: GARDEN_STEP_TICKS,
  run(sim) {
    for (const { col, P } of atColonies(sim)) {
      const last = col.fungus!.lastStepTick ?? -1;
      const dt = last >= 0 ? sim.state.tick - last : GARDEN_STEP_TICKS;
      stepColonyGardens(sim, col, P, dt / TICKS_PER_DAY);
    }
  },
};
