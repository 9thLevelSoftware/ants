// Journal aims, "Current focus" (GDD 06 §5.13, GDD 08 §9.2): naturalist questions opened by colony facts and
// completed by milestones. At most AIMS_SHOWN_MAX are open at once, oldest first; further eligible aims wait in
// order. An aim whose completing milestone already fired is never opened. No aim gates play or carries a reward.
// The founding script opens and closes the opening aims and the first hand-over aims itself (colony/founding).

import type { AimId, MilestoneId, Sim, SpeciesId, StageId } from '@/sim/types';
import { STAGES } from '@/sim/types';
import {
  AIM_MIDDEN_WORKERS, AIM_SATELLITE_WORKERS, AIM_SECOND_ENTRANCE_WORKERS, AIMS_SHOWN_MAX,
} from '@/sim/balance';
import { calendarTick, currentSeason, DEFAULT_DAYS_PER_YEAR, inDefaultYearWindow } from '@/sim/time';
import { engineOf, playerColony } from './engine';
import type { Census } from './engine';
import { addJournal } from './journal';
import { sourceVariant } from './triggers';

interface AimRule {
  id: AimId;
  species?: readonly SpeciesId[];
  completes: MilestoneId;
  eligible: (sim: Sim, census: Census) => boolean;
}

const LN_CP = ['lasius-niger', 'camponotus-pennsylvanicus'] as const;

const stageAtLeast = (sim: Sim, s: StageId): boolean =>
  STAGES.indexOf(sim.state.progression.stage.id) >= STAGES.indexOf(s);
const reached = (sim: Sim, id: MilestoneId): boolean => sim.state.progression.milestones[id] !== undefined;
const aimDone = (sim: Sim, id: AimId): boolean => sim.state.progression.aims.some((a) => a.id === id && a.state === 'done');

/** True once the opening has handed the colony over (or there was no opening to play). */
export function queenHandedOver(sim: Sim): boolean {
  const op = sim.state.player.opening;
  return !op || op.done || op.phase === 'handover' || op.phase === 'done';
}

function herdKnown(sim: Sim): boolean {
  const col = playerColony(sim);
  return !!col && col.knownSourceIds.some((id) => sourceVariant(sim, id) === 'aphid-herd');
}

/** Hand-over aims follow the founding script's per-species choice (colony/founding/handover.ts). */
export const AIM_RULES: readonly AimRule[] = [
  { id: 'aim-first-food', species: LN_CP, completes: 'ms-first-food', eligible: queenHandedOver },
  { id: 'aim-second-chamber', species: [...LN_CP, 'messor-barbarus'], completes: 'ms-second-chamber', eligible: queenHandedOver },
  { id: 'aim-nest-open', species: ['atta-texana'], completes: 'ms-nest-reopened', eligible: queenHandedOver },
  { id: 'aim-garden', species: ['atta-texana'], completes: 'ms-first-leaf', eligible: queenHandedOver },
  { id: 'aim-trunk-trail', species: ['messor-barbarus'], completes: 'ms-first-seed', eligible: queenHandedOver },
  {
    // "after aim-first-food": its question is answered by ms-first-food even when the aim waited unopened (or was
    // never opened because the milestone came first), so the follow-up must not depend on the aim being shown
    id: 'aim-first-protein', species: LN_CP, completes: 'ms-first-prey',
    eligible: (sim) => aimDone(sim, 'aim-first-food') || reached(sim, 'ms-first-food'),
  },
  { id: 'aim-first-trail', completes: 'ms-first-trail', eligible: (sim) => reached(sim, 'ms-first-food') },
  {
    // "stage first-workers and season autumn": read as any stage past founding, in autumn
    id: 'aim-stores-winter', completes: 'ms-first-winter-survived',
    eligible: (sim) => stageAtLeast(sim, 'first-workers') && currentSeason(sim.state) === 'autumn',
  },
  { id: 'aim-midden', completes: 'ms-first-midden', eligible: (_s, c) => c.workers >= AIM_MIDDEN_WORKERS },
  { id: 'aim-satellite', species: ['camponotus-pennsylvanicus'], completes: 'ms-satellite-nest', eligible: (_s, c) => c.workers >= AIM_SATELLITE_WORKERS },
  { id: 'aim-second-entrance', completes: 'ms-second-entrance', eligible: (_s, c) => c.workers >= AIM_SECOND_ENTRANCE_WORKERS },
  { id: 'aim-cross-zone', completes: 'ms-zone-crossed', eligible: (sim) => stageAtLeast(sim, 'growing') },
  { id: 'aim-herd', species: ['lasius-niger'], completes: 'ms-first-aphid-herd', eligible: (sim) => stageAtLeast(sim, 'growing') && herdKnown(sim) },
  { id: 'aim-alates', completes: 'ms-first-alate', eligible: (sim) => stageAtLeast(sim, 'mature') },
  { id: 'aim-flight', completes: 'ms-first-flight', eligible: (sim) => reached(sim, 'ms-first-alate') },
];

const BY_ID = new Map(AIM_RULES.map((r) => [r.id, r]));

function openCount(sim: Sim): number {
  return sim.state.progression.aims.filter((a) => a.state === 'open').length;
}

function openAimNow(sim: Sim, id: AimId): void {
  sim.state.progression.aims.push({ id, state: 'open', openedTick: sim.state.tick, doneTick: -1 });
  sim.emit({ type: 'aim.opened', id });
  addJournal(sim, 'aim', id);
}

/** Queues newly eligible aims and opens waiting ones while a slot is free. */
export function evaluateAims(sim: Sim, census: Census): void {
  const eng = engineOf(sim);
  const aims = sim.state.progression.aims;
  const sp = sim.state.config.species;
  for (const r of AIM_RULES) {
    if (r.species && !r.species.includes(sp)) continue;
    if (aims.some((a) => a.id === r.id) || eng.aimQueue.includes(r.id)) continue;
    if (reached(sim, r.completes) || !r.eligible(sim, census)) continue;
    eng.aimQueue.push(r.id);
  }
  // a waiting aim whose milestone fired meanwhile is dropped; one opened elsewhere (founding) leaves the queue
  eng.aimQueue = eng.aimQueue.filter((id) => {
    const r = BY_ID.get(id as AimId);
    return !!r && !reached(sim, r.completes) && !aims.some((a) => a.id === id);
  });
  while (eng.aimQueue.length > 0 && openCount(sim) < AIMS_SHOWN_MAX) openAimNow(sim, eng.aimQueue.shift() as AimId);
}

/** Completes the open aims a milestone answers (journal entry refs = [milestone id]). */
export function onMilestoneForAims(sim: Sim, milestoneId: string): void {
  for (const a of sim.state.progression.aims) {
    if (a.state !== 'open' || BY_ID.get(a.id)?.completes !== milestoneId) continue;
    a.state = 'done';
    a.doneTick = sim.state.tick;
    sim.emit({ type: 'aim.completed', id: a.id });
    addJournal(sim, 'aim', a.id, {}, [milestoneId]);
  }
  const eng = engineOf(sim);
  eng.aimQueue = eng.aimQueue.filter((id) => BY_ID.get(id as AimId)?.completes !== milestoneId);
}

/** Ref of an aim's completed journal entry when no milestone completed it (closed by the founding script). */
export const AIM_DONE_REF = 'aim.completed';

/**
 * Journal entry of an aim opened or completed by another module (the founding script): progression owns the journal,
 * so every `aim.opened` / `aim.completed` event gets its entry once. Entries progression wrote itself are found
 * and not repeated. Convention: an opened entry has no refs; a completed entry has refs [milestone id], or
 * [AIM_DONE_REF] when no milestone completed it.
 */
export function journalAimEvent(sim: Sim, id: AimId, op: 'opened' | 'completed'): void {
  const done = op === 'completed';
  const has = sim.state.progression.journal.entries.some((e) => e.kind === 'aim' && e.key === id && (e.refs.length > 0) === done);
  if (!has) addJournal(sim, 'aim', id, {}, done ? [AIM_DONE_REF] : []);
}

/** "Current focus" for the journal: open aims oldest first (at most AIMS_SHOWN_MAX), with the out-of-season hint. */
export function currentAims(sim: Sim): { id: AimId; openedTick: number; hint: 'out-of-season' | null }[] {
  return sim.state.progression.aims
    .filter((a) => a.state === 'open')
    .sort((a, b) => a.openedTick - b.openedTick)
    .slice(0, AIMS_SHOWN_MAX)
    .map((a) => ({ id: a.id, openedTick: a.openedTick, hint: a.id === 'aim-alates' && !inLayWindow(sim) ? 'out-of-season' as const : null }));
}

function inLayWindow(sim: Sim): boolean {
  const [from, to] = sim.species.reproduction.alateLayWindow;
  const t = calendarTick(sim.state);
  return from <= to
    ? inDefaultYearWindow(t, sim.state.config, from, to)
    : inDefaultYearWindow(t, sim.state.config, from, DEFAULT_DAYS_PER_YEAR) || inDefaultYearWindow(t, sim.state.config, 1, to);
}
