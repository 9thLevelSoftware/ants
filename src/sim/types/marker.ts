// Spatial markers placed by the player (directions §J, GDD 02 §12, GDD 05 rally modes, GDD 07 satellite).

import type { Vec3 } from '@/core/math/vec3';
import type { ChamberType, MarkerKind } from './ids';
import type { RallyMode } from './ids/ecology';

/** Kind-specific parameters; unused fields keep their neutral value (-1 / null). */
export interface MarkerParams {
  /** rally: defend or attack. */
  mode: RallyMode | null;
  /** dig: chamber type to create. */
  chamberType: ChamberType | null;
  /** move-brood / move-queen: destination chamber, -1 none. */
  targetChamberId: number;
  /** move-brood: source chamber, -1 any. */
  sourceChamberId: number;
  /** dig / entrance: plan created from this marker, -1 none. */
  planId: number;
}

export interface Marker {
  id: number;
  alive: boolean;
  kind: MarkerKind;
  /** mm */
  pos: Vec3;
  /** mm */
  radius: number;
  colony: number;
  params: MarkerParams;
  placedTick: number;
  /** Tick it expires, -1 never. */
  expiresTick: number;
}
