// `idle` and `rest` (GDD 02 §10.11). Idle workers walk home if outside, then wander slowly in a rest / general
// chamber near the colony centre (else the entrance chamber, where returning foragers find them as liquid
// receivers, §5.3), with ambient trophallaxis as a visual event; the allocator re-evaluates them every
// IDLE_REEVAL_S. `rest` as a task is the rest state of common.ts. Queens with task `idle` run queen.ts.

import type { Ant, Behaviour, Sim } from '@/sim/types';
import { rngChance } from '@/core/rng';
import { navWander } from '@/sim/locomotion';
import { requestTask } from '@/sim/colony';
import {
  AMBIENT_TROPH_IDLE_MIN, AMBIENT_TROPH_RADIUS_BU, IDLE_CYCLE_S, IDLE_RECENTRE_FRAC, IDLE_SPEED_MULT, IDLE_STILL_BU, IDLE_WANDER_FRAC,
  ROOM_WAIT_FRAC,
  WAIT_THINK_TICKS,
} from '@/sim/balance/nestwork';
import { secondsToTicks, TICKS_PER_SECOND } from '@/sim/time';
import { needsRest, recover, releaseAll, think } from './common';
import { evacuationOpen } from './board';
import { B, bbv, setState, waitThink } from './fsm';
import { homeNest, restChamber } from './places';
import { queenEnter, queenUpdate } from './queen';
import { act, entity, resetTravel, travel } from './travel';

const scratch: number[] = [];

function ambientTrophallaxis(sim: Sim, ant: Ant): void {
  const p = WAIT_THINK_TICKS / (AMBIENT_TROPH_IDLE_MIN * 60 * TICKS_PER_SECOND);
  if (!rngChance(sim.stream('rng.behaviour'), p)) return;
  scratch.length = 0;
  sim.index.queryAnts(ant.pos, AMBIENT_TROPH_RADIUS_BU * sim.world.bu, scratch);
  for (const id of scratch) {
    const o = sim.stores.ants.get(id);
    if (o && o.id !== ant.id && o.colony === ant.colony && o.task === 'idle') {
      sim.emit({ type: 'trophallaxis', donorId: ant.id, receiverId: o.id, amount: 0, ambient: true });
      return;
    }
  }
}

/** bb: where the ant stood when its idle cycle began (x, y, z). */
const CX = 'bn.icx', CY = 'bn.icy', CZ = 'bn.icz';

function idleStep(sim: Sim, ant: Ant): void {
  if (ant.carry.kind !== 'none') { act(sim, ant, 'put-down', null); return; }
  // brood in rising water and not enough nurses to carry it out: every idle hand helps (GDD 03 §11.3)
  const home = homeNest(sim, ant);
  if (home && home.flood.water > 0 && evacuationOpen(sim, ant.colony, home.id)) { requestTask(sim, ant, 'nurse', 'alarm'); return; }
  if (needsRest(ant)) { setState(sim, ant, 'rest', 'fatigue'); return; }
  if (sim.state.tick - ant.stateTick > secondsToTicks(IDLE_CYCLE_S)) {
    // a whole cycle of wandering that left the ant where it was (locomotion could not move it: int-1B-sim saw idle
    // ants stand at one spot of a woodland nest for days with nav `moving`): walk back to the room centre on a
    // planned path in the next cycle instead of wandering again
    const still = Math.hypot(ant.pos.x - bbv(ant, CX, NaN), ant.pos.y - bbv(ant, CY, NaN), ant.pos.z - bbv(ant, CZ, NaN))
      < IDLE_STILL_BU * sim.world.bu;
    setState(sim, ant, 'idle');
    ant.bb[CX] = ant.pos.x; ant.bb[CY] = ant.pos.y; ant.bb[CZ] = ant.pos.z;
    if (still && ant.chamberId >= 0) { ant.bb[B.n] = 2; resetTravel(ant); }
    return;
  }
  const nest = homeNest(sim, ant);
  const room = nest ? restChamber(sim, nest) : undefined;
  if (!room) return;
  if (ant.chamberId !== room.id) {
    ant.bb[B.n] = 0;
    if (travel(sim, ant, entity('chamber', room.id, room.center), ROOM_WAIT_FRAC * Math.min(room.radii.x, room.radii.z)) === 'failed') {
      recover(sim, ant, 'idle', 'stuck', true);
    }
    return;
  }
  // B.n: 0 = start a wander, 1 = wandering, 2 = the wander failed (locomotion could not move the walker, e.g. on a
  // fin of wall): walk back toward the centre on a planned path first
  if (bbv(ant, B.n, 0) === 1 && ant.nav.status === 'failed') { ant.bb[B.n] = 2; resetTravel(ant); }
  if (bbv(ant, B.n, 0) === 2) {
    const st = travel(sim, ant, entity('chamber', room.id, room.center), IDLE_RECENTRE_FRAC * Math.min(room.radii.x, room.radii.z));
    if (st === 'failed') { recover(sim, ant, 'idle', 'stuck', true); return; }
    if (st !== 'arrived') return;
    ant.bb[B.n] = 0;
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
