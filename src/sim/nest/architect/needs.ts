// Need evaluation of the nest architect (GDD 03 §8.3, Tier 1 needs: crowding, brood-space, food-space,
// missing-type). Pure functions of NeedInputs and the nest record, so the same code serves the running colony
// (inputs read from the state) and a whole-nest layout from abstract numbers (layout.ts).

import type { ArchitectNeed, ChamberSize, ChamberType, Nest, PlanPriority, Sim, SpeciesId } from '@/sim/types';
import { CHAMBER_SIZES } from '@/sim/types';
import { BROOD_SPACE, nestTemplate } from '@/sim/balance/nest';
import {
  BROOD_HIGH, BROOD_RECENT_EGG_S, BROOD_RECENT_EGG_WEIGHT, BROOD_TARGET, BROOD_TRIGGER, BROOD_URGENT,
  CROWDING_GENERAL_BELOW, CROWDING_HIGH, CROWDING_TARGET, CROWDING_TRIGGER, CROWDING_URGENT, FOOD_LOOSE_ITEMS,
  FOOD_CHAMBER_TYPE, FOOD_LOOSE_S, FOOD_STORE_TYPES, FOOD_TARGET, FOOD_TRIGGER, REQUIRED_TYPES, ROYAL_PLAN_SIZE,
} from '@/sim/balance/architect';
import { TICKS_PER_SECOND } from '@/sim/time';
import { chamberAtIn } from '../chambers/registry';
import { digPowerOf } from '../substrate';
import { chambersOfType, nestCapacity, plannedLoad, type NestCapacity } from './capacity';

/** What the needs read about the colony living in a nest. */
export interface NeedInputs {
  /** Adult workers (not queens, gynes, males). */
  workers: number;
  /** Adults' space units (body length^2, queen not counted, GDD 03 §6.4). */
  adultUnits: number;
  /** Brood space units: 0.25 x eggs + larvae + pupae + 0.5 x eggs of the last 0.5 game day. */
  broodUnits: number;
  /** Solid food loads lying in the nest. */
  foodLoads: number;
  /** Food items lying outside storage chambers for FOOD_LOOSE_S or longer. */
  looseFoodItems: number;
  /** A living queen lives in this nest (inside it, or outside and this is the colony's main nest). */
  queenAlive: boolean;
  /** Ants able to dig (dig power > 0). */
  diggers: number;
}

/** One triggered need and the chamber it asks for. */
export interface NeedRequest {
  need: ArchitectNeed;
  priority: PlanPriority;
  type: ChamberType;
  size: ChamberSize;
  /** The pressure that triggered it (needCache value). */
  pressure: number;
}

export interface NeedEvaluation {
  /** Pressure per T1 need (written to ArchitectState.needCache). */
  pressures: Partial<Record<ArchitectNeed, number>>;
  /** Triggered needs, most urgent first (priority weight, then the fixed need order). */
  requests: NeedRequest[];
}

const NEED_ORDER: ArchitectNeed[] = ['missing-type', 'brood-space', 'crowding', 'food-space'];
const PRIORITY_RANK: Record<PlanPriority, number> = { low: 0, normal: 1, high: 2, urgent: 3 };

const isAdultWorker = (caste: string): boolean => caste !== 'queen' && caste !== 'gyne' && caste !== 'male';

/** Does an entity at `nestId` belong to this nest (inside it, or outside and this is the colony's main nest)? */
function belongs(sim: Sim, nest: Nest, nestId: number): boolean {
  if (nestId === nest.id) return true;
  return nestId < 0 && sim.stores.colonies.get(nest.colony)?.nestIds[0] === nest.id;
}

/** Need inputs of a nest from the live state. */
export function liveInputs(sim: Sim, nest: Nest): NeedInputs {
  const now = sim.state.tick;
  const out: NeedInputs = { workers: 0, adultUnits: 0, broodUnits: 0, foodLoads: 0, looseFoodItems: 0, queenAlive: false, diggers: 0 };
  for (const a of sim.stores.ants.list) {
    if (!a.alive || a.colony !== nest.colony) continue;
    if (!belongs(sim, nest, a.nestId)) continue;
    // GDD 03 §6.3: a royal plan only for a queen without one, so only the nest she lives in asks for it
    if (a.caste === 'queen') { out.queenAlive = true; continue; }
    out.adultUnits += a.lengthBu * a.lengthBu;
    if (isAdultWorker(a.caste)) out.workers++;
    if (digPowerOf(a) > 0) out.diggers++;
  }
  const recent = BROOD_RECENT_EGG_S * TICKS_PER_SECOND;
  for (const b of sim.stores.brood.list) {
    if (!b.alive || b.colony !== nest.colony || !belongs(sim, nest, b.nestId)) continue;
    out.broodUnits += BROOD_SPACE[b.stage];
    if (b.stage === 'egg' && now - b.laidTick <= recent) out.broodUnits += BROOD_RECENT_EGG_WEIGHT;
  }
  const looseAge = FOOD_LOOSE_S * TICKS_PER_SECOND;
  for (const it of sim.stores.items.list) {
    if (!it.alive || it.foodKind === null || it.nestId !== nest.id || it.carrierIds.length > 0) continue;
    out.foodLoads += it.c + it.p;
    const c = chamberAtIn(sim, nest, it.pos);
    if ((!c || !FOOD_STORE_TYPES.includes(c.type)) && it.droppedTick >= 0 && now - it.droppedTick >= looseAge) out.looseFoodItems++;
  }
  return out;
}

function priorityOf(x: number, high: number, urgent: number): PlanPriority {
  return x >= urgent ? 'urgent' : x >= high ? 'high' : 'normal';
}

/** Sizes the species builds for a type, smallest first. */
function sizesOf(species: string, type: ChamberType): ChamberSize[] {
  const dims = nestTemplate(species).chambers[type] ?? {};
  return CHAMBER_SIZES.filter((s) => dims[s] !== undefined);
}

/** The smallest size whose added capacity brings `load / (cap + added)` to `target` or below, else the largest. */
function sizeFor(species: string, type: ChamberType, load: number, cap: number, target: number, pick: (c: NestCapacity) => number): ChamberSize | null {
  const sizes = sizesOf(species, type);
  for (const s of sizes) {
    const l = plannedLoad(species, type, s);
    const added = pick({ adults: l.adults, brood: l.brood, food: l.food });
    if (load / Math.max(1e-9, cap + added) <= target) return s;
  }
  return sizes[sizes.length - 1] ?? null;
}

const ratio = (load: number, cap: number): number => (load <= 0 ? 0 : cap <= 0 ? Infinity : load / cap);

/** First unmet template requirement (royal for a queen without one, then GDD 03 §8.2 by workers), or null. */
export function missingType(nest: Nest, species: string, inputs: NeedInputs, pending: boolean): { type: ChamberType; size: ChamberSize; missing: number } | null {
  let first: { type: ChamberType; size: ChamberSize } | null = null, missing = 0;
  if (inputs.queenAlive && chambersOfType(nest, 'royal', pending) === 0 && chambersOfType(nest, 'founding', pending) === 0) {
    first = { type: 'royal', size: ROYAL_PLAN_SIZE };
    missing++;
  }
  for (const r of REQUIRED_TYPES[species as keyof typeof REQUIRED_TYPES] ?? []) {
    if (inputs.workers < r.workers || chambersOfType(nest, r.type, pending) >= r.count) continue;
    if (!first) first = { type: r.type, size: r.size };
    missing++;
  }
  return first ? { ...first, missing } : null;
}

/**
 * Evaluates the Tier 1 needs. With `pending` (the architect's own use) chamber plans not finished yet count as
 * built; without it the pressures are what the nest has now (diagnostics, withdrawal).
 */
export function evaluateNeeds(nest: Nest, species: string, inputs: NeedInputs, pending = true): NeedEvaluation {
  const cap = nestCapacity(nest, species, pending);
  const requests: NeedRequest[] = [];
  const pressures: Partial<Record<ArchitectNeed, number>> = {};

  const rho = ratio(inputs.adultUnits, cap.adults);
  pressures.crowding = rho;
  if (rho > CROWDING_TRIGGER) {
    const type: ChamberType = inputs.workers < CROWDING_GENERAL_BELOW ? 'general' : 'rest';
    const size = sizeFor(species, type, inputs.adultUnits, cap.adults, CROWDING_TARGET, (c) => c.adults);
    if (size) requests.push({ need: 'crowding', priority: priorityOf(rho, CROWDING_HIGH, CROWDING_URGENT), type, size, pressure: rho });
  }

  const rhoB = ratio(inputs.broodUnits, cap.brood);
  pressures['brood-space'] = rhoB;
  if (rhoB > BROOD_TRIGGER) {
    const size = sizeFor(species, 'nursery', inputs.broodUnits, cap.brood, BROOD_TARGET, (c) => c.brood);
    if (size) requests.push({ need: 'brood-space', priority: priorityOf(rhoB, BROOD_HIGH, BROOD_URGENT), type: 'nursery', size, pressure: rhoB });
  }

  const rhoF = ratio(inputs.foodLoads, cap.food);
  pressures['food-space'] = rhoF;
  if (rhoF > FOOD_TRIGGER || inputs.looseFoodItems >= FOOD_LOOSE_ITEMS) {
    const type = FOOD_CHAMBER_TYPE[species as SpeciesId] ?? 'food';
    const size = sizeFor(species, type, inputs.foodLoads, cap.food, FOOD_TARGET, (c) => c.food);
    if (size) requests.push({ need: 'food-space', priority: 'normal', type, size, pressure: Math.max(rhoF, inputs.looseFoodItems / FOOD_LOOSE_ITEMS) });
  }

  const miss = missingType(nest, species, inputs, pending);
  pressures['missing-type'] = miss ? miss.missing : 0;
  if (miss) requests.push({ need: 'missing-type', priority: 'normal', type: miss.type, size: miss.size, pressure: miss.missing });

  requests.sort((a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority] || NEED_ORDER.indexOf(a.need) - NEED_ORDER.indexOf(b.need));
  return { pressures, requests };
}

/** Is the need still there, counting only what is built (the withdrawal test, GDD 03 §7.8)? */
export function needStillThere(nest: Nest, species: string, inputs: NeedInputs, need: ArchitectNeed): boolean {
  return evaluateNeeds(nest, species, inputs, false).requests.some((r) => r.need === need);
}
