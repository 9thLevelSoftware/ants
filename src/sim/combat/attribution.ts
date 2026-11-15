// Who is hitting? The action library's `bite` and `spray-acid` shells call applyDamage(sim, kind, id, dmg,
// 'combat') from inside their effect, without the attacker. Bite resolution needs the attacker (hit chance,
// outnumbering, size, events), so applyDamage asks here for the ant whose combat primitive is applying its effect
// right now: an ant whose `bite` on this target (or `spray-acid`) is at its effect tick and not yet marked done.
//
// Why this is exact: the action system steps ants in list order and marks a timed primitive's effect done
// (`act.fx` = 1) right after the effect returns. Among the ants that match, the one being stepped is the first in
// list order (those before it were already stepped and are marked). Calls from any other phase find no match.
// When the shells pass the attacker (proposed in the report), this lookup is no longer used.

import type { Ant, Sim } from '@/sim/types';
import { ACTION_ACTIVE_FRAC, ACTION_WINDUP_FRAC } from '@/sim/balance/actions';
import { dep } from './late';

const ids: number[] = [];
/** Search radius around the target, BU (spray range 1.5 L of the largest ants plus bodies). */
const SEARCH_BU = 12;

/** Tick count (1-based elapsed) at which a timed primitive of d ticks applies its effect (mirrors the runner). */
function effectTickOf(windupFrac: number, d: number): number {
  const w = Math.round(d * windupFrac);
  const e = Math.floor(d * (windupFrac + ACTION_ACTIVE_FRAC) + 1e-9);
  return Math.min(d, Math.max(w, 1, e));
}

function atEffect(sim: Sim, a: Ant): boolean {
  const act = a.action;
  if (!act || (a.bb['act.fx'] ?? 0) === 1) return false;
  const def = dep().actionDefs[act.id];
  if (!def || def.kind !== 'timed') return false;
  const elapsed = sim.state.tick - act.startTick + 1;
  return elapsed === effectTickOf(def.windupFrac ?? ACTION_WINDUP_FRAC, act.durationTicks);
}

/** The ant whose `bite` on (kind, id) or whose `spray-acid` is applying its effect now, or null. */
export function executingAttacker(sim: Sim, kind: string, id: number, pos: { x: number; y: number; z: number }): Ant | null {
  sim.index.queryAnts(pos, SEARCH_BU * sim.world.bu, ids);
  let best: Ant | null = null;
  let bestIdx = Infinity;
  for (let i = 0; i < ids.length; i++) {
    const a = sim.stores.ants.get(ids[i]);
    if (!a || !a.alive || !a.action) continue;
    const act = a.action;
    const match = (act.id === 'bite' && act.target.kind === kind && act.target.id === id) || act.id === 'spray-acid';
    if (!match || !atEffect(sim, a)) continue;
    if (best === null) { best = a; continue; }
    // two candidates in one tick: the one the action system is stepping is first in list order
    if (bestIdx === Infinity) bestIdx = sim.stores.ants.list.indexOf(best);
    const idx = sim.stores.ants.list.indexOf(a);
    if (idx < bestIdx) { best = a; bestIdx = idx; }
  }
  return best;
}
