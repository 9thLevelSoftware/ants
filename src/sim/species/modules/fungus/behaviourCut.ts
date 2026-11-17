// Task `cut` for a leafcutter (GDD 07 §6.4.6 stages 1-2, §6.4.5, §6.4.7): a cutter walks out to a leaf site, cuts a
// fragment sized to her (cut-leaf: time/15 x carryCap LU; sap into her crop), carries it home at the laden speed and
// puts it into the cache of a garden chamber. Leaf choice: sites the colony may cut (quality >= leafSelectivity,
// not rejected, with leaf left), nearest first with a stable per-ant jitter so cutters spread over the near sites.
// Rain makes a carrier drop her fragment. Phorids and hitchhikers ride on the laden walk (phorids.ts).
//   cut.select  choose a site (or wait in the nest while the surface is closed)
//   cut.out     walk to it
//   cut.clear   step out of a nav cell the planner counts as blocked (beside the entrance: a walker standing there
//               gets no route at all; core defect reported) by a short wander toward the site, then cut.out again
//   cut.cut     the primitive
//   cut.home    carry the fragment to a garden chamber
//   cut.drop    put it into the chamber's cache

import { hash3i } from '@/core/math/noise';
import type { Ant, Behaviour, Chamber, Colony, LeafSite, Sim } from '@/sim/types';
import { CUT_SITE_JITTER, CUT_SITE_JITTER_TICKS, GARDEN_ARRIVE_FRAC } from '@/sim/balance/species-leafcutter';
import { endCycle, releaseAll, think } from '@/sim/ants/behaviours/nest/common';
import { setState } from '@/sim/ants/behaviours/nest/fsm';
import { busy, entity, resetTravel, travel, tryAct, actEnded } from '@/sim/ants/behaviours/nest/travel';
import { navStop, navWander } from '@/sim/locomotion';
import { removeItem } from '@/sim/entities';
import { chamberById } from '@/sim/colony/census';
import { rainIntensityOf, surfaceActivityOf } from '@/sim/colony/envAdapter';
import {
  CUT_ACTIVITY_MIN, CUT_ARRIVE_BU, CUT_TRIP_MAX_S, MINIM_CUT_RANGE_BU, RAIN_DROP_INTENSITY, CUT_RANGE_BU,
  CUT_CLEAR_CELLS, CUT_CLEAR_S, CUT_CLEAR_TRIES, CUT_RETRY_S,
} from '@/sim/balance/species-leafcutter';
import { TICKS_PER_SECOND } from '@/sim/time';
import { LEAF } from './actions';
import { fungusParams } from './params';
import { leafSitesOf, homeOf } from './leaves';
import { isRejected } from './rejection';
import { addToCache, lotsLu } from './cache';
import { chainAdd } from './chain';
import { AK } from './work';
import { liveGardens } from './state';
import { phoridStep, resetRider } from './phorids';

const ENTRY = 'cut.select';

function colonyOf(sim: Sim, ant: Ant): Colony | undefined {
  return sim.stores.colonies.get(ant.colony);
}

/** The colony's leaf selectivity (directive, else the species default). */
export function selectivityOf(sim: Sim, col: Colony): number {
  const P = fungusParams(sim.getSpecies(col.species));
  const v = col.directives.leafSelectivity;
  return typeof v === 'number' && Number.isFinite(v) ? v : (P?.leafSelectivityDefault ?? 0.3);
}

/** Whether this ant may cut at this site now. */
export function siteAcceptable(sim: Sim, col: Colony, s: LeafSite, minLu: number): boolean {
  if (s.lu < minLu) return false;
  if (s.q < selectivityOf(sim, col)) return false;
  return !isRejected(col, s.plantId, sim.state.tick);
}

/** The site this cutter goes to, or -1: nearest acceptable within her range, spread by a per-ant jitter. */
export function chooseSite(sim: Sim, ant: Ant, col: Colony): number {
  const sites = leafSitesOf(sim, col);
  const home = homeOf(sim, col), bu = sim.world.bu;
  const range = (ant.caste === 'minor' ? MINIM_CUT_RANGE_BU : CUT_RANGE_BU) * bu;
  const minLu = 0.25 * ant.carryCap;
  let best = -1, bestScore = Infinity;
  for (let i = 0; i < sites.length; i++) {
    const s = sites[i];
    const d = Math.sqrt((s.pos.x - home.x) ** 2 + (s.pos.z - home.z) ** 2);
    if (d > range || !siteAcceptable(sim, col, s, minLu)) continue;
    // distance with a jitter of up to +60 % per ant and site (stable over a game hour): cutters spread out
    const jitter = 1 + CUT_SITE_JITTER * hash3i(ant.id, i, Math.floor(sim.state.tick / CUT_SITE_JITTER_TICKS), 0xc07);
    const score = (d + 10 * bu) * jitter / (0.5 + s.q);
    if (score < bestScore) { bestScore = score; best = i; }
  }
  return best;
}

/** The garden chamber a fragment goes to: the live garden with the least cache per GU (nearest on a tie). */
export function dropChamber(sim: Sim, ant: Ant, col: Colony): Chamber | undefined {
  let best: Chamber | undefined, bestScore = Infinity;
  for (const g of liveGardens(col.fungus!)) {
    const ch = chamberById(sim, g.chamberId);
    if (!ch) continue;
    const score = lotsLu(g.cache) / Math.max(0.1, g.biomass) + Math.sqrt((ch.center.x - ant.pos.x) ** 2 + (ch.center.y - ant.pos.y) ** 2 + (ch.center.z - ant.pos.z) ** 2) * 1e-4;
    if (score < bestScore) { bestScore = score; best = ch; }
  }
  return best;
}

function carryingFragment(sim: Sim, ant: Ant): boolean {
  return ant.carry.kind === 'item' && sim.stores.items.get(ant.carry.id)?.kind === 'leaf-fragment';
}

function tripTooLong(sim: Sim, ant: Ant): boolean {
  const t0 = ant.bb[AK.tripTick] ?? -1;
  return t0 >= 0 && sim.state.tick - t0 > CUT_TRIP_MAX_S * TICKS_PER_SECOND;
}

/** Starts a cut trip (site chosen, state cut.out); false when there is nowhere to cut now. */
export function startCutTrip(sim: Sim, ant: Ant): boolean {
  if (sim.state.tick < (ant.bb[AK.retry] ?? 0)) return false;
  const col = colonyOf(sim, ant);
  if (!col?.fungus || liveGardens(col.fungus).length === 0) return false;
  if (surfaceActivityOf(sim, col.species) < CUT_ACTIVITY_MIN || rainIntensityOf(sim) > RAIN_DROP_INTENSITY) return false;
  const i = chooseSite(sim, ant, col);
  if (i < 0) return false;
  ant.bb[AK.site] = i;
  ant.bb[AK.tripTick] = sim.state.tick;
  setState(sim, ant, 'cut.out', 'job:cut');
  return true;
}

function select(sim: Sim, ant: Ant): void {
  const col = colonyOf(sim, ant);
  if (!col?.fungus) { endCycle(sim, ant, ENTRY); return; }
  if (carryingFragment(sim, ant)) { setState(sim, ant, 'cut.home'); return; }
  if (!startCutTrip(sim, ant)) endCycle(sim, ant, ENTRY, 'job:cut');
}

function goOut(sim: Sim, ant: Ant): void {
  const col = colonyOf(sim, ant);
  const s = col?.fungus ? leafSitesOf(sim, col)[ant.bb[AK.site] ?? -1] : undefined;
  if (!col || !s) { setState(sim, ant, ENTRY); return; }
  if (tripTooLong(sim, ant) || surfaceActivityOf(sim, col.species) < CUT_ACTIVITY_MIN) { setState(sim, ant, 'cut.home', 'curfew'); return; }
  const st = travel(sim, ant, entity('point', -1, s.pos), CUT_ARRIVE_BU * sim.world.bu);
  if (st === 'arrived') setState(sim, ant, 'cut.cut');
  else if (st === 'failed') {
    if (ant.nestId < 0 && sim.navGrid.blocked(ant.pos.x, ant.pos.z) && (ant.bb[AK.clears] ?? 0) < CUT_CLEAR_TRIES) { startClear(sim, ant, s.pos); return; }
    giveUp(sim, ant);
  }
}

/** A failed trip: back off before the next one (no re-plan every tick). */
function giveUp(sim: Sim, ant: Ant): void {
  ant.bb[AK.retry] = sim.state.tick + CUT_RETRY_S * TICKS_PER_SECOND;
  ant.bb[AK.clears] = 0;
  endCycle(sim, ant, ENTRY, 'stuck');
}

function startClear(sim: Sim, ant: Ant, toward: { x: number; z: number }): void {
  const cell = sim.navGrid.cell;
  const dx = toward.x - ant.pos.x, dz = toward.z - ant.pos.z, d = Math.max(1e-6, Math.sqrt(dx * dx + dz * dz));
  const c = { x: ant.pos.x + (dx / d) * CUT_CLEAR_CELLS * cell, y: ant.pos.y, z: ant.pos.z + (dz / d) * CUT_CLEAR_CELLS * cell };
  ant.bb[AK.clears] = (ant.bb[AK.clears] ?? 0) + 1;
  ant.bb[AK.cx] = c.x; ant.bb[AK.cz] = c.z;
  navWander(sim, ant, c, 0.5 * cell);
  setState(sim, ant, 'cut.clear', 'stuck');
}

function clear(sim: Sim, ant: Ant): void {
  if (!sim.navGrid.blocked(ant.pos.x, ant.pos.z)) { resetTravel(ant); setState(sim, ant, carryingFragment(sim, ant) ? 'cut.home' : 'cut.out'); return; }
  if (sim.state.tick - ant.stateTick > CUT_CLEAR_S * TICKS_PER_SECOND) { navStop(sim, ant); giveUp(sim, ant); return; }
  navWander(sim, ant, { x: ant.bb[AK.cx] ?? ant.pos.x, y: ant.pos.y, z: ant.bb[AK.cz] ?? ant.pos.z }, 0.5 * sim.navGrid.cell);
}

function cut(sim: Sim, ant: Ant): void {
  if (carryingFragment(sim, ant)) {
    resetRider(ant);
    ant.bb[AK.lastX] = ant.pos.x;
    ant.bb[AK.lastZ] = ant.pos.z;
    setState(sim, ant, 'cut.home', 'item-collected');
    return;
  }
  if (actEnded(ant)) { setState(sim, ant, ENTRY, 'source-depleted'); return; }
  if (busy(ant)) return;
  if (tryAct(sim, ant, 'cut-leaf', null) !== null) setState(sim, ant, ENTRY, 'source-depleted');
}

function home(sim: Sim, ant: Ant): void {
  const col = colonyOf(sim, ant);
  if (!col?.fungus) { setState(sim, ant, ENTRY); return; }
  const laden = carryingFragment(sim, ant);
  if (ant.nestId < 0 && laden) {
    if (rainIntensityOf(sim) > RAIN_DROP_INTENSITY) {
      // rain: carriers drop fragments (GDD 07 §6.4.6 stage 2)
      if (!busy(ant)) tryAct(sim, ant, 'drop', null);
      return;
    }
    phoridStep(sim, ant, col);
  }
  const ch = dropChamber(sim, ant, col);
  if (!ch) { endCycle(sim, ant, ENTRY, 'job:cut'); return; }
  if (ant.chamberId === ch.id) { setState(sim, ant, laden ? 'cut.drop' : ENTRY); return; }
  if (!laden && ant.nestId >= 0) { endCycle(sim, ant, ENTRY, 'job:cut'); return; }
  const st = travel(sim, ant, entity('chamber', ch.id, ch.center), GARDEN_ARRIVE_FRAC * Math.min(ch.radii.x, ch.radii.z));
  if (st === 'arrived') setState(sim, ant, laden ? 'cut.drop' : ENTRY);
  else if (st === 'failed' && ant.nestId >= 0 && ant.chamberId >= 0 && laden) setState(sim, ant, 'cut.drop');
  else if (st === 'failed' && ant.nestId < 0) {
    if (sim.navGrid.blocked(ant.pos.x, ant.pos.z) && (ant.bb[AK.clears] ?? 0) < CUT_CLEAR_TRIES) { startClear(sim, ant, homeOf(sim, col)); return; }
    if (laden && !busy(ant)) tryAct(sim, ant, 'drop', null);
    giveUp(sim, ant);
  }
}

/** Puts the fragment into the cache of the garden of the chamber the ant stands in. */
function drop(sim: Sim, ant: Ant): void {
  const col = colonyOf(sim, ant);
  const it = ant.carry.kind === 'item' ? sim.stores.items.get(ant.carry.id) : undefined;
  const g = col?.fungus ? col.fungus.gardens.find((x) => x.chamberId === ant.chamberId && x.state !== 'dead') : undefined;
  if (!col || !it || it.kind !== 'leaf-fragment') { endCycle(sim, ant, ENTRY); return; }
  if (!g) { setState(sim, ant, 'cut.home'); return; }
  if (ant.nav.status === 'moving') navStop(sim, ant);
  const lu = ant.bb[LEAF.lu] > 0 ? ant.bb[LEAF.lu] : it.bulk;
  addToCache(g, { lu, q: ant.bb[LEAF.q] ?? 0.5, p: ant.bb[LEAF.p] ?? 0.15, t: ant.bb[LEAF.t] ?? 0, plantId: ant.bb[LEAF.plant] ?? -1, tick: sim.state.tick });
  removeItem(sim, it.id, 'delivered');
  ant.bb[LEAF.lu] = 0;
  ant.mem.trips = (ant.mem.trips ?? 0) + 1;
  chainAdd(sim, col, 'carried', lu);
  // the delivery event (journal, milestones: ms-first-leaf; GDD 06 aim-garden): leaf substrate counted in LU as `c`
  // (a leaf feeds the garden, not the pool: no deposit is made)
  sim.emit({ type: 'delivery', antId: ant.id, colonyId: col.id, sourceId: -1, kind: 'leaf', c: lu, p: 0, toxin: 0 });
  endCycle(sim, ant, ENTRY);
}

/** One think of a cut trip in progress (states cut.out to cut.drop); false when the ant is not on one. */
export function cutTripStep(sim: Sim, ant: Ant): boolean {
  switch (ant.state) {
    case 'cut.out': goOut(sim, ant); return true;
    case 'cut.clear': clear(sim, ant); return true;
    case 'cut.cut': cut(sim, ant); return true;
    case 'cut.home': home(sim, ant); return true;
    case 'cut.drop': drop(sim, ant); return true;
    default: return false;
  }
}

/** Ants of the colony on a cut trip now. */
export function cutTripsUnderway(sim: Sim, col: Colony): number {
  let n = 0;
  for (const a of sim.stores.ants.list) if (a.alive && a.colony === col.id && a.state.startsWith('cut.') && a.state !== ENTRY) n++;
  return n;
}

function step(sim: Sim, ant: Ant): void {
  if (!cutTripStep(sim, ant)) select(sim, ant);
}

export const cutBehaviour: Behaviour = {
  task: 'cut', species: ['atta-texana'],
  enter: (sim, ant) => setState(sim, ant, ENTRY),
  update: (sim, ant) => think(sim, ant, ENTRY, step),
  exit: (sim, ant) => releaseAll(sim, ant),
  // deliver first: a cutter with a fragment, or outside, finishes her trip home
  delivering: (sim, ant) => carryingFragment(sim, ant) || (ant.nestId < 0 && ant.state.startsWith('cut.')),
};
