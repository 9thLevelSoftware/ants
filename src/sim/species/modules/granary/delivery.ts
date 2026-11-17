// Seeds into the granary (GDD 07 §6.3.2). A forager (or the possessed ant) unloads a seed with the `put-down`
// primitive like any solid food; the primitive's effect would put its nutrients straight into the colony pool.
// For a granary colony this system, run after the behaviours and before the actions complete, takes the seed's
// loads into a granary cohort while the put-down is in progress and leaves the item empty, so the primitive's
// effect removes it as stored. Animal food put down is noted as animal protein entering the pool (§6.3.7).

import type { Ant, Colony, FoodKind, FoodRoute, Item, Sim, System } from '@/sim/types';
import { rainIntensityOf } from '@/sim/colony/envAdapter';
import { WET_ARRIVAL_RAIN } from '@/sim/balance/species-harvester';
import { granaryParams, nutrientsPerSeedLoad, type GranaryParams } from './params';
import { addSeeds, seedClassOf } from './cohorts';
import { addAnimalP } from './paste';
import { storeTarget } from './state';

/** bb key: id of the item this ant's current put-down was already handled for. */
const HANDLED = 'mb.put';

/** Food kinds whose protein counts as animal (GDD 07 §6.3.7: carrion and prey). */
const ANIMAL: readonly FoodKind[] = ['carrion', 'prey'];

/** The diet route of an item for the colony's species, or null. */
function routeOf(sim: Sim, col: Colony, it: Item): FoodRoute | null {
  if (it.kind === 'seed') return 'granary';
  const kind = it.foodKind;
  if (!kind) return it.kind === 'carcass' ? 'solid-p' : null;
  return sim.getSpecies(col.species)?.diet.foods[kind]?.route ?? null;
}

function isAnimal(it: Item): boolean {
  return it.kind === 'carcass' || (it.foodKind !== null && ANIMAL.includes(it.foodKind));
}

/** Hardness 0..1 of a stored item: seeds keep theirs; crumbs are soft (0.1), kibble 0.3 (GDD 07 §5.3.5). */
function seedHardness(it: Item): number {
  if (it.kind === 'seed') return Math.max(0, Math.min(1, it.hardness));
  return it.foodKind === 'pet-food' ? 0.3 : 0.1;
}

/**
 * Stores the item's seed loads in a granary of the colony; the item is left with no nutrients. Returns the loads
 * stored (0: not stored).
 */
export function storeSeedItem(sim: Sim, col: Colony, g: GranaryParams, it: Item, chamberId: number): number {
  const mod = col.granary;
  if (!mod) return 0;
  const per = nutrientsPerSeedLoad(g);
  const loads = (it.c + it.p) / (per.c + per.p);
  if (!(loads > 0)) return 0;
  const gr = storeTarget(sim, col, mod, g, chamberId);
  if (!gr) return 0;
  const u = rainIntensityOf(sim) > WET_ARRIVAL_RAIN ? g.seedUWet : g.seedUArriving;
  addSeeds(gr, g, seedClassOf(g, loads / Math.max(1, it.count)), seedHardness(it), loads, u);
  mod.seedInToday = (mod.seedInToday ?? 0) + loads;
  it.c = 0;
  it.p = 0;
  return loads;
}

function handlePutDown(sim: Sim, col: Colony, g: GranaryParams, ant: Ant, it: Item): void {
  if (ant.bb[HANDLED] === it.id) return;
  const route = routeOf(sim, col, it);
  if (route === 'granary') {
    if (ant.chamberId < 0 || it.c + it.p <= 0) return;
    if (storeSeedItem(sim, col, g, it, ant.chamberId) > 0) ant.bb[HANDLED] = it.id;
    return;
  }
  if (isAnimal(it) && it.p > 0 && ant.chamberId >= 0) {
    addAnimalP(col.granary!, it.p);
    ant.bb[HANDLED] = it.id;
  }
}

export const granaryDeliverySystem: System = {
  name: 'granary-deliveries', phase: 'behaviours',
  run(sim) {
    let any = false;
    for (const c of sim.state.colonies) if (c.alive && c.granary) { any = true; break; }
    if (!any) return;
    for (const ant of sim.stores.ants.list) {
      if (ant.action?.id !== 'put-down' || ant.carry.kind !== 'item' || ant.nestId < 0) continue;
      const col = sim.stores.colonies.get(ant.colony);
      if (!col?.granary) continue;
      const g = granaryParams(sim.getSpecies(col.species));
      const it = sim.stores.items.get(ant.carry.id);
      if (g && it) handlePutDown(sim, col, g, ant, it);
    }
  },
};
