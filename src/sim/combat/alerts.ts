// Alerts owned by combat (GDD 05 §4.10, App. C): `queen-in-danger` when the player queen takes damage or a hostile
// ant is within 3 L of her (cleared 30 s after the last danger), and `possessed-danger` with cause "pinned" while
// the possessed ant is pinned. The alert state lives in the subject ant's bb.

import type { Ant, Sim } from '@/sim/types';
import { QUEEN_DANGER_CLEAR_S, QUEEN_DANGER_L } from '@/sim/balance/combat';
import { clearAlert, raiseAlert } from '@/sim/progression';
import { antLenMm, dist, isPossessed, ticksOf } from './state';

const Q_LAST = 'cb.qdT', Q_ON = 'cb.qdOn', PIN_ON = 'cb.pinOn';
const ids: number[] = [];

function playerQueen(sim: Sim, ant: Ant): boolean {
  if (ant.caste !== 'queen') return false;
  const col = sim.stores.colonies.get(ant.colony);
  return !!col && col.isPlayer;
}

function raiseQueen(sim: Sim, q: Ant, cause: string): void {
  q.bb[Q_LAST] = sim.state.tick;
  if (q.bb[Q_ON] === 1) return;
  q.bb[Q_ON] = 1;
  raiseAlert(sim, {
    kind: 'queen-in-danger', level: 'critical', subjectId: q.id, title: 'The queen is in danger', cause,
    focus: { kind: 'ant', id: q.id, pos: { ...q.pos } }, diagnosticId: 'diag-combat-losses', tokens: { cause },
  });
}

/** Called for every damage to an ant: the player queen raises the alert. */
export function noteQueenDamaged(sim: Sim, ant: Ant): void {
  if (playerQueen(sim, ant)) raiseQueen(sim, ant, 'damage');
}

/** Periodic check (combat diagnostics cadence): hostiles near the player queen, clearing, the pinned alert. */
export function combatAlerts(sim: Sim): void {
  const col = sim.state.colonies[0];
  const q = col ? sim.stores.ants.get(col.queenId) : undefined;
  if (q && q.alive) {
    const r = QUEEN_DANGER_L * antLenMm(sim, q);
    sim.index.queryAnts(q.pos, r, ids);
    for (const id of ids) {
      const a = sim.stores.ants.get(id);
      if (a && a.alive && a.colony !== q.colony && dist(a.pos, q.pos) <= r) { raiseQueen(sim, q, 'hostile-near'); break; }
    }
    if (q.bb[Q_ON] === 1 && sim.state.tick - (q.bb[Q_LAST] ?? 0) >= ticksOf(QUEEN_DANGER_CLEAR_S)) {
      q.bb[Q_ON] = 0;
      clearAlert(sim, 'queen-in-danger', q.id);
    }
  }
  const p = sim.stores.ants.get(sim.state.player.possessedAntId);
  if (p && isPossessed(p)) {
    const pinned = !!p.combat?.pinned;
    if (pinned && p.bb[PIN_ON] !== 1) {
      p.bb[PIN_ON] = 1;
      raiseAlert(sim, {
        kind: 'possessed-danger', level: 'warning', subjectId: p.id, title: 'Pinned', cause: 'pinned',
        focus: { kind: 'ant', id: p.id, pos: { ...p.pos } }, diagnosticId: null, tokens: { cause: 'pinned' },
      });
    } else if (!pinned && p.bb[PIN_ON] === 1) {
      p.bb[PIN_ON] = 0;
      clearAlert(sim, 'possessed-danger', p.id);
    }
  }
}
