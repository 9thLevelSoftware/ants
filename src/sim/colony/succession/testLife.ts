// Test kit of the lifecycle tests: a colony-core test sim with the overwinter, reproduction and succession systems,
// an established queen in a royal chamber, a nursery, workers, larvae and stores, and a constant chamber climate.
import type { Command, Sim } from '@/sim/types';
import { addBrood, addChamber, addEntrance, addWorkers, careSystem, colonyOf, establishQueen, makeColonySim, step } from '../testkit';
import { overwinterSystem } from '../overwinter';
import { reproductionSystem } from '../reproduction';
import { successionSystem } from './system';
import { locomotionSystem } from '@/sim/locomotion';

export interface LifeSimOptions {
  workers?: number;
  larvae?: number;
  pupae?: number;
  c?: number;
  p?: number;
  /** Chamber temperature, C (constant). */
  chamberC?: number;
  seed?: number;
  summerDay?: number;
  /** Scripted nurses (colony testkit): tend, feed larvae and the queen, assist eclosion, the queen lays. */
  care?: boolean;
  /** Add the locomotion system (the possessed flight is moved by its movement override). */
  locomotion?: boolean;
}

export function makeLifeSim(o: LifeSimOptions = {}): Sim {
  const t = o.chamberC ?? 5;
  const sim = makeColonySim({
    seed: o.seed ?? 1, summerDay: o.summerDay,
    extra: [
      ...(o.care ? [careSystem({ tend: true, assist: true, feedLarvae: true, feedQueen: true, lay: true })] : []),
      ...(o.locomotion ? [locomotionSystem] : []),
      overwinterSystem, reproductionSystem, successionSystem,
    ],
    climate: { chamberTemp: () => t, pointTemp: () => t },
  });
  const q0 = sim.stores.ants.get(colonyOf(sim).queenId)!;
  const royal = addChamber(sim, 'royal', { ...q0.pos, y: q0.pos.y - 40 });
  const nursery = addChamber(sim, 'nursery', { x: q0.pos.x + 30, y: q0.pos.y - 40, z: q0.pos.z });
  addEntrance(sim, { ...q0.pos });
  establishQueen(sim, royal);
  addWorkers(sim, o.workers ?? 18, { chamber: royal, lifespanGd: 60 });
  if ((o.larvae ?? 20) > 0) addBrood(sim, 'larva', o.larvae ?? 20, nursery, 0.2);
  if ((o.pupae ?? 0) > 0) addBrood(sim, 'pupa', o.pupae ?? 0, nursery, 0.2);
  const col = colonyOf(sim);
  col.stores.c = o.c ?? 10;
  col.stores.p = o.p ?? 4;
  sim.state.player.opening = null;
  return sim;
}

export function send(sim: Sim, cmd: Command, ticks = 1): void {
  sim.enqueue(cmd);
  step(sim, ticks);
}

export function living(sim: Sim, caste?: string): number {
  const col = colonyOf(sim);
  return sim.state.ants.filter((a) => a.alive && a.colony === col.id && (!caste || a.caste === caste)).length;
}

export { colonyOf, step };
