// Spatial markers placed by the player (directions §J, GDD 02 §12, GDD 05 rally modes, GDD 07 satellite).

import type { Vec3 } from '@/core/math/vec3';
import type { ChamberType, MarkerKind } from './ids';
import type { RallyMode } from './ids/ecology';
import type { PlanPriority } from './ids/nest';

/** Kind-specific parameters (D2.23); unused fields keep their neutral value (null / -1). */
export interface MarkerParams {
  /** rally: defend or attack (GDD 05). */
  mode: RallyMode | null;
  /** dig / entrance: priority of the plan it creates. */
  priority: PlanPriority | null;
  /** dig: chamber type to create. Additive to D2.23. */
  chamberType: ChamberType | null;
  /** dig / entrance: plan created from this marker, -1 none. Additive to D2.23. */
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
  /** move-brood / move-queen: destination chamber, -1 none. */
  targetChamberId: number;
  /** move-brood: source chamber, -1 any. */
  sourceChamberId: number;
  /** Tick it expires, -1 never. */
  expiresTick: number;
  params: MarkerParams;
  placedTick: number;
}
