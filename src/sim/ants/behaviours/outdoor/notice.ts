// What a worker outside the nest notices whatever her task or trip (colony-life R38, direction 24 items 2-3, 5): the
// aphid herds whose sign she walks through (herdFind.ts), the prey patches she meets prey in or walks through
// (hunt.ts noticePatches) and the food she smells on the way, which she reports when she is back home
// (noteSmelledFood). The behaviour runner calls noticeOutside for every autonomous worker after its think; the
// outside checks run every HERD_NOTICE_EVERY_TICKS per ant. Scouts also check herds on every think (phaseScout.ts).

import type { Ant, Sim } from '@/sim/types';
import { HERD_NOTICE_EVERY_TICKS } from '@/sim/balance/foraging';
import { reportSmelledSource } from '@/sim/colony';
import { discoverSource, sourcesSmelledFrom } from '@/sim/ecology';
import { discoverHerdsNear } from './herdFind';
import { noticePatches } from './hunt';

/** ant.bb keys: the tick of this worker's next check outside; a smelled source she will report at home (-1 none). */
const NEXT_CHECK = 'notice.next';
const TO_REPORT = 'notice.report';

const smelled: number[] = [];

export function noticeOutside(sim: Sim, ant: Ant): void {
  if (ant.colony < 0) return;
  if (ant.nestId >= 0) { reportAtHome(sim, ant); return; }
  const tick = sim.state.tick;
  if (tick < (ant.bb[NEXT_CHECK] ?? 0)) return;
  ant.bb[NEXT_CHECK] = tick + HERD_NOTICE_EVERY_TICKS;
  discoverHerdsNear(sim, ant);
  noticePatches(sim, ant);
  noteSmelledFood(sim, ant);
}

/**
 * R38 item 5 (direction 24): a worker whose trip does not perceive (outbound to a known source, homing with a load or
 * a full crop, a tender, a hauler) still reports the food she smells. She remembers the nearest unknown source with
 * food whose odour reaches her (one at a time) and reports it when she is back in the nest (colony
 * reportSmelledSource: the colony knows it, its news can recruit). Round 11's trace on kitchen-door #2: an
 * insect-medium carcass (4 P) 60 BU from the entrance, on the floor, had foragers and tenders inside its 20 BU odour
 * for 142 s in 5 gd (46 s outbound, 72 s homing with a full crop, nearest 1.2 BU) and stayed unknown, because only a
 * scout's investigate or a forager's collect made a source known. Scouts keep their own investigate.
 */
function noteSmelledFood(sim: Sim, ant: Ant): void {
  if (ant.task === 'scout' || (ant.bb[TO_REPORT] ?? -1) >= 0) return;
  const col = sim.stores.colonies.get(ant.colony);
  if (!col) return;
  for (const id of sourcesSmelledFrom(sim, ant.pos, smelled)) {
    const s = sim.stores.sources.get(id);
    if (!s || s.herdId >= 0 || (s.c <= 0 && s.p <= 0) || col.knownSourceIds.includes(id)) continue;
    ant.bb[TO_REPORT] = id;
    return;
  }
}

function reportAtHome(sim: Sim, ant: Ant): void {
  const id = ant.bb[TO_REPORT] ?? -1;
  if (id < 0) return;
  ant.bb[TO_REPORT] = -1;
  const s = sim.stores.sources.get(id);
  if (!s || !s.alive) return;
  // discovered (the colony bit a scout's collect sets) and reported (known, news), as after a scout's return
  discoverSource(sim, ant.colony, id, ant.id);
  reportSmelledSource(sim, ant.colony, id);
}
