// Forager activation by interaction rate (GDD 02 §6.6, D4) and recruitment as information transfer (§6.7):
// successful returners excite waiting foragers, waiting foragers depart on activation or spontaneously, the
// entrance keeps a news list. Behaviours call recordForagerReturn / recordDelivery / shouldDepart.

import type { Vec3 } from '@/core/math/vec3';
import { rngChance } from '@/core/rng';
import { clamp } from '@/core/math/scalar';
import type { Ant, Colony, Sim } from '@/sim/types';
import {
  ACTIVATION_DEPART, CURFEW_ALARM_PH, CURFEW_FENV, ENC_GAIN, ENC_SCOUT_MULT, FENV_RH_BASE, FENV_RH_GAIN,
  FENV_RH_LO_PCT, FENV_RH_SPAN_PCT, NEWS_EXPIRY_GD, NEWS_MAX, RECRUIT_CONTACTS_MAX, RECRUIT_RADIUS_BU,
  SPONT_DEPART_RATE_S, SPONT_NEED_BASE, SPONT_ROUTE_MULT,
} from '@/sim/balance';
import { recordDelivery as recordSourceDelivery } from '@/sim/ecology';
import { daysToTicks, TICKS_PER_SECOND } from '@/sim/time';
import { accAdd, coreOf } from './core';
import { chamberRh, isStorm, surfaceActivityOf } from './envAdapter';
import { recruitAcceptance } from './needs';
import { countDelivery } from './population';
import { deposit, type FoodMove } from './stores';

const WAIT_STATES = new Set(['forage.wait', 'tend.wait']);

/** An ant waiting in the entrance chamber between trips (GDD 02 §6.6). */
export function isWaitingForager(a: Ant): boolean {
  return a.alive && (a.task === 'forage' || a.task === 'tend') && WAIT_STATES.has(a.state);
}

/** Main entrance position of the colony (first entrance of its first nest), or the nest origin. */
export function homePos(sim: Sim, col: Colony): Vec3 | null {
  for (const nid of col.nestIds) {
    const n = sim.stores.nests.get(nid);
    if (!n) continue;
    return n.entrances.length > 0 ? n.entrances[0].pos : n.origin;
  }
  return null;
}

/** Environmental activity factor fEnv (GDD 02 §6.6): surface activity x humidity term. */
export function fEnv(sim: Sim, col: Colony): number {
  const p = homePos(sim, col) ?? sim.world.queenStart.pos;
  const rhPct = chamberRh(sim, -1, p) * 100;
  return surfaceActivityOf(sim, col.species) * (FENV_RH_BASE + FENV_RH_GAIN * clamp((rhPct - FENV_RH_LO_PCT) / FENV_RH_SPAN_PCT, 0, 1));
}

/** Foraging curfew (GDD 02 §6.6, §12.1 stayIn): no departures. */
export function curfew(sim: Sim, col: Colony): boolean {
  if (col.directives.stayIn || isStorm(sim) || fEnv(sim, col) < CURFEW_FENV) return true;
  for (const nid of col.nestIds) {
    const n = sim.stores.nests.get(nid);
    if (!n) continue;
    for (const e of n.entrances) if (sim.phero.sample(col.id, 'alarm', e.pos) > CURFEW_ALARM_PH) return true;
  }
  return false;
}

function hasLiveRoute(sim: Sim, a: Ant): boolean {
  for (const r of a.mem.routes) if (r.sourceId !== -1 && sim.stores.sources.has(r.sourceId)) return true;
  return false;
}

/**
 * Called by a waiting forager's behaviour (every `dtTicks`): returns why it departs now, or null. Activation is
 * consumed on a recruited departure.
 */
export function shouldDepart(sim: Sim, a: Ant, dtTicks = 1): 'recruited' | 'spontaneous' | null {
  const col = sim.stores.colonies.get(a.colony);
  if (!col || !isWaitingForager(a) || curfew(sim, col)) return null;
  let reason: 'recruited' | 'spontaneous' | null = null;
  if (a.activation >= ACTIVATION_DEPART) reason = 'recruited';
  else {
    const need = Math.max(col.needs.needC, col.needs.needP);
    const rate = SPONT_DEPART_RATE_S * (SPONT_NEED_BASE + need) * fEnv(sim, col) * (hasLiveRoute(sim, a) ? SPONT_ROUTE_MULT : 1);
    if (rngChance(sim.stream('rng.colony'), rate * (dtTicks / TICKS_PER_SECOND))) reason = 'spontaneous';
  }
  if (reason) {
    a.activation = 0;
    coreOf(col).departuresToday++;
    sim.emit({ type: 'forager-departed', antId: a.id, reason });
  }
  return reason;
}

function updateNews(sim: Sim, col: Colony, sourceId: number): void {
  const src = sim.stores.sources.get(sourceId);
  if (!src) return;
  const now = sim.state.tick;
  const expiry = daysToTicks(NEWS_EXPIRY_GD);
  col.news = col.news.filter((n) => n.sourceId !== sourceId && now - n.tick <= expiry && sim.stores.sources.has(n.sourceId));
  col.news.push({ sourceId, pos: { x: src.pos.x, y: src.pos.y, z: src.pos.z }, tick: now });
  while (col.news.length > NEWS_MAX) col.news.shift();
  if (!col.knownSourceIds.includes(sourceId)) col.knownSourceIds.push(sourceId);
}

/**
 * Antennal contacts of a returner at `pos` with up to RECRUIT_CONTACTS_MAX nearest waiting foragers within
 * RECRUIT_RADIUS_BU. A successful return adds activation and may pass on the source as a lead. Returns the ids
 * contacted.
 */
function contactWaiting(sim: Sim, col: Colony, pos: Vec3, fromId: number, success: boolean, scout: boolean, sourceId: number): number[] {
  const r = RECRUIT_RADIUS_BU * sim.world.bu;
  const near: { a: Ant; d: number }[] = [];
  for (const a of sim.stores.ants.list) {
    if (a.colony !== col.id || a.id === fromId || !isWaitingForager(a)) continue;
    const dx = a.pos.x - pos.x, dy = a.pos.y - pos.y, dz = a.pos.z - pos.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d <= r) near.push({ a, d });
  }
  near.sort((x, y) => x.d - y.d || x.a.id - y.a.id);
  const out: number[] = [];
  const src = sourceId >= 0 ? sim.stores.sources.get(sourceId) : undefined;
  const gain = ENC_GAIN * (scout ? ENC_SCOUT_MULT : 1) * fEnv(sim, col);
  for (let i = 0; i < near.length && i < RECRUIT_CONTACTS_MAX; i++) {
    const a = near[i].a;
    out.push(a.id);
    if (!success) continue;
    a.activation += gain;
    if (src && rngChance(sim.stream('rng.colony'), recruitAcceptance(col, src.c, src.p))) {
      a.mem.lead = { sourceId: src.id, pos: { x: src.pos.x, y: src.pos.y, z: src.pos.z }, tick: sim.state.tick };
      sim.emit({ type: 'recruit', fromId, toId: a.id, sourceId: src.id });
    }
  }
  return out;
}

/**
 * A forager (or scout) is back in the nest after a trip. `success` per GDD 02 §6.6 (crop >= 0.5 unloaded, solid
 * delivered, or a scout's find); `tripTicks` is the trip duration for the statistics. Returns the ants contacted.
 */
export function recordForagerReturn(sim: Sim, returner: Ant, success: boolean, sourceId: number, tripTicks = 0): number[] {
  const col = sim.stores.colonies.get(returner.colony);
  if (!col) return [];
  col.counters.trips++;
  col.counters.tripTicks += Math.max(0, tripTicks);
  if (success) {
    col.counters.tripSuccesses++;
    returner.mem.lastSuccessTick = sim.state.tick;
    if (sourceId >= 0) updateNews(sim, col, sourceId);
  }
  return contactWaiting(sim, col, returner.pos, returner.id, success, returner.task === 'scout', sourceId);
}

/** Debug `cheat.injectReturn`: a synthetic returner contact at an entrance. */
export function injectReturn(sim: Sim, entranceId: number, success: boolean, sourceId: number): number[] {
  for (const n of sim.stores.nests.list) {
    if (!n.alive) continue;
    const e = n.entrances.find((x) => x.id === entranceId);
    const col = sim.stores.colonies.get(n.colony);
    if (!e || !col) continue;
    col.counters.trips++;
    if (success) {
      col.counters.tripSuccesses++;
      if (sourceId >= 0) updateNews(sim, col, sourceId);
    }
    return contactWaiting(sim, col, e.pos, -1, success, false, sourceId);
  }
  return [];
}

/**
 * A forager unloads food it brought from a source into the pool (liquid to a receiver, solid to a pile; GDD 02
 * §5.3). Books the delivery, tallies it by food kind and source (colony and ecology), emits `delivery` and feeds
 * the yield-per-forager estimate. `waitTicks` is how long the forager waited to unload (-1 = not measured).
 * Returns what was accepted.
 */
export function recordDelivery(
  sim: Sim, ant: Ant, sourceId: number, kind: string, c: number, p: number, toxin = 0, waitTicks = -1,
): FoodMove {
  const col = sim.stores.colonies.get(ant.colony);
  if (!col) return { c: 0, p: 0, toxin: 0 };
  const got = deposit(col, c, p, toxin, 'delivery');
  if (got.c + got.p > 0) {
    countDelivery(sim, col, sourceId, kind, got.c, got.p, waitTicks);
    recordSourceDelivery(sim, col.id, sourceId, got.c, got.p);
    if (ant.task === 'forage' || ant.task === 'scout' || ant.task === 'tend') accAdd(coreOf(col), 'yield.loads', got.c + got.p);
    sim.emit({ type: 'delivery', antId: ant.id, colonyId: col.id, sourceId, kind, c: got.c, p: got.p, toxin: got.toxin });
  }
  return got;
}
