// `store` (GDD 02 §10.6, §5.3): wait in the entrance chamber as the preferred liquid receiver (returning foragers
// give their crop with `trophallaxis-give`; the amount enters the pool and the ledger), then walk into the nest
// for STORE_DISPERSE_S; shift solid food dropped near the entrance into the food chamber (`put-down` there books it
// as a delivery); carry spoiled food out of the food chambers to the midden.

import type { Ant, Behaviour, Item, Nest, Sim } from '@/sim/types';
import { isFoodItem } from '@/sim/ants/actions';
import { DROP_ZONE_BU, RECEIVER_SEARCH_BU, STORE_DISPERSE_S } from '@/sim/balance/nestwork';
import { secondsToTicks } from '@/sim/time';
import { claim, freeFor, Job } from './board';
import { carryTo } from './carry';
import { endCycle, primitiveDone, reachAndAct, recover, releaseAll, think } from './common';
import { B, bbv, setState, skipped, waitThink } from './fsm';
import { chamberIn, entranceChamber, floorPoint, foodChamber, homeNest, onSurface, royalChamber } from './places';
import { act, entity, travel } from './travel';
import { perTick } from './perTick';

const ENTRY = 'store.post';
const ids: number[] = [];
const spot = { x: 0, y: 0, z: 0 };
/** bb: 1 pick-up started, 2 carrying the job's item. */
const PICKED = 'bn.pk';

/** A forager now giving trophallaxis to this ant. */
function giverTo(sim: Sim, ant: Ant): Ant | undefined {
  ids.length = 0;
  sim.index.queryAnts(ant.pos, RECEIVER_SEARCH_BU * sim.world.bu, ids);
  for (const id of ids) {
    const o = sim.stores.ants.get(id);
    if (o && o.id !== ant.id && o.action?.id === 'trophallaxis-give' && o.action.target.id === ant.id) return o;
  }
  return undefined;
}

function inFoodChamber(nest: Nest, it: Item): boolean {
  return it.chamberId >= 0 && chamberIn(nest, it.chamberId)?.type === 'food';
}

interface StoreJobs { solid: Item[]; spoiled: Item[] }

/**
 * The nest's store jobs this tick: solid food lying near an entrance (the drop zone) or in the entrance chamber,
 * not in a food chamber; spoiled food lying in a food chamber. Computed once per tick.
 */
function storeJobs(sim: Sim, nest: Nest): StoreJobs {
  return perTick(sim, `store:${nest.id}`, () => {
    const solid = new Set<Item>(), spoiled: Item[] = [];
    const scan = (p: { x: number; y: number; z: number }, r: number, take: (it: Item) => void) => {
      ids.length = 0;
      sim.index.queryItems(p, r, ids);
      for (const id of ids) { const it = sim.stores.items.get(id); if (it && it.carrierIds.length === 0) take(it); }
    };
    const food = (it: Item) => { if (isFoodItem(it) && !inFoodChamber(nest, it) && onSurface(sim, it.pos)) solid.add(it); };
    for (const e of nest.entrances) scan(e.pos, DROP_ZONE_BU * sim.world.bu, food);
    const room = entranceChamber(sim, nest);
    if (room) scan(room.center, Math.max(room.radii.x, room.radii.z), food);
    for (const c of nest.chambers) {
      if (c.type !== 'food') continue;
      scan(c.center, Math.max(c.radii.x, c.radii.y, c.radii.z), (it) => {
        if (it.kind === 'waste' && it.wasteKind === 'spoiled-food' && onSurface(sim, it.pos)) spoiled.push(it);
      });
    }
    return { solid: [...solid].sort((a, b) => a.id - b.id), spoiled };
  });
}

/** The first store job of a list this ant may take. */
function firstFree(sim: Sim, ant: Ant, list: Item[]): Item | undefined {
  for (const it of list) {
    if (it.alive && it.carrierIds.length === 0 && it.bulk <= ant.carryCap && freeFor(sim, ant, it.id) && !skipped(sim, ant, it.id)) return it;
  }
  return undefined;
}

function post(sim: Sim, ant: Ant): void {
  const nest = homeNest(sim, ant);
  const room = nest ? entranceChamber(sim, nest) : undefined;
  if (!nest || !room) return;
  if (ant.carry.kind !== 'none') { act(sim, ant, 'put-down', null); return; }
  if (giverTo(sim, ant)) { setState(sim, ant, 'store.receive', 'item-collected'); return; }
  const jobs = storeJobs(sim, nest);
  const solid = firstFree(sim, ant, jobs.solid);
  if (solid) { claim(sim, ant, Job.shift, solid.id); setState(sim, ant, 'store.shift', 'job:shift'); return; }
  const bad = firstFree(sim, ant, jobs.spoiled);
  if (bad) { claim(sim, ant, Job.clean, bad.id); setState(sim, ant, 'store.clean', 'job:clean'); return; }
  floorPoint(room, 0.25, 0, spot);
  const st = travel(sim, ant, entity('point', -1, spot), 0.8 * sim.world.bu);
  if (st === 'failed') { recover(sim, ant, ENTRY, 'stuck', true); return; }
  // waiting is a cycle of its own: re-stamped, so only a really stuck store ant times out
  if (sim.state.tick - ant.stateTick > secondsToTicks(STORE_DISPERSE_S * 4)) endCycle(sim, ant, ENTRY);
  else if (st === 'arrived') waitThink(sim, ant);
}

function receive(sim: Sim, ant: Ant): void {
  if (giverTo(sim, ant)) return;
  setState(sim, ant, 'store.disperse');
}

function disperse(sim: Sim, ant: Ant): void {
  const nest = homeNest(sim, ant);
  const deep = nest ? royalChamber(nest) : undefined;
  if (!deep || sim.state.tick - ant.stateTick >= secondsToTicks(STORE_DISPERSE_S)) { endCycle(sim, ant, ENTRY); return; }
  if (travel(sim, ant, entity('chamber', deep.id, deep.center), 0.6 * Math.min(deep.radii.x, deep.radii.z)) === 'arrived') endCycle(sim, ant, ENTRY);
}

/** Picks up the claimed item, then runs `deliver` until it reports the item put down (end of the cycle). */
function fetch(sim: Sim, ant: Ant, deliver: () => 'moving' | 'dropped' | 'failed'): void {
  const it = sim.stores.items.get(bbv(ant, B.jobId));
  if (ant.carry.kind === 'item' && it && ant.carry.id === it.id) ant.bb[PICKED] = 2;
  if (bbv(ant, PICKED, 0) === 2) {
    const st = deliver();
    if (st === 'dropped') { ant.bb[PICKED] = 0; endCycle(sim, ant, ENTRY); }
    else if (st === 'failed') { ant.bb[PICKED] = 0; recover(sim, ant, ENTRY, 'stuck', true); }
    return;
  }
  if (!it || it.carrierIds.length > 0) { endCycle(sim, ant, ENTRY); return; }
  if (primitiveDone(ant)) { ant.bb[B.began] = 0; ant.bb[B.n] = bbv(ant, B.n, 0) + 1; }
  const st = reachAndAct(sim, ant, entity('item', it.id, it.pos), 'pick-up');
  if (st === 'failed') recover(sim, ant, ENTRY, 'job:shift', ant.nav.status === 'failed');
}

function shift(sim: Sim, ant: Ant): void {
  fetch(sim, ant, () => {
    if (bbv(ant, B.leg, 0) === 2) return primitiveDone(ant) ? 'dropped' : 'moving';
    const nest = homeNest(sim, ant);
    const room = nest ? foodChamber(sim, nest, ant.pos) : undefined;
    if (!room) return 'failed';
    floorPoint(room, 0.3, Math.PI, spot);
    const st = ant.chamberId === room.id ? 'arrived' : travel(sim, ant, entity('chamber', room.id, room.center), 0.6 * Math.min(room.radii.x, room.radii.z));
    if (st !== 'arrived') return st;
    if (!act(sim, ant, 'put-down', null)) return 'failed';
    ant.bb[B.leg] = 2;
    return 'moving';
  });
}

function clean(sim: Sim, ant: Ant): void {
  const itemId = bbv(ant, B.jobId);
  fetch(sim, ant, () => {
    const st = carryTo(sim, ant, 'midden');
    if (st === 'dropped') sim.emit({ type: 'waste-dumped', antId: ant.id, itemId, to: 'midden' });
    return st;
  });
}

function step(sim: Sim, ant: Ant): void {
  switch (ant.state) {
    case 'store.receive': return receive(sim, ant);
    case 'store.disperse': return disperse(sim, ant);
    case 'store.shift': return shift(sim, ant);
    case 'store.clean': return clean(sim, ant);
    default:
      if (ant.state !== ENTRY) { setState(sim, ant, ENTRY); return; }
      return post(sim, ant);
  }
}

export const storeBehaviour: Behaviour = {
  task: 'store',
  enter: (sim, ant) => setState(sim, ant, ENTRY),
  update: (sim, ant) => think(sim, ant, ENTRY, step),
  exit: (sim, ant) => releaseAll(sim, ant),
};
