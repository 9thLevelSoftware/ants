// Messor founding variation (GDD 06 §5.15, GDD 07 §5.3.3): the autumn founding's first-brood time-lapse may reach
// winter. When the rest begins during the lapse (the first tick of winter, or earlier when the colony's brood module
// arrests the larvae for the winter, its diapause from DIAPAUSE_DOY: GDD 07 "autumn eggs develop until the cell falls
// below 14 °C, are held through winter") the aggregate winter step is applied to the queen and her brood only:
// brood arrested (no development is simulated across the jump), the queen's reserve drains at her winter rate (founding upkeep x FOUND_WINTER_UPKEEP_FACTOR) for the days skipped, each brood item survives with
// FOUND_WINTER_BROOD_SURVIVAL, and the calendar moves to the first tick of spring; the lapse then continues in spring
// until the first eclosion. Registered as a system by the granary module (src/sim/species/modules/granary/index.ts).

import { rngFloat } from '@/core/rng';
import type { Sim, System } from '@/sim/types';
import { BroodFlag } from '@/sim/types';
import { timeHandlers } from '@/sim/environment';
import { calendarTick, currentSeason, currentYear, TICKS_PER_DAY } from '@/sim/time';
import { FOUND_WINTER_BROOD_SURVIVAL } from '@/sim/balance/species-harvester';
import { FOUND_WINTER_UPKEEP_FACTOR } from '@/sim/balance/founding';
import { broodDies } from '../../brood';
import { ticksToSpring } from '../../overwinter/begin';
import { reserveDrainPerGd } from '../exposure';
import { bbGet, bbSet, foundingQueen, openingOf, playerColonyOf } from '../access';

/** Queen bb key: calendar year whose winter the lapse already jumped. */
const JUMPED = 'mb.lapseWinter';

/** Species that winter inside the founding lapse. */
const SPECIES = new Set(['messor-barbarus']);

/** Whether the jump is due now: player Messor founding in its time-lapse, the rest begun, not jumped this year. */
export function lapseWinterDue(sim: Sim): boolean {
  const op = openingOf(sim);
  const col = playerColonyOf(sim);
  const q = foundingQueen(sim);
  if (!op || op.phase !== 'timelapse' || !col || !q || !SPECIES.has(col.species)) return false;
  if (bbGet(q, JUMPED, -1) === currentYear(sim.state)) return false;
  if (currentSeason(sim.state) === 'winter') return true;
  if (currentSeason(sim.state) !== 'autumn') return false;
  for (const b of sim.stores.brood.list) if (b.alive && b.colony === col.id && (b.flags & BroodFlag.DIAPAUSE) !== 0) return true;
  return false;
}

/** The winter step inside the lapse; returns the game days jumped (0: nothing done). */
export function lapseWinterJump(sim: Sim): number {
  if (!lapseWinterDue(sim)) return 0;
  const col = playerColonyOf(sim)!;
  const q = foundingQueen(sim)!;
  const jump = ticksToSpring(sim);
  const days = jump / TICKS_PER_DAY;
  const year = currentYear(sim.state);
  const f = q.queen?.founding;
  // the drain at the winter rate also for the late-autumn days of the rest (reserveDrainPerGd applies it in winter)
  const winterRate = currentSeason(sim.state) === 'winter' ? 1 : FOUND_WINTER_UPKEEP_FACTOR;
  if (f) f.reserveLoads -= reserveDrainPerGd(sim, q) * winterRate * days;
  const rng = sim.stream('rng.opening');
  for (const b of [...sim.stores.brood.list]) {
    if (b.alive && b.colony === col.id && rngFloat(rng) >= FOUND_WINTER_BROOD_SURVIVAL) broodDies(sim, b, 'temperature');
  }
  timeHandlers['cheat.setTime']!(sim, { type: 'cheat.setTime', tick: calendarTick(sim.state) + jump });
  col.foundedTick -= jump;
  for (const a of sim.stores.ants.list) if (a.alive && a.colony === col.id) a.bornTick -= jump;
  bbSet(q, JUMPED, year);
  const tl = sim.state.player.timelapse;
  sim.emit({ type: 'opening.timelapse', kind: 'beat', p: tl?.progress ?? 0, spanGd: tl ? (tl.endTick - tl.startTick) / TICKS_PER_DAY : 0, hazard: null });
  return days;
}

export const messorLapseWinterSystem: System = {
  name: 'messor-lapse-winter', phase: 'queen',
  run(sim) { lapseWinterJump(sim); },
};
