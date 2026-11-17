// Outbound, search, queue and return (GDD 02 §8.4, §9.2, §10.2). Each function is one think of its phase.

import type { Vec3 } from '@/core/math/vec3';
import type { Ant, Sim } from '@/sim/types';
import { AntFlag } from '@/sim/types';
import {
  ALT_SOURCE_BU, ARRIVE_SOURCE_BU, EXIT_CLEAR_BU, FOLLOW_MIN_PH, OUTBOUND_BASE_S, OUTBOUND_MAX_S, OUTBOUND_PER_BU_S,
  QUEUE_DIST_BU, QUEUE_NO_TRAIL_S, QUEUE_S, RETURN_LOST_S, RETURN_REPLAN_S, RETURN_STAGE_S, ROUTE_WP_ARRIVE_BU, SEARCH_ARRIVE_BU, SEARCH_S, SEARCH_STEP_RAD, TRAIL_FOLLOW_MAX_S,
  HUNT_PATCH_SEARCH_S,
} from '@/sim/balance/foraging';
import { footprintMm } from '@/sim/ecology';
import { navFollowTrail } from '@/sim/locomotion';
import { processAntDeath } from '@/sim/ants/lifecycle';
import { avoidMarkerNear, smelledSource, touchedSource, trailHere } from '@/sim/ants/perception';
import { TICKS_PER_SECOND } from '@/sim/time';
import { chooseNear, leadValid, markDepleted, usableFor } from './choice';
import { distFromHome, homeNest, logDecision, mainEntrance, noteFailure, phaseS } from './common';
import type { Flavour } from './flavours';
import { HOME, K, NAV } from './keys';
import { noteTrailLost } from './monitor';
import { avoidLeg } from './avoid';
import { arrived, destOf, distXZ, failed, goTo, moving, stop } from './nav';
import { tryHarvest } from './phaseCollect';
import { tripPatch } from './hunt';
import { learnedRoute, waypoint } from './routes';
import { startOutboundDabs, stopLaying } from './trail';
import { checkCourse, startCourse } from './trailCourse';
import {
  homePlanner, resumeOutboundNav, startApproach, startCollect, startDeliver, startOutbound, startReturn, startSearch,
} from './transitions';

const tmp: Vec3 = { x: 0, y: 0, z: 0 };
const tmp2: Vec3 = { x: 0, y: 0, z: 0 };

/** The source the trip is after, or any usable one when the trip has none (marker search). */
function wanted(sim: Sim, ant: Ant, fl: Flavour, id: number): boolean {
  if (id < 0) return false;
  const src = ant.bb[K.src] ?? -1;
  if (src >= 0 && id !== src && !fl.scout) return false;
  return usableFor(sim, ant, id, fl.accept);
}

/** Contact with the wanted source -> collect; its smell -> approach. True when the phase changed. */
export function reactToFood(sim: Sim, ant: Ant, fl: Flavour): boolean {
  if (ant.nestId >= 0) return false;
  const touch = touchedSource(ant);
  if (wanted(sim, ant, fl, touch)) {
    startCollect(sim, ant, fl, touch);
    tryHarvest(sim, ant, fl, false);
    return true;
  }
  const smell = smelledSource(ant);
  if ((ant.bb[K.nav] ?? -1) !== NAV.approach && wanted(sim, ant, fl, smell)) {
    startApproach(sim, ant, fl, smell);
    return true;
  }
  return false;
}

function outboundTimeoutS(sim: Sim, ant: Ant): number {
  const d = distFromHome(sim, ant, { x: ant.bb[K.dx] ?? ant.pos.x, z: ant.bb[K.dz] ?? ant.pos.z }) / sim.world.bu;
  return Math.min(OUTBOUND_MAX_S, OUTBOUND_BASE_S + OUTBOUND_PER_BU_S * (Number.isFinite(d) ? d : 0));
}

function searchHere(sim: Sim, ant: Ant, fl: Flavour): void {
  // a hunting trip searches its whole patch (prey appears ahead of an ant moving in it)
  const patch = tripPatch(sim, ant);
  if (patch) { startSearch(sim, ant, fl, patch.center, patch.radius, 'job:hunt'); return; }
  const markerId = ant.bb[K.marker] ?? -1;
  const m = markerId >= 0 ? sim.stores.markers.get(markerId) : undefined;
  startSearch(sim, ant, fl, destOf(ant, tmp), m ? m.radius : 0, m ? `marker:${m.kind}` : undefined);
}

function exitedNest(sim: Sim, ant: Ant): boolean {
  if (ant.nestId >= 0) return false;
  const nest = homeNest(sim, ant);
  const e = nest ? mainEntrance(nest) : undefined;
  return !e || distXZ(ant.pos, e.pos) >= EXIT_CLEAR_BU * sim.world.bu;
}

/**
 * Leaving the nest toward a source with a lead or news: pick up a trail unless this bout ignores trails. Whether it
 * is the source's own trail shows on the way (trailCourse.ts); outbound dabs start once a stretch was on course.
 */
function maybeFollowTrail(sim: Sim, ant: Ant): boolean {
  if ((ant.flags & AntFlag.TRAIL_IGNORER) !== 0 || trailHere(ant) < FOLLOW_MIN_PH) return false;
  if (avoidMarkerNear(ant) >= 0) return false;
  if (!navFollowTrail(sim, ant, ant.colony, 'trail', 'out')) return false;
  ant.bb[K.nav] = NAV.trail;
  ant.bb[K.nav0] = sim.state.tick;
  ant.bb[K.onTrail] = 1;
  startCourse(ant);
  return true;
}

/** Judges the followed trail's course: dabs only on course; another source's trail -> planner (§6.7). */
function keepTrail(sim: Sim, ant: Ant): void {
  switch (checkCourse(sim, ant, destOf(ant, tmp))) {
    case 'on':
      if ((ant.flags & AntFlag.TRAIL_ON) === 0) startOutboundDabs(sim, ant);
      return;
    case 'drift':
      stopLaying(sim, ant);
      return;
    case 'off':
      logDecision(sim, ant, 'job:other-trail', ant.bb[K.src] ?? -1);
      toPlanner(sim, ant);
      return;
    default:
  }
}

function toPlanner(sim: Sim, ant: Ant): void {
  if ((ant.bb[K.nav] ?? -1) === NAV.trail) stopLaying(sim, ant);
  ant.bb[K.nav] = NAV.plan;
  ant.bb[K.nav0] = sim.state.tick;
  resumeOutboundNav(sim, ant);
}

export function updateOutbound(sim: Sim, ant: Ant, fl: Flavour): void {
  if (phaseS(sim, ant) > outboundTimeoutS(sim, ant)) { startReturn(sim, ant, fl, false, 'timeout'); return; }
  if (reactToFood(sim, ant, fl)) return;
  if (ant.nestId < 0) {
    const leg = avoidLeg(sim, ant, destOf(ant, tmp2));
    if (leg === 'leg') return;
    if (leg === 'done') { toPlanner(sim, ant); return; }
  }
  const mode = ant.bb[K.nav] ?? NAV.exit;
  const navS = (sim.state.tick - (ant.bb[K.nav0] ?? sim.state.tick)) / TICKS_PER_SECOND;
  if (failed(ant) && mode !== NAV.trail) {
    if (noteFailure(sim, ant)) { startReturn(sim, ant, fl, false, 'stuck'); return; }
    if (mode === NAV.approach) { searchHere(sim, ant, fl); return; }
    toPlanner(sim, ant);
    return;
  }
  switch (mode) {
    case NAV.exit:
      if (exitedNest(sim, ant) && (leadValid(sim, ant) || (ant.bb[K.src] ?? -1) >= 0) && maybeFollowTrail(sim, ant)) return;
      if (!moving(ant)) arriveOrRetry(sim, ant, fl);
      return;
    case NAV.trail:
      if (failed(ant)) {
        noteTrailLost(sim, ant.colony, ant.bb[K.src] ?? -1, ant.pos, ant.id);
        toPlanner(sim, ant);
        return;
      }
      if (navS > TRAIL_FOLLOW_MAX_S || avoidMarkerNear(ant) >= 0) { toPlanner(sim, ant); return; }
      keepTrail(sim, ant);
      return;
    case NAV.route: {
      if (moving(ant)) return;
      const r = learnedRoute(ant, ant.bb[K.src] ?? -1);
      const i = (ant.bb[K.wp] ?? 1) + 1;
      if (!r || i >= r.n || avoidMarkerNear(ant) >= 0) { toPlanner(sim, ant); return; }
      ant.bb[K.wp] = i;
      goTo(sim, ant, waypoint(r, i, tmp), ROUTE_WP_ARRIVE_BU);
      return;
    }
    case NAV.approach:
      if (!moving(ant)) {
        // standing at the source without contact: it is not where it smelled (or it went) -> search
        if (!tryHarvestAt(sim, ant, fl)) searchHere(sim, ant, fl);
      }
      return;
    default:
      if (!moving(ant)) arriveOrRetry(sim, ant, fl);
  }
}

/** At the trip's source: switch to collect (which approaches, queues or harvests). False if it is not usable. */
function tryHarvestAt(sim: Sim, ant: Ant, fl: Flavour): boolean {
  const src = ant.bb[K.src] ?? -1;
  if (!usableFor(sim, ant, src, fl.accept)) return false;
  startCollect(sim, ant, fl, src);
  tryHarvest(sim, ant, fl, false);
  return true;
}

/** Planner leg ended: at the destination -> search; elsewhere -> plan again. */
function arriveOrRetry(sim: Sim, ant: Ant, fl: Flavour): void {
  destOf(ant, tmp);
  const src = sim.stores.sources.get(ant.bb[K.src] ?? -1);
  const near = ARRIVE_SOURCE_BU * sim.world.bu + (src ? footprintMm(src, sim.world.bu) : 0);
  if (ant.nestId < 0 && distXZ(ant.pos, tmp) <= near) {
    if (src && tryHarvestAt(sim, ant, fl)) return;
    searchHere(sim, ant, fl);
    return;
  }
  if (arrived(ant) || ant.nav.status === 'idle') resumeOutboundNav(sim, ant);
}

export function updateSearch(sim: Sim, ant: Ant, fl: Flavour): void {
  if (reactToFood(sim, ant, fl)) return;
  const limitS = tripPatch(sim, ant) ? HUNT_PATCH_SEARCH_S : SEARCH_S;
  if (phaseS(sim, ant) >= limitS) {
    const src = ant.bb[K.src] ?? -1;
    if (src >= 0) markDepleted(sim, ant, src);
    startReturn(sim, ant, fl, false, src >= 0 ? 'source-depleted' : 'timeout', src);
    return;
  }
  if (moving(ant)) return;
  const a = (ant.bb[K.sa] ?? 0) + SEARCH_STEP_RAD;
  ant.bb[K.sa] = a;
  const full = (limitS * TICKS_PER_SECOND) / 2;
  const r = (ant.bb[K.sr] ?? 0) * Math.min(1, (sim.state.tick - (ant.bb[K.phase0] ?? sim.state.tick) + 1) / full);
  tmp.x = (ant.bb[K.sx] ?? ant.pos.x) + Math.cos(a) * r;
  tmp.z = (ant.bb[K.sz] ?? ant.pos.z) + Math.sin(a) * r;
  tmp.y = sim.field.height(tmp.x, tmp.z);
  if (!goTo(sim, ant, tmp, SEARCH_ARRIVE_BU)) ant.bb[K.sa] = a + Math.PI / 2;
}

export function updateQueue(sim: Sim, ant: Ant, fl: Flavour): void {
  const src = ant.bb[K.src] ?? -1;
  const s = sim.stores.sources.get(src);
  const waited = (sim.state.tick - (ant.bb[K.queue0] ?? sim.state.tick)) / TICKS_PER_SECOND;
  if (waited > QUEUE_NO_TRAIL_S) ant.bb[K.queuedLong] = 1;
  if (!s || !usableFor(sim, ant, src, fl.accept)) { startReturn(sim, ant, fl, false, 'source-depleted', src); return; }
  if (phaseS(sim, ant) >= QUEUE_S) {
    const alt = chooseNear(sim, ant, s.pos, ALT_SOURCE_BU * sim.world.bu, src);
    const a = alt >= 0 ? sim.stores.sources.get(alt) : undefined;
    if (a) startOutbound(sim, ant, fl, a.id, a.pos, -1, 'source-crowded', a.id);
    else startReturn(sim, ant, fl, false, 'source-crowded', src);
    return;
  }
  // keep close to the source; harvest as soon as a slot frees
  if (distXZ(ant.pos, s.pos) - footprintMm(s, sim.world.bu) > QUEUE_DIST_BU * sim.world.bu) {
    if (!moving(ant)) goTo(sim, ant, s.pos, QUEUE_DIST_BU);
    return;
  }
  if (moving(ant)) stop(sim, ant);
  tryHarvest(sim, ant, fl, true); // switches to collect when a slot is free
}

export function updateReturn(sim: Sim, ant: Ant, fl: Flavour): void {
  if (ant.nestId >= 0) { stopLaying(sim, ant); startDeliver(sim, ant, fl); return; }
  const nest = homeNest(sim, ant);
  const e = nest ? mainEntrance(nest) : undefined;
  const leg = e ? avoidLeg(sim, ant, e.pos) : 'none';
  if (leg === 'leg') return;
  if (leg === 'done') { homePlanner(sim, ant); return; }
  const mode = ant.bb[K.home] ?? HOME.planner;
  const t = phaseS(sim, ant);
  if (t > RETURN_LOST_S) { processAntDeath(sim, ant.id, 'lost'); return; }
  if (mode !== HOME.planner && (t > RETURN_STAGE_S || avoidMarkerNear(ant) >= 0)) { homePlanner(sim, ant); return; }
  if (t > RETURN_REPLAN_S && failed(ant)) { homePlanner(sim, ant); return; }
  if (moving(ant)) return;
  if (failed(ant)) {
    noteFailure(sim, ant);
    homePlanner(sim, ant);
    return;
  }
  if (mode === HOME.route) {
    const r = learnedRoute(ant, ant.bb[K.src] ?? -1);
    const i = (ant.bb[K.wp] ?? 0) - 1;
    if (!r || i < 0) { homePlanner(sim, ant); return; }
    ant.bb[K.wp] = i;
    goTo(sim, ant, waypoint(r, i, tmp), ROUTE_WP_ARRIVE_BU);
    return;
  }
  // crumbs reached the entrance (crumb 0), or the planner leg ended outside: go in
  homePlanner(sim, ant);
}
