// Hand-over to normal play (GDD 06 §5.13, GDD 02 §2.7 / E-21): the first workers exist; the queen becomes an
// established queen whose remaining pool is split into reserve (C) and reserveP (P); the nest record moves to
// `reopening` and a reopen job for every sealed entrance of the cell is requested through the nest's command (the
// nanitics dig the plug out themselves, beh-nest); the first journal aims open. Workers are already autonomous.

import type { Ant, AimId, Nest, OpeningState, Sim } from '@/sim/types';
import { AntFlag } from '@/sim/types';
import { bbClear, playerColonyOf, setPhase, speciesOf } from './access';
import { cavityEntrances } from './dig';
import { lapseCounters } from './lapse';

/** First aims opened at hand-over (GDD 06 §5.13), per species. */
const HANDOVER_AIMS: Record<string, AimId[]> = {
  'lasius-niger': ['aim-first-food', 'aim-second-chamber'],
  'camponotus-pennsylvanicus': ['aim-first-food', 'aim-second-chamber'],
  'messor-barbarus': ['aim-trunk-trail', 'aim-second-chamber'],
  'atta-texana': ['aim-nest-open', 'aim-garden'],
};

/** Opens an aim unless it exists already (at most 3 shown is the journal's rule). */
export function openAim(sim: Sim, id: AimId): void {
  const aims = sim.state.progression.aims;
  if (aims.some((a) => a.id === id)) return;
  aims.push({ id, state: 'open', openedTick: sim.state.tick, doneTick: -1 });
  sim.emit({ type: 'aim.opened', id });
}

/** Closes an aim that is open (founding aims of GDD 08 §9.2 as the script reaches them). */
export function closeAim(sim: Sim, id: AimId): void {
  const a = sim.state.progression.aims.find((x) => x.id === id && x.state === 'open');
  if (!a) return;
  a.state = 'done';
  a.doneTick = sim.state.tick;
  sim.emit({ type: 'aim.completed', id });
}

/** The queen leaves the founding state: pool split 50/50 into reserve C and reserveP; FOUNDING flag cleared. */
function establishQueen(q: Ant): number {
  const qs = q.queen;
  if (!qs || !qs.founding) return 0;
  const left = Math.max(0, qs.founding.reserveLoads);
  const share = left / qs.founding.R0;
  qs.reserve += left / 2;
  qs.reserveP += left / 2;
  qs.founding = null;
  q.flags &= ~AntFlag.FOUNDING;
  bbClear(q);
  return share;
}

export function handover(sim: Sim, op: OpeningState, q: Ant, nest: Nest): void {
  const counters = lapseCounters(sim, q);
  const workers = counters.workers;
  const reserves = establishQueen(q);
  if (nest.founding) {
    nest.founding.state = 'reopening';
    for (const e of cavityEntrances(sim, nest)) {
      if (e.status === 'sealed' || e.status === 'sealing') sim.enqueue({ type: 'reopenEntrance', entranceId: e.id });
    }
  }
  if (op.lapse) {
    op.lapse.endTick = sim.state.tick;
    op.lapse.outcome = `workers:${workers};reserves:${reserves.toFixed(3)}`;
  }
  // the lapse is over: normal speeds again (the outcome card reads opening.lapse.outcome)
  sim.state.player.timelapse = null;
  closeAim(sim, 'aim-first-clutch');
  closeAim(sim, 'aim-first-workers');
  const col = playerColonyOf(sim);
  if (col) for (const id of HANDOVER_AIMS[speciesOf(sim).id] ?? HANDOVER_AIMS['lasius-niger']) openAim(sim, id);
  sim.emit({ type: 'opening.timelapse', kind: 'end', p: 1, spanGd: 0, hazard: null });
  sim.emit({ type: 'opening.handover', workers, reserves, q: op.siteQ });
  setPhase(sim, op, 'handover');
}
