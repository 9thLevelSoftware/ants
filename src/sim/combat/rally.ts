// Rally markers (GDD 02 §12.2, GDD 05 §4.9). Mode `defend`: the defend group plus up to 25 % of idle or waiting
// non-callow workers go to the marker as patrols, hold within 8 BU and engage non-nestmates inside its radius.
// Mode `attack`: the same party assaults whatever hostile is inside the radius (the raid into a foreign nest is
// the rivals module's, GDD 05 §3.7). The patrol behaviour carries out the hold; this file picks the responders.

import type { Ant, Marker, Sim } from '@/sim/types';
import { AntFlag } from '@/sim/types';
import { RALLY_MAX_FRACTION } from '@/sim/balance/combat';
import { dep } from './late';
import { canFight } from './engage';
import { CB } from './state';

/** The active rally marker of a colony, or null (one at a time, GDD 02 MARKER_CAP). */
export function activeRally(sim: Sim, colonyId: number): Marker | null {
  for (const m of sim.stores.markers.list) {
    if (!m.alive || m.kind !== 'rally' || m.colony !== colonyId) continue;
    if (m.expiresTick >= 0 && sim.state.tick >= m.expiresTick) continue;
    return m;
  }
  return null;
}

function availableForRally(a: Ant): boolean {
  return canFight(a) && (a.flags & (AntFlag.CALLOW | AntFlag.INJURED)) === 0 && a.carry.kind === 'none'
    && (a.task === 'idle' || dep().isWaitingForager(a));
}

/** Sends idle / waiting workers to every colony's active rally marker (cadence RALLY_EVERY_TICKS). */
export function rallyRecruit(sim: Sim): void {
  for (const col of sim.stores.colonies.list) {
    if (!col.alive) continue;
    const m = activeRally(sim, col.id);
    if (!m) continue;
    // the defend group (patrols) goes anyway; recruits are counted against the 25 % of idle / waiting workers
    let pool = 0, answering = 0;
    for (const a of sim.stores.ants.list) {
      if (!a.alive || a.colony !== col.id) continue;
      if ((a.bb[CB.rallyRecruit] ?? -1) === m.id && (a.task === 'patrol' || a.task === 'fight')) answering++;
      else if (availableForRally(a)) pool++;
    }
    const want = Math.floor(RALLY_MAX_FRACTION * (pool + answering)) - answering;
    if (want <= 0) continue;
    let sent = 0;
    for (const a of sim.stores.ants.list) {
      if (sent >= want) break;
      if (!a.alive || a.colony !== col.id || !availableForRally(a)) continue;
      if (dep().requestTask(sim, a, 'patrol', 'marker:rally')) { a.bb[CB.rally] = m.id; a.bb[CB.rallyRecruit] = m.id; sent++; }
    }
  }
}
