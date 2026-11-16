// What a creature geometry builder returns: an opaque body and optional transparent wing membranes, both in the
// body frame of geometry/builder.ts and both animated by the same per-instance data.
import type { CreatureBuilder, Detail } from './builder';

export interface Built {
  body: CreatureBuilder;
  /** Clear wing membranes (drawn blended, after the bodies). */
  wings?: CreatureBuilder;
}

export type BuildFn = (d: Detail) => Built;

/** Row helper for body profiles: [u, half width, half height, centre y]. */
export const row = (u: number, a: number, b: number, y: number): number[] => [u, a, b, y];
