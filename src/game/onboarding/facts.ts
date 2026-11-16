// Reads the facts the hint table triggers on: the UI snapshot (what the HUD shows), a few read-only looks at the sim
// (the opening phase, the movement intent, milestones) and UI state the host passes in (open drawer, overlays, which
// prompts other presenters draw). Pure: nothing is written anywhere.
import { foundingInProgress } from '@/sim/colony/founding/access';
import { calendarTick, TICKS_PER_DAY } from '@/sim/time';
import type { HintId, Sim } from '@/sim/types';
import type { UiSnapshot } from '@/ui/api';
import { HINT_MOVE_MIN_INTENT } from './balance';
import type { Facts } from './types';

/** UI-side state the facts need (the host reads it off the UI's signals). */
export interface UiFacts {
  drawer: string | null;
  overlayScent: boolean;
  overlayOther: boolean;
  /** Hints the opening overlay draws right now. */
  foundingShown: readonly HintId[];
}

export interface FactSource {
  snap: UiSnapshot;
  sim: Sim | null;
  ui: UiFacts;
  hintsOn: boolean;
}

/** Food the player can carry home (a `carrying` word of the possessed-ant panel). */
const FOOD_WORDS = /^(food piece|seed|seed paste|carcass|live aphid)/;

const NO_FACTS: Facts = {
  active: false, menuOpen: false, hudHidden: false, view: 'observer', foundingInProgress: false, openingPhase: null, timelapse: false,
  fighting: false, criticalAlert: false, alertActive: false, speedPaused: false, moving: false, possessed: null, workers: 0,
  daysSinceFirstWorker: -1, promptPickup: false, promptShare: false, firstFood: false, firstTrail: false, diagWarn: false, markerTotal: 0,
  drawer: null, overlayScent: false, overlayOther: false, externalShown: [], hintsOn: true,
};

/** Facts for no game at all (title screen, loading). */
export function noFacts(hintsOn = true): Facts {
  return { ...NO_FACTS, hintsOn };
}

export function readFacts(src: FactSource): Facts {
  const { snap, sim, ui } = src;
  const playing = snap.screen === 'playing';
  const paused = snap.screen === 'paused';
  if (!sim || (!playing && !paused)) return { ...noFacts(src.hintsOn), active: false };
  const st = sim.state;
  const op = st.player.opening;
  const colonyId = st.player.colonyId;
  const poss = snap.possessed;
  const ant = poss ? sim.stores.ants.get(poss.id) : undefined;
  const d = st.player.intent.dir;
  const view = snap.view;
  const prompt = snap.prompt?.lines ?? [];
  const promptPickup = prompt.some((l) => (l.input === 'interact' || l.input === 'interact-hold') && /^pick up/i.test(l.text));
  const promptShare = prompt.some((l) => l.input === 'share-food' && l.ok && /^share food/i.test(l.text)); // not "Beg food": the crop must have something to give
  const ms = st.progression.milestones;
  const firstWorker = ms['ms-first-worker'];
  const worst = snap.colony?.worst?.status;
  const markers = snap.markers;
  const markerTotal = markers
    ? Object.values(markers.counts).reduce((n, c) => n + c.n, 0) + markers.plans.filter((p) => p.source === 'player').length
    : 0;
  const external: HintId[] = [...ui.foundingShown];
  if (promptPickup) external.push('hint-pickup');
  if (promptShare) external.push('hint-share');
  return {
    active: true,
    menuOpen: paused,
    hudHidden: snap.hudHidden,
    view,
    foundingInProgress: foundingInProgress(sim, colonyId),
    openingPhase: op && !op.done ? op.phase : null,
    timelapse: st.player.timelapse !== null || (!!op && op.phase === 'timelapse'),
    fighting: !!ant && ant.combat !== null,
    criticalAlert: snap.alerts.some((a) => a.level === 'critical'),
    alertActive: snap.alerts.some((a) => a.level === 'warning' || a.level === 'critical'),
    speedPaused: snap.speed?.paused ?? false,
    moving: view === 'possess' && !!poss && d.x * d.x + d.y * d.y + d.z * d.z >= HINT_MOVE_MIN_INTENT * HINT_MOVE_MIN_INTENT,
    possessed: poss ? {
      isQueen: poss.isQueen ?? poss.caste === 'queen', underground: poss.underground, carryingFood: FOOD_WORDS.test(poss.carrying),
      trailOn: poss.trailOn, colonyOrders: !!poss.colonyOrders,
    } : null,
    workers: snap.colony?.workers ?? 0,
    daysSinceFirstWorker: firstWorker ? Math.max(0, (calendarTick(st) - firstWorker.tick) / TICKS_PER_DAY) : -1,
    promptPickup, promptShare,
    firstFood: !!ms['ms-first-food'],
    firstTrail: !!ms['ms-first-trail'],
    diagWarn: worst === 'warn' || worst === 'bad' || snap.colony?.status === 'warn' || snap.colony?.status === 'bad',
    markerTotal,
    drawer: ui.drawer, overlayScent: ui.overlayScent, overlayOther: ui.overlayOther,
    externalShown: external,
    hintsOn: src.hintsOn,
  };
}
