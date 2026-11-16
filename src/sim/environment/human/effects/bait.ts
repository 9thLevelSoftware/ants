// Bait stations (GDD 04 §15.4, §15.6; GDD 05 §1.8): a plastic station (dynamic primitive) and its gel source (ecology
// `spawnBaitStation`: sugar plus a delayed toxin that ants carry home into the colony's toxin store). It stays
// BAIT_LIFE_GD, is refreshed up to BAIT_REFRESH_MAX times while ants keep feeding, then is taken away.

import type { Sim } from '@/sim/types';
import type { Vec3 } from '@/core/math/vec3';
import { retireSource, spawnBaitStation } from '@/sim/ecology';
import { BAIT_LIFE_GD, BAIT_REFRESH_MAX, BAIT_REFRESH_VISITS, BAIT_STATION_HALF } from '@/sim/balance/human';
import { TICKS_PER_DAY } from '@/sim/time';
import { humanExtra } from '../extra';
import type { Footprint } from '../plan';
import { addBaitStation, removeDyn } from './objects';

export function placeBaitStation(sim: Sim, fp: Footprint): void {
  const pos: Vec3 = { x: fp.x, y: fp.y, z: fp.z };
  const primId = addBaitStation(sim, pos);
  // the gel sits in an entrance slot at the station's side, at the ant's level
  const gel = spawnBaitStation(sim, { x: fp.x + BAIT_STATION_HALF.x + 1, y: fp.y, z: fp.z });
  const now = sim.state.tick;
  humanExtra(sim).baits.push({ sourceId: gel.id, primId, pos, placedTick: now, expiresTick: now + Math.round(BAIT_LIFE_GD * TICKS_PER_DAY), refreshes: 0, visits: 0 });
  sim.state.env.human.reactive.baitRefreshes = 0;
  sim.emit({ type: 'human.bait-placed', id: primId, pos: { ...pos } });
}

/** A delivery from a gel source counts toward its station's refresh. */
export function noteBaitVisit(sim: Sim, sourceId: number): void {
  for (const b of humanExtra(sim).baits) if (b.sourceId === sourceId) b.visits++;
}

/** End of a station's life: refreshed while ants still feed (<= BAIT_REFRESH_MAX times), else removed. */
export function runBaits(sim: Sim): void {
  const ex = humanExtra(sim), now = sim.state.tick;
  for (const b of [...ex.baits]) {
    if (now < b.expiresTick) continue;
    const src = sim.stores.sources.get(b.sourceId);
    if (b.visits >= BAIT_REFRESH_VISITS && b.refreshes < BAIT_REFRESH_MAX && src) {
      b.refreshes++;
      b.visits = 0;
      b.expiresTick = now + Math.round(BAIT_LIFE_GD * TICKS_PER_DAY);
      src.units = src.capacity;
      src.exhaustedBy = 0;
      sim.state.env.human.reactive.baitRefreshes = b.refreshes;
      continue;
    }
    if (src) retireSource(sim, src, 'bait-removed');
    removeDyn(sim, b.primId, 'bait-station');
    ex.baits.splice(ex.baits.indexOf(b), 1);
    sim.emit({ type: 'human.bait-removed', id: b.primId, pos: { ...b.pos } });
  }
}
