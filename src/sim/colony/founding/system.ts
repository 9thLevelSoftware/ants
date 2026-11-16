// The opening's state machine (GDD 06 §5.1): one system in the `queen` phase drives
// intro-card -> dealation -> search <-> dig -> seal -> lay -> timelapse -> handover -> done, and failed.
// It runs before the actions system, so a bite seen in progress here still lands this tick under the new state.

import type { Ant, Nest, OpeningPhase, OpeningState, Sim } from '@/sim/types';
import { bindFoundingSystem } from './entry';
import { OPEN_DEALATION_LOCK_S, OPEN_DEALATION_S, HANDOVER_DONE_S } from '@/sim/balance/founding';
import { TICKS_PER_SECOND } from '@/sim/time';
import { FB, bbClear, bbGet, bbSet, foundingNest, foundingQueen, openingOf, playerColonyOf, queenOf, setPhase } from './access';
import { autoTick, isAuto } from './auto';
import { careTick } from './care';
import { layTick, refuseLayBeforeSeal } from './clutch';
import { bitePoint, digTick, sealTick, searchTick } from './dig';
import { exposureTick, nestSealed } from './exposure';
import { soilForSeal } from './seal';
import { sealGuideTick } from './sealGuide';
import { broodLost, causeOfQueenDeath, failOpening } from './failure';
import { closeAim, handover, openAim } from './handover';
import { beginLapse, lapseTick } from './lapse';
import { assessDigSite, readoutTick } from './readout';
import { reopenTick } from './reopen';

/** The phase now (a function call, so TypeScript does not narrow it across the transitions below). */
function phaseOf(op: OpeningState): OpeningPhase {
  return op.phase;
}

function phaseTicks(sim: Sim, q: Ant): number {
  return sim.state.tick - bbGet(q, FB.phaseTick, sim.state.tick);
}

/** The player's intent held at rest (input lock of the dealation; the queen's automatic care in the lapse). */
function holdStill(sim: Sim): void {
  const i = sim.state.player.intent;
  i.dir.x = 0; i.dir.y = 0; i.dir.z = 0;
  i.held.length = 0;
}

function dealationTick(sim: Sim, op: OpeningState, q: Ant): void {
  const t = phaseTicks(sim, q);
  // input locked while she sheds her wings (the camera settles behind her)
  if (t < OPEN_DEALATION_LOCK_S * TICKS_PER_SECOND) holdStill(sim);
  if (t >= OPEN_DEALATION_S * TICKS_PER_SECOND) {
    if (q.queen?.founding) q.queen.founding.wings = false;
    setPhase(sim, op, 'search');
    openAim(sim, 'aim-find-site');
    sim.emit({ type: 'hint-trigger', hintId: 'hint-reserves' });
    sim.emit({ type: 'hint-trigger', hintId: 'hint-move' });
  }
}

function handoverTick(sim: Sim, op: OpeningState): void {
  const q = queenOf(sim);
  const t = q ? phaseTicks(sim, q) : HANDOVER_DONE_S * TICKS_PER_SECOND;
  const d = sim.state.player.intent.dir;
  const moving = sim.state.player.possessedAntId >= 0 && d.x * d.x + d.y * d.y + d.z * d.z > 0.01;
  if (t >= HANDOVER_DONE_S * TICKS_PER_SECOND || moving) {
    setPhase(sim, op, 'done');
    if (q) bbClear(q); // the founding module keeps nothing on the established queen
  }
}

/** Claustral phases: the queen's care pays her upkeep; outside the sealed cell the exposure rules do. */
function sealedOrOpen(sim: Sim, op: OpeningState, q: Ant, nest: Nest): void {
  if (nestSealed(sim)) {
    exposureTick(sim, q, false);
    if (q.alive) careTick(sim, op, q, nest);
  } else {
    exposureTick(sim, q, true);
  }
}

/**
 * The founding queen's pool replaces the colony's stores until the first worker eats (GDD 02 §2.7 point 1): the
 * colony's empty stores are no famine, so its starvation clocks (GDD 02 §5.7: brood sacrifice and the "colony is
 * starving" alarm) do not run during the opening.
 */
function holdStarvationClocks(sim: Sim): void {
  const core = playerColonyOf(sim)?.core;
  if (core) { core.cZeroSinceTick = -1; core.pZeroSinceTick = -1; }
}

function step(sim: Sim, op: OpeningState, q: Ant, nest: Nest): void {
  holdStarvationClocks(sim);
  if (isAuto(q)) autoTick(sim, op, q, nest);
  switch (op.phase) {
    case 'dealation':
      dealationTick(sim, op, q);
      return;
    case 'search': {
      exposureTick(sim, q, true);
      if (!q.alive) return;
      readoutTick(sim, op, q);
      const before = op.phase;
      searchTick(sim, op, q, nest);
      if (before === 'search' && phaseOf(op) === 'dig') {
        const p = bitePoint(sim, q);
        if (p && bbGet(q, FB.digSite, 0) !== 1) { bbSet(q, FB.digSite, 1); assessDigSite(sim, op, p); }
        closeAim(sim, 'aim-find-site');
        openAim(sim, 'aim-dig-chamber');
        sim.emit({ type: 'hint-trigger', hintId: 'hint-readiness' });
      }
      return;
    }
    case 'dig':
      exposureTick(sim, q, true);
      if (!q.alive) return;
      if (bbGet(q, FB.digSite, 0) !== 1) { // the dig site's own reading (also when the dig started another way)
        bbSet(q, FB.digSite, 1);
        assessDigSite(sim, op, bitePoint(sim, q) ?? nest.origin);
      }
      digTick(sim, op, q, nest);
      if (phaseOf(op) === 'seal') {
        closeAim(sim, 'aim-dig-chamber');
        openAim(sim, 'aim-seal');
        sim.emit({ type: 'hint-trigger', hintId: 'hint-seal' });
      }
      return;
    case 'seal':
      refuseLayBeforeSeal(sim, q);
      exposureTick(sim, q, true);
      if (!q.alive) return;
      // sealed first: soil is scraped (and the guide plans) only while a throat is still open (a plug lands in the
      // actions system, after this one, so the next tick's check sees it)
      if (!sealTick(sim, op, nest)) {
        soilForSeal(sim, q, nest);
        sealGuideTick(sim, q, nest);
      } else {
        setPhase(sim, op, 'lay');
        closeAim(sim, 'aim-seal');
        openAim(sim, 'aim-first-clutch');
        sim.emit({ type: 'hint-trigger', hintId: 'hint-lay' });
      }
      return;
    case 'lay':
      sealedOrOpen(sim, op, q, nest);
      if (!q.alive) return;
      if (layTick(sim, op, q, nest)) {
        openAim(sim, 'aim-first-workers');
        beginLapse(sim, op, q, nest, isAuto(q));
        sim.emit({ type: 'hint-trigger', hintId: 'hint-timelapse' });
      }
      return;
    case 'timelapse': {
      holdStill(sim);
      sealedOrOpen(sim, op, q, nest);
      if (!q.alive) return;
      const r = lapseTick(sim, op, q);
      if (r === 'end') {
        handover(sim, op, q, nest);
        sim.emit({ type: 'hint-trigger', hintId: 'hint-cycle' });
      } else if (r === 'empty') broodLost(sim, op, q, nest);
      return;
    }
    default:
  }
}

export function runFounding(sim: Sim): void {
  const op = openingOf(sim);
  if (op && (op.phase === 'handover' || op.phase === 'done')) reopenTick(sim);
  if (!op || op.done || op.phase === 'failed' || op.phase === 'intro-card') return;
  if (op.phase === 'handover') { handoverTick(sim, op); return; }
  const q = foundingQueen(sim);
  const nest = foundingNest(sim);
  if (!q || !nest) {
    // she died (or was never a founding queen): the founding failed
    const any = queenOf(sim);
    if (!any || !any.alive || !nest) failOpening(sim, op, causeOfQueenDeath(sim));
    return;
  }
  step(sim, op, q, nest);
  if (!q.alive) failOpening(sim, op, causeOfQueenDeath(sim));
}

bindFoundingSystem(runFounding);
/** Founding sequence (opening phases, founding model, time-lapse); bound late, see entry.ts. */
export { foundingSystem } from './entry';
