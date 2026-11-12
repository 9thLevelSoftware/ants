// Behaviour runner: for each autonomous ant on its think tick, runs the behaviour registered for its task
// (calling exit/enter when the task changes); possessed ants are skipped (contracts guidance §5, ruling 13).
//
// Registration: behaviour modules export `behaviours` arrays from src/sim/ants/behaviours/{outdoor,nest}/index.ts;
// src/sim/ants/index.ts concatenates them and systems.ts builds sim.behaviours (a BehaviourTable) from them.
//
// Runner state per ant lives in ant.bb: `run.task` = TASKS index of the behaviour that was entered (-1 none).
// A behaviour schedules its next think by setting ant.thinkTick; when it does not, the runner thinks again after
// BEHAVIOUR_THINK_TICKS.

import type { Ant, Behaviour, ColonySpeciesId, Sim, System, Task } from '@/sim/types';
import { AntFlag, TASKS, taskIndex } from '@/sim/types';
import { BEHAVIOUR_THINK_TICKS } from '@/sim/balance/actions';
import { DELIVER_FIRST_EXEMPT_TASKS, DELIVER_FIRST_MAX_S } from '@/sim/balance/ants';
import { secondsToTicks } from '@/sim/time';
import { ports } from './actions/ports';
import { reinferAfterLanding } from './player/release';

/** Used for every task without a registered behaviour: stand still, keeping the current (tangent) heading. */
export const defaultBehaviour: Behaviour = {
  task: 'idle',
  enter: (sim, ant) => ports.navStop(sim, ant),
  update: (sim, ant) => {
    if (ant.nav.status === 'moving') ports.navStop(sim, ant);
  },
  exit: () => {},
};

function speciesOf(sim: Sim, ant: Ant): ColonySpeciesId {
  return sim.stores.colonies.get(ant.colony)?.species ?? sim.species.id;
}

/** Behaviour that runs an ant's task (species-specific first), or the default. */
export function behaviourFor(sim: Sim, ant: Ant, task: Task): Behaviour {
  return sim.behaviours.get(task, speciesOf(sim, ant)) ?? defaultBehaviour;
}

/** The task whose behaviour is currently entered, or null. */
export function enteredTask(ant: Ant): Task | null {
  const i = ant.bb['run.task'] ?? -1;
  return i >= 0 && i < TASKS.length ? TASKS[i] : null;
}

/** Calls exit() of the entered behaviour (releasing its claims) and forgets it. Safe to call twice. */
export function exitBehaviour(sim: Sim, ant: Ant): void {
  const t = enteredTask(ant);
  ant.bb['run.task'] = -1;
  if (t !== null) behaviourFor(sim, ant, t).exit(sim, ant);
}

/** Makes the runner think for this ant on the next behaviour pass (after a release or a task change). */
export function thinkNow(sim: Sim, ant: Ant): void {
  ant.thinkTick = sim.state.tick;
}

/** bb key: tick a deliver-first hold began (-1 none). */
const DELIVER_SINCE = 'run.dlv';

/**
 * Deliver first (GDD 02 §10.0): the task changed while the entered behaviour is still delivering what the ant
 * carries. True = keep running the entered behaviour this think: while its delivery goes on, and for one more think
 * right after it ended (the behaviour concludes it: events, booking, its next state); false = switch now.
 */
function holdForDelivery(sim: Sim, ant: Ant, entered: Task): boolean {
  const b = behaviourFor(sim, ant, entered);
  const since = ant.bb[DELIVER_SINCE] ?? -1;
  const late = since >= 0 && sim.state.tick - since > secondsToTicks(DELIVER_FIRST_MAX_S);
  const exempt = (DELIVER_FIRST_EXEMPT_TASKS as readonly string[]).includes(ant.task);
  if (!late && !exempt && b.delivering?.(sim, ant)) {
    if (since < 0) ant.bb[DELIVER_SINCE] = sim.state.tick;
    return true;
  }
  ant.bb[DELIVER_SINCE] = -1;
  return since >= 0 && !late && !exempt;
}

/** The task this ant is still working at while it finishes a delivery for it (deliver first), or null. */
export function deliveringFor(ant: Ant): Task | null {
  return (ant.bb[DELIVER_SINCE] ?? -1) >= 0 ? enteredTask(ant) : null;
}

/** One think of one autonomous ant: switch behaviour if the task changed (after a delivery in hand), then update. */
export function runBehaviour(sim: Sim, ant: Ant): void {
  const tick = sim.state.tick;
  const entered = enteredTask(ant);
  if (entered === ant.task && (ant.bb[DELIVER_SINCE] ?? -1) >= 0) ant.bb[DELIVER_SINCE] = -1; // changed back meanwhile
  if (entered !== ant.task && entered !== null && holdForDelivery(sim, ant, entered)) {
    behaviourFor(sim, ant, entered).update(sim, ant);
    if (ant.thinkTick <= tick) ant.thinkTick = tick + BEHAVIOUR_THINK_TICKS;
    return;
  }
  if (entered !== ant.task) {
    if (entered !== null) behaviourFor(sim, ant, entered).exit(sim, ant);
    ant.bb['run.task'] = taskIndex(ant.task);
    ant.state = ant.task; // behaviours set their own '<task>.<state>' in enter()
    ant.stateTick = tick;
    behaviourFor(sim, ant, ant.task).enter(sim, ant);
    // enter() changed the task again (or the ant died / was possessed): the next think catches up
    if (ant.bb['run.task'] !== taskIndex(ant.task)) return;
  }
  if (!ant.alive || (ant.flags & AntFlag.POSSESSED) !== 0) return;
  behaviourFor(sim, ant, ant.task).update(sim, ant);
  if (ant.thinkTick <= tick) ant.thinkTick = tick + BEHAVIOUR_THINK_TICKS;
}

export const behaviourSystem: System = {
  name: 'behaviours',
  phase: 'behaviours',
  run(sim) {
    const tick = sim.state.tick;
    const list = sim.stores.ants.list;
    for (let i = 0; i < list.length; i++) {
      const ant = list[i];
      if (!ant.alive || (ant.flags & AntFlag.POSSESSED) !== 0 || ant.thinkTick > tick) continue;
      // An ant released while falling finishes the fall first, then the release table runs again (GDD 01 §3.5 rule 2).
      if (ant.bb['ctl.reinfer'] === 1 && !reinferAfterLanding(sim, ant)) continue;
      runBehaviour(sim, ant);
    }
  },
};
