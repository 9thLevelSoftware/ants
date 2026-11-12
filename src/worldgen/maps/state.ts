// Results of the derived-maps step kept beside the context (float versions of the byte maps), for the later
// steps: suitability of rival profiles, start pose, validation and repairs.

import type { GenContext } from '../kit/context';
import type { Columns } from './columns';
import type { NavDerived } from './nav';
import type { ShadeResult } from './shade';
import type { WaterResult } from './water';
import type { SurfaceResult } from './surface';

export interface MapState {
  col: Columns;
  nav: NavDerived;
  shade: ShadeResult;
  water: WaterResult;
  surface: SurfaceResult;
  /** Static Q per nav cell per species id (0..1). */
  q: Record<string, Float32Array>;
}

const states = new WeakMap<GenContext, MapState>();

export function setMapState(ctx: GenContext, s: MapState): void {
  states.set(ctx, s);
}

/** The derived maps of this context; throws before the maps step ran. */
export function mapState(ctx: GenContext): MapState {
  const s = states.get(ctx);
  if (!s) throw new Error('worldgen: derived maps are not built yet (step 6)');
  return s;
}

export function hasMapState(ctx: GenContext): boolean {
  return states.has(ctx);
}
