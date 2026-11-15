// Recording milestones and codex observations (each at most once per game), and running the trigger tables of
// milestoneRules.ts and codexRules.ts against events and polled state.

import type { CodexId, MilestoneId, Sim, SimEvent } from '@/sim/types';
import { dateNow } from './engine';
import { addJournal, logEvent, type Tokens } from './journal';
import { MILESTONE_RULES } from './milestoneRules';
import { CODEX_RULES } from './codexRules';
import { indexByEvent, speciesAllows, type PollContext, type TriggerRule } from './triggers';
import { onMilestoneForAims } from './aims';

const MS_BY_EVENT = indexByEvent(MILESTONE_RULES);
const CX_BY_EVENT = indexByEvent(CODEX_RULES);
const CX_AFTER = new Map<string, TriggerRule<CodexId>[]>();
for (const r of CODEX_RULES) if (r.afterMilestone) CX_AFTER.set(r.afterMilestone, [...(CX_AFTER.get(r.afterMilestone) ?? []), r]);
const MS_POLLED = MILESTONE_RULES.filter((r) => r.poll);
const CX_POLLED = CODEX_RULES.filter((r) => r.poll);

export function hasMilestone(sim: Sim, id: string): boolean {
  return sim.state.progression.milestones[id] !== undefined;
}

/**
 * Records a milestone once: date stamp, journal entry (text id = milestone id, with the tokens its wording needs),
 * `milestone.reached` (title = the id; the interface words it), event-log row, codex entries and aims that follow
 * from it. True if newly reached.
 */
export function recordMilestone(sim: Sim, id: MilestoneId, tokens: Tokens = {}): boolean {
  const p = sim.state.progression;
  if (p.milestones[id] !== undefined) return false;
  p.milestones[id] = dateNow(sim);
  addJournal(sim, 'milestone', id, { ...tokens });
  logEvent(sim, 'milestone', 'info', id, { ...tokens });
  sim.emit({ type: 'milestone.reached', id, tick: sim.state.tick, title: id });
  for (const r of CX_AFTER.get(id) ?? []) if (speciesAllows(sim, r)) unlockCodex(sim, r.id);
  onMilestoneForAims(sim, id);
  return true;
}

/** Records a codex observation for this game (codexSeen) and emits `codex.unlocked` once; true if new. */
export function unlockCodex(sim: Sim, id: CodexId): boolean {
  const seen = sim.state.progression.codexSeen;
  if (seen[id] !== undefined) return false;
  seen[id] = sim.state.tick;
  logEvent(sim, 'codex', 'info', id);
  sim.emit({ type: 'codex.unlocked', id });
  return true;
}

/** Runs the event triggers of both tables for one delivered event. */
export function triggersOnEvent(sim: Sim, ev: SimEvent): void {
  const ms = MS_BY_EVENT.get(ev.type);
  if (ms) {
    for (const r of ms) {
      if (hasMilestone(sim, r.id) || !speciesAllows(sim, r)) continue;
      const fn = r.on![ev.type] as ((s: Sim, e: SimEvent) => Tokens | null) | undefined;
      const t = fn?.(sim, ev);
      if (t) recordMilestone(sim, r.id, t);
    }
  }
  const cx = CX_BY_EVENT.get(ev.type);
  if (cx) {
    for (const r of cx) {
      if (sim.state.progression.codexSeen[r.id] !== undefined || !speciesAllows(sim, r)) continue;
      const fn = r.on![ev.type] as ((s: Sim, e: SimEvent) => Tokens | null) | undefined;
      if (fn?.(sim, ev)) unlockCodex(sim, r.id);
    }
  }
}

/** Runs the state checks of every rule that has not fired yet. */
export function triggersOnPoll(sim: Sim, ctx: PollContext): void {
  for (const r of MS_POLLED) {
    if (hasMilestone(sim, r.id) || !speciesAllows(sim, r)) continue;
    const t = r.poll!(sim, ctx);
    if (t) recordMilestone(sim, r.id, t);
  }
  for (const r of CX_POLLED) {
    if (sim.state.progression.codexSeen[r.id] !== undefined || !speciesAllows(sim, r)) continue;
    if (r.poll!(sim, ctx)) unlockCodex(sim, r.id);
  }
}
