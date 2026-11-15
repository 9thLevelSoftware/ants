// The `raid` task behaviour (registered once through src/sim/ants/behaviours/outdoor/index.ts): every ant of a
// rival colony (agents and queens) and the player's raid parties. Rival ants run their job (jobs.ts,
// raidJobs.ts); combat moves them into `fight` / `flee` and back (resume task `raid`, the job stays in bb).

import type { Ant, Behaviour, Sim } from '@/sim/types';
import { AGENT_THINK_TICKS, MARK_PRUNE_TICKS } from '@/sim/balance/rivals';
import { absorbAgent } from '../agents';
import { encounterStep, pruneMarks } from '../encounter';
import {
  defendJob, emerged, forageJob, guardJob, patrolJob, queenJob, returnJob, wanderJob, warJob,
} from './jobs';
import { halt } from './move';
import { digJob, finishPlayerRaider, playerReturn, raidJob } from './raidJobs';
import { BB, JOB, jobOf, type RivalColony } from '../state';

function busy(sim: Sim, ant: Ant): boolean {
  const c = ant.combat;
  return !!c && (c.seizedBy >= 0 || c.paralysedUntilTick > sim.state.tick || c.heldBy.length > 0 || !!c.lock);
}

function rivalUpdate(sim: Sim, ant: Ant, col: RivalColony): void {
  const job = jobOf(ant);
  if (job === JOB.queen) { queenJob(sim, ant, col); return; }
  if (job === JOB.wander) { wanderJob(sim, ant); return; }
  if (ant.action) return; // a primitive in progress (pick-up) finishes first
  if (job !== JOB.ret && job !== JOB.defend && job !== JOB.escort && job !== JOB.dig && !emerged(sim, ant)) return;
  if (job !== JOB.ret && job !== JOB.dig && encounterStep(sim, ant, col)) return;
  if ((ant.id + sim.state.tick) % MARK_PRUNE_TICKS < AGENT_THINK_TICKS) pruneMarks(sim, ant);
  switch (job) {
    case JOB.forage: case JOB.emerge: forageJob(sim, ant, col); return;
    case JOB.patrol: patrolJob(sim, ant, col); return;
    case JOB.war: warJob(sim, ant, col); return;
    case JOB.guard: guardJob(sim, ant, col); return;
    case JOB.defend: defendJob(sim, ant, col, false); return;
    case JOB.escort: defendJob(sim, ant, col, true); return;
    case JOB.raid: case JOB.brood: raidJob(sim, ant); return;
    case JOB.dig: digJob(sim, ant); return;
    case JOB.ret: returnJob(sim, ant, col); return;
    default: returnJob(sim, ant, col);
  }
}

function playerUpdate(sim: Sim, ant: Ant): void {
  if (ant.action) return;
  const job = jobOf(ant);
  if (job === JOB.raid || job === JOB.brood) { raidJob(sim, ant); return; }
  if (job === JOB.ret) { playerReturn(sim, ant); return; }
  finishPlayerRaider(sim, ant);
}

export const raidBehaviour: Behaviour = {
  task: 'raid',
  enter(sim, ant) {
    ant.bb[BB.go] = 0;
    ant.thinkTick = sim.state.tick;
  },
  update(sim, ant) {
    ant.thinkTick = sim.state.tick + AGENT_THINK_TICKS;
    if (busy(sim, ant)) return;
    const col = sim.stores.colonies.get(ant.colony);
    if (col?.rival) { rivalUpdate(sim, ant, col as RivalColony); return; }
    if (col) { playerUpdate(sim, ant); return; }
    // the colony is gone (destroyed): the agent wanders until it dies, or is removed if it has no clock
    if (ant.bb[BB.dieTick] !== undefined) wanderJob(sim, ant);
    else absorbAgent(sim, ant);
  },
  exit(sim, ant) {
    halt(sim, ant);
  },
};
