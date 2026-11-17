// The `nurse` behaviour of wood-nesting species: the colony's nurse behaviour, plus the shuttle trip (GDD 07 §6.2.6,
// subtype `nurse:shuttle`): pick up the late larva or pupa in the parent, carry it along the surface to the
// satellite's nursery, put it down, walk back to the parent. Each trip carries one item and emits `brood-shuttled`.

import type { Ant, Behaviour, Chamber, Nest, Sim } from '@/sim/types';
import { nurseBehaviour } from '@/sim/ants/behaviours/nest/nurse';
import { approach, primitiveDone, reachAndAct } from '@/sim/ants/behaviours/nest/common';
import { act, entity } from '@/sim/ants/behaviours/nest/travel';
import { setState } from '@/sim/ants/behaviours/nest/fsm';
import { SHUTTLE_ARRIVE_BU, SHUTTLE_TIMEOUT_GD } from '@/sim/balance/species-carpenter';
import { TICKS_PER_DAY } from '@/sim/time';
import { SH, clearShuttle, isShuttling } from './shuttleKeys';

const STATE = 'nurse.shuttle';

/**
 * One step of the walk from nest `from` to `room` in nest `to`, in three legs (out through `from`'s open entrance,
 * over the surface to the mouth of `to`, in to the room): each leg is a walk the locomotion module plans on its own
 * (inside a nest, on the surface, into a nest). 'arrived' once in the room.
 */
function walkLegs(sim: Sim, ant: Ant, from: Nest, to: Nest, room: Chamber): 'moving' | 'arrived' | 'failed' {
  const bu = sim.world.bu;
  let leg = ant.bb[SH.leg] ?? 0;
  if (ant.nestId === to.id && leg < 2) leg = 2;
  if (leg === 0 && ant.nestId !== from.id) leg = 1;
  if (leg === 0) {
    const e = from.entrances.find((x) => x.status === 'open');
    if (!e) return 'failed';
    const st = approach(sim, ant, entity('entrance', e.id, e.pos), 1.5 * bu, true);
    if (st === 'failed') return 'failed';
    if (st === 'arrived') leg = 1;
  }
  if (leg === 1) {
    const e = to.entrances.find((x) => x.status === 'open');
    if (!e) return 'failed';
    const mouth = { x: e.pos.x + e.dir.x * 1.5 * bu, y: e.pos.y + e.dir.y * 1.5 * bu, z: e.pos.z + e.dir.z * 1.5 * bu };
    const st = approach(sim, ant, entity('point', -1, mouth), 2 * bu, true);
    if (st === 'failed') return 'failed';
    if (st === 'arrived') leg = 2;
  }
  ant.bb[SH.leg] = leg;
  if (leg !== 2) return 'moving';
  return approach(sim, ant, entity('chamber', room.id, room.center), SHUTTLE_ARRIVE_BU * bu, true);
}

function end(sim: Sim, ant: Ant): void {
  if (ant.carry.kind !== 'none') act(sim, ant, 'put-down', null);
  clearShuttle(ant);
  setState(sim, ant, 'nurse.select');
}

function delivered(sim: Sim, ant: Ant, broodId: number): void {
  const b = sim.stores.brood.get(broodId);
  const col = sim.stores.colonies.get(ant.colony);
  const to = sim.stores.nests.get(ant.bb[SH.nest]);
  if (b && to) {
    b.nestId = to.id;
    const site = (id: number) => col?.wood?.sites.find((s) => s.nestId === id)?.id ?? -1;
    sim.emit({ type: 'brood-shuttled', broodId, fromSite: site(ant.bb[SH.from]), toSite: site(to.id) });
    if (col?.wood && to.kind === 'satellite') col.wood.shuttled = (col.wood.shuttled ?? 0) + 1; // returns not counted
  }
  ant.bb[SH.phase] = 3;
  ant.bb[SH.leg] = 0;
}

/** One think of the shuttle trip; false when the ant has no trip (the colony's nurse behaviour runs instead). */
export function shuttleStep(sim: Sim, ant: Ant): boolean {
  if (!isShuttling(ant)) return false;
  if (ant.state !== STATE) { setState(sim, ant, STATE); ant.bb[SH.since] = sim.state.tick; }
  if (sim.state.tick - (ant.bb[SH.since] ?? sim.state.tick) > SHUTTLE_TIMEOUT_GD * TICKS_PER_DAY) { end(sim, ant); return true; }
  const bu = sim.world.bu;
  const broodId = ant.bb[SH.brood];
  const b = sim.stores.brood.get(broodId);
  const nest = sim.stores.nests.get(ant.bb[SH.nest]);
  const room = nest?.chambers.find((c) => c.id === ant.bb[SH.chamber]) ?? nest?.chambers[0];
  const phase = ant.bb[SH.phase] ?? 0;
  if (!nest || !room) { end(sim, ant); return true; }
  if (ant.bb[SH.migrate] === 1) {
    const from = sim.stores.nests.get(ant.bb[SH.from]);
    // a migrant settles in the satellite: walking ends there and the colony's nurse work goes on from it
    if (!from || walkLegs(sim, ant, from, nest, room) !== 'moving') { clearShuttle(ant); setState(sim, ant, 'nurse.select'); }
    return true;
  }
  if (phase === 3) {
    const home = sim.stores.nests.get(ant.bb[SH.from]);
    const back = home?.chambers[0];
    if (!home || !back) { end(sim, ant); return true; }
    if (walkLegs(sim, ant, nest, home, back) !== 'moving') end(sim, ant);
    return true;
  }
  if (!b || !b.alive) { end(sim, ant); return true; }
  if (phase === 2) {
    if (primitiveDone(ant) && ant.carry.kind === 'none') delivered(sim, ant, broodId);
    return true;
  }
  if (b.carriedBy === ant.id) {
    if (phase !== 1) { ant.bb[SH.phase] = 1; ant.bb[SH.leg] = 0; }
    const from = sim.stores.nests.get(ant.bb[SH.from]);
    if (!from) { end(sim, ant); return true; }
    const st = walkLegs(sim, ant, from, nest, room);
    if (st === 'failed') { end(sim, ant); return true; }
    if (st === 'arrived' && act(sim, ant, 'put-down', null)) ant.bb[SH.phase] = 2;
    return true;
  }
  if (b.carriedBy >= 0) { end(sim, ant); return true; }
  const st = reachAndAct(sim, ant, entity('brood', b.id, b.pos), 'pick-up');
  if (st === 'failed') end(sim, ant);
  return true;
}

export const woodNurseBehaviour: Behaviour = {
  task: 'nurse',
  species: ['camponotus-pennsylvanicus'],
  enter: (sim, ant) => { if (!isShuttling(ant)) nurseBehaviour.enter(sim, ant); },
  update: (sim, ant) => { if (!shuttleStep(sim, ant)) nurseBehaviour.update(sim, ant); },
  exit: (sim, ant) => { if (isShuttling(ant)) end(sim, ant); nurseBehaviour.exit(sim, ant); },
  delivering: (sim, ant) => isShuttling(ant) || (nurseBehaviour.delivering?.(sim, ant) ?? false),
};
