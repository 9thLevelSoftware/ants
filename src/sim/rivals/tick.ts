// The per-tick rivals system body: real nests not built at creation (saves from before prepare.ts), deaths watched
// every tick, territory deposits every second, the fielding pass and its observers every FIELD_EVERY_TICKS, and the hard ant cap.

import type { Sim } from '@/sim/types';
import { FIELD_EVERY_TICKS, FIELD_OFFSET, TERR_DEPOSIT_EVERY_TICKS, TERR_DEPOSIT_OFFSET } from '@/sim/balance/rivals';
import { enforceCap, fieldingPass } from './fielding';
import { watchQueens } from './lifecycle';
import { playerRallyRaid, raidProgress } from './raids';
import { updateAlerts } from './report';
import { setupRivalNest } from './setup';
import { colExt, rivalColonies } from './state';
import { depositMarks } from './territory';
import { reclaimAgents, watchDeaths, watchFights, watchNests, watchTheft } from './watch';

export function rivalsTick(sim: Sim): void {
  const tick = sim.state.tick;
  for (const col of rivalColonies(sim)) if (!colExt(sim.state, col.id).setupDone) setupRivalNest(sim, col);
  watchDeaths(sim);
  if (tick % TERR_DEPOSIT_EVERY_TICKS === TERR_DEPOSIT_OFFSET) depositMarks(sim);
  if (tick % FIELD_EVERY_TICKS === FIELD_OFFSET) {
    watchQueens(sim);
    watchTheft(sim);
    watchNests(sim);
    watchFights(sim);
    reclaimAgents(sim);
    playerRallyRaid(sim);
    raidProgress(sim);
    fieldingPass(sim);
    updateAlerts(sim);
  }
  enforceCap(sim);
}
