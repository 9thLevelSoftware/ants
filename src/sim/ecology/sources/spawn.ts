// Creating sources from the catalogue: the one place that turns a variant into a FoodSource record.
// Used at New Game (anchors), by the sources system (drops, re-placement) and by other modules at runtime.

import { rngInt, rngRange } from '@/core/rng';
import type { Vec3 } from '@/core/math/vec3';
import type { CarrionStage, FoodSource, FoodVariant } from '@/sim/types';
import { SEASONS } from '@/sim/types';
import { spawnSource, worldBu, type EntityCtx } from '@/sim/entities';
import { difficultyValue } from '@/sim/balance/difficulty';
import {
  CARRION_TEAR_P_PER_BULK_MIN, ECOLOGY_TIER, LARGE_CARCASS_TYPES, REF_CARRY_MG, SPILL_HALF_LIFE_GD, SPILL_SIZES, WINDFALL_FRUITS, WINDFALL_STAGES,
  type LargeCarcassType, type WindfallFruit,
} from '@/sim/balance/ecology';
import { odourFromRadiusBu, sourceDef, spillSlots } from './def';
import { ecologyRng } from './util';

export interface CreateSourceOptions {
  variant: FoodVariant;
  pos: Vec3;
  up?: Vec3;
  /** Units (liquids: loads); default: rolled from the catalogue range x foodAbundanceMult. */
  units?: number;
  /** Rules of this tier (default ECOLOGY_TIER): T1 sources have no carrion stages, T1 overrides apply. */
  tier?: number;
  /**
   * Carrion stage to start in (T2 rules). Carrion at tier >= 2 always has a stage ('fresh' when this is null or
   * missing, e.g. a fresh corpse item); other sources and all T1 sources have none.
   */
  stage?: CarrionStage | null;
  objectId?: number;
  plantId?: number;
  herdId?: number;
  anchorId?: number;
  /** SEASONS bits; default all seasons. */
  seasonMask?: number;
  /** Large carcass type, windfall fruit, spill diameter (mm). */
  carcass?: LargeCarcassType;
  fruit?: WindfallFruit;
  spillMm?: number;
  /** Start a renewable pool empty (anchor initialState 'empty'). */
  empty?: boolean;
}

function abundance(ctx: EntityCtx): number {
  return difficultyValue(ctx, 'foodAbundanceMult');
}

/** Creates a source of a catalogue variant (events: entity-created, food-source-spawned). */
export function createSource(ctx: EntityCtx, o: CreateSourceOptions): FoodSource {
  const tier = o.tier ?? ECOLOGY_TIER;
  const d = sourceDef(o.variant, tier);
  const rng = ecologyRng(ctx.state);
  const mult = abundance(ctx);
  const bu = worldBu(ctx);
  const pool = d.poolCap > 0;
  const rolled = d.units[1] > d.units[0] ? rngInt(rng, d.units[0], d.units[1]) : d.units[0];
  let units = o.units ?? (d.form === 'liquid' ? rolled * mult : Math.max(1, Math.round(rolled * mult)));
  if (d.form === 'pick') units = Math.round(units); // a fraction of a crumb could never be picked
  const slots = d.slots[1] > d.slots[0] ? rngInt(rng, d.slots[0], d.slots[1]) : d.slots[0];
  const init: Partial<FoodSource> = {
    variant: o.variant, objectId: o.objectId ?? -1, plantId: o.plantId ?? -1, herdId: o.herdId ?? -1,
    anchorId: o.anchorId ?? -1, unitBulk: d.unitBulk, c: d.c, p: d.p, toxin: d.toxin, water: d.water,
    pool: -1, poolCap: 0, refillPerGd: d.refillPerGd * mult, decayPerGd: halfLifeToDecay(d.halfLifeGd),
    quality: d.quality, hardness: d.hardness, slots, drinkRateMult: d.drinkRateMult, odour: odourFromRadiusBu(d.odourBu),
    stage: d.carrion && tier >= 2 ? o.stage ?? 'fresh' : null, stageClock: 0,
    seasonMask: o.seasonMask ?? (1 << SEASONS.length) - 1,
  };
  if (pool) {
    init.poolCap = d.poolCap * mult;
    if (o.units === undefined) units = o.empty ? 0 : Math.min(units, init.poolCap);
  }
  if (o.variant === 'large-carcass') applyCarcass(init, o.carcass ?? 'worm');
  if (o.variant === 'windfall') units = applyFruit(init, o.fruit ?? 'plum', o.units, mult);
  if (o.variant === 'sugary-spill') units = applySpill(init, o.spillMm, o.units, mult, bu, tier);
  const capacity = pool ? Math.max(init.poolCap ?? 0, units) : units;
  const s = spawnSource(ctx, { kind: d.kind, pos: o.pos, up: o.up, units, init: { ...init, capacity } });
  if (pool) s.pool = s.units;
  return s;
}

/** Fraction lost per game day for a half-life (0 = none). */
export function halfLifeToDecay(halfLifeGd: number): number {
  return halfLifeGd > 0 ? 1 - Math.pow(0.5, 1 / halfLifeGd) : 0;
}

function applyCarcass(init: Partial<FoodSource>, type: LargeCarcassType): void {
  const t = LARGE_CARCASS_TYPES[type];
  init.c = t.c;
  init.p = t.p;
  // R38 item 4: no lighter than CARRION_TEAR_P_PER_BULK_MIN P per load of carry capacity
  init.unitBulk = Math.min(t.massMg / REF_CARRY_MG, t.p / CARRION_TEAR_P_PER_BULK_MIN);
  init.hardness = t.hardness;
  init.slots = t.slots;
  init.odour = odourFromRadiusBu(t.odourBu);
}

/** Windfall: `units` is the juice reserve in loads (1.0 C per load; apple adds its P pro rata). */
function applyFruit(init: Partial<FoodSource>, fruit: WindfallFruit, units: number | undefined, mult: number): number {
  const f = WINDFALL_FRUITS[fruit];
  init.p = f.p / f.c;
  init.slots = WINDFALL_STAGES[0].slots;
  init.quality = WINDFALL_STAGES[0].quality;
  return units ?? f.c * mult;
}

/**
 * Sugary spill: size, slots, amount. Tier 2 spills (event-driven) evaporate: they start with the shade half-life
 * (the hourly update sets sun / shade / indoors). A Tier 1 spill is the static one GDD 05 §0 allows: decayPerGd 0
 * marks it static (no evaporation, no residue), as the T1 honeydew sites have no decay.
 */
function applySpill(init: Partial<FoodSource>, mm: number | undefined, units: number | undefined, mult: number, bu: number, tier: number): number {
  const size = SPILL_SIZES.find((z) => z.mm === mm) ?? SPILL_SIZES[1];
  init.slots = spillSlots(size.mm, bu);
  init.decayPerGd = tier >= 2 ? halfLifeToDecay(SPILL_HALF_LIFE_GD.shade) : 0;
  return units ?? size.loads * mult;
}

/** A random spill size (GDD 05 §1.2 sizes), mm. */
export function rollSpillMm(ctx: EntityCtx): number {
  const i = Math.floor(rngRange(ecologyRng(ctx.state), 0, SPILL_SIZES.length));
  return SPILL_SIZES[i].mm;
}
