// Scouting (GDD 02 §10.1): depart 10 BU, then a correlated random walk biased away from home-marked ground and
// from avoid markers, toward an open forage marker for half the scouts, and toward cells the colony has not
// explored; food odour -> investigate (climb toward it); contact -> assess -> collect -> return -> report.

import { rngChance, rngFloat, rngGauss } from '@/core/rng';
import type { Vec3 } from '@/core/math/vec3';
import type { Ant, Marker, ReasonCode, Sim } from '@/sim/types';
import { HOME_EXPLORED } from '@/sim/balance';
import {
  INVESTIGATE_S, LEG_ARRIVE_BU, SCOUT_CANDIDATES, SCOUT_DEPART_BU, SCOUT_DEPART_DONE_FRAC, SCOUT_DEPART_MAX_S, SCOUT_EDGE_BU,
  SCOUT_LEG_BU, SCOUT_MARKER_ARRIVE_FRAC,
  SCOUT_FAN_RAD, SCOUT_RAY_LEGS, SCOUT_MARKER_SHARE, SCOUT_MAX_RANGE_BU, SCOUT_MAX_S, SCOUT_TURN_SIGMA_DEG_S,
  SCOUT_W_AVOID, SCOUT_W_HOME, SCOUT_W_MARKER, SCOUT_W_NOISE, SCOUT_W_STRAIGHT, SCOUT_W_UNEXPLORED,
} from '@/sim/balance/foraging';
import { homeHere, isExplored, smelledSource, touchedSource } from '@/sim/ants/perception';
import { casteSpeeds } from '@/sim/locomotion';
import { TICKS_PER_SECOND } from '@/sim/time';
import { usableFor } from './choice';
import { distFromHome, homeNest, mainEntrance, noteFailure, phaseS, setPhase } from './common';
import type { Flavour } from './flavours';
import { K, PHASE } from './keys';
import { atSource, distXZ, failed, goTo, goToSource, moving, stop } from './nav';
import { rationStep } from './phaseNest';
import { assessFind } from './phaseCollect';
import { dropAction, startReturn } from './transitions';
import { stopLaying } from './trail';

const tmp: Vec3 = { x: 0, y: 0, z: 0 };

function openForageMarkers(sim: Sim, ant: Ant): Marker[] {
  return sim.stores.markers.list.filter((m) => m.alive && m.kind === 'forage' && m.colony === ant.colony);
}

function insideAvoid(sim: Sim, ant: Ant, x: number, z: number): boolean {
  for (const m of sim.stores.markers.list) {
    if (m.alive && m.kind === 'avoid' && m.colony === ant.colony && Math.hypot(x - m.pos.x, z - m.pos.z) <= m.radius) return true;
  }
  return false;
}

/** Bout start: ration, then out of the entrance along a chosen heading (or toward a forage marker). */
export function startDepart(sim: Sim, ant: Ant, fl: Flavour, reason?: ReasonCode): void {
  dropAction(sim, ant);
  stopLaying(sim, ant);
  const rng = sim.stream('rng.behaviour');
  ant.bb[K.trip0] = sim.state.tick;
  ant.bb[K.wentOut] = ant.nestId >= 0 ? 0 : 1;
  ant.bb[K.success] = 0;
  ant.bb[K.src] = -1;
  ant.bb[K.recall] = 0;
  ant.bb[K.queuedLong] = 0;
  ant.bb[K.rationed] = 0;
  ant.bb[K.ration] = ant.nestId >= 0 ? 0 : 2;
  const markers = openForageMarkers(sim, ant);
  const m = markers.length > 0 && rngChance(rng, SCOUT_MARKER_SHARE) ? markers[Math.floor(rngFloat(rng) * markers.length)] : undefined;
  ant.bb[K.marker] = m ? m.id : -1;
  const nest = homeNest(sim, ant);
  const e = nest ? mainEntrance(nest) : undefined;
  const origin = e ? e.pos : ant.pos;
  const heading = m ? Math.atan2(m.pos.z - origin.z, m.pos.x - origin.x) : bestHeading(sim, ant, origin, rngFloat(rng) * 2 * Math.PI, Math.PI);
  ant.bb[K.heading] = heading;
  ant.bb[K.dx] = origin.x + Math.cos(heading) * SCOUT_DEPART_BU * sim.world.bu;
  ant.bb[K.dz] = origin.z + Math.sin(heading) * SCOUT_DEPART_BU * sim.world.bu;
  ant.bb[K.dy] = sim.field.height(ant.bb[K.dx], ant.bb[K.dz]);
  setPhase(sim, ant, fl.names, PHASE.depart, reason ?? (m ? 'marker:forage' : 'spontaneous'), m ? m.id : -1);
  if (ant.bb[K.ration] === 2) departNav(sim, ant);
  else stop(sim, ant);
}

function departNav(sim: Sim, ant: Ant): void {
  tmp.x = ant.bb[K.dx]; tmp.y = ant.bb[K.dy]; tmp.z = ant.bb[K.dz];
  goTo(sim, ant, tmp, LEG_ARRIVE_BU);
}

export function updateDepart(sim: Sim, ant: Ant, fl: Flavour): void {
  if (rationStep(sim, ant)) return;
  if ((ant.bb[K.ration] ?? 2) === 2 && !moving(ant) && ant.nestId >= 0 && ant.nav.status !== 'failed') departNav(sim, ant);
  const out = ant.nestId < 0 && distFromHome(sim, ant, ant.pos) >= SCOUT_DEPART_DONE_FRAC * SCOUT_DEPART_BU * sim.world.bu;
  if (out || (ant.nestId < 0 && !moving(ant)) || phaseS(sim, ant) > SCOUT_DEPART_MAX_S) {
    if (ant.nestId >= 0) { startReturn(sim, ant, fl, false, 'stuck'); return; }
    ant.bb[K.explore0] = sim.state.tick;
    setPhase(sim, ant, fl.names, PHASE.explore);
    nextLeg(sim, ant);
    return;
  }
  if (failed(ant) && noteFailure(sim, ant)) startReturn(sim, ant, fl, false, 'stuck');
  else if (failed(ant)) departNav(sim, ant);
}

/**
 * Picks a heading among candidates around `base` (spread rad): unexplored cells score, avoid discs and blocked
 * nav cells exclude, a marker waypoint attracts, and on home-marked ground headings away from home score.
 */
function bestHeading(sim: Sim, ant: Ant, from: Vec3, base: number, spread: number): number {
  const col = sim.stores.colonies.get(ant.colony);
  const rng = sim.stream('rng.behaviour');
  const leg = SCOUT_LEG_BU * sim.world.bu;
  const m = sim.stores.markers.get(ant.bb[K.marker] ?? -1);
  const nest = homeNest(sim, ant);
  const e = nest ? mainEntrance(nest) : undefined;
  const marked = homeHere(ant) > HOME_EXPLORED;
  const edge = SCOUT_EDGE_BU * sim.world.bu, size = sim.world.size;
  let best = base, bestScore = -Infinity;
  for (let k = 0; k < SCOUT_CANDIDATES; k++) {
    // the walk's own turn first, then a fan around it (the correlated walk stays the default)
    const h = k === 0 ? base : base + ((k % 2 === 1 ? 1 : -1) * Math.ceil(k / 2) * SCOUT_FAN_RAD) + rngGauss(rng, 0, spread * 0.5);
    const x = from.x + Math.cos(h) * leg, z = from.z + Math.sin(h) * leg;
    if (x < edge || z < edge || x > size - edge || z > size - edge || sim.navGrid.blocked(x, z)) continue;
    let score = rngFloat(rng) * SCOUT_W_NOISE + (k === 0 ? SCOUT_W_STRAIGHT : 0);
    if (col) {
      // unexplored ground along the ray, near cells weighing most: the scout heads for the closest frontier
      for (let r = 0; r < SCOUT_RAY_LEGS.length; r++) {
        const far = SCOUT_RAY_LEGS[r] * leg;
        if (!isExplored(sim, col, from.x + Math.cos(h) * far, from.z + Math.sin(h) * far)) score += SCOUT_W_UNEXPLORED / (1 + r);
      }
    }
    if (insideAvoid(sim, ant, x, z)) score -= SCOUT_W_AVOID;
    if (m && m.alive) score += SCOUT_W_MARKER * Math.cos(h - Math.atan2(m.pos.z - from.z, m.pos.x - from.x));
    if (marked && e) score += SCOUT_W_HOME * Math.cos(h - Math.atan2(from.z - e.pos.z, from.x - e.pos.x));
    if (score > bestScore) { bestScore = score; best = h; }
  }
  return best;
}

function nextLeg(sim: Sim, ant: Ant): void {
  const cruise = Math.max(1e-3, casteSpeeds(sim.stores.colonies.get(ant.colony)?.species ?? sim.species.id, ant.caste, sim.world.bu).cruise);
  const legS = (SCOUT_LEG_BU * sim.world.bu) / cruise;
  const sigma = ((SCOUT_TURN_SIGMA_DEG_S * Math.PI) / 180) * Math.sqrt(legS);
  const m = sim.stores.markers.get(ant.bb[K.marker] ?? -1);
  if (m && m.alive && distXZ(ant.pos, m.pos) > m.radius) {
    // the marker is this scout's first waypoint
    if (goTo(sim, ant, m.pos, (m.radius / sim.world.bu) * SCOUT_MARKER_ARRIVE_FRAC)) return;
  } else if (m) ant.bb[K.marker] = -1;
  let h = bestHeading(sim, ant, ant.pos, (ant.bb[K.heading] ?? 0) + rngGauss(sim.stream('rng.behaviour'), 0, sigma), sigma);
  for (let tries = 0; tries < 4; tries++) {
    tmp.x = ant.pos.x + Math.cos(h) * SCOUT_LEG_BU * sim.world.bu;
    tmp.z = ant.pos.z + Math.sin(h) * SCOUT_LEG_BU * sim.world.bu;
    tmp.y = sim.field.height(tmp.x, tmp.z);
    if (goTo(sim, ant, tmp, LEG_ARRIVE_BU)) break;
    h += Math.PI / 2;
  }
  ant.bb[K.heading] = h;
}

function exploreOver(sim: Sim, ant: Ant): ReasonCode | null {
  const t = (sim.state.tick - (ant.bb[K.explore0] ?? sim.state.tick)) / TICKS_PER_SECOND;
  if (t > SCOUT_MAX_S) return 'timeout';
  if (distFromHome(sim, ant, ant.pos) > SCOUT_MAX_RANGE_BU * sim.world.bu) return 'timeout';
  // GDD 02 §10.1 returns a scout at crop C < 0.05; its own ration (0.1 C at 0.20 C/gd) falls below that after
  // about 150 s, half of SCOUT_MAX_S. Resolved: a scout turns home on hunger like any outside ant (crop C below
  // HUNGER_RETURN_CROP and reserve below half), which the engine's recall check applies.
  return null;
}

export function updateExplore(sim: Sim, ant: Ant, fl: Flavour): void {
  if (ant.nestId >= 0) { startReturn(sim, ant, fl, false, 'job:home'); return; }
  const touch = touchedSource(ant);
  if (usableFor(sim, ant, touch, fl.accept)) { setPhase(sim, ant, fl.names, PHASE.assess); assessFind(sim, ant, fl, touch); return; }
  const smell = smelledSource(ant);
  if (usableFor(sim, ant, smell, fl.accept)) {
    const s = sim.stores.sources.get(smell)!;
    ant.bb[K.src] = smell;
    setPhase(sim, ant, fl.names, PHASE.investigate, 'job:investigate', smell);
    goToSource(sim, ant, s);
    return;
  }
  const over = exploreOver(sim, ant);
  if (over) { startReturn(sim, ant, fl, false, over); return; }
  if (failed(ant)) noteFailure(sim, ant);
  if (!moving(ant)) nextLeg(sim, ant);
}

export function updateInvestigate(sim: Sim, ant: Ant, fl: Flavour): void {
  const src = ant.bb[K.src] ?? -1;
  const touch = touchedSource(ant);
  if (usableFor(sim, ant, touch, fl.accept)) { setPhase(sim, ant, fl.names, PHASE.assess); assessFind(sim, ant, fl, touch); return; }
  const s = sim.stores.sources.get(src);
  if (!s || !usableFor(sim, ant, src, fl.accept) || phaseS(sim, ant) > INVESTIGATE_S) {
    ant.bb[K.src] = -1;
    setPhase(sim, ant, fl.names, PHASE.explore, 'timeout');
    nextLeg(sim, ant);
    return;
  }
  if (!moving(ant)) {
    // standing at it: that is contact
    if (atSource(sim, ant, s)) { setPhase(sim, ant, fl.names, PHASE.assess); assessFind(sim, ant, fl, src); return; }
    if (failed(ant)) noteFailure(sim, ant);
    goToSource(sim, ant, s);
  }
}

/** Back to exploring after an interruption (flee). */
export function resumeExplore(sim: Sim, ant: Ant, fl: Flavour): void {
  setPhase(sim, ant, fl.names, PHASE.explore, 'job:resume');
  nextLeg(sim, ant);
}
