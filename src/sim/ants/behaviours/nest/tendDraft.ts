// Ruling R33 (direction 21, second half): while any egg or pupa is overdue (its pile has a tend job nobody holds), no
// worker in the nest stays idle, waiting to forage (`forage.wait`) or resting unless exhausted: the nearest such
// worker takes the tend job whatever its task. Round 8 measured the loss this answers: a founding-year colony's nurse
// demand at the GDD 02 §6.2 rates is one nurse, who cannot be at two piles, carry, feed and rest at once, while the
// queen's attendants and idle workers stood beside the eggs (36 of 71 year-two eggs died untended).
//
// One assignment per overdue pile, computed once a tick per colony (derived; the ants' own state decides it, so a
// loaded game assigns the same): piles in board priority order, each to the nearest free candidate in its nest; one
// hand per pile.

import type { Ant, Sim } from '@/sim/types';
import { AntFlag } from '@/sim/types';
import { isWorkerCaste } from '@/sim/colony/census';
import { mayTakeTask, requestTask } from '@/sim/colony';
import { TEND_PILE_RADIUS_BU } from '@/sim/balance/nestwork';
import { openTendJobs } from './board';
import { needsRest } from './common';
import { perTick } from './perTick';

/** bb key on a drafted worker: the brood id of the overdue pile she tends next (nurse select reads it). */
export const DRAFT_BROOD = 'nu.draft';

/**
 * The workers a pile may be given to: idle, resting (unless exhausted) or waiting to forage, and allowed to nurse
 * (the allocation's own eligibility: a caste with nurse weight 0, Atta's majors, is never given a pile, or the pile
 * would be hers on every tick while her nurse request is refused; sweep-9 review finding 3).
 */
function draftable(sim: Sim, ant: Ant): boolean {
  if (!ant.alive || !isWorkerCaste(ant.caste) || ant.nestId < 0 || (ant.flags & AntFlag.POSSESSED) !== 0) return false;
  if (ant.carry.kind !== 'none' || ant.task === 'nurse') return false;
  const free = ant.state === 'idle' || ant.state === 'forage.wait' || (ant.state === 'rest' && !needsRest(ant));
  return free && mayTakeTask(sim, ant, 'nurse');
}

/** Ant id -> brood id of the colony's drafts this tick. */
function draftsOf(sim: Sim, colonyId: number): Map<number, number> {
  return perTick(sim, `tendDraft:${colonyId}`, () => {
    const out = new Map<number, number>();
    const jobs = openTendJobs(sim, colonyId);
    if (jobs.length === 0) return out;
    const free: Ant[] = [];
    for (const a of sim.stores.ants.list) if (a.colony === colonyId && draftable(sim, a)) free.push(a);
    // one hand per pile: a tend round grooms the whole pile within TEND_PILE_RADIUS_BU (nurse.ts), so a job whose
    // brood lies within that of a pile already given a hand is left to her
    const pile = (TEND_PILE_RADIUS_BU * sim.world.bu) ** 2;
    const given: { x: number; y: number; z: number }[] = [];
    for (const j of jobs) {
      if (given.some((p) => (p.x - j.pos.x) ** 2 + (p.y - j.pos.y) ** 2 + (p.z - j.pos.z) ** 2 <= pile)) continue;
      let best: Ant | null = null, bestD = Infinity;
      for (const a of free) {
        if (a.nestId !== j.nestId || out.has(a.id)) continue;
        const d = (a.pos.x - j.pos.x) ** 2 + (a.pos.y - j.pos.y) ** 2 + (a.pos.z - j.pos.z) ** 2;
        if (d < bestD || (d === bestD && best && a.id < best.id)) { best = a; bestD = d; }
      }
      if (best) { out.set(best.id, j.id); given.push(j.pos); }
    }
    return out;
  });
}

/**
 * Called on the think of an idle, resting or waiting worker: if R33 drafts her for an overdue pile, she becomes a
 * nurse for it (her next nurse select tends that pile) and true is returned (her current behaviour stops here).
 */
export function takeOverdueTend(sim: Sim, ant: Ant): boolean {
  if (!draftable(sim, ant)) return false;
  const broodId = draftsOf(sim, ant.colony).get(ant.id);
  if (broodId === undefined) return false;
  if (!requestTask(sim, ant, 'nurse', 'job:tend-overdue')) return false;
  ant.bb[DRAFT_BROOD] = broodId;
  return true;
}
