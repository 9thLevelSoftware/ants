// Collecting at a source (GDD 02 §10.2 forage.collect, §10.1 scout.collect, §10.3 tend.solicit in Tier 1):
// liquids by `harvest-liquid`, whole units by `pick-up`, flesh and large crumbs by `harvest-solid` (tearing a
// piece). Everything the ant takes goes through those primitives; ecology moves the food (sources-core).

import type { ActionId, Ant, FoodSource, Sim } from '@/sim/types';
import { CROP_RETURN_FRACTION, CROP_RETURN_MIN } from '@/sim/balance/actions';
import { COLLECT_MAX_S, SUCCESS_CROP } from '@/sim/balance/foraging';
import { begin, canDo } from '@/sim/ants/actions';
import { discoverSource, harvestForm } from '@/sim/ecology';
import { markDepleted } from './choice';
import { logDecision, phaseOf, phaseS } from './common';
import type { Flavour } from './flavours';
import { K, PHASE } from './keys';
import { atSource, goToSource, moving } from './nav';
import { startCollect, startQueue, startReturn } from './transitions';
import { transportHook } from './transport';

/** The primitive that takes food from this source for this ant, or null (too heavy: cooperative transport). */
export function harvestPrimitive(sim: Sim, ant: Ant, s: FoodSource): ActionId | null {
  const form = harvestForm(sim, s);
  if (form === 'liquid') return 'harvest-liquid';
  if (form === 'tear') return 'harvest-solid';
  return s.unitBulk <= ant.carryCap ? 'pick-up' : null;
}

function cropOf(ant: Ant): number {
  return ant.cropC + ant.cropP;
}

/**
 * Tries to start harvesting the trip's source. Walks closer when out of reach; queues when the feeding slots are
 * full (unless already queueing); returns home when nothing can be taken. True when a harvest began.
 */
export function tryHarvest(sim: Sim, ant: Ant, fl: Flavour, fromQueue: boolean): boolean {
  const src = ant.bb[K.src] ?? -1;
  const s = sim.stores.sources.get(src);
  if (!s) { startReturn(sim, ant, fl, cropOf(ant) >= SUCCESS_CROP, 'source-depleted', src); return false; }
  if (!atSource(sim, ant, s)) {
    if (!moving(ant)) goToSource(sim, ant, s);
    return false;
  }
  const prim = harvestPrimitive(sim, ant, s);
  if (!prim) {
    transportHook(sim, ant, s);
    startReturn(sim, ant, fl, false, 'job:transport', src);
    return false;
  }
  const t = { kind: 'source' as const, id: s.id, pos: s.pos };
  const check = canDo(sim, ant, prim, t);
  if (!check.ok) {
    switch (check.reason) {
      case 'blocked':
        if (!fromQueue) startQueue(sim, ant, fl);
        return false;
      case 'out-of-reach':
        if (!moving(ant)) goToSource(sim, ant, s);
        return false;
      case 'crop-full':
      case 'hands-full':
        startReturn(sim, ant, fl, true, 'crop-full', src);
        return false;
      case 'conditions':
        startReturn(sim, ant, fl, cropOf(ant) >= SUCCESS_CROP, 'too-cold', src);
        return false;
      default:
        finishEmpty(sim, ant, fl, src);
        return false;
    }
  }
  if (phaseOf(ant) !== PHASE.collect) startCollect(sim, ant, fl, src);
  discoverSource(sim, ant.colony, s.id, ant.id);
  ant.mem.knownSourceId = s.id;
  return begin(sim, ant, prim, t);
}

/** Nothing (more) to take: home with what the crop holds, else remember the source as empty. */
function finishEmpty(sim: Sim, ant: Ant, fl: Flavour, src: number): void {
  if (cropOf(ant) >= CROP_RETURN_MIN) { startReturn(sim, ant, fl, cropOf(ant) >= SUCCESS_CROP, 'source-depleted', src); return; }
  markDepleted(sim, ant, src);
  startReturn(sim, ant, fl, fl.scout && (ant.bb[K.success] ?? 0) === 1, 'source-depleted', src);
}

export function updateCollect(sim: Sim, ant: Ant, fl: Flavour): void {
  const src = ant.bb[K.src] ?? -1;
  if (ant.action) {
    if (phaseS(sim, ant) > COLLECT_MAX_S) startReturn(sim, ant, fl, cropOf(ant) >= SUCCESS_CROP, 'timeout', src);
    return;
  }
  if (ant.carry.kind === 'item') { startReturn(sim, ant, fl, true, 'item-collected', src); return; }
  if (cropOf(ant) >= CROP_RETURN_FRACTION * ant.cropCap) { startReturn(sim, ant, fl, true, 'crop-full', src); return; }
  const s = sim.stores.sources.get(src);
  if (!s || s.units <= 0) { finishEmpty(sim, ant, fl, src); return; }
  if (phaseS(sim, ant) > COLLECT_MAX_S) { startReturn(sim, ant, fl, cropOf(ant) >= SUCCESS_CROP, 'timeout', src); return; }
  tryHarvest(sim, ant, fl, false);
}

/** Scout at a find (GDD 02 §10.1 scout.assess): reads it, records it, always accepts. */
export function assessFind(sim: Sim, ant: Ant, fl: Flavour, srcId: number): void {
  const s = sim.stores.sources.get(srcId);
  if (!s) return;
  discoverSource(sim, ant.colony, s.id, ant.id);
  ant.mem.knownSourceId = s.id;
  // the scout becomes its own recruit: if it turns forager it goes back to this source
  ant.mem.lead = { sourceId: s.id, pos: { x: s.pos.x, y: s.pos.y, z: s.pos.z }, tick: sim.state.tick };
  ant.bb[K.success] = 1;
  logDecision(sim, ant, 'job:assess', s.id);
  startCollect(sim, ant, fl, s.id);
  tryHarvest(sim, ant, fl, false);
}
