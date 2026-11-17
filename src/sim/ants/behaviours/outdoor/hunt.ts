// Hunting patch prey (ruling R18; GDD 05 §2.3 prey patches, §1.5 subduing; GDD 02 §10.2 "prey: combat first").
//
// Springtails (and mites, the prey of last resort) appear only ahead of a forager or scout moving inside a prey
// patch (ecology spawners). Before this module nothing bit them: the colony walked through 200 springtails' worth of
// protein and starved of it (colony-life round 2). Three parts:
//   1. huntCheck (engine interrupt): an outside forager or scout with free mandibles that sees patch prey within
//      HUNT_NOTICE_BU chases it (phase `hunt`); the colony now knows that patch (PreyPatch.knownBy).
//   2. updateHunt: approach, `bite` (combat resolves it: the prey may evade, one bite kills a springtail, its remains
//      become a food item), `pick-up` the remains, home with them like any solid load.
//   3. Hunting trips: a waiting forager scores the known patches like sources (choosePatch) and walks to the best one
//      when it beats every known source; there it searches the patch (phaseTravel search, HUNT_PATCH_SEARCH_S).

import type { Vec3 } from '@/core/math/vec3';
import type { Ant, Item, PreyPatch, Sim } from '@/sim/types';
import { CROP_RETURN_FRACTION } from '@/sim/balance/actions';
import {
  CHOICE_CROWD_MIN, CHOICE_MIN_TRIP_S, HUNT_CHASE_S, HUNT_EXPECT_S, HUNT_NOTICE_BU, HUNT_REMAINS_BU, PATCH_FORAGERS_MAX,
} from '@/sim/balance/foraging';
import { CREATURE_STATS } from '@/sim/balance/creatures';
import { begin, canDo } from '@/sim/ants/actions';
import { sourceWeight } from '@/sim/colony';
import { preyNear } from '@/sim/ecology';
import { colonySlotBit } from '@/sim/entities';
import { casteSpeeds } from '@/sim/locomotion';
import { distFromHome, phaseOf, phaseS, setPhase } from './common';
import type { Flavour } from './flavours';
import { K, NAV, PHASE } from './keys';
import { goTo, moving, stop } from './nav';
import { resumeExplore } from './phaseScout';
import { resumeOutboundNav, startOutbound, startReturn, startSearch } from './transitions';

const tmp: Vec3 = { x: 0, y: 0, z: 0 };
const ids: number[] = [];

/** Protein of one patch catch, loads (a springtail; the patch kind's remains). */
function catchP(kind: 'springtail' | 'mite' = 'springtail'): number {
  return CREATURE_STATS[kind].deadP;
}

// ---- patch knowledge ----

export function patchOf(sim: Sim, id: number): PreyPatch | undefined {
  return id >= 0 ? sim.state.ecology.preyPatches.find((p) => p.id === id) : undefined;
}

export function patchKnownBy(sim: Sim, p: PreyPatch, colonyId: number): boolean {
  const bit = colonySlotBit(sim, colonyId);
  return bit !== 0 && ((p.knownBy ?? 0) & bit) !== 0;
}

/** The colony learns the patch (one of its ants met the patch's prey). */
export function notePatch(sim: Sim, colonyId: number, patchId: number): void {
  const p = patchOf(sim, patchId);
  const bit = colonySlotBit(sim, colonyId);
  if (p && bit !== 0) p.knownBy = (p.knownBy ?? 0) | bit;
}

// ---- part 1: noticing prey on the way ----

/** Phases in which an outside ant on its way (or searching) may break off to chase prey. */
function mayBreakOff(phase: number): boolean {
  return phase === PHASE.outbound || phase === PHASE.search || phase === PHASE.explore || phase === PHASE.investigate;
}

/** Free mandibles and room for a load: nothing carried, crop below the return mark. */
function free(ant: Ant): boolean {
  return ant.carry.kind === 'none' && !ant.action && ant.cropC + ant.cropP < CROP_RETURN_FRACTION * ant.cropCap;
}

/**
 * Engine interrupt for foragers and scouts: patch prey within HUNT_NOTICE_BU -> chase it. Mites only under a protein
 * deficit (GDD 05 §2.2b: "AI takes only under protein deficit"). True when the hunt began.
 */
export function huntCheck(sim: Sim, ant: Ant, fl: Flavour): boolean {
  if (fl.task === 'tend' || ant.nestId >= 0 || !mayBreakOff(phaseOf(ant)) || !free(ant)) return false;
  const col = sim.stores.colonies.get(ant.colony);
  if (!col) return false;
  const near = preyNear(sim, ant.pos, HUNT_NOTICE_BU * sim.world.bu, ant.colony);
  for (const q of near) {
    if (q.kind !== 'springtail' && !(q.kind === 'mite' && col.needs.proteinDeficit)) continue;
    const c = sim.stores.creatures.get(q.creatureId);
    if (!c || c.bb.patch === undefined || chasedByNestmate(sim, ant, c.id)) continue;
    notePatch(sim, ant.colony, c.bb.patch);
    ant.bb[K.huntFrom] = phaseOf(ant);
    ant.bb[K.patch] = c.bb.patch;
    ant.bb[K.prey] = c.id;
    ant.bb[K.preyX] = c.pos.x; ant.bb[K.preyZ] = c.pos.z;
    setPhase(sim, ant, fl.names, PHASE.hunt, 'job:hunt', c.id);
    goTo(sim, ant, c.pos, 0.3);
    return true;
  }
  return false;
}

/** Another ant of the colony already chases this prey (two hunters do not split one springtail). */
function chasedByNestmate(sim: Sim, ant: Ant, creatureId: number): boolean {
  sim.index.queryAnts(ant.pos, 2 * HUNT_NOTICE_BU * sim.world.bu, ids);
  for (const id of ids) {
    const o = sim.stores.ants.get(id);
    if (o && o.id !== ant.id && o.colony === ant.colony && o.bb[K.phase] === PHASE.hunt && o.bb[K.prey] === creatureId) return true;
  }
  return false;
}

// ---- part 2: the chase ----

/** A lying food item left by the kill near where the prey was last seen (its remains), or undefined. */
function remainsNear(sim: Sim, ant: Ant): Item | undefined {
  tmp.x = ant.bb[K.preyX] ?? ant.pos.x; tmp.z = ant.bb[K.preyZ] ?? ant.pos.z; tmp.y = ant.pos.y;
  const r = HUNT_REMAINS_BU * sim.world.bu;
  sim.index.queryItems(tmp, r, ids);
  let best: Item | undefined, bd = Infinity;
  for (const id of ids) {
    const it = sim.stores.items.get(id);
    if (!it || !it.alive || it.inNest || it.carrierIds.length > 0 || it.foodKind !== 'carrion' || it.bulk > ant.carryCap) continue;
    if (it.reservedBy >= 0 && it.reservedBy !== ant.id) continue;
    const dx = it.pos.x - tmp.x, dz = it.pos.z - tmp.z, d = dx * dx + dz * dz;
    if (d < bd || (d === bd && best && it.id < best.id)) { bd = d; best = it; }
  }
  return best;
}

/** The chase is over without a catch: back to what the ant was doing (a hunting trip searches its patch again). */
function endChase(sim: Sim, ant: Ant, fl: Flavour): void {
  ant.bb[K.prey] = -1;
  const from = ant.bb[K.huntFrom] ?? PHASE.outbound;
  const p = patchOf(sim, ant.bb[K.patch] ?? -1);
  if (from === PHASE.search && p) { startSearch(sim, ant, fl, p.center, p.radius, 'job:hunt'); return; }
  if (fl.scout) { resumeExplore(sim, ant, fl); return; }
  setPhase(sim, ant, fl.names, PHASE.outbound, 'job:resume');
  ant.bb[K.nav] = NAV.plan;
  ant.bb[K.nav0] = sim.state.tick;
  resumeOutboundNav(sim, ant);
}

export function updateHunt(sim: Sim, ant: Ant, fl: Flavour): void {
  if (ant.action) return; // a bite or the pick-up of the remains is under way
  if (ant.carry.kind === 'item') {
    // the remains are lifted: a solid load, home with it
    ant.bb[K.prey] = -1;
    startReturn(sim, ant, fl, true, 'item-collected');
    return;
  }
  const c = sim.stores.creatures.get(ant.bb[K.prey] ?? -1);
  if (!c || !c.alive) {
    // killed (by this ant or another), vanished or eaten: take the remains if they lie here
    const it = remainsNear(sim, ant);
    if (it) {
      const t = { kind: 'item' as const, id: it.id, pos: it.pos };
      const check = canDo(sim, ant, 'pick-up', t);
      if (check.ok) { stop(sim, ant); begin(sim, ant, 'pick-up', t); return; }
      if (check.reason === 'out-of-reach' && phaseS(sim, ant) <= HUNT_CHASE_S) { if (!moving(ant)) goTo(sim, ant, it.pos, 0.2); return; }
    }
    endChase(sim, ant, fl);
    return;
  }
  ant.bb[K.preyX] = c.pos.x; ant.bb[K.preyZ] = c.pos.z;
  if (phaseS(sim, ant) > HUNT_CHASE_S) { endChase(sim, ant, fl); return; }
  const t = { kind: 'creature' as const, id: c.id, pos: c.pos };
  const check = canDo(sim, ant, 'bite', t);
  if (check.ok) { stop(sim, ant); begin(sim, ant, 'bite', t); return; }
  if (check.reason === 'cooldown') return;
  if (check.reason !== 'out-of-reach') { endChase(sim, ant, fl); return; }
  // follow it (a springtail that escaped has jumped away)
  const d = ant.nav.loco?.reqDest;
  const dx = d ? d.x - c.pos.x : Infinity, dz = d ? d.z - c.pos.z : Infinity;
  if (!moving(ant) || dx * dx + dz * dz > (0.5 * sim.world.bu) ** 2) goTo(sim, ant, c.pos, 0.3);
}

// ---- part 3: hunting trips ----

/** Colony ants on a hunting trip to this patch (outbound to it, searching it or chasing in it). */
function huntersOf(sim: Sim, colonyId: number, patchId: number): number {
  let n = 0;
  for (const a of sim.stores.ants.list) {
    if (!a.alive || a.colony !== colonyId || a.bb[K.patch] !== patchId) continue;
    const ph = a.bb[K.phase];
    if (ph === PHASE.outbound || ph === PHASE.search || ph === PHASE.hunt) n++;
  }
  return n;
}

/**
 * Score U of a known patch for this ant, the source rule's terms (choice.ts sourceScore): protein of one catch x the
 * colony's weights x crowding / trip time, the trip being the walk both ways plus the expected time to a catch at the
 * patch's prey density (HUNT_EXPECT_S x K / count). 0 = do not go.
 */
export function patchScore(sim: Sim, ant: Ant, p: PreyPatch): number {
  const col = sim.stores.colonies.get(ant.colony);
  if (!col || p.k <= 0 || p.count < 1 || !patchKnownBy(sim, p, ant.colony)) return 0;
  const density = p.count / p.k;
  const w = sourceWeight(col, 0, catchP());
  const crowd = Math.max(CHOICE_CROWD_MIN, 1 - huntersOf(sim, ant.colony, p.id) / PATCH_FORAGERS_MAX);
  const speed = Math.max(1e-3, casteSpeeds(col.species, ant.caste, sim.world.bu).cruise);
  const walkS = Math.max(0, distFromHome(sim, ant, p.center) - p.radius) / speed;
  const trip = Math.max(CHOICE_MIN_TRIP_S, 2 * walkS + HUNT_EXPECT_S / Math.max(density, 0.05));
  return (w * crowd) / trip;
}

/** Best known patch for a departing forager within its flavour's range, or null. */
export function choosePatch(sim: Sim, ant: Ant, fl: Flavour): { patch: PreyPatch; u: number } | null {
  if (fl.task !== 'forage') return null;
  const maxMm = fl.rangeBu !== undefined ? fl.rangeBu * sim.world.bu : Infinity;
  let best: { patch: PreyPatch; u: number } | null = null;
  for (const p of sim.state.ecology.preyPatches) {
    if (distFromHome(sim, ant, p.center) - p.radius > maxMm) continue;
    const u = patchScore(sim, ant, p);
    if (u > 0 && (!best || u > best.u || (u === best.u && p.id < best.patch.id))) best = { patch: p, u };
  }
  return best;
}

/** Out to a patch to hunt: outbound to its centre (prey appears on the way in), then a search of the whole disc. */
export function startHuntTrip(sim: Sim, ant: Ant, fl: Flavour, p: PreyPatch, reason: 'recruited' | 'spontaneous'): void {
  startOutbound(sim, ant, fl, -1, p.center, -1, reason, -1);
  ant.bb[K.patch] = p.id;
  ant.bb[K.prey] = -1;
}

/** A hunting trip's patch, if this trip is one. */
export function tripPatch(sim: Sim, ant: Ant): PreyPatch | undefined {
  return (ant.bb[K.src] ?? -1) < 0 ? patchOf(sim, ant.bb[K.patch] ?? -1) : undefined;
}
