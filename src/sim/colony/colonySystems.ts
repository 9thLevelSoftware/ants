// The colony systems and their cadences (GDD 02 §0.2): allocation every ALLOC_PERIOD, idle re-evaluation every
// IDLE_REEVAL_S (staggered), queen / brood / physiology on the staggered slow tick (id mod PHYSIO_EVERY),
// the colony cycle at the end of each stagger cycle, statistics hourly, diagnostics every DIAGNOSTICS_EVERY.

import type { Colony, ColonyCoreState, Sim, SpeciesDef, System } from '@/sim/types';
import {
  ALLOC_EVERY, ALLOC_OFFSET, COLONY_DIAGNOSTICS_OFFSET, COLONY_STATS_OFFSET, DIAGNOSTICS_EVERY, HOURLY_EVERY, PHYSIO_EVERY,
} from '@/sim/balance';
import { accAdd } from './core';
import { allocateColony, isSurplusRun, reevaluateIdle } from './allocation';
import { broodStep, flushBroodAcc, newBroodAcc, type BroodAcc } from './brood';
import { closeColonyCycle, colonyTick } from './economy';
import { newPhysioAcc, physiologyStep, settlePhysioAcc, type PhysioAcc } from './physiology';
import { queenStep } from './queen';
import { sampleHour } from './stats';
import { runColonyDiagnostics } from './diagnostics';
import { watchColonyEvents } from './deaths';

export interface LiveColony {
  col: Colony;
  core: ColonyCoreState;
  def: SpeciesDef;
}

const liveCache = new WeakMap<Sim, { tick: number; list: LiveColony[]; byId: Map<number, LiveColony> }>();

/** Full-fidelity living colonies with species data, prepared for this tick (core created, day rolled). */
export function liveColonies(sim: Sim): { list: LiveColony[]; byId: Map<number, LiveColony> } {
  const hit = liveCache.get(sim);
  if (hit && hit.tick === sim.state.tick) return hit;
  watchColonyEvents(sim);
  const list: LiveColony[] = [];
  const byId = new Map<number, LiveColony>();
  for (const col of sim.state.colonies) {
    if (!col.alive || col.fidelity !== 'full') continue;
    const def = sim.getSpecies(col.species);
    if (!def) continue;
    const lc = { col, core: colonyTick(sim, col), def };
    list.push(lc);
    byId.set(col.id, lc);
  }
  const v = { tick: sim.state.tick, list, byId };
  liveCache.set(sim, v);
  return v;
}

/** Task allocation: demand, targets, actual counts (GDD 02 §6.2-6.3) and the 120 s surplus check. */
export const allocationSystem: System = {
  name: 'allocation', phase: 'colony-allocation', every: ALLOC_EVERY, offset: ALLOC_OFFSET,
  run: (sim) => {
    const surplus = isSurplusRun(sim.state.tick, ALLOC_EVERY);
    for (const lc of liveColonies(sim).list) allocateColony(sim, lc.col, lc.def, surplus);
  },
};

/** Idle ants re-evaluate their task every IDLE_REEVAL_S, staggered (GDD 02 §6.5). */
export const taskReevalSystem: System = {
  name: 'task-reeval', phase: 'colony-allocation', every: PHYSIO_EVERY,
  run: (sim) => {
    for (const lc of liveColonies(sim).list) reevaluateIdle(sim, lc.col, lc.def, PHYSIO_EVERY);
  },
};

/** Queen laying potential, egg budget, nutrition (GDD 02 §3), staggered slow tick. */
export const queenSystem: System = {
  name: 'queen', phase: 'queen',
  run: (sim) => {
    const bucket = sim.state.tick % PHYSIO_EVERY;
    for (const lc of liveColonies(sim).list) {
      const q = sim.stores.ants.get(lc.col.queenId);
      if (!q || !q.queen) {
        if (lc.col.orphanedAtTick < 0 && lc.col.queens.length > 0) lc.col.orphanedAtTick = sim.state.tick;
        continue;
      }
      if (q.id % PHYSIO_EVERY === bucket) queenStep(sim, q, lc.col, lc.core, lc.def, PHYSIO_EVERY);
    }
  },
};

/** Brood development, digestion, hazards, stage changes (GDD 02 §2), staggered slow tick. */
export const broodSystem: System = {
  name: 'brood', phase: 'brood',
  run: (sim) => {
    const every = PHYSIO_EVERY;
    const bucket = sim.state.tick % every;
    const { list: cols, byId } = liveColonies(sim);
    const accs = new Map<number, BroodAcc>();
    for (const lc of cols) accs.set(lc.col.id, newBroodAcc());
    const list = sim.stores.brood.list;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (!b.alive || b.id % every !== bucket) continue;
      const lc = byId.get(b.colony);
      if (lc) broodStep(sim, b, lc.col, lc.core, lc.def, every, accs.get(b.colony)!);
    }
    for (const lc of cols) flushBroodAcc(lc.core, accs.get(lc.col.id)!);
  },
};

/** Adult physiology (staggered) and, at the end of each stagger cycle, the colony economy cycle. */
export const economySystem: System = {
  name: 'economy', phase: 'colony-economy',
  run: (sim) => {
    const every = PHYSIO_EVERY;
    const bucket = sim.state.tick % every;
    const { list: cols, byId } = liveColonies(sim);
    const accs = new Map<number, PhysioAcc>();
    for (const lc of cols) accs.set(lc.col.id, newPhysioAcc(lc.col));
    const ants = sim.stores.ants.list;
    for (let i = 0; i < ants.length; i++) {
      const a = ants[i];
      if (!a.alive || a.caste === 'queen' || a.id % every !== bucket) continue;
      const lc = byId.get(a.colony);
      if (lc) physiologyStep(sim, a, lc.col, lc.def, every, accs.get(a.colony)!);
    }
    for (const lc of cols) {
      const acc = accs.get(lc.col.id)!;
      settlePhysioAcc(lc.col, acc);
      accAdd(lc.core, 'cyc.upkeepC', acc.upkeepC);
      accAdd(lc.core, 'cyc.alateC', acc.alateC);
      accAdd(lc.core, 'cyc.cropC', acc.cropC);
      accAdd(lc.core, 'cyc.cropP', acc.cropP);
      accAdd(lc.core, 'cyc.starving', acc.starving);
    }
    if (bucket === every - 1) for (const lc of cols) closeColonyCycle(sim, lc.col, lc.core, lc.def);
  },
};

/** Hourly statistics of the player colony (GDD 02 §13.2). */
export const colonyStatsSystem: System = {
  name: 'colony-stats', phase: 'colony-economy', every: HOURLY_EVERY, offset: COLONY_STATS_OFFSET,
  run: (sim) => {
    liveColonies(sim);
    sampleHour(sim);
  },
};

/** Colony diagnostics of the player colony (GDD 02 §14). Runs before progression aggregates them. */
export const colonyDiagnosticsSystem: System = {
  name: 'colony-diagnostics', phase: 'colony-economy', every: DIAGNOSTICS_EVERY, offset: COLONY_DIAGNOSTICS_OFFSET,
  run: (sim) => {
    const lc = liveColonies(sim).byId.get(sim.state.colonies[0]?.id ?? -1);
    if (lc && lc.col.isPlayer) runColonyDiagnostics(sim, lc.col, lc.def);
  },
};
