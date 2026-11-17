// Phase entries of the outdoor engine: each sets the phase (state name, decision log) and makes the first
// locomotion request. The per-think logic of each phase lives in phase*.ts and calls back in here.

import { rngChance } from '@/core/rng';
import type { Vec3 } from '@/core/math/vec3';
import type { Ant, ReasonCode, Sim } from '@/sim/types';
import { AntFlag, FOOD_KINDS } from '@/sim/types';
import { REASON_CODES } from '@/sim/types/ids/ants';
import { TRAIL_IGNORE_P } from '@/sim/balance';
import { OUTBOUND_ARRIVE_BU, ROUTE_WP_ARRIVE_BU, SEARCH_RADIUS_BU, WAIT_SPREAD_BU } from '@/sim/balance/foraging';
import { cancel, interruptible } from '@/sim/ants/actions';
import { crumbCount, navRetrace } from '@/sim/locomotion';
import { entranceChamber, homeNest, logDecision, setPhase } from './common';
import type { Flavour } from './flavours';
import { HOME, K, NAV, PHASE, UNLOAD } from './keys';
import { goTo, goToChamber, goToSource, setDest, stop } from './nav';
import { resetAvoid } from './avoid';
import { abandonTrip } from './phaseNest';
import { noteClaim } from './claims';
import { learnedRoute, prepareRoute, waypoint } from './routes';
import { decideReturnTrail, stopLaying } from './trail';

const tmp: Vec3 = { x: 0, y: 0, z: 0 };

/** Cancels a running harvest / beg when the ant changes plan (a put-down in progress always finishes). */
export function dropAction(sim: Sim, ant: Ant): void {
  if (ant.action && interruptible(ant)) cancel(sim, ant, null);
}

export function startWait(sim: Sim, ant: Ant, fl: Flavour, reason?: ReasonCode): void {
  stopLaying(sim, ant);
  setPhase(sim, ant, fl.names, PHASE.wait, reason);
  const nest = homeNest(sim, ant);
  const room = nest ? entranceChamber(nest) : undefined;
  if (room && ant.chamberId !== room.id) goToChamber(sim, ant, room, WAIT_SPREAD_BU);
  else stop(sim, ant);
}

export function startRest(sim: Sim, ant: Ant, fl: Flavour, reason: ReasonCode): void {
  stopLaying(sim, ant);
  stop(sim, ant);
  setPhase(sim, ant, fl.names, PHASE.rest, reason);
}

/** New foraging bout: trail-ignorer drawn per bout (GDD 02 §8.4), trip bookkeeping reset. */
function newBout(sim: Sim, ant: Ant): void {
  if (rngChance(sim.stream('rng.behaviour'), TRAIL_IGNORE_P)) ant.flags |= AntFlag.TRAIL_IGNORER;
  else ant.flags &= ~AntFlag.TRAIL_IGNORER;
  ant.bb[K.trip0] = sim.state.tick;
  ant.bb[K.wentOut] = ant.nestId >= 0 ? 0 : 1;
  ant.bb[K.success] = 0;
  ant.bb[K.queuedLong] = 0;
  ant.bb[K.queue0] = -1;
  ant.bb[K.onTrail] = 0;
  ant.bb[K.recall] = 0;
  ant.bb[K.patch] = -1;
  ant.bb[K.prey] = -1;
}

/**
 * Outbound to a source (srcId >= 0) or to a point (a forage marker, srcId -1). From the nest the ant first takes
 * its departure ration, then leaves by the planner; a learned route is walked waypoint by waypoint.
 */
export function startOutbound(sim: Sim, ant: Ant, fl: Flavour, srcId: number, dest: Vec3, markerId: number,
  reason: ReasonCode, detail = srcId): void {
  dropAction(sim, ant);
  if (ant.nestId >= 0 || (ant.bb[K.trip0] ?? -1) < 0) newBout(sim, ant);
  ant.bb[K.src] = srcId;
  ant.bb[K.marker] = markerId;
  setDest(ant, dest);
  ant.bb[K.nav0] = sim.state.tick;
  ant.bb[K.ration] = ant.nestId >= 0 ? 0 : 2;
  resetAvoid(ant);
  const route = learnedRoute(ant, srcId);
  setPhase(sim, ant, fl.names, PHASE.outbound, reason, detail);
  noteClaim(sim, ant, srcId);
  if (route && route.n >= 2) {
    ant.bb[K.nav] = NAV.route;
    ant.bb[K.wp] = 1;
    route.lastUsed = sim.state.tick;
  } else {
    ant.bb[K.nav] = NAV.exit;
  }
  if (ant.bb[K.ration] === 2) resumeOutboundNav(sim, ant);
  else stop(sim, ant);
}

/** (Re)issues the outbound locomotion request for the current mode. */
export function resumeOutboundNav(sim: Sim, ant: Ant): void {
  const mode = ant.bb[K.nav] ?? NAV.exit;
  const srcId = ant.bb[K.src] ?? -1;
  if (mode === NAV.route) {
    const r = learnedRoute(ant, srcId);
    const i = ant.bb[K.wp] ?? 1;
    if (r && i < r.n) { goTo(sim, ant, waypoint(r, i, tmp), ROUTE_WP_ARRIVE_BU); return; }
    ant.bb[K.nav] = NAV.plan;
  }
  if (mode === NAV.approach) {
    const s = sim.stores.sources.get(srcId);
    if (s) { goToSource(sim, ant, s); return; }
    ant.bb[K.nav] = NAV.plan;
  }
  tmp.x = ant.bb[K.dx] ?? ant.pos.x; tmp.y = ant.bb[K.dy] ?? ant.pos.y; tmp.z = ant.bb[K.dz] ?? ant.pos.z;
  goTo(sim, ant, tmp, OUTBOUND_ARRIVE_BU);
}

/** Approach a source the ant can smell or sees ahead (final leg of any outbound mode). */
export function startApproach(sim: Sim, ant: Ant, fl: Flavour, srcId: number, reason?: ReasonCode): void {
  const s = sim.stores.sources.get(srcId);
  if (!s) return;
  ant.bb[K.src] = srcId;
  ant.bb[K.nav] = NAV.approach;
  ant.bb[K.nav0] = sim.state.tick;
  stopLaying(sim, ant);
  if (ant.bb[K.phase] !== PHASE.outbound) setPhase(sim, ant, fl.names, PHASE.outbound, reason, srcId);
  else if (reason) logDecision(sim, ant, reason, srcId);
  noteClaim(sim, ant, srcId);
  goToSource(sim, ant, s);
}

/** Expanding spiral around a centre (GDD 02 §10.2 forage.search; a forage marker uses its own radius). */
export function startSearch(sim: Sim, ant: Ant, fl: Flavour, centre: Vec3, radiusMm: number, reason?: ReasonCode): void {
  stopLaying(sim, ant);
  ant.bb[K.sx] = centre.x;
  ant.bb[K.sz] = centre.z;
  ant.bb[K.sr] = Math.max(radiusMm, SEARCH_RADIUS_BU * sim.world.bu);
  ant.bb[K.sa] = 0;
  setPhase(sim, ant, fl.names, PHASE.search, reason);
  stop(sim, ant);
}

export function startQueue(sim: Sim, ant: Ant, fl: Flavour): void {
  if ((ant.bb[K.queue0] ?? -1) < 0) ant.bb[K.queue0] = sim.state.tick;
  stop(sim, ant);
  setPhase(sim, ant, fl.names, PHASE.queue, 'source-crowded', ant.bb[K.src] ?? -1);
}

export function startCollect(sim: Sim, ant: Ant, fl: Flavour, srcId: number): void {
  ant.bb[K.src] = srcId;
  stop(sim, ant);
  setPhase(sim, ant, fl.names, PHASE.collect);
}

/** The food kind of the trip's load (for delivery statistics). */
function noteKind(sim: Sim, ant: Ant): void {
  const s = sim.stores.sources.get(ant.bb[K.src] ?? -1);
  // hunted remains (hunt.ts) come from no source: the load is prey
  const hunted = !s && (ant.bb[K.patch] ?? -1) >= 0 && ant.carry.kind === 'item';
  ant.bb[K.kind] = s ? FOOD_KINDS.indexOf(s.kind) : hunted ? FOOD_KINDS.indexOf('prey') : -1;
}

/**
 * Homeward: decides trail laying once (successful foragers and scouts with a find), prepares the route memory
 * candidate, then homes by learned route, breadcrumbs (shortcuts) or the planner (GDD 02 §9.2, §10.2).
 */
export function startReturn(sim: Sim, ant: Ant, fl: Flavour, success: boolean, reason: ReasonCode, detail = -1): void {
  dropAction(sim, ant);
  stopLaying(sim, ant);
  const src = ant.bb[K.src] ?? -1;
  // a scout's trip is a success when it found something, whatever it carries home
  if (fl.scout && (ant.bb[K.success] ?? 0) === 1) success = true;
  ant.bb[K.success] = success ? 1 : 0;
  noteKind(sim, ant);
  if (success && src >= 0 && ant.nestId < 0) {
    prepareRoute(sim, ant, src);
    decideReturnTrail(sim, ant, src, fl.scout, (ant.bb[K.queuedLong] ?? 0) === 1);
  }
  resetAvoid(ant);
  if (ant.nestId >= 0 && (ant.bb[K.wentOut] ?? 0) !== 1) { abandonTrip(sim, ant, fl, reason); return; }
  ant.bb[K.returnWhy] = (REASON_CODES as readonly string[]).indexOf(reason.split(':')[0]);
  setPhase(sim, ant, fl.names, PHASE.return, reason, detail >= 0 ? detail : src);
  if (ant.nestId >= 0) { startDeliver(sim, ant, fl); return; }
  const route = learnedRoute(ant, src);
  if (route && route.n >= 2) {
    ant.bb[K.home] = HOME.route;
    ant.bb[K.wp] = route.n - 2;
    route.lastUsed = sim.state.tick;
    goTo(sim, ant, waypoint(route, route.n - 2, tmp), ROUTE_WP_ARRIVE_BU);
  } else if (crumbCount(ant) > 0 && navRetrace(sim, ant)) {
    ant.bb[K.home] = HOME.crumbs;
  } else {
    homePlanner(sim, ant);
  }
}

/** Homing by the coarse planner to the entrance chamber (hidden fallback, GDD 02 §9.2). */
export function homePlanner(sim: Sim, ant: Ant): void {
  ant.bb[K.home] = HOME.planner;
  const nest = homeNest(sim, ant);
  const room = nest ? entranceChamber(nest) : undefined;
  if (room) goToChamber(sim, ant, room, WAIT_SPREAD_BU);
}

/** Inside: unload (liquid to a receiver, solid to a food chamber pile; GDD 02 §5.3). */
export function startDeliver(sim: Sim, ant: Ant, fl: Flavour): void {
  stopLaying(sim, ant);
  ant.bb[K.unload] = UNLOAD.toChamber;
  ant.bb[K.unload0] = sim.state.tick;
  ant.bb[K.full0] = -1;
  ant.bb[K.receiver] = -1;
  ant.bb[K.badRcv] = -1;
  ant.bb[K.c0] = ant.cropC;
  ant.bb[K.p0] = ant.cropP;
  setPhase(sim, ant, fl.names, PHASE.deliver);
  stop(sim, ant);
}
