// The `midden-blocked` flag (GDD 02 §10.8 "midden unreachable -> drop in a dead-end tunnel and flag
// midden-blocked"; §14 diag-hygiene factor) and its alert. Blocked while the colony has workers but none of its
// nests has an open entrance or a `midden` chamber (nowhere to take waste and soil), or for MIDDEN_REPORT_HOLD_S
// after a hauler reported dropping at the internal dump (nest internalDumpSite). Evaluated on the colony cycle;
// the flag and the report tick live in Colony.core.acc (persisted), so it survives save/load.

import type { Colony, Sim } from '@/sim/types';
import { MIDDEN_REPORT_HOLD_S } from '@/sim/balance';
import { secondsToTicks } from '@/sim/time';
import { accGet, accSet, coreOf } from './core';
import { colonyAlert, colonyClearAlert } from './alerts';
import { foundingInProgress } from './founding/access';

const FLAG = 'midden.blocked', REPORT = 'midden.reportTick';

/** Is the colony's midden blocked now (the flag as last evaluated)? */
export function isMiddenBlocked(col: Colony): boolean {
  return accGet(coreOf(col), FLAG) === 1;
}

/**
 * A hauler of the colony could not reach the midden and dropped its load at the internal dump: the flag is set
 * (at once) and held for MIDDEN_REPORT_HOLD_S. False for an unknown colony.
 */
export function reportMiddenBlocked(sim: Sim, colonyId: number): boolean {
  const col = sim.stores.colonies.get(colonyId);
  if (!col) return false;
  accSet(coreOf(col), REPORT, sim.state.tick + 1); // + 1: tick 0 is a real report
  updateMiddenBlocked(sim, col);
  return true;
}

/** Nowhere to take waste: no open entrance and no midden chamber in any of the colony's nests. */
function noMiddenRoute(sim: Sim, col: Colony): boolean {
  for (const id of col.nestIds) {
    const n = sim.stores.nests.get(id);
    if (!n || !n.alive) continue;
    if (n.entrances.some((e) => e.status === 'open') || n.chambers.some((c) => c.type === 'midden')) return false;
  }
  return true;
}

/** Re-evaluates the flag; on a change emits `midden-blocked` and raises or clears the alert (player colony). */
export function updateMiddenBlocked(sim: Sim, col: Colony): void {
  const core = coreOf(col);
  const reported = accGet(core, REPORT);
  const recent = reported > 0 && sim.state.tick - (reported - 1) < secondsToTicks(MIDDEN_REPORT_HOLD_S);
  // the claustral founding keeps its plug in on purpose: no false alarm while the opening runs (founding-close §4)
  const blocked = core.workers > 0 && !foundingInProgress(sim, col.id) && (noMiddenRoute(sim, col) || recent);
  if (blocked === isMiddenBlocked(col)) return;
  accSet(core, FLAG, blocked ? 1 : 0);
  sim.emit({ type: 'midden-blocked', colonyId: col.id, blocked });
  if (!col.isPlayer) return;
  if (blocked) colonyAlert(sim, 'midden-blocked', 'notice', col.id, 'Waste cannot leave the nest', 'no open entrance: haulers drop it in a dead-end tunnel', 'diag-hygiene');
  else colonyClearAlert(sim, 'midden-blocked', col.id);
}
