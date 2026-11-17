// Learned rejection of harmful plants (GDD 07 §6.4.5): every rejectCheckGd each garden records its health; if it fell
// by at least rejectHealthDrop over the last rejectWindowGd and a plant supplied at least rejectShare of its
// substrate over that window with leafT >= rejectToxin or leafP >= rejectProtein, that plant is rejected
// colony-wide for rejectGd (event `plant-rejected`): cutters refuse it. Plant ids: world object ids; herbage
// patches carry negative ids below -1 (see leaves.ts).

import type { Colony, GardenRecord, Sim } from '@/sim/types';
import { TICKS_PER_DAY } from '@/sim/time';
import type { FungusParams } from './params';
import { plantShares } from './substrate';

const checkTicks = (P: FungusParams) => Math.max(1, Math.round(P.rejectCheckGd * TICKS_PER_DAY));

/** Records the garden's health at each check time (aligned to the check period); true when a new slot began. */
export function recordHealth(sim: Sim, g: GardenRecord, P: FungusParams): boolean {
  const every = checkTicks(P);
  const slot = Math.floor(sim.state.tick / every);
  const log = (g.healthLog ??= []);
  // one entry per check slot: the log holds the health at the first step of each slot (index = slot order)
  if ((g.healthSlot ?? -1) === slot) return false;
  g.healthSlot = slot;
  log.push(g.health);
  const keep = Math.round(P.rejectWindowGd / P.rejectCheckGd) + 1;
  while (log.length > keep) log.shift();
  return true;
}

/** Whether the plant is rejected now. */
export function isRejected(col: Colony, plantId: number, tick: number): boolean {
  for (const r of col.fungus?.rejected ?? []) if (r.plantId === plantId && r.untilTick > tick) return true;
  return false;
}

/** The checks of one garden (run when it has just logged a new slot). */
export function checkRejection(sim: Sim, col: Colony, g: GardenRecord, P: FungusParams): void {
  const log = g.healthLog ?? [];
  if (log.length < 2) return;
  const drop = Math.max(...log) - g.health;
  if (drop < P.rejectHealthDrop) return;
  const mod = col.fungus!;
  const tick = sim.state.tick;
  for (const s of plantShares(g, tick, P.rejectWindowGd)) {
    if (s.share < P.rejectShare) continue;
    const reason = s.t >= P.rejectToxin ? 'toxin' : s.p >= P.rejectProtein ? 'protein' : null;
    if (!reason || isRejected(col, s.plantId, tick)) continue;
    const untilTick = tick + Math.round(P.rejectGd * TICKS_PER_DAY);
    mod.rejected = mod.rejected.filter((r) => r.untilTick > tick);
    mod.rejected.push({ plantId: s.plantId, untilTick });
    (mod.rejectLog ??= []).push({ plantId: s.plantId, tick, reason });
    sim.emit({ type: 'plant-rejected', plantId: s.plantId, reason, untilTick });
  }
}
