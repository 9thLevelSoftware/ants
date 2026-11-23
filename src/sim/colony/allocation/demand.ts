// Demand per task in worker-equivalents (GDD 02 §6.2), recomputed every ALLOC_PERIOD.

import { ti } from '../taskIdx';
import type { Colony, FoodSource, Sim, Task } from '@/sim/types';
import { clamp } from '@/core/math/scalar';
import { harvestForm } from '@/sim/ecology';
import {
  BROOD_MOVE_NURSE, DEFEND_MIN_WORKERS, DIAPAUSE_LARVAE_PER_NURSE, EGGS_PER_NURSE, ENTRANCE_ALARM_ALERT_PH,
  GUARDS_PER_ENTRANCE, HAUL_BROOD_MAX_FRAC, HAUL_MAX_FRAC, HAUL_PER_CORPSE, HAUL_PER_PELLET, HAUL_PER_WASTE, NURSE_FEED_CAPACITY,
  PATROL_FRAC, PUPAE_PER_NURSE, QUEEN_CARE_BASE, QUEEN_CARE_MAX, QUEEN_CARE_PER_WORKERS, SCOUT_BASE_FRAC,
  SCOUT_MAX_FRAC, SCOUT_MIN_ACTIVITY, SCOUT_MISSING_FRAC, SCOUT_MISSING_MAX_FRAC, SCOUT_MISSING_SHORT,
  SCOUT_SHORTFALL_FRAC, SCOUT_SHORT_KNOWN_FRAC, SCOUTS_MISSING_MIN, SCOUTS_MISSING_SMALL_N, SMALL_COLONY_N, SMALL_KNOWN_SOURCES, SMALL_OUTSIDE_FRAC,
  SMALL_OUTSIDE_MIN, SMALL_SCOUTS_MIN, SOURCE_SLOT_FORAGERS, SPOILED_ITEMS_PER_STORE,
  STORE_PER_FORAGER, THREAT_DEMAND_MULT, FORAGER_TRIPS_PER_GD, STOCK_REFILL_GD, TEND_HEADROOM, TEND_KEEP,
} from '@/sim/balance';
import { RIVAL_TEND_GUARD } from '@/sim/balance/ecology';
import { PATCH_FORAGERS_MAX } from '@/sim/balance/foraging';
import { CREATURE_STATS, PATCH_IMMIGRATION_PER_GD, PATCH_R_PER_GD } from '@/sim/balance/creatures';
import { colonySlotBit } from '@/sim/entities';
import { accGet, coreOf } from '../core';
import { type Census, itemCounts } from '../census';
import { surfaceActivityOf } from '../envAdapter';
import { carbStockWanted, forageRates, intakeTarget, targetDays } from '../needs';
import { queenOf } from '../queen';
import { tooColdToDepart } from '../coldGate';
import { digDemand as nestDigDemand, entranceToUnplug, haulPelletLoad } from '@/sim/nest';
import { herdMarked, herdWorkable, tendersWanted } from '@/sim/ecology/plants/demand';
import { productionPerGd, tendersNeeded, tendSlots } from '@/sim/ecology/plants/herdMath';
import { typicalForager, unitsPerTripOf } from '../tripLoad';

const T = (t: Task): number => ti(t);

/**
 * core.acc key: worker-equivalents of the forage demand that only R32b's prospective protein demand asks for (R35
 * point 5); the allocation fills them after every other task (targets.ts autoTargets).
 */
export const PROSPECTIVE_FORAGE_KEY = 'alloc.prospForage';

/**
 * core.acc key: the scout floor R38 item 1 (in direction 26a item 2's two levels) asks for a missing nutrient (0 when
 * no nutrient is missing); the auto allocation fills it before `forage` (targets.ts planTargets).
 */
export const SCOUT_FLOOR_KEY = 'alloc.scoutFloor';

/** Known foraging capacity: forager-equivalents and loads per gd (C + P, and each) the known sources can absorb. */
export interface KnownCapacity { ants: number; loads: number; loadsC: number; loadsP: number }

/**
 * Forager-equivalents one known source keeps busy (GDD 02 §6.2 feedSlots x trips/gd): its slots (SOURCE_SLOT_FORAGERS
 * each), but no more than its food supports at FORAGER_TRIPS_PER_GD trips each (econ-growth R10: a flower refilling
 * 4 loads a day counted as 9 foragers, a one-unit carcass as 4.5). A finite source offers all it holds within the day;
 * a renewable one what it holds plus its refill.
 */
function sourceForagers(sim: Sim, col: Colony, s: FoodSource): number {
  const bySlots = Math.max(1, s.slots) * SOURCE_SLOT_FORAGERS;
  const ant = typicalForager(sim, col);
  const perTrip = unitsPerTripOf(harvestForm(sim, s), ant.cropCap, ant.carryCap, s.unitBulk);
  const trips = (Math.max(0, s.units) + Math.max(0, s.refillPerGd)) / perTrip;
  return Math.min(bySlots, trips / FORAGER_TRIPS_PER_GD);
}

/**
 * Known foraging capacity. Foraged sources give forager-equivalents (the `forage` demand cap) and their loads; the
 * honeydew of the herds the colony works counts as carbohydrate it can get (at full tending, GDD 05 §1.4) but not as
 * foragers: tenders are the `tend` demand (econ-growth review: without it a colony living on its herds reported a
 * carbohydrate scout shortfall of 1 for good).
 */
export function knownCapacity(sim: Sim, col: Colony): KnownCapacity {
  const out: KnownCapacity = { ants: 0, loads: 0, loadsC: 0, loadsP: 0 };
  for (const id of col.knownSourceIds) {
    const s = sim.stores.sources.get(id);
    // a renewable source counts while it refills, even when it is empty this minute; a herd's own source holds no
    // food (its honeydew comes by tending: counted from the herds below)
    if (!s || s.herdId >= 0 || (s.units <= 0 && !(s.refillPerGd > 0))) continue;
    const ants = sourceForagers(sim, col, s);
    const loads = ants * col.yieldPerForager, tot = s.c + s.p;
    out.ants += ants;
    out.loads += loads;
    if (tot > 0) { out.loadsC += (loads * s.c) / tot; out.loadsP += (loads * s.p) / tot; }
  }
  for (const h of sim.stores.herds.list) {
    if (!herdWorkable(sim, col, h)) continue;
    const c = productionPerGd(h.a, 1, 1);
    out.loads += c;
    out.loadsC += c;
  }
  addKnownPatches(sim, col, out);
  return out;
}

/**
 * Prey patches the colony knows (R18 hunting, ants/behaviours/outdoor/hunt.ts) as protein capacity: the catches a
 * patch offers within a day (its prey now plus its logistic regrowth and immigration, GDD 05 §2.3), at one catch a
 * trip and FORAGER_TRIPS_PER_GD trips a forager, at most PATCH_FORAGERS_MAX foragers; one springtail's protein a catch.
 */
function addKnownPatches(sim: Sim, col: Colony, out: KnownCapacity): void {
  const bit = colonySlotBit(sim, col.id);
  if (bit === 0) return;
  const pCatch = CREATURE_STATS.springtail.deadP;
  for (const p of sim.state.ecology.preyPatches) {
    if (((p.knownBy ?? 0) & bit) === 0 || p.k <= 0 || p.count < 1) continue;
    const catches = p.count + PATCH_R_PER_GD * p.count * (1 - p.count / p.k) + PATCH_IMMIGRATION_PER_GD * p.k;
    const ants = Math.min(PATCH_FORAGERS_MAX, catches / FORAGER_TRIPS_PER_GD);
    const loads = ants * FORAGER_TRIPS_PER_GD * pCatch;
    out.ants += ants;
    out.loads += loads;
    out.loadsP += loads;
  }
}

/**
 * Share of each nutrient's forage want the known sources cannot supply (GDD 02 §6.2 `shortfall`, per nutrient), 0 for
 * a nutrient the colony does not need now.
 */
export function nutrientShortfalls(col: Colony, known: KnownCapacity): { c: number; p: number } {
  const want = forageWant(col);
  const short = (w: number, loads: number, need: number): number => (need > 0 && w > 0 ? clamp(1 - loads / w, 0, 1) : 0);
  return { c: short(want.c, known.loadsC, col.needs.needC), p: short(want.p, known.loadsP, col.needs.needP) };
}

/**
 * Each nutrient's forage want, loads per gd: today's rate plus the refill of the stock wanted over STOCK_REFILL_GD
 * (the forage side's rates, so it carries the season's stock target and R32b / R35's prospective protein; for
 * carbohydrate the stock wanted also covers the path to the winter need, R40 a / R41 carbStockWanted).
 */
export function forageWant(col: Colony): { c: number; p: number } {
  const r = forageRates(col), t = targetDays(col), st = col.stores;
  return {
    c: r.c + Math.max(0, carbStockWanted(col) - st.c) / STOCK_REFILL_GD,
    p: r.p + Math.max(0, t.p * r.p - st.p) / STOCK_REFILL_GD,
  };
}

/**
 * Tenders that keep a herd's claim: TEND_KEEP, or as many as hold its `tend` above RIVAL_TEND_GUARD for a herd that
 * needs more than 1 / RIVAL_TEND_GUARD tenders at full tending (tend = present / tendersNeeded, plants/tending.ts).
 */
export function tendKeep(aphids: number): number {
  return Math.max(TEND_KEEP, Math.floor(RIVAL_TEND_GUARD * tendersNeeded(aphids)) + 1);
}

/**
 * R39 (direction 26 item 1): the `tend` demand, worker-equivalents. Herds under the colony's forage marker get their
 * (multiplied) slots as before. The others get min(their slots, max(keep, tenders the carbohydrate want needs)), where
 * tenders needed = ceil(TEND_HEADROOM x wantC / carbohydrate one tender brings a gd); one tender's carbohydrate is the
 * herds' production at full tending over their slots (plants/herdMath), and wantC is the forage want (forageWant) less
 * what the known non-herd sources and the marked herds supply: the forage demand already asks foragers for the
 * carbohydrate those sources can give (intakeTarget, capped by their forager-equivalents), so counting it again for
 * the tenders would ask for the same sugar twice. The keep holds only while the surface is workable.
 */
export function tendDemand(sim: Sim, col: Colony, known: KnownCapacity, workable: boolean): number {
  let marked = 0, markedC = 0, slots = 0, prod = 0, keep = 0, herdC = 0;
  for (const h of sim.stores.herds.list) {
    if (!herdWorkable(sim, col, h)) continue;
    const full = productionPerGd(h.a, 1, 1);
    herdC += full;
    if (herdMarked(sim, col, h)) { marked += tendersWanted(sim, col, h); markedC += full; continue; }
    slots += tendSlots(h.a);
    prod += full;
    keep += tendKeep(h.a);
  }
  if (slots <= 0) return marked;
  const nonHerdC = Math.max(0, known.loadsC - herdC);
  const wantC = Math.max(0, forageWant(col).c - nonHerdC - markedC);
  const perTender = prod / slots;
  const needed = perTender > 0 ? Math.ceil((TEND_HEADROOM * wantC) / perTender) : slots;
  return marked + Math.min(slots, Math.max(workable ? keep : 0, needed));
}

/**
 * Share of the intake target the known sources cannot supply (GDD 02 §6.2 `shortfall`; econ-growth R9: a colony short
 * of protein that knows only sugar keeps scouting for protein, whatever its carbohydrate): the larger of the two.
 */
export function scoutShortfall(col: Colony, known: KnownCapacity): number {
  const s = nutrientShortfalls(col, known);
  return Math.max(s.c, s.p);
}

/** R38 item 1: the scout floor while a nutrient is missing, in worker-equivalents, for a colony of `n` workers. */
export function missingScoutFloor(n: number): number {
  const min = n < SCOUTS_MISSING_SMALL_N ? 1 : SCOUTS_MISSING_MIN;
  return Math.min(SCOUT_MISSING_MAX_FRAC * n, Math.max(min, SCOUT_MISSING_FRAC * n));
}

/** Direction 26a item 2: the lower floor while the colony knows a live source of the nutrient and is still short. */
export function shortKnownScoutFloor(n: number): number {
  return Math.max(1, Math.ceil(SCOUT_SHORT_KNOWN_FRAC * n));
}

/**
 * The scout floor (R38 item 1 in direction 26a item 2's two levels), worker-equivalents; 0 while no nutrient is
 * missing. Per missing nutrient: the full floor while the colony knows no live source of it, the lower floor while it
 * knows one; the larger over the nutrients.
 */
export function scoutFloor(col: Colony, known: KnownCapacity, live: { c: number; p: number }, n: number): number {
  const s = nutrientShortfalls(col, known);
  let floor = 0;
  for (const k of ['c', 'p'] as const) {
    if (s[k] < SCOUT_MISSING_SHORT) continue;
    floor = Math.max(floor, live[k] > 0 ? shortKnownScoutFloor(n) : missingScoutFloor(n));
  }
  return floor;
}

/** Worker-equivalents of open dig work: the nest module's digDemand over the colony's plans (GDD 03 §7.7). */
export function digDemand(sim: Sim, col: Colony): number {
  // a `reopening` entrance's plug is dig work too (GDD 03 §4.2, §13: the first workers dig it out), one digger each
  let unplug = 0;
  for (const nid of col.nestIds) if (entranceToUnplug(sim, nid)) unplug++;
  return nestDigDemand(sim, col.id) + unplug;
}

/** Threat multiplier for guards and patrols: alarm near an entrance. */
function threatMult(sim: Sim, col: Colony): number {
  for (const nid of col.nestIds) {
    const n = sim.stores.nests.get(nid);
    if (!n) continue;
    for (const e of n.entrances) if (sim.phero.sample(col.id, 'alarm', e.pos) > ENTRANCE_ALARM_ALERT_PH) return THREAT_DEMAND_MULT;
  }
  return 1;
}

export function entranceCount(sim: Sim, col: Colony): number {
  let k = 0;
  for (const nid of col.nestIds) {
    const n = sim.stores.nests.get(nid);
    if (n) for (const e of n.entrances) if (e.status !== 'sealed') k++;
  }
  return k;
}

/**
 * Live sources the colony knows, per nutrient. Carbohydrate: known sources with food and carbohydrate in it, and the
 * herds it works; protein: known sources with protein, and its known prey patches holding prey.
 */
export function knownLiveSources(sim: Sim, col: Colony): { c: number; p: number } {
  let c = 0, p = 0;
  for (const id of col.knownSourceIds) {
    const s = sim.stores.sources.get(id);
    if (!s || s.units <= 0) continue;
    if (s.c > 0) c++;
    if (s.p > 0) p++;
  }
  for (const h of sim.stores.herds.list) if (herdWorkable(sim, col, h)) c++;
  const bit = colonySlotBit(sim, col.id);
  if (bit !== 0) for (const pt of sim.state.ecology.preyPatches) if (((pt.knownBy ?? 0) & bit) !== 0 && pt.count >= 1) p++;
  return { c, p };
}

/**
 * Live sources the colony knows that carry a nutrient it needs now, the fewest over those nutrients (R38 item 1: a
 * colony that knows two sugar sources and no protein still has protein to find). Infinity while it needs neither.
 */
function knownSourcesOfNeeded(live: { c: number; p: number }, col: Colony): number {
  const { c, p } = live;
  let fewest = Infinity;
  if (col.needs.needC > 0) fewest = Math.min(fewest, c);
  if (col.needs.needP > 0) fewest = Math.min(fewest, p);
  return fewest;
}

/**
 * Small colonies forage (R3, balance SMALL_*): under the stock target on a workable surface, forage + scout demand
 * is at least max(SMALL_OUTSIDE_MIN, SMALL_OUTSIDE_FRAC x N). Scouts are at least SMALL_SCOUTS_MIN until
 * SMALL_KNOWN_SOURCES live sources of each nutrient it needs are known (R38 item 1); the rest of the outside share
 * forages.
 */
function smallColonyFloor(
  sim: Sim, col: Colony, n: number, d: Float64Array | Float32Array, live: { c: number; p: number },
): void {
  if (n >= SMALL_COLONY_N || surfaceActivityOf(sim, col.species) < SCOUT_MIN_ACTIVITY) return;
  if (col.needs.needC <= 0 && col.needs.needP <= 0) return;
  const outside = Math.min(n, Math.max(SMALL_OUTSIDE_MIN, SMALL_OUTSIDE_FRAC * n));
  const scoutsMin = knownSourcesOfNeeded(live, col) < SMALL_KNOWN_SOURCES ? Math.min(outside, SMALL_SCOUTS_MIN) : 0;
  d[T('scout')] = Math.max(d[T('scout')], scoutsMin);
  // the rest of the outside share forages, at least one forager (a 7-worker colony's 2.45 - 2 scouts rounded to no
  // forager at all). With nothing known yet those foragers wait inside for news, where they age at a third of the
  // outside rate (GDD 02 §1.3); sending the whole share out to scout cost small colonies their first workers to old
  // age before the winter (econ-growth sweeps 5-6: 3-4 old-age deaths of 13-15 workers)
  d[T('forage')] = Math.max(d[T('forage')], outside - scoutsMin, 1);
}

/**
 * Fills col.alloc.demand (Float32Array by TASKS order). `broodAmongWaste`: a brood chamber holds waste at the hygiene
 * tolerance (allocation/index.ts): the haul cap is HAUL_BROOD_MAX_FRAC then (direction 26 item 4b).
 */
export function computeDemand(sim: Sim, col: Colony, cen: Census, broodAmongWaste = false): Float32Array {
  const d = col.alloc.demand;
  d.fill(0);
  const n = cen.workers;
  if (n === 0) return d;
  const core = coreOf(col);
  const brood = cen.eggs + cen.larvae + cen.pupae;
  const larval = accGet(core, 'inst.larvaC') + accGet(core, 'inst.larvaP');
  let nurse = larval / NURSE_FEED_CAPACITY + cen.eggs / EGGS_PER_NURSE + cen.pupae / PUPAE_PER_NURSE
    + BROOD_MOVE_NURSE * accGet(core, 'pendingBroodMoves') + cen.diapause / DIAPAUSE_LARVAE_PER_NURSE;
  if (brood > 0) nurse = Math.max(1, nurse);
  d[T('nurse')] = nurse;

  const q = queenOf(sim, col);
  d[T('queen-care')] = q && !q.queen?.founding ? Math.min(QUEEN_CARE_MAX, QUEEN_CARE_BASE + Math.floor(n / QUEEN_CARE_PER_WORKERS)) : 0;

  const known = knownCapacity(sim, col);
  const perForager = Math.max(col.yieldPerForager, 1e-6);
  const forageFull = Math.min(intakeTarget(col) / perForager, known.ants + 1);
  d[T('forage')] = Math.min(intakeTarget(col, false) / perForager, known.ants + 1);
  const foragers = cen.byTask[T('forage')];
  const items = itemCounts(sim).byColony.get(col.id);
  d[T('store')] = (foragers >= 1 ? Math.max(1, STORE_PER_FORAGER * foragers) : 0) + (items ? items.spoiled / SPOILED_ITEMS_PER_STORE : 0);

  // R42: a surface too cold to walk on is not workable, and nobody is asked to go out on it
  const outdoorOk = !tooColdToDepart(sim, col);
  const workable = outdoorOk && surfaceActivityOf(sim, col.species) >= SCOUT_MIN_ACTIVITY;
  if (workable) {
    const shortfall = scoutShortfall(col, known);
    d[T('scout')] = Math.min(SCOUT_MAX_FRAC * n, Math.max(1, SCOUT_BASE_FRAC * n) + SCOUT_SHORTFALL_FRAC * n * shortfall);
  }
  const live = knownLiveSources(sim, col);
  smallColonyFloor(sim, col, n, d, live);
  // R38 item 1 / direction 26a item 2: scouts for a missing nutrient; this floor (not the rest of the scout demand) is
  // filled before `forage` (targets.ts, direction 26 item 3)
  const floor = workable ? scoutFloor(col, known, live, n) : 0;
  d[T('scout')] = Math.max(d[T('scout')], floor);
  core.acc[SCOUT_FLOOR_KEY] = floor;
  // R35 point 5: the prospective part of the forage demand, on top of the plain demand and the small-colony floor
  const plainForage = d[T('forage')];
  d[T('forage')] = Math.max(plainForage, forageFull);
  core.acc[PROSPECTIVE_FORAGE_KEY] = d[T('forage')] - plainForage;
  // R39: tenders for the carbohydrate the colony wants, at most Σ tenderSlots over its workable herds (GDD 02 §6.2)
  d[T('tend')] = tendDemand(sim, col, known, workable);
  if (!outdoorOk) {
    d[T('forage')] = 0; d[T('scout')] = 0; d[T('tend')] = 0;
    core.acc[PROSPECTIVE_FORAGE_KEY] = 0; core.acc[SCOUT_FLOOR_KEY] = 0;
  }
  d[T('dig')] = digDemand(sim, col);
  // pellets: the nest's lying in-nest pellets weighted by haul urgency (spoil nearing tamping age counts more)
  const pellets = haulPelletLoad(sim, col.id);
  if (items || pellets > 0) {
    const w = items ? items.waste / HAUL_PER_WASTE + items.corpses / HAUL_PER_CORPSE : 0;
    d[T('haul')] = Math.min((broodAmongWaste ? HAUL_BROOD_MAX_FRAC : HAUL_MAX_FRAC) * n, pellets / HAUL_PER_PELLET + w);
  }
  if (n >= DEFEND_MIN_WORKERS) {
    const m = threatMult(sim, col);
    d[T('guard')] = entranceCount(sim, col) * GUARDS_PER_ENTRANCE * m;
    d[T('patrol')] = Math.max(1, PATROL_FRAC * n) * m;
  }
  core.acc['threat'] = n >= DEFEND_MIN_WORKERS && threatMult(sim, col) > 1 ? 1 : 0;
  return d;
}
