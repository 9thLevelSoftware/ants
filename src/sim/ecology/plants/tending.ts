// Per-second herd step (GDD 05 §1.4 Tending and Production): who tends (tender-seconds per colony and the claiming
// colony), the tending level `tend` (EWMA, TEND_TAU), honeydew production into the pool and its overflow to the
// film, discovery of the herd by passing ants, and the tender slots of the herd source.

import type { Ant, FoodSource, Herd, Sim } from '@/sim/types';
import { colonySlotBit } from '@/sim/entities';
import { SECONDS_PER_DAY } from '@/sim/time';
import {
  TEND_TAU_GD, TENDER_QUERY_L_MAX, TENDER_QUERY_MIN_BU, TENDER_RADIUS_L, TENDER_WINDOW_GD, SOURCE_ODOUR_REF_BU,
} from '@/sim/balance/ecology';
import { addToPool } from '../sources/runtime';
import { discoverSource } from '../sources/discovery';
import { poolCap, productionPerGd, tendersNeeded, tendSlots } from './herdMath';
import { ensureLinks, herdSourceOf } from './links';
import { addClaim, removeClaim } from './claims';

const ids: number[] = [];
/** Tender counts per colony slot of the herd being stepped (scratch). */
const counts: number[] = [];

/** Whether the ant counts as a tender of this herd (task `tend` near it, or stroking it). */
export function isTenderOf(sim: Sim, ant: Ant, src: FoodSource): boolean {
  if (!ant.alive || ant.nestId >= 0) return false;
  const a = ant.action;
  if (a && a.id === 'tend-aphid' && a.target.kind === 'source' && a.target.id === src.id) return true;
  if (ant.task !== 'tend') return false;
  const r = TENDER_RADIUS_L * ant.lengthBu * sim.world.bu;
  const dx = ant.pos.x - src.pos.x, dy = ant.pos.y - src.pos.y, dz = ant.pos.z - src.pos.z;
  return dx * dx + dy * dy + dz * dz <= r * r;
}

function slotOf(sim: Sim, colonyId: number): number {
  return sim.state.rivals.territory.slotColony.indexOf(colonyId);
}

/** Tenders of a colony present at the herd now. */
export function tendersPresent(sim: Sim, h: Herd, colonyId: number): number {
  const src = herdSourceOf(sim, h);
  if (!src) return 0;
  let n = 0;
  sim.index.queryAnts(src.pos, queryRadius(sim), ids);
  for (const id of ids) {
    const a = sim.stores.ants.get(id);
    if (a && a.colony === colonyId && isTenderOf(sim, a, src)) n++;
  }
  return n;
}

function queryRadius(sim: Sim): number {
  // the widest tender (a large caste) and the herd's odour (discovery)
  return Math.max(TENDER_RADIUS_L * TENDER_QUERY_L_MAX, TENDER_QUERY_MIN_BU) * sim.world.bu;
}

/** The claiming colony: the most tender-seconds over the window; a claim stays while nobody else tends (decision). */
function updateClaim(sim: Sim, h: Herd): void {
  const ts = h.tenderSeconds;
  let best = -1;
  for (let i = 0; i < ts.length; i++) if (ts[i] > 1e-6 && (best < 0 || ts[i] > ts[best])) best = i;
  if (best < 0) return;
  const cur = h.tenderColony >= 0 ? slotOf(sim, h.tenderColony) : -1;
  if (cur === best || (cur >= 0 && ts[cur] >= ts[best])) return;
  const colonyId = sim.state.rivals.territory.slotColony[best];
  if (colonyId === undefined || colonyId < 0) return;
  const prev = h.tenderColony;
  h.tenderColony = colonyId;
  if (prev >= 0) {
    sim.emit({ type: 'herd-lost', herdId: h.id, colonyId: prev, cause: 'rival-claim' });
    removeClaim(sim.stores.colonies.get(prev), h.id);
  }
  addClaim(sim.stores.colonies.get(colonyId), h.id);
  sim.emit({ type: 'herd-claimed', herdId: h.id, colonyId, cause: prev >= 0 ? 'takeover' : 'tended' });
}

/** Outside ants of any colony within the herd's odour radius discover it (food-source-discovered). */
function discover(sim: Sim, src: FoodSource, film: FoodSource | undefined): void {
  const r = src.odour * SOURCE_ODOUR_REF_BU * sim.world.bu;
  for (const id of ids) {
    const a = sim.stores.ants.get(id);
    if (!a || a.nestId >= 0 || (src.discoveredBy & colonySlotBit(sim, a.colony)) !== 0) continue;
    const dx = a.pos.x - src.pos.x, dy = a.pos.y - src.pos.y, dz = a.pos.z - src.pos.z;
    if (dx * dx + dy * dy + dz * dz <= r * r) discoverSource(sim, a.colony, src.id, a.id);
  }
  // finding the film below means finding the herd above it
  if (film && (film.discoveredBy & ~src.discoveredBy) !== 0) {
    for (let slot = 0; slot < 31; slot++) {
      const bit = 1 << slot;
      if ((film.discoveredBy & bit) === 0 || (src.discoveredBy & bit) !== 0) continue;
      const colonyId = sim.state.rivals.territory.slotColony[slot];
      if (colonyId !== undefined && colonyId >= 0) discoverSource(sim, colonyId, src.id, -1);
    }
  }
}

/** One step of dtS seconds for one herd; fT = temperature factor, mult = foodAbundanceMult. */
export function stepTending(sim: Sim, h: Herd, dtS: number, fT: number, mult: number): void {
  if (!h.alive) return;
  ensureLinks(sim, h);
  const src = herdSourceOf(sim, h);
  const ts = h.tenderSeconds;
  counts.length = ts.length;
  counts.fill(0);
  if (src) {
    sim.index.queryAnts(src.pos, queryRadius(sim), ids);
    for (const id of ids) {
      const a = sim.stores.ants.get(id);
      if (!a || !isTenderOf(sim, a, src)) continue;
      const s = slotOf(sim, a.colony);
      if (s >= 0 && s < counts.length) counts[s]++;
    }
    discover(sim, src, sim.stores.sources.get(h.filmSourceId));
    src.slots = tendSlots(h.a);
  }
  const keep = Math.exp(-dtS / (TENDER_WINDOW_GD * SECONDS_PER_DAY));
  for (let i = 0; i < ts.length; i++) ts[i] = ts[i] * keep + counts[i] * dtS;
  updateClaim(sim, h);
  if (src) src.tendedBy = h.tenderColony;
  if (!h.frozen) {
    const s = h.tenderColony >= 0 ? slotOf(sim, h.tenderColony) : -1;
    const present = s >= 0 ? counts[s] : 0;
    const target = Math.min(1, present / tendersNeeded(h.a));
    h.tend = target + (h.tend - target) * Math.exp(-dtS / (TEND_TAU_GD * SECONDS_PER_DAY));
  }
  produce(sim, h, dtS, fT, mult);
}

/** Honeydew into the pool (cap 1 + 0.02 A); the overflow runs into the film, which keeps up to its own cap. */
function produce(sim: Sim, h: Herd, dtS: number, fT: number, mult: number): void {
  if (h.a <= 0) return;
  h.pool += (productionPerGd(h.a, h.tend, fT, mult) * dtS) / SECONDS_PER_DAY;
  const cap = poolCap(h.a, mult);
  if (h.pool > cap) {
    const over = h.pool - cap;
    h.pool = cap;
    if (h.filmSourceId >= 0) addToPool(sim, h.filmSourceId, over);
  }
}
