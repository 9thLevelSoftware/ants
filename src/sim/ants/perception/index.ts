// Perception (GDD 02 §7; owner: beh-forage). A staggered system senses for every ant outside the nest and for
// every outdoor-task ant (scout, forage, tend) inside it, every PERCEPTION_EVERY ticks (ant id offsets the turn),
// and stores a compact percept in ant.bb (keys.ts). Behaviours read the percept through the getters below; a
// behaviour that needs a fresh reading at a decision point calls perceiveNow.
//
// Foragers and scouts outside also mark the coarse cell they stand in on their colony's explored bitmap.

import type { Ant, Sim, System } from '@/sim/types';
import { AntFlag } from '@/sim/types';
import { PERCEPTION_EVERY } from '@/sim/balance/foraging';
import { markExplored } from './explored';
import { PC, THREAT, type ThreatCode } from './keys';
import { perceive } from './sense';

export { PC, THREAT, type ThreatCode } from './keys';
export { exploredCell, exploredCount, exploredSide, isExplored, markExplored } from './explored';

/** Tasks whose ants are perceived even inside the nest (they read the entrance and alarm before leaving). */
export function isOutdoorTask(task: string): boolean {
  return task === 'scout' || task === 'forage' || task === 'tend' || task === 'flee';
}

function wants(ant: Ant): boolean {
  if (!ant.alive || (ant.flags & AntFlag.DORMANT) !== 0) return false;
  return ant.nestId < 0 || isOutdoorTask(ant.task);
}

/** Senses now (outside the stagger), e.g. when a behaviour enters a state that decides on what it perceives. */
export function perceiveNow(sim: Sim, ant: Ant): void {
  perceive(sim, ant);
  if (ant.nestId < 0 && (ant.task === 'scout' || ant.task === 'forage' || ant.task === 'tend')) {
    const col = sim.stores.colonies.get(ant.colony);
    if (col) markExplored(sim, col, ant.pos.x, ant.pos.z);
  }
}

export const perceptionSystem: System = {
  name: 'perception-outdoor',
  phase: 'perception',
  run(sim) {
    const slot = sim.state.tick % PERCEPTION_EVERY;
    const list = sim.stores.ants.list;
    for (let i = 0; i < list.length; i++) {
      const ant = list[i];
      if (ant.id % PERCEPTION_EVERY !== slot || !wants(ant)) continue;
      perceiveNow(sim, ant);
    }
  },
};

// ---- read access (behaviours, inspect card, tests) ----

const num = (ant: Ant, k: string, d: number): number => {
  const v = ant.bb[k];
  return v === undefined ? d : v;
};

/** Whether the ant has a percept at all (perceived at least once). */
export function hasPercept(ant: Ant): boolean {
  return num(ant, PC.tick, -1) >= 0;
}
export function touchedSource(ant: Ant): number { return num(ant, PC.touch, -1); }
export function smelledSource(ant: Ant): number { return num(ant, PC.smell, -1); }
export function smelledDistance(ant: Ant): number { return num(ant, PC.smellD, 0); }
export function nestmatesMet(ant: Ant): number { return num(ant, PC.mates, 0); }
export function aliensMet(ant: Ant): number { return num(ant, PC.aliens, 0); }
export function trailHere(ant: Ant): number { return num(ant, PC.trail, 0); }
export function homeHere(ant: Ant): number { return num(ant, PC.home, 0); }
export function alarmHere(ant: Ant): number { return num(ant, PC.alarm, 0); }
export function forageMarkerHere(ant: Ant): number { return num(ant, PC.forageMarker, -1); }
export function avoidMarkerNear(ant: Ant): number { return num(ant, PC.avoidMarker, -1); }
export function threatCode(ant: Ant): ThreatCode { return num(ant, PC.threat, THREAT.none) as ThreatCode; }
export function threatX(ant: Ant): number { return num(ant, PC.threatX, 0); }
export function threatZ(ant: Ant): number { return num(ant, PC.threatZ, 0); }
export function nearestEntranceId(ant: Ant): number { return num(ant, PC.entrance, -1); }
export function nearestEntranceDist(ant: Ant): number { return num(ant, PC.entranceD, 0); }

export const systems: readonly System[] = [perceptionSystem];
