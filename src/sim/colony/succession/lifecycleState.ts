// The colony's lifecycle bookkeeping (`Colony.lifecycle`, src/sim/types/lifecycle.ts): created on first use, shared by
// the overwinter, reproduction and succession folders.

import type { Colony, ColonyLifecycleState, ReproBook, Sim, SuccessionBook } from '@/sim/types';
import { SEASONS } from '@/sim/types';
import { currentDayOfYear, currentSeason, currentYear } from '@/sim/time';

export function newReproBook(): ReproBook {
  return {
    windowYear: 0, quotaGynes: 0, quotaMales: 0, designatedGynes: 0, designatedMales: 0, scanTick: -1, gateDay: -1,
    gateFails: [], rollDay: -1, lastP: 0, askTick: -1, launchAtTick: -1, assemblyUntil: -1, flightSeq: 0, openFlightId: '', openFounded: 0, alatesReared: 0, alatesFlown: 0,
    flights: 0, daughtersFounded: 0, shortfallLoads: 0, demoted: 0, expiredYear: 0, flownByCause: {}, flownBySeason: [0, 0, 0, 0],
  };
}

export function newSuccessionBook(): SuccessionBook {
  return {
    queenDiedTick: -1, queenCause: '', queenChain: [], emptySinceTick: -1, extinct: false, extinctTick: -1, extinctCause: '',
    causeChain: [], retired: false, lastAnts: false, peakWorkers: 0, peakYear: 0, born: 0, foodC: 0, foodP: 0,
    peakVolume: 0, peakChambers: 0, sampleDays: [], sampleTicks: [], trackDay: -1, queenDied: null,
  };
}

export function newLifecycleState(): ColonyLifecycleState {
  return {
    winters: [], bannerTick: -1, delayUntilTick: -1, noticeYear: 0, repro: newReproBook(), flight: null, flights: [],
    daughters: [], succession: newSuccessionBook(), founded: null,
  };
}

/** The colony's lifecycle record, created on first use. */
export function lifecycleOf(col: Colony): ColonyLifecycleState {
  col.lifecycle ??= newLifecycleState();
  return col.lifecycle;
}

/** The player's colony (colonies[0]) whether alive or not, undefined when there is none. */
export function playerCol(sim: Sim): Colony | undefined {
  return sim.state.colonies.find((c) => c.id === sim.state.player.colonyId) ?? sim.state.colonies[0];
}

/** Books an alate leaving on a flight (removed with death cause `cause`) so the epitaph can keep it apart. */
export function bookFlown(sim: Sim, col: Colony, cause: string): void {
  const book = lifecycleOf(col).repro;
  const by = (book.flownByCause ??= {});
  by[cause] = (by[cause] ?? 0) + 1;
  const season = (book.flownBySeason ??= [0, 0, 0, 0]);
  season[SEASONS.indexOf(currentSeason(sim.state))]++;
}

/** Calendar stamp of the current tick. */
export function stampNow(sim: Sim): { tick: number; doy: number; year: number } {
  return { tick: sim.state.tick, doy: currentDayOfYear(sim.state), year: currentYear(sim.state) };
}

/** The opening is over (handed over or done): the colony's own life (winter, flights, succession) runs. */
export function openingOver(sim: Sim): boolean {
  const op = sim.state.player.opening;
  return !op || op.done || op.phase === 'handover' || op.phase === 'done';
}
