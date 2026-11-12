// Taking food from a source (GDD 05 §1.1, §1.5; GDD 01 §7 harvest-liquid / harvest-solid / pick-up).
//
//   liquid: `amount` = game seconds of drinking; 0.05 load/s x drinkRateMult into the crop, up to its room.
//   pick:   `amount` = whole units wanted (at least 1); one item of up to floor(carryCap / unitBulk) units.
// A NaN amount takes nothing (status 'ok', taken 0) so a caller's bad dt cannot wipe a source.
//   tear:   `amount` = pieces wanted (1 per call); one piece of bulk carryCap (or what is left) in the mandibles.
// Never takes more than is there or than the ant can hold; feeding slots are enforced (slots.ts). A depleted
// non-renewable source is removed with its events; a renewable one is flagged exhausted for the colony.

import { v3Clone, v3DistanceSq, type Vec3 } from '@/core/math/vec3';
import type { Ant, FoodSource, Item, Sim } from '@/sim/types';
import { spawnItem } from '@/sim/entities';
import { FINAL_PIECE_MIN_BULK, LIQUID_EMPTY_EPS, REF_CARRY_MG, SOURCE_DRINK_RATE, type SourceForm } from '@/sim/balance/ecology';
import { addToCrop, cropRoom } from './crop';
import { defOf, isEmpty, reachMm, setAmount } from './def';
import { discoverSource } from './discovery';
import { recordHarvest } from './ledger';
import { isDriedWetFood } from './lifecycle';
import { markExhausted, retireSource } from './remove';
import { isInSeason } from './season';
import { hasSlot } from './slots';

export type HarvestStatus =
  | 'ok' | 'no-source' | 'out-of-season' | 'empty' | 'crowded' | 'out-of-reach' | 'crop-full' | 'hands-full'
  | 'too-heavy';

export interface HarvestResult {
  status: HarvestStatus;
  /** Nutrients taken, loads (into the crop for liquids, inside the item for solids). */
  c: number;
  p: number;
  toxin: number;
  water: number;
  /** Liquid volume drunk (loads) or solid units / bulk fraction removed from the source. */
  taken: number;
  /** Item created in the ant's mandibles (pick / tear), -1 none. */
  itemId: number;
  /** The source ran out (and was removed when not renewable). */
  depleted: boolean;
}

export interface HarvestOptions {
  /** Check that the ant is within reach of the footprint (default true). */
  checkReach?: boolean;
}

function result(status: HarvestStatus): HarvestResult {
  return { status, c: 0, p: 0, toxin: 0, water: 0, taken: 0, itemId: -1, depleted: false };
}

/** How the source is harvested now (dried wet pet food is torn). */
export function harvestForm(sim: Sim, s: FoodSource): SourceForm {
  if (isDriedWetFood(sim, s)) return 'tear';
  return defOf(s)?.form ?? 'pick';
}

/** Whether the ant stands within reach of the source. */
export function withinReach(sim: Sim, ant: Ant, s: FoodSource): boolean {
  const r = reachMm(s, sim.world.bu);
  return v3DistanceSq(ant.pos, s.pos) <= r * r;
}

/** Takes food from a source for an ant. See the file header for what `amount` means per form. */
export function takeFromSource(sim: Sim, ant: Ant, sourceId: number, amount: number, opts: HarvestOptions = {}): HarvestResult {
  const s = sim.stores.sources.get(sourceId);
  if (!s) return result('no-source');
  if (Number.isNaN(amount)) return result('ok'); // a caller bug takes nothing rather than wiping the source
  if (!isInSeason(sim, s)) return result('out-of-season');
  if (isEmpty(s)) return result('empty');
  if ((opts.checkReach ?? true) && !withinReach(sim, ant, s)) return result('out-of-reach');
  if (!hasSlot(sim, ant, s)) return result('crowded');
  const form = harvestForm(sim, s);
  const r = form === 'liquid' ? drink(ant, s, amount) : form === 'pick' ? pick(sim, ant, s, amount) : tear(sim, ant, s);
  if (r.status !== 'ok') return r;
  discoverSource(sim, ant.colony, s.id, ant.id);
  recordHarvest(sim, ant.colony, s.id, r.c, r.p);
  if (isEmpty(s)) {
    r.depleted = true;
    markExhausted(sim, s, ant.colony);
    if (!defOf(s)?.renewable) retireSource(sim, s, 'depleted');
  }
  return r;
}

function drink(ant: Ant, s: FoodSource, seconds: number): HarvestResult {
  const perLoad = s.c + s.p + s.water;
  const room = cropRoom(ant);
  if (room <= LIQUID_EMPTY_EPS) return result('crop-full');
  const want = Math.max(0, seconds) * SOURCE_DRINK_RATE * s.drinkRateMult;
  const v = Math.min(want, s.units, perLoad > 0 ? room / perLoad : room);
  const r = result('ok');
  if (v <= 0) return r;
  setAmount(s, s.units - v);
  if (s.units <= LIQUID_EMPTY_EPS) setAmount(s, 0);
  r.c = v * s.c;
  r.p = v * s.p;
  r.toxin = v * s.toxin;
  r.water = v * s.water;
  r.taken = v;
  addToCrop(ant, r.c, r.p, r.toxin, r.water);
  return r;
}

function handsFree(ant: Ant): boolean {
  return ant.carry.kind === 'none';
}

function pick(sim: Sim, ant: Ant, s: FoodSource, wanted: number): HarvestResult {
  if (!handsFree(ant)) return result('hands-full');
  if (s.unitBulk > ant.carryCap) return result('too-heavy');
  const k = Math.min(Math.floor(Math.max(1, wanted)), Math.floor(s.units + LIQUID_EMPTY_EPS), Math.floor(ant.carryCap / s.unitBulk));
  if (k < 1) return result('empty');
  setAmount(s, s.units - k);
  const it = makeFoodItem(sim, s, s.pos, k * s.unitBulk, k, ant);
  return itemResult(it, k);
}

function tear(sim: Sim, ant: Ant, s: FoodSource): HarvestResult {
  if (!handsFree(ant)) return result('hands-full');
  if (ant.carryCap <= LIQUID_EMPTY_EPS) return result('too-heavy'); // it could only tear an empty piece
  const left = s.units * s.unitBulk;
  const piece = Math.min(ant.carryCap, left);
  const takenUnits = piece / s.unitBulk;
  setAmount(s, s.units - takenUnits);
  const it = makeFoodItem(sim, s, s.pos, piece, 1, ant);
  const rest = s.units * s.unitBulk;
  if (rest > LIQUID_EMPTY_EPS && rest < FINAL_PIECE_MIN_BULK) {
    makeFoodItem(sim, s, s.pos, rest, 1, null); // the last scrap lies where the carcass was (GDD 05 §1.5 rule 6)
    setAmount(s, 0);
  }
  return itemResult(it, takenUnits);
}

function itemResult(it: Item, taken: number): HarvestResult {
  const r = result('ok');
  r.c = it.c;
  r.p = it.p;
  r.toxin = it.toxin;
  r.water = it.water;
  r.taken = taken;
  r.itemId = it.id;
  return r;
}

/**
 * Creates the item for `bulk` of the source (nutrients pro rata per bulk). With an ant it goes straight into its
 * mandibles; without, it lies at pos.
 */
export function makeFoodItem(sim: Sim, s: FoodSource, pos: Vec3, bulk: number, count: number, ant: Ant | null): Item {
  const d = defOf(s);
  const perBulk = s.unitBulk > 0 ? bulk / s.unitBulk : 0;
  const whole = d?.form === 'pick';
  const it = spawnItem(sim, {
    kind: whole ? d.item : 'food-piece', pos: ant ? v3Clone(ant.pos) : v3Clone(pos),
    init: {
      c: s.c * perBulk, p: s.p * perBulk, toxin: s.toxin * perBulk, water: s.water * perBulk, count, bulk,
      massMg: bulk * REF_CARRY_MG, lengthMm: whole && d ? d.unitMm : 0, hardness: s.hardness, foodKind: s.kind,
      variant: s.variant, stage: s.stage, stageClock: s.stageClock, carrierIds: ant ? [ant.id] : [],
    },
  });
  if (ant) ant.carry = { kind: 'item', id: it.id };
  return it;
}

/**
 * Turns what is left of a single-unit source (a carcass, a crust) into one lying item for dragging or
 * cooperative transport, and removes the source (cause 'taken'). Returns the item id, -1 if nothing to take.
 */
export function detachWhole(sim: Sim, sourceId: number): number {
  const s = sim.stores.sources.get(sourceId);
  if (!s || isEmpty(s) || defOf(s)?.form === 'liquid') return -1;
  const d = defOf(s);
  const bulk = s.units * s.unitBulk;
  const it = makeFoodItem(sim, s, s.pos, bulk, 1, null);
  if (d?.carrion) it.kind = 'carcass';
  if (d) it.lengthMm = d.unitMm;
  setAmount(s, 0);
  retireSource(sim, s, 'taken');
  return it.id;
}
