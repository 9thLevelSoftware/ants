// Messor founding variation (GDD 06 §5.15, GDD 07 §5.3.3): the autumn founding's first-brood time-lapse may reach
// winter. When the rest begins during the lapse (the first tick of winter, or earlier when the colony's brood module
// arrests the larvae for the winter, its diapause from DIAPAUSE_DOY: GDD 07 "autumn eggs develop until the cell falls
// below 14 °C, are held through winter") the aggregate winter step is applied to the queen and her brood only:
// brood arrested (no development is simulated across the jump), the queen's reserve drains at her winter rate (founding upkeep x FOUND_WINTER_UPKEEP_FACTOR) for the days skipped, each brood item survives with
// FOUND_WINTER_BROOD_SURVIVAL, and the calendar moves to the first tick of spring. While the cell is still colder than
// FOUND_SPRING_RESUME_C the brood stays arrested and the lapse skips on in short steps (the spring hold); it then
// continues in spring until the first eclosion. Registered as a system by the granary module (src/sim/species/modules/granary/index.ts).

import { rngFloat } from '@/core/rng';
import type { Ant, Colony, Sim, System } from '@/sim/types';
import { BroodFlag } from '@/sim/types';
import { timeHandlers } from '@/sim/environment';
import { calendarTick, currentSeason, currentYear, TICKS_PER_DAY } from '@/sim/time';
import {
  FOUND_SPRING_HOLD_MAX_GD, FOUND_SPRING_HOLD_STEP_GD, FOUND_SPRING_RESUME_C, FOUND_WINTER_BROOD_SURVIVAL,
} from '@/sim/balance/species-harvester';
import { chamberTempC } from '../../envAdapter';
import { FOUND_WINTER_UPKEEP_FACTOR } from '@/sim/balance/founding';
import { broodDies } from '../../brood';
import { ticksToSpring } from '../../overwinter/begin';
import { reserveDrainPerGd } from '../exposure';
import { bbGet, bbSet, foundingQueen, openingOf, playerColonyOf } from '../access';

/** Queen bb key: calendar year whose winter the lapse already jumped. */
const JUMPED = 'mb.lapseWinter';
/** Queen bb key: game days the spring hold has skipped so far (-1: no hold pending). */
const HELD_GD = 'mb.springHeld';

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

/** Skips `ticks` of the lapse: the queen drains at `rateMult` x her founding rate, the clocks of her colony move along. */
function skipLapse(sim: Sim, col: Colony, q: Ant, ticks: number, rateMult: number): void {
  const f = q.queen?.founding;
  if (f) f.reserveLoads -= reserveDrainPerGd(sim, q) * rateMult * (ticks / TICKS_PER_DAY);
  timeHandlers['cheat.setTime']!(sim, { type: 'cheat.setTime', tick: calendarTick(sim.state) + ticks });
  col.foundedTick -= ticks;
  for (const a of sim.stores.ants.list) if (a.alive && a.colony === col.id) a.bornTick -= ticks;
}

function emitBeat(sim: Sim): void {
  const tl = sim.state.player.timelapse;
  sim.emit({ type: 'opening.timelapse', kind: 'beat', p: tl?.progress ?? 0, spanGd: tl ? (tl.endTick - tl.startTick) / TICKS_PER_DAY : 0, hazard: null });
}

/** The winter step inside the lapse; returns the game days jumped (0: nothing done). */
export function lapseWinterJump(sim: Sim): number {
  if (!lapseWinterDue(sim)) return 0;
  const col = playerColonyOf(sim)!;
  const q = foundingQueen(sim)!;
  const jump = ticksToSpring(sim);
  const year = currentYear(sim.state);
  // the drain at the winter rate also for the late-autumn days of the rest (reserveDrainPerGd applies it in winter)
  const winterRate = currentSeason(sim.state) === 'winter' ? 1 : FOUND_WINTER_UPKEEP_FACTOR;
  const rng = sim.stream('rng.opening');
  for (const b of [...sim.stores.brood.list]) {
    if (b.alive && b.colony === col.id && rngFloat(rng) >= FOUND_WINTER_BROOD_SURVIVAL) broodDies(sim, b, 'temperature');
  }
  skipLapse(sim, col, q, jump, winterRate);
  bbSet(q, JUMPED, year);
  bbSet(q, HELD_GD, 0);
  emitBeat(sim);
  return jump / TICKS_PER_DAY;
}

/** Temperature of the founding cell, °C (the queen's chamber, else the nest's founding chamber). */
function cellTempC(sim: Sim, col: Colony, q: Ant): number {
  const nest = sim.stores.nests.get(col.nestIds[0] ?? -1);
  const cell = nest?.chambers.find((c) => c.id === q.chamberId) ?? nest?.chambers.find((c) => c.type === 'founding') ?? nest?.chambers[0];
  return cell ? chamberTempC(sim, cell.id) : FOUND_SPRING_RESUME_C;
}

/**
 * The spring hold after the winter jump: while the cell is colder than FOUND_SPRING_RESUME_C the brood stays
 * arrested and the lapse skips ahead FOUND_SPRING_HOLD_STEP_GD at a time (queen drain at the winter rate), at most
 * FOUND_SPRING_HOLD_MAX_GD in all. Returns the game days skipped by this call.
 */
export function lapseSpringHold(sim: Sim): number {
  const op = openingOf(sim);
  const col = playerColonyOf(sim);
  const q = foundingQueen(sim);
  if (!op || op.phase !== 'timelapse' || !col || !q || !SPECIES.has(col.species)) return 0;
  let held = bbGet(q, HELD_GD, -1);
  if (held < 0) return 0;
  const step = Math.round(FOUND_SPRING_HOLD_STEP_GD * TICKS_PER_DAY);
  let skipped = 0;
  while (held < FOUND_SPRING_HOLD_MAX_GD && cellTempC(sim, col, q) < FOUND_SPRING_RESUME_C) {
    skipLapse(sim, col, q, step, FOUND_WINTER_UPKEEP_FACTOR);
    held += FOUND_SPRING_HOLD_STEP_GD;
    skipped += FOUND_SPRING_HOLD_STEP_GD;
  }
  bbSet(q, HELD_GD, -1);
  if (skipped > 0) emitBeat(sim);
  return skipped;
}

export const messorLapseWinterSystem: System = {
  name: 'messor-lapse-winter', phase: 'queen',
  run(sim) {
    lapseWinterJump(sim);
    lapseSpringHold(sim);
  },
};
