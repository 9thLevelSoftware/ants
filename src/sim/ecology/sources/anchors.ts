// Food anchors (WorldData.placements.foodAnchors, placed by worldgen) -> live sources at New Game, and the
// re-creation of a consumed anchor's source (T1 crumb rule).
//
// An anchor names a food kind; its `initialState` may name the variant ('crumb-protein', 'flower' ...) and/or the
// start state ('empty', 'full'). Anchors whose node is another module's (aphid herds: ecology-plants; prey
// patches: creatures) or only an area (dead-insect spawn areas: carrion drops) create no source here.

import type { FoodAnchor, FoodSource, FoodVariant, WorldData } from '@/sim/types';
import { FOOD_VARIANTS } from '@/sim/types';
import type { EntityCtx } from '@/sim/entities';
import { CRUMB_PROTEIN_EVERY, ECOLOGY_TIER } from '@/sim/balance/ecology';
import { availableAtTier, defaultVariant, sourceDef } from './def';
import { createSource } from './spawn';

/** Herd-driven variants: their sources are created by the plants module with the herd. */
const HERD_VARIANTS: readonly FoodVariant[] = ['aphid-herd', 'scale-herd'];
const EMPTY_STATE = 'empty';
const AREA_STATE = 'area';

function hintedVariant(a: FoodAnchor): FoodVariant | null {
  const words = a.initialState.split(/[\s,;:]+/);
  for (const w of words) {
    const v = (FOOD_VARIANTS as readonly string[]).includes(w) ? (w as FoodVariant) : null;
    if (v && sourceDef(v).kind === a.kind) return v;
  }
  return null;
}

/**
 * Variant an anchor becomes, or null when it creates no source at this tier. `crumbIndex` counts crumb anchors
 * without a hint: every CRUMB_PROTEIN_EVERY-th one is a protein cluster (GDD 05 §1.2: 1 protein per 3 starch).
 */
export function anchorVariant(a: FoodAnchor, crumbIndex: number, tier: number = ECOLOGY_TIER): FoodVariant | null {
  if (a.initialState.split(/[\s,;:]+/).includes(AREA_STATE)) return null;
  let v = hintedVariant(a);
  if (!v) {
    if (a.kind === 'carrion') return null; // carrion comes from runtime drops; a bare carrion anchor is an area
    v = defaultVariant(a.kind);
    if (v === 'crumb-starch' && crumbIndex % CRUMB_PROTEIN_EVERY === CRUMB_PROTEIN_EVERY - 1) v = 'crumb-protein';
  }
  if (!v || HERD_VARIANTS.includes(v)) return null;
  if (v === 'honeydew-film' && tier >= 2) return null; // T2 films come with their herds (GDD 05 §0)
  return availableAtTier(v, tier) ? v : null;
}

/** Creates the source of one anchor. */
export function sourceFromAnchor(ctx: EntityCtx, a: FoodAnchor, variant: FoodVariant): FoodSource {
  return createSource(ctx, {
    variant, pos: a.pos, up: a.up, objectId: a.hostObjectId, anchorId: a.id, seasonMask: a.seasonMask,
    empty: a.initialState.split(/[\s,;:]+/).includes(EMPTY_STATE),
  });
}

const variantCache = new WeakMap<WorldData, Map<number, Map<number, FoodVariant>>>();

/** Variant each anchor makes at this tier, by anchor id (anchors that make no source are absent); cached. */
export function anchorVariants(world: WorldData, tier: number = ECOLOGY_TIER): Map<number, FoodVariant> {
  let byTier = variantCache.get(world);
  if (!byTier) {
    byTier = new Map();
    variantCache.set(world, byTier);
  }
  let m = byTier.get(tier);
  if (m) return m;
  m = new Map();
  let crumbIndex = 0;
  for (const a of world.placements.foodAnchors) {
    const hinted = hintedVariant(a) !== null;
    const v = anchorVariant(a, crumbIndex, tier);
    if (a.kind === 'crumb' && !hinted) crumbIndex++;
    if (v) m.set(a.id, v);
  }
  byTier.set(tier, m);
  return m;
}

/** New Game: one source per anchor that makes one at this tier. Returns the number created. */
export function initSources(ctx: EntityCtx, world: WorldData, tier: number = ECOLOGY_TIER): number {
  const variants = anchorVariants(world, tier);
  let made = 0;
  for (const a of world.placements.foodAnchors) {
    const v = variants.get(a.id);
    if (!v) continue;
    sourceFromAnchor(ctx, a, v);
    made++;
  }
  return made;
}
