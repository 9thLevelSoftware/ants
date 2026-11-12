// `haul` (GDD 02 §10.8, GDD 03 §7.7 hauler): claim the best job (nestmate corpses after CORPSE_DETECT_S within 60
// BU of an entrance, waste in the nest, then soil pellets: spoil piles before clutter), pick it up, carry soil to
// the dump point beside the nearest open entrance (it settles into that mound) and waste and corpses to the
// midden, then return into the nest. Also the item rules shared with `store.clean`.

import type { Ant, Behaviour, Item, Nest, Sim } from '@/sim/types';
import {
  CORPSE_DETECT_S, CORPSE_HAUL_RADIUS_BU, HAUL_CLUTTER_COST, HAUL_IDLE_S, HAUL_PRIORITY, MIDDEN_RADIUS_BU,
  ROOM_ARRIVE_FRAC,
} from '@/sim/balance/nestwork';
import { secondsToTicks } from '@/sim/time';
import { claim, freeFor, Job } from './board';
import { carryTo } from './carry';
import { endCycle, primitiveDone, reachAndAct, recover, releaseAll, think, carryingLoad } from './common';
import { B, bbv, setState, skipped, waitThink } from './fsm';
import { dist, entranceChamber, homeNest, middenPoint, onSurface } from './places';
import { entity, travel } from './travel';
import { perTick } from './perTick';

const ENTRY = 'haul.claim';
const mid = { x: 0, y: 0, z: 0 };

/** Is the item lying at the colony midden already? */
function atMidden(sim: Sim, nest: Nest, it: Item): boolean {
  return middenPoint(sim, nest, mid) !== null && dist(it.pos, mid) <= MIDDEN_RADIUS_BU * sim.world.bu;
}

function nearEntrance(sim: Sim, nest: Nest, it: Item): boolean {
  const r = CORPSE_HAUL_RADIUS_BU * sim.world.bu;
  return nest.entrances.some((e) => dist(e.pos, it.pos) <= r);
}

/**
 * Haul priority of an item for this colony's nest (0 = not a haul job): corpses of nestmates 60 s after death
 * near the nest, waste inside the nest, soil pellets lying inside the nest.
 */
export function haulPriority(sim: Sim, nest: Nest, it: Item): number {
  if (!it.alive || it.carrierIds.length > 0) return 0;
  // nowhere to take it (no open entrance, no midden chamber): not a job; it waits (GDD 03 §7.7 `internal-dump`
  // to a dead-end tunnel tip is not implemented, so haulers do not pick it up only to put it down again)
  if (!destinationOpen(sim, nest, it)) return 0;
  if (it.kind === 'corpse') {
    if (it.colony !== nest.colony || sim.state.tick < it.createdTick + secondsToTicks(CORPSE_DETECT_S)) return 0;
    if (!(it.inNest && it.nestId === nest.id) && !nearEntrance(sim, nest, it)) return 0;
    return atMidden(sim, nest, it) || !onSurface(sim, it.pos) ? 0 : HAUL_PRIORITY.corpse;
  }
  if (!it.inNest || it.nestId !== nest.id) return 0;
  if (it.kind === 'waste') return atMidden(sim, nest, it) || !onSurface(sim, it.pos) ? 0 : HAUL_PRIORITY.waste;
  if (it.kind === 'soil-pellet' || it.kind === 'frass') return onSurface(sim, it.pos) ? HAUL_PRIORITY.pellet : 0;
  return 0;
}

/** Can a carry trip for this item end anywhere: soil at an open entrance's dump point, waste and corpses at the midden? */
function destinationOpen(sim: Sim, nest: Nest, it: Item): boolean {
  if (it.kind === 'soil-pellet' || it.kind === 'frass') return nest.entrances.some((e) => e.status === 'open');
  return middenPoint(sim, nest, mid) !== null;
}

interface HaulCandidate { it: Item; pr: number; cost: number }

/** The nest's haul jobs this tick (priority and distance cost per item), computed once per tick. */
function haulCandidates(sim: Sim, nest: Nest): HaulCandidate[] {
  return perTick(sim, `haul:${nest.id}`, () => {
    const out: HaulCandidate[] = [];
    for (const it of sim.stores.items.list) {
      if (it.kind !== 'corpse' && it.kind !== 'waste' && it.kind !== 'soil-pellet' && it.kind !== 'frass') continue;
      const pr = haulPriority(sim, nest, it);
      if (pr > 0) out.push({ it, pr, cost: it.kind === 'soil-pellet' && it.spoilPlanId < 0 ? HAUL_CLUTTER_COST : 1 });
    }
    return out;
  });
}

/** Best haul job for the ant: highest priority, then nearest (clutter pellets cost x1.4); unclaimed. */
export function findHaulJob(sim: Sim, ant: Ant, nest: Nest): Item | null {
  const bu = sim.world.bu;
  let best: Item | null = null, bestS = -Infinity;
  for (const { it, pr, cost } of haulCandidates(sim, nest)) {
    if (!it.alive || it.carrierIds.length > 0 || it.bulk > ant.carryCap || !freeFor(sim, ant, it.id) || skipped(sim, ant, it.id)) continue;
    if (it.reservedBy >= 0 && it.reservedBy !== ant.id && sim.stores.ants.has(it.reservedBy)) continue;
    const s = pr * 1e6 - (dist(it.pos, ant.pos) / bu) * cost;
    if (s > bestS || (s === bestS && best && it.id < best.id)) { best = it; bestS = s; }
  }
  return best;
}

function claimStep(sim: Sim, ant: Ant): void {
  if (ant.carry.kind === 'item') { setState(sim, ant, 'haul.carry'); return; }
  const nest = homeNest(sim, ant);
  const job = nest ? findHaulJob(sim, ant, nest) : null;
  if (!job) {
    if (sim.state.tick - ant.stateTick >= secondsToTicks(HAUL_IDLE_S)) endCycle(sim, ant, ENTRY);
    else waitThink(sim, ant);
    return;
  }
  claim(sim, ant, Job.haul, job.id);
  setState(sim, ant, 'haul.travel', `job:${job.kind}`);
}

function travelStep(sim: Sim, ant: Ant): void {
  const it = sim.stores.items.get(bbv(ant, B.jobId));
  if (!it || it.carrierIds.length > 0) { setState(sim, ant, ENTRY); return; }
  const st = reachAndAct(sim, ant, entity('item', it.id, it.pos), 'pick-up');
  if (st === 'started') setState(sim, ant, 'haul.pick');
  else if (st === 'failed') recover(sim, ant, ENTRY, 'job:haul', ant.nav.status === 'failed');
}

function pickStep(sim: Sim, ant: Ant): void {
  if (!primitiveDone(ant) && bbv(ant, B.began, 0) === 1) return;
  if (ant.carry.kind === 'item' && ant.carry.id === bbv(ant, B.jobId)) { setState(sim, ant, 'haul.carry', 'item-collected'); return; }
  setState(sim, ant, ENTRY, 'job:haul');
}

/** bb: kind of the carried item (0 soil, 1 corpse, 2 waste) and its id, noted when the trip starts. */
const IK = 'bn.ik', IID = 'bn.ii';

function carryStep(sim: Sim, ant: Ant): void {
  const it = ant.carry.kind === 'item' ? sim.stores.items.get(ant.carry.id) : undefined;
  const leg = bbv(ant, B.leg, 0);
  if (!it && leg !== 2) { setState(sim, ant, ENTRY); return; }
  if (it && leg === 0) {
    ant.bb[IK] = it.kind === 'corpse' ? 1 : it.kind === 'waste' ? 2 : 0;
    ant.bb[IID] = it.id;
  }
  const ik = bbv(ant, IK, 0);
  const st = carryTo(sim, ant, ik > 0 ? 'midden' : 'mound');
  if (st === 'failed') { recover(sim, ant, ENTRY, 'stuck', true); return; }
  if (st !== 'dropped') return;
  const itemId = bbv(ant, IID);
  if (ik === 1) sim.emit({ type: 'corpse-removed', antId: ant.id, itemId, to: 'midden' });
  else if (ik === 2) sim.emit({ type: 'waste-dumped', antId: ant.id, itemId, to: 'midden' });
  setState(sim, ant, 'haul.return');
}

function returnStep(sim: Sim, ant: Ant): void {
  const nest = homeNest(sim, ant);
  const room = nest ? entranceChamber(sim, nest) : undefined;
  if (!room || ant.nestId === nest!.id) { endCycle(sim, ant, ENTRY); return; }
  const st = travel(sim, ant, entity('chamber', room.id, room.center), ROOM_ARRIVE_FRAC * Math.min(room.radii.x, room.radii.z));
  if (st === 'arrived') endCycle(sim, ant, ENTRY);
  else if (st === 'failed') recover(sim, ant, ENTRY, 'stuck', true);
}

function step(sim: Sim, ant: Ant): void {
  switch (ant.state) {
    case 'haul.travel': return travelStep(sim, ant);
    case 'haul.pick': return pickStep(sim, ant);
    case 'haul.carry': return carryStep(sim, ant);
    case 'haul.return': return returnStep(sim, ant);
    default:
      if (ant.state !== ENTRY) { setState(sim, ant, ENTRY); return; }
      return claimStep(sim, ant);
  }
}

export const haulBehaviour: Behaviour = {
  task: 'haul',
  enter: (sim, ant) => setState(sim, ant, ENTRY),
  update: (sim, ant) => think(sim, ant, ENTRY, step),
  exit: (sim, ant) => releaseAll(sim, ant),
  delivering: carryingLoad,
};
