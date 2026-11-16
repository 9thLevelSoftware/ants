// Alerts owned by combat (GDD 05 §4.10, App. C): `queen-in-danger` when the player queen takes damage or a hostile
// ant is within 3 L of her (cleared 30 s after the last danger), and `possessed-danger` with cause "pinned" while
// the possessed ant is pinned (cleared when it is no longer pinned, possessed or alive). The alert state lives in
// the subject ant's bb.

import type { Ant, Sim } from '@/sim/types';
import { QUEEN_DANGER_CLEAR_S, QUEEN_DANGER_L } from '@/sim/balance/combat';
import { FLOOD_ANT_SUB_KEY } from '@/sim/balance/weather';
import { clearAlert, raiseAlert } from '@/sim/progression/alerts';
import { antLenMm, dist, isPossessed, ticksOf } from './state';

const Q_LAST = 'cb.qdT', Q_ON = 'cb.qdOn', PIN_ON = 'cb.pinOn';
const ids: number[] = [];

/**
 * Combat holds the shared `queen-in-danger` card for this queen (damage or a hostile near in the last
 * QUEEN_DANGER_CLEAR_S). Alerts are keyed on kind and subject only, so the flood module (rising water) asks this
 * before it clears the card (task nest-fix3 item 5).
 */
export function combatHoldsQueenAlert(ant: Ant): boolean {
  return ant.bb[Q_ON] === 1;
}

/** The queen is under water now (the flood module's submersion counter): the shared card is the flood's to clear. */
function underWater(ant: Ant): boolean {
  return (ant.bb[FLOOD_ANT_SUB_KEY] ?? 0) > 0;
}

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
      // the card is shared with the flood's "rising water": while she is under water it stays (nest-fix3 item 5)
      if (!underWater(q)) clearAlert(sim, 'queen-in-danger', q.id);
    }
  }
  clearStale(sim);
  const p = sim.stores.ants.get(sim.state.player.possessedAntId);
  if (p && p.alive && isPossessed(p)) {
    const pinned = !!p.combat?.pinned;
    if (pinned && p.bb[PIN_ON] !== 1) {
      p.bb[PIN_ON] = 1;
      raiseAlert(sim, {
        kind: 'possessed-danger', level: 'warning', subjectId: p.id, title: 'Pinned', cause: 'pinned',
        focus: { kind: 'ant', id: p.id, pos: { ...p.pos } }, diagnosticId: null, tokens: { cause: 'pinned' },
      });
    } else if (!pinned && p.bb[PIN_ON] === 1) unpin(sim, p.id);
  }
}

function unpin(sim: Sim, antId: number): void {
  const a = sim.stores.ants.get(antId);
  if (a) delete a.bb[PIN_ON];
  clearAlert(sim, 'possessed-danger', antId);
}

/**
 * Alerts whose subject is gone: queen-in-danger of a queen that died (or is no longer the player queen), and the
 * "pinned" possessed-danger of an ant the player left, that died or is no longer pinned.
 */
function clearStale(sim: Sim): void {
  const alerts = sim.state.progression.alerts;
  for (let i = alerts.length - 1; i >= 0; i--) {
    const al = alerts[i];
    const a = sim.stores.ants.get(al.subjectId);
    if (al.kind === 'queen-in-danger') {
      if (!a || !a.alive || !playerQueen(sim, a)) clearAlert(sim, 'queen-in-danger', al.subjectId);
    } else if (al.kind === 'possessed-danger' && al.cause === 'pinned') {
      const current = !!a && a.alive && isPossessed(a) && sim.state.player.possessedAntId === a.id && !!a.combat?.pinned;
      if (!current) unpin(sim, al.subjectId);
    }
  }
}
