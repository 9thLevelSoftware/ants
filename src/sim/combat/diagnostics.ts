// Combat read-outs (GDD 05 App. D `diag-combat-losses`) and the debug summary of fights in progress. Losses come
// from progression's death ring (cause `combat`); the rest is counted live from the ants.

import type { Sim } from '@/sim/types';
import { taskIndex } from '@/sim/types';
import { COMBAT_LOSSES_BAD, COMBAT_LOSSES_WARN, RETREAT_RATIO } from '@/sim/balance/combat';
import { publishDiagnostic } from '@/sim/progression';
import { TICKS_PER_DAY } from '@/sim/time';
import { localStrength } from './engage';

export interface CombatSummary {
  /** Ants of the colony with task `fight`, fleeing, holding a lock, held, pinned, seized by a predator. */
  fighters: number;
  fleeing: number;
  locks: number;
  held: number;
  pinned: number;
  seized: number;
  /** Living ants with at least one injury. */
  injured: number;
  /** Deaths of the colony in the last game day by cause (player colony: progression's death ring). */
  lossesLastGd: Record<string, number>;
  combatLossesLastGd: number;
}

/** Fights in progress and losses of a colony (default: the player's). */
export function combatSummary(sim: Sim, colonyId = sim.state.colonies[0]?.id ?? -1): CombatSummary {
  const s: CombatSummary = { fighters: 0, fleeing: 0, locks: 0, held: 0, pinned: 0, seized: 0, injured: 0, lossesLastGd: {}, combatLossesLastGd: 0 };
  for (const a of sim.stores.ants.list) {
    if (!a.alive || a.colony !== colonyId) continue;
    if (a.task === 'fight') s.fighters++;
    if (a.task === 'flee') s.fleeing++;
    if (a.injuries !== 0) s.injured++;
    const cs = a.combat;
    if (!cs) continue;
    if (cs.lock) s.locks++;
    if (cs.heldBy.length > 0) s.held++;
    if (cs.pinned) s.pinned++;
    if (cs.seizedBy >= 0) s.seized++;
  }
  const col = sim.stores.colonies.get(colonyId);
  if (col?.isPlayer) {
    const since = sim.state.tick - TICKS_PER_DAY;
    for (const d of sim.state.progression.deaths.recent) {
      if (d.tick < since) continue;
      s.lossesLastGd[d.cause] = (s.lossesLastGd[d.cause] ?? 0) + 1;
    }
    s.combatLossesLastGd = s.lossesLastGd.combat ?? 0;
  }
  return s;
}

/** Publishes `diag-combat-losses` for the player colony (GDD 05 App. D). */
export function publishCombatDiagnostic(sim: Sim): void {
  const col = sim.state.colonies[0];
  if (!col || !col.alive) return;
  const s = combatSummary(sim, col.id);
  let outnumbered = 0, outside = 0;
  for (const a of sim.stores.ants.list) {
    if (!a.alive || a.colony !== col.id || a.task !== 'fight') continue;
    if (a.nestId < 0) outside++;
    const st = localStrength(sim, a);
    if (st.hostile >= RETREAT_RATIO * st.friendly) outnumbered++;
  }
  const guards = col.alloc.actual[taskIndex('guard')] ?? 0;
  const living = Math.max(1, col.livingAnts);
  const status = s.combatLossesLastGd >= COMBAT_LOSSES_BAD ? 'bad' : s.combatLossesLastGd >= COMBAT_LOSSES_WARN ? 'warn' : 'ok';
  const f = Math.max(1, s.fighters);
  const raw = [
    { cause: 'outnumbered', w: outnumbered / f, detail: `${outnumbered} of ${s.fighters} fighters outnumbered` },
    { cause: 'outside-territory', w: outside / f, detail: `${outside} fighters outside the nest` },
    { cause: 'few-guards', w: guards === 0 && s.fighters > 0 ? 1 : 0, detail: `${guards} guards` },
  ];
  const sum = raw.reduce((t, r) => t + r.w, 0);
  publishDiagnostic(sim, {
    id: 'diag-combat-losses', system: 'combat', status,
    label: `${s.combatLossesLastGd} workers lost in fights today; ${Math.round((100 * s.injured) / living)} % injured`,
    value: s.combatLossesLastGd,
    factors: raw.filter((r) => r.w > 0).map((r) => ({ cause: r.cause, weight: sum > 0 ? r.w / sum : 0, detail: r.detail, diagId: null })),
    remedies: status === 'ok' ? [] : ['remedy.stance.cautious', 'remedy.marker.rally'],
    sinceTick: -1, focus: null,
  });
}
