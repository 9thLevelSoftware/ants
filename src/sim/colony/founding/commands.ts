// Command handlers of the opening (GDD 06 App. B; colony module per COMMAND_OWNERS). Refusals go out as
// `command-rejected` with a reason the UI can word. `openingUndo` is a game-level checkpoint restore (the game keeps
// the `opening-start` snapshot); the sim only refuses it outside the phases that allow it.

import type { CommandOf, FoundingDigState, OpeningPhase, Sim } from '@/sim/types';
import { ensureThermal } from '@/sim/environment/surface';
import { FB, bbSet, foundingNest, foundingQueen, openingOf, setPhase } from './access';
import { autoClutchFor, startAuto } from './auto';
import { eggsLaidTotal } from './clutch';
import { beginLapse } from './lapse';
import { bindFoundingCommands } from './entry';

const reject = (sim: Sim, commandType: string, reason: string): void => sim.emit({ type: 'command-rejected', commandType, reason });

/** Leaves the intro card: the world starts running (weather and light), dealation begins. */
function skipIntro(sim: Sim): void {
  const op = openingOf(sim);
  if (!op || op.phase !== 'intro-card') { reject(sim, 'openingSkipIntro', 'invalid-phase'); return; }
  ensureThermal(sim);
  setPhase(sim, op, 'dealation');
}

/** "Tend the brood": starts the time-lapse once at least one batch is laid. */
function beginTimelapse(sim: Sim): void {
  const op = openingOf(sim);
  const q = foundingQueen(sim);
  const nest = foundingNest(sim);
  if (!op || op.phase !== 'lay' || !q || !nest) { reject(sim, 'openingBeginTimelapse', 'invalid-phase'); return; }
  if (op.layBatches < 1 || (q.queen?.founding?.eggsLaid ?? 0) < 1) { reject(sim, 'openingBeginTimelapse', 'no-eggs'); return; }
  if (q.action && q.action.id === 'lay-egg') { reject(sim, 'openingBeginTimelapse', 'busy'); return; }
  beginLapse(sim, op, q, nest);
}

/**
 * Skip (GDD 06 §5.11): the same simulation continues to the same end tick; how fast is the game's choice, so the
 * command changes no simulation state (watching and skipping must end in the same stateHash). It is validated here
 * so a refusal reaches the UI.
 */
function skipTimelapse(sim: Sim): void {
  if (sim.state.player.timelapse?.kind === 'winter') return; // the overwintering lapse (owner: overwinter-repro)
  const op = openingOf(sim);
  if (!op || op.phase !== 'timelapse' || !op.lapse) reject(sim, 'skipTimelapse', 'invalid-phase');
}

/** Interrupt beats are T2 (no interrupt is raised yet): nothing to answer. */
function respond(sim: Sim, _c: CommandOf<'timelapseRespond'>): void {
  const tl = sim.state.player.timelapse;
  if (!tl || !tl.interrupt) reject(sim, 'timelapseRespond', 'no-interrupt');
}

/** Phases from which "Undo founding" is offered from the pause menu (GDD 06 §5.14: until the first lay). */
const UNDO_PHASES: readonly OpeningPhase[] = ['search', 'dig', 'seal', 'lay'];

/**
 * Why "Undo founding" is refused now, or null when it is allowed: from the failure card always, from the pause
 * menu until the first egg is laid, and only while retries are left (GDD 06 §5.14).
 */
export function undoRefusal(sim: Sim): 'invalid-phase' | 'limit' | null {
  const op = openingOf(sim);
  if (!op) return 'invalid-phase';
  if (op.phase !== 'failed') {
    if (!UNDO_PHASES.includes(op.phase)) return 'invalid-phase';
    const q = foundingQueen(sim);
    if (op.layBatches > 0 || (q && eggsLaidTotal(q) > 0)) return 'invalid-phase';
  }
  return op.retriesUsed >= sim.state.config.difficulty.params.openingRetries ? 'limit' : null;
}

/** Undo is restored by the game from its checkpoint; the sim checks only that it is still allowed. */
function undo(sim: Sim): void {
  const why = undoRefusal(sim);
  if (why) reject(sim, 'openingUndo', why);
}

/** cheat.completeFounding: the remaining steps run automatically (auto.ts), aiming at about `workers` first workers. */
function completeFounding(sim: Sim, c: CommandOf<'cheat.completeFounding'>): void {
  const op = openingOf(sim);
  const q = foundingQueen(sim);
  if (!op || !q || op.done || op.phase === 'failed' || op.phase === 'handover') { reject(sim, c.type, 'invalid-phase'); return; }
  startAuto(q, autoClutchFor(sim, Number.isFinite(c.workers) ? c.workers : 10));
  if (op.phase === 'intro-card') { ensureThermal(sim); setPhase(sim, op, 'dealation'); }
  if (op.phase === 'dealation') setPhase(sim, op, 'search');
  if (op.lapse && op.phase === 'timelapse') op.lapse.skipped = true;
}

const PHASE_OF: Partial<Record<FoundingDigState, OpeningPhase>> = {
  'site-search': 'search', digging: 'dig', ready: 'seal', sealed: 'lay',
};

/** cheat.setFoundingState: writes the nest's founding state and moves the opening to the matching phase. */
function setFoundingState(sim: Sim, c: CommandOf<'cheat.setFoundingState'>): void {
  const nest = sim.stores.nests.get(c.nestId) ?? foundingNest(sim);
  if (!nest || !nest.founding) { reject(sim, c.type, 'no-target'); return; }
  nest.founding.state = c.state;
  if (c.state === 'ready' && nest.founding.readyTick < 0) nest.founding.readyTick = sim.state.tick;
  if (c.state === 'sealed' && nest.founding.sealedTick < 0) nest.founding.sealedTick = sim.state.tick;
  const op = openingOf(sim);
  const phase = PHASE_OF[c.state];
  if (op && phase && !op.done && op.phase !== 'failed') {
    if (op.phase === 'intro-card') ensureThermal(sim);
    setPhase(sim, op, phase);
    if (phase === 'lay') op.sealed = true;
  }
  const q = foundingQueen(sim);
  if (q) bbSet(q, FB.readinessTick, -1e9);
}

bindFoundingCommands({
  openingSkipIntro: (sim) => skipIntro(sim),
  openingBeginTimelapse: (sim) => beginTimelapse(sim),
  skipTimelapse: (sim) => skipTimelapse(sim),
  timelapseRespond: respond,
  openingUndo: (sim) => undo(sim),
  'cheat.completeFounding': completeFounding,
  'cheat.setFoundingState': setFoundingState,
});

/** The opening's command handlers (bound late, see entry.ts). */
export { foundingCommandHandlers } from './entry';
