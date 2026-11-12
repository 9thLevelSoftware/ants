// `idle` and `rest` (GDD 02 §10.11). Idle workers walk home if outside, then wander slowly in a rest / general
// chamber near the colony centre (else the entrance chamber, where returning foragers find them as liquid
// receivers, §5.3), with ambient trophallaxis as a visual event; the allocator re-evaluates them every
// IDLE_REEVAL_S. `rest` as a task is the rest state of common.ts. Queens with task `idle` run queen.ts.

import type { Ant, Behaviour, Sim } from '@/sim/types';
import { rngChance } from '@/core/rng';
import { navWander } from '@/sim/locomotion';
import { requestTask } from '@/sim/colony';
import { AMBIENT_TROPH_IDLE_MIN, IDLE_CYCLE_S, IDLE_SPEED_MULT, IDLE_WANDER_FRAC, WAIT_THINK_TICKS } from '@/sim/balance/nestwork';
import { secondsToTicks, TICKS_PER_SECOND } from '@/sim/time';
import { needsRest, recover, releaseAll, think } from './common';
import { B, bbv, setState, waitThink } from './fsm';
import { homeNest, restChamber } from './places';
import { queenEnter, queenUpdate } from './queen';
import { act, entity, travel } from './travel';

const scratch: number[] = [];

function ambientTrophallaxis(sim: Sim, ant: Ant): void {
  const p = WAIT_THINK_TICKS / (AMBIENT_TROPH_IDLE_MIN * 60 * TICKS_PER_SECOND);
  if (!rngChance(sim.stream('rng.behaviour'), p)) return;
  scratch.length = 0;
  sim.index.queryAnts(ant.pos, 1.5 * sim.world.bu, scratch);
  for (const id of scratch) {
    const o = sim.stores.ants.get(id);
    if (o && o.id !== ant.id && o.colony === ant.colony && o.task === 'idle') {
      sim.emit({ type: 'trophallaxis', donorId: ant.id, receiverId: o.id, amount: 0, ambient: true });
      return;
    }
  }
}

function idleStep(sim: Sim, ant: Ant): void {
  if (ant.carry.kind !== 'none') { act(sim, ant, 'put-down', null); return; }
  if (needsRest(ant)) { setState(sim, ant, 'rest', 'fatigue'); return; }
  if (sim.state.tick - ant.stateTick > secondsToTicks(IDLE_CYCLE_S)) { setState(sim, ant, 'idle'); return; }
  const nest = homeNest(sim, ant);
  const room = nest ? restChamber(sim, nest) : undefined;
  if (!room) return;
  if (ant.chamberId !== room.id) {
    ant.bb[B.n] = 0;
    if (travel(sim, ant, entity('chamber', room.id, room.center), 0.5 * Math.min(room.radii.x, room.radii.z)) === 'failed') {
      recover(sim, ant, 'idle', 'stuck', true);
    }
    return;
  }
  if (bbv(ant, B.n, 0) === 0) {
    navWander(sim, ant, room.center, IDLE_WANDER_FRAC * Math.min(room.radii.x, room.radii.z), { speedMult: IDLE_SPEED_MULT });
    ant.bb[B.n] = 1;
  }
  ambientTrophallaxis(sim, ant);
  waitThink(sim, ant);
}

export const idleBehaviour: Behaviour = {
  task: 'idle',
  enter: (sim, ant) => {
    if (ant.caste === 'queen') { queenEnter(sim, ant); return; }
    setState(sim, ant, 'idle');
  },
  update: (sim, ant) => {
    if (ant.caste === 'queen') { queenUpdate(sim, ant); return; }
    if (ant.caste !== 'worker') return;
    think(sim, ant, 'idle', idleStep);
  },
  exit: (sim, ant) => releaseAll(sim, ant),
};

/** `rest` as an assigned task: rest until recovered, then hand the ant back to the allocator as idle. */
export const restBehaviour: Behaviour = {
  task: 'rest',
  enter: (sim, ant) => setState(sim, ant, 'rest'),
  update: (sim, ant) => {
    if (ant.state !== 'rest' && ant.carry.kind === 'none') { requestTask(sim, ant, 'idle', 'fatigue'); return; }
    think(sim, ant, 'idle', idleStep);
  },
  exit: (sim, ant) => releaseAll(sim, ant),
};
