// What a worker outside the nest notices whatever her task or trip (colony-life R38, direction 24 items 2-3, 5): the
// aphid herds whose sign she walks through (herdFind.ts), the prey patches she meets prey in or walks through
// (hunt.ts noticePatches) and the food she smells on the way, which she reports when she is back home
// (noteSmelledFood). The behaviour runner calls noticeOutside for every autonomous worker after its think; the
// outside checks run every HERD_NOTICE_EVERY_TICKS per ant. Scouts also check herds on every think (phaseScout.ts).

import type { Ant, Colony, FoodSource, Sim } from '@/sim/types';
import { HERD_NOTICE_EVERY_TICKS } from '@/sim/balance/foraging';
import { reportSmelledSource } from '@/sim/colony';
import { discoverSource, nearestSmelledFrom } from '@/sim/ecology';
import { discoverHerdsNear } from './herdFind';
import { noticePatches } from './hunt';
import { phaseOf } from './common';
import { PHASE } from './keys';

/** ant.bb keys: the tick of this worker's next check outside; a smelled source she will report at home (-1 none). */
const NEXT_CHECK = 'notice.next';
const TO_REPORT = 'notice.report';

/** The colony whose unknown food the current check looks for (scratch for `unknownFood`, never persisted). */
let checking: Colony | null = null;

/** A source a worker of `checking` would report: food in it, not a herd's own source, unknown to her colony. */
function unknownFood(s: FoodSource): boolean {
  return s.herdId < 0 && (s.c > 0 || s.p > 0) && !!checking && !checking.knownSourceIds.includes(s.id);
}

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
 * scout's investigate or a forager's collect made a source known.
 *
 * Scouts (direction 26a item 1, round 12): a scout keeps her own investigate while she explores or investigates; in
 * every other phase (departing, assessing or collecting at another find, homing, fleeing) she remembers the food she
 * smells like any worker, and a scout who gives up an investigation without reaching the source remembers that one
 * (phaseScout.ts updateInvestigate). Sweep 11's kitchen-door #2: scouts in odour range of carrion on 6 trips, 1
 * discovery; round 12's probe (kd #2 cached hand-over, 5 gd): the scout-seconds in the odour of unknown food were spent
 * collecting, homing and investigating, the one unknown carrion smelled in explore and investigate and never known.
 */
function noteSmelledFood(sim: Sim, ant: Ant): void {
  if ((ant.bb[TO_REPORT] ?? -1) >= 0) return;
  if (ant.task === 'scout' && scoutInvestigates(ant)) return;
  const col = sim.stores.colonies.get(ant.colony);
  if (!col) return;
  checking = col;
  const id = nearestSmelledFrom(sim, ant.pos, unknownFood);
  checking = null;
  if (id >= 0) ant.bb[TO_REPORT] = id;
}

/** Whether a scout is in a phase in which she investigates what she smells herself. */
function scoutInvestigates(ant: Ant): boolean {
  const ph = phaseOf(ant);
  return ph === PHASE.explore || ph === PHASE.investigate;
}

/**
 * A scout who gave up investigating `id` without reaching it (timed out, the way failed) remembers it to report at
 * home, unless she already carries a report or her colony knows it.
 */
export function rememberSmelled(sim: Sim, ant: Ant, id: number): void {
  if (ant.colony < 0 || (ant.bb[TO_REPORT] ?? -1) >= 0) return;
  const col = sim.stores.colonies.get(ant.colony);
  const s = sim.stores.sources.get(id);
  if (!col || !s || col.knownSourceIds.includes(id)) return;
  checking = col;
  const ok = unknownFood(s);
  checking = null;
  if (ok) ant.bb[TO_REPORT] = id;
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
