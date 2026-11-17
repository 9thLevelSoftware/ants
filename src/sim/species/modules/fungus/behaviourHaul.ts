// Task `haul` for a leafcutter, subtype garden-waste (GDD 07 §6.4.6 stage 8, §6.4.4 refuse workers): a small media,
// media or refuse worker on `haul` first takes spent substrate out of a garden whose waste is due (tend-fungus "take
// waste": one garden-waste item, 1 load per trip, she becomes a refuse worker for life) and carries it to the waste
// dump (wasteDump.ts); with no garden waste due, or none she may carry, the shared haul behaviour runs (soil
// pellets, corpses, nest waste). With nowhere to dump it, the waste is not taken out of the garden at all.
// States: gw.find (choose a garden), gw.go, gw.take (the primitive), gw.carry; the shared haul's own states
// (haul.*, rest) are delegated to it, and its entry state is intercepted so the garden waste comes first.

import type { Vec3 } from '@/core/math/vec3';
import type { Ant, Behaviour, Colony, GardenRecord, Sim } from '@/sim/types';
import { endCycle, releaseAll, think } from '@/sim/ants/behaviours/nest/common';
import { setState } from '@/sim/ants/behaviours/nest/fsm';
import { haulBehaviour } from '@/sim/ants/behaviours/nest/haul';
import { chamberIn, homeNest } from '@/sim/ants/behaviours/nest/places';
import { perTick } from '@/sim/ants/behaviours/nest/perTick';
import { actEnded, busy, entity, travel, tryAct } from '@/sim/ants/behaviours/nest/travel';
import { removeItem } from '@/sim/entities';
import { DUMP_ARRIVE_BU, GARDEN_ARRIVE_FRAC } from '@/sim/balance/species-leafcutter';
import { gardenOf } from './state';
import { TEND_MODE, TM } from './actions';
import { AK, wasteDue } from './work';
import { mayHaulGardenWaste } from './refuse';
import { wasteDumpPoint } from './wasteDump';

const ENTRY = 'gw.find';
/** The shared haul's entry state (haul.ts ENTRY). */
const HAUL_ENTRY = 'haul.claim';
const DUMP = { x: 'at.gwx', y: 'at.gwy', z: 'at.gwz' } as const;
const scratch: Vec3 = { x: 0, y: 0, z: 0 };

function colonyOf(sim: Sim, ant: Ant): Colony | undefined {
  return sim.stores.colonies.get(ant.colony);
}

/** Garden-waste haulers already assigned to each garden chamber (per tick). */
function haulersOf(sim: Sim, col: Colony): Map<number, number> {
  return perTick(sim, `at.gw:${col.id}`, () => {
    const m = new Map<number, number>();
    for (const a of sim.stores.ants.list) {
      if (!a.alive || a.colony !== col.id || a.task !== 'haul' || !a.state.startsWith('gw.')) continue;
      const room = a.bb[AK.room] ?? -1;
      if (room >= 0) m.set(room, (m.get(room) ?? 0) + 1);
    }
    return m;
  });
}

/** The garden whose waste this ant should take now: waste due, a dump point, the most loads per hauler. */
export function gardenWasteJob(sim: Sim, ant: Ant): GardenRecord | undefined {
  const col = colonyOf(sim, ant);
  if (!col?.fungus || !mayHaulGardenWaste(ant) || ant.carry.kind !== 'none') return undefined;
  const nest = homeNest(sim, ant);
  if (!nest || !wasteDumpPoint(sim, nest, scratch)) return undefined;
  const staff = haulersOf(sim, col);
  let best: GardenRecord | undefined, bestScore = 0;
  for (const g of col.fungus.gardens) {
    if (!wasteDue(g) || !chamberIn(nest, g.chamberId)) continue;
    const score = g.waste / (1 + (staff.get(g.chamberId) ?? 0));
    if (score > bestScore) { bestScore = score; best = g; }
  }
  return best;
}

function find(sim: Sim, ant: Ant): void {
  const g = gardenWasteJob(sim, ant);
  if (!g) { ant.bb[AK.room] = -1; setState(sim, ant, HAUL_ENTRY); return; }
  ant.bb[AK.room] = g.chamberId;
  setState(sim, ant, 'gw.go', 'job:garden-waste');
}

function go(sim: Sim, ant: Ant): void {
  const nest = homeNest(sim, ant);
  const ch = nest ? chamberIn(nest, ant.bb[AK.room] ?? -1) : undefined;
  if (!ch) { setState(sim, ant, ENTRY); return; }
  if (ant.chamberId === ch.id) { setState(sim, ant, 'gw.take'); return; }
  const st = travel(sim, ant, entity('chamber', ch.id, ch.center), GARDEN_ARRIVE_FRAC * Math.min(ch.radii.x, ch.radii.z));
  if (st === 'arrived') setState(sim, ant, 'gw.take');
  else if (st === 'failed') endCycle(sim, ant, ENTRY, 'stuck');
}

function take(sim: Sim, ant: Ant): void {
  const col = colonyOf(sim, ant);
  const g = col?.fungus ? gardenOf(col.fungus, ant.bb[AK.room] ?? -1) : undefined;
  if (!g) { setState(sim, ant, ENTRY); return; }
  if (actEnded(ant)) {
    const nest = homeNest(sim, ant);
    const p = nest ? wasteDumpPoint(sim, nest, scratch) : null;
    if (ant.carry.kind !== 'item') { endCycle(sim, ant, ENTRY); return; }
    if (!p) { returnWaste(sim, ant); endCycle(sim, ant, ENTRY); return; }
    ant.bb[DUMP.x] = p.x; ant.bb[DUMP.y] = p.y; ant.bb[DUMP.z] = p.z;
    setState(sim, ant, 'gw.carry', 'job:garden-waste');
    return;
  }
  if (busy(ant)) return;
  if (ant.chamberId !== g.chamberId) { setState(sim, ant, 'gw.go'); return; }
  ant.bb[TEND_MODE] = TM.waste;
  if (tryAct(sim, ant, 'tend-fungus', null) !== null) endCycle(sim, ant, ENTRY);
}

function carry(sim: Sim, ant: Ant): void {
  if (ant.carry.kind !== 'item') { endCycle(sim, ant, ENTRY); return; }
  const dest = { x: ant.bb[DUMP.x] ?? ant.pos.x, y: ant.bb[DUMP.y] ?? ant.pos.y, z: ant.bb[DUMP.z] ?? ant.pos.z };
  const st = travel(sim, ant, entity('point', -1, dest), DUMP_ARRIVE_BU * sim.world.bu);
  if (st === 'failed') { returnWaste(sim, ant); endCycle(sim, ant, ENTRY, 'stuck'); return; }
  if (st !== 'arrived') return;
  const id = ant.carry.id;
  const it = sim.stores.items.get(id);
  if (it) it.droppedTick = sim.state.tick;
  tryAct(sim, ant, 'put-down', null);
  sim.emit({ type: 'waste-dumped', antId: ant.id, itemId: id, to: 'midden' });
  endCycle(sim, ant, ENTRY);
}

/**
 * A garden-waste load that cannot reach the dump (the way failed, the dump vanished, the task changed) goes back
 * into its garden's W: never left lying in a fungus chamber or a tunnel where nothing would pick it up.
 */
function returnWaste(sim: Sim, ant: Ant): void {
  if (ant.carry.kind !== 'item') return;
  const it = sim.stores.items.get(ant.carry.id);
  if (!it || it.kind !== 'garden-waste') return;
  const col = colonyOf(sim, ant);
  const g = col?.fungus ? gardenOf(col.fungus, ant.bb[AK.room] ?? -1) : undefined;
  if (g) g.waste += it.volume > 0 ? it.volume : it.bulk;
  removeItem(sim, it.id, 'returned');
}

function step(sim: Sim, ant: Ant): void {
  switch (ant.state) {
    case 'gw.go': go(sim, ant); return;
    case 'gw.take': take(sim, ant); return;
    case 'gw.carry': carry(sim, ant); return;
    default: find(sim, ant);
  }
}

function update(sim: Sim, ant: Ant): void {
  if (ant.state.startsWith('gw.')) { think(sim, ant, ENTRY, step); return; }
  // the shared haul's entry: garden waste comes first
  if (ant.state === HAUL_ENTRY && !busy(ant) && gardenWasteJob(sim, ant)) { setState(sim, ant, ENTRY); return; }
  haulBehaviour.update(sim, ant);
}

export const attaHaulBehaviour: Behaviour = {
  task: 'haul', species: ['atta-texana'],
  enter: (sim, ant) => setState(sim, ant, ENTRY),
  update,
  exit: (sim, ant) => {
    if (ant.state.startsWith('gw.')) { returnWaste(sim, ant); releaseAll(sim, ant); }
    else haulBehaviour.exit(sim, ant);
    ant.bb[AK.room] = -1;
  },
  delivering: (sim, ant) => ant.state === 'gw.carry' || (!ant.state.startsWith('gw.') && (haulBehaviour.delivering?.(sim, ant) ?? false)),
};

