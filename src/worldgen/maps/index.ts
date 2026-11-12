// Step 6 — derived maps (GDD 04 §4.2): top surface (columns), nav grid, shade samples, water (catchment, flood,
// puddles), moisture / litter / shelter / exposure / access, and nesting suitability of the played species.
// Re-run after steps 7-9 when any placer is registered there, and after repairs.

import type { GenContext } from '../kit/context';
import { rasterColumns } from './columns';
import { buildNav } from './nav';
import { buildShade } from './shade';
import { buildWater } from './water';
import { buildSurfaceMaps } from './surface';
import { computeSuitability, applyRivalFactor } from './suitability';
import { specialFactor } from './special';
import { setMapState, type MapState } from './state';

export function deriveMaps(ctx: GenContext): MapState {
  const col = rasterColumns(ctx);
  ctx.derived = col;
  const nav = buildNav(ctx, col);
  const shade = buildShade(ctx, col);
  const water = buildWater(ctx, nav);
  const surface = buildSurfaceMaps(ctx, nav, shade, water);
  const st: MapState = { col, nav, shade, water, surface, q: {} };
  setMapState(ctx, st);
  const sp = ctx.params.speciesId;
  const special = specialFactor(ctx, sp);
  computeSuitability(ctx, sp, () => 1, special);
  applyRivalFactor(ctx, special);
  return st;
}

export { computeSuitability, applyRivalFactor, suitabilityAt, moistFactor } from './suitability';
export { mapState, hasMapState } from './state';
export { CLS, walkable } from './nav';
