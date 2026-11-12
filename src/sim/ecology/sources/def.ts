// Catalogue lookups and small accessors on FoodSource records (plain data in, numbers out).
//
// Amount convention: `units` is the authoritative amount of every source (solid units, or loads for liquids).
// Pool sources (renewable liquids) also mirror it into `pool` (and `poolCap` = `capacity`), the GDD 05 App. A
// fields other readers may use; setAmount keeps the two equal.

import type { FoodKind, FoodSource, FoodVariant } from '@/sim/types';
import {
  DEFAULT_VARIANT_BY_KIND, ECOLOGY_TIER, LIQUID_EMPTY_EPS, SOURCE_CATALOGUE, SOURCE_ODOUR_REF_BU, SOURCE_REACH_BU,
  SPILL_SIZES, SPILL_SLOT_SPACING_L, SPILL_SLOTS_MAX, type SourceDef,
} from '@/sim/balance/ecology';

const t1Cache = new Map<FoodVariant, SourceDef>();

/** Catalogue row of a variant with the overrides of the given tier applied (GDD 05 §0). */
export function sourceDef(variant: FoodVariant, tier: number = ECOLOGY_TIER): SourceDef {
  const base = SOURCE_CATALOGUE[variant];
  if (tier !== 1 || !base.t1) return base;
  let d = t1Cache.get(variant);
  if (!d) {
    d = { ...base, ...base.t1 };
    t1Cache.set(variant, d);
  }
  return d;
}

/** Variant for a kind when none is given; null when the kind is not a source (prey, leaf). */
export function defaultVariant(kind: FoodKind): FoodVariant | null {
  return DEFAULT_VARIANT_BY_KIND[kind];
}

/** Whether a variant exists at the given tier (T1 builds create only T1 rows unless asked explicitly). */
export function availableAtTier(variant: FoodVariant, tier: number = ECOLOGY_TIER): boolean {
  return sourceDef(variant, tier).tier <= tier;
}

/** Catalogue row of a source record (static variant data; null variants use the kind's default). */
export function defOf(s: FoodSource): SourceDef | null {
  const v = s.variant ?? defaultVariant(s.kind);
  return v ? SOURCE_CATALOGUE[v] : null;
}

export function isLiquid(s: FoodSource): boolean {
  return defOf(s)?.form === 'liquid';
}

/** Amount left: units, or loads for liquids. */
export function amountOf(s: FoodSource): number {
  return s.units;
}

export function setAmount(s: FoodSource, v: number): void {
  const a = v > 0 ? v : 0;
  s.units = a;
  if (s.pool >= 0) s.pool = a;
}

/** Nothing left to take (liquids below LIQUID_EMPTY_EPS, solids below one hundredth of a unit). */
export function isEmpty(s: FoodSource): boolean {
  return s.units <= LIQUID_EMPTY_EPS;
}

/** Odour radius of the source, mm (a single crumb smells less far than a cluster). */
export function odourRadiusMm(s: FoodSource, bu: number): number {
  const d = defOf(s);
  const single = d && d.odourSingleBu > 0 && s.units <= 1 ? d.odourSingleBu / SOURCE_ODOUR_REF_BU : s.odour;
  return single * SOURCE_ODOUR_REF_BU * bu;
}

/** Odour multiplier stored on the record for a radius in BU. */
export function odourFromRadiusBu(radiusBu: number): number {
  return radiusBu / SOURCE_ODOUR_REF_BU;
}

/** Footprint radius, mm (spills by their size). */
export function footprintMm(s: FoodSource, bu: number): number {
  const d = defOf(s);
  if (s.variant === 'sugary-spill' || s.variant === 'sticky-residue') return spillDiameterMm(s.capacity) * 0.5;
  return (d ? d.footprintBu : 1) * bu;
}

/** Distance within which an ant harvests the source, mm. */
export function reachMm(s: FoodSource, bu: number): number {
  return footprintMm(s, bu) + SOURCE_REACH_BU * bu;
}

/** Diameter of a spill holding `loads` at the start: the smallest catalogue size that holds it, mm. */
export function spillDiameterMm(loads: number): number {
  for (const z of SPILL_SIZES) if (loads <= z.loads) return z.mm;
  return SPILL_SIZES[SPILL_SIZES.length - 1].mm;
}

/** Feeding slots of a spill of diameter mm: perimeter / (1.5 L), at most SPILL_SLOTS_MAX (GDD 05 §1.2). */
export function spillSlots(diameterMm: number, buMm: number): number {
  const n = Math.floor((Math.PI * diameterMm) / (SPILL_SLOT_SPACING_L * buMm));
  return Math.max(1, Math.min(SPILL_SLOTS_MAX, n));
}
