// Founding failure (GDD 06 §5.14): the queen died before the first workers, or the pool ran out, or all brood was
// lost with nothing left to lay. The phase becomes `failed` (event `opening.failed {cause}`); the game shows the
// calm failure card with retry (a game-level checkpoint restore) or the epitaph. Total brood loss with the queen
// alive is not a failure by itself: she may lay one extra clutch if her pool allows.

import type { Ant, DeathCause, FoundingFailCause, Nest, OpeningState, Sim } from '@/sim/types';
import { OPEN_LAY_BATCH_EGGS } from '@/sim/balance/actions';
import { BROOD_LOST_FAIL_GD, BROOD_LOST_RELAY_MIN } from '@/sim/balance/founding';
import { killAnt } from '@/sim/entities';
import { TICKS_PER_DAY } from '@/sim/time';
import { FB, bbGet, bbSet, setPhase } from './access';
import { clutchCap } from './clutch';

const BY_DEATH: Partial<Record<DeathCause, FoundingFailCause>> = {
  desiccation: 'desiccation', heat: 'heat', cold: 'cold', drowning: 'drowning', crushed: 'crushed', predation: 'predation',
  bird: 'predation', antlion: 'predation', combat: 'predation', parasitoid: 'predation', exhaustion: 'exhaustion',
  starvation: 'exhaustion',
};

/** Causes of deaths the founding rules caused this tick (the colony's death record catches up after the tick). */
const pending = new WeakMap<Sim, FoundingFailCause>();

/** Kills the founding queen by a founding rule, remembering the failure cause. */
export function queenDies(sim: Sim, q: Ant, death: DeathCause, cause: FoundingFailCause): void {
  pending.set(sim, cause);
  killAnt(sim, q.id, death);
}

/** Failure cause of the queen's death: a founding rule's, else the colony's death record (latest queen death). */
export function causeOfQueenDeath(sim: Sim): FoundingFailCause {
  const p = pending.get(sim);
  if (p) { pending.delete(sim); return p; }
  const recent = sim.state.progression.deaths.recent;
  for (let i = recent.length - 1; i >= 0; i--) {
    if (recent[i].caste === 'queen') return BY_DEATH[recent[i].cause] ?? 'predation';
  }
  return 'predation';
}

export function failOpening(sim: Sim, op: OpeningState, cause: FoundingFailCause): void {
  if (op.phase === 'failed') return;
  setPhase(sim, op, 'failed');
  if (op.lapse) op.lapse.outcome = `failed:${cause}`;
  else op.lapse = { startTick: -1, endTick: sim.state.tick, skipped: false, outcome: `failed:${cause}` };
  sim.state.player.timelapse = null;
  sim.emit({ type: 'opening.failed', cause });
}

/** The cause recorded by failOpening (`failed:<cause>` in lapse.outcome), or null. */
export function failCauseOf(op: OpeningState): FoundingFailCause | null {
  const o = op.lapse?.outcome ?? '';
  return o.startsWith('failed:') ? (o.slice(7) as FoundingFailCause) : null;
}

/**
 * All brood gone before the first eclosion, queen alive (GDD 06 §5.14): if her pool is at least 0.35 R0 she may lay
 * one extra clutch of up to half the cap (back to `lay`); otherwise the founding fails (`no-workers`) after 1 GD.
 * Returns true when the opening failed.
 */
export function broodLost(sim: Sim, op: OpeningState, q: Ant, nest: Nest): boolean {
  const f = q.queen?.founding;
  if (!f) return false;
  if (bbGet(q, FB.relayClutch, -1) < 0 && f.reserveLoads >= BROOD_LOST_RELAY_MIN * f.R0) {
    // the extra clutch is a clutch of its own: up to half the clutch cap (species and chamber volume), counted
    // from 0 (the colony's laying rule checks eggsLaid against the species cap); earlier eggs stay on record
    const half = Math.max(OPEN_LAY_BATCH_EGGS, Math.floor(clutchCap(sim, nest) / 2));
    bbSet(q, FB.earlierEggs, bbGet(q, FB.earlierEggs, 0) + f.eggsLaid);
    f.eggsLaid = 0;
    bbSet(q, FB.relayClutch, half);
    bbSet(q, FB.autoLaid, 0);
    op.layBatches = 0;
    op.lapse = null;
    sim.state.player.timelapse = null;
    setPhase(sim, op, 'lay');
    return false;
  }
  const since = bbGet(q, FB.broodLostTick, -1);
  if (since < 0) { bbSet(q, FB.broodLostTick, sim.state.tick); return false; }
  if (sim.state.tick - since < BROOD_LOST_FAIL_GD * TICKS_PER_DAY) return false;
  queenDies(sim, q, 'exhaustion', 'no-workers');
  failOpening(sim, op, causeOfQueenDeath(sim));
  return true;
}
