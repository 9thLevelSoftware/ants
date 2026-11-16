// Human-activity state beyond GDD 04 App. A's sketch (additive, owner: human-events). Plain data, saved with the
// game: parked cars, bait stations, mown anchors waiting to regrow, mowing progress per lawn, reactive counters.

import type { Vec3 } from '@/core/math/vec3';
import type { FoodVariant } from './ids/ecology';

/** A car parked by a `car` arrival (dynamic primitives: body + 4 tyres). */
export interface HumanParkedCar {
  /** Site id of the car park / driveway and bay index in it. */
  siteId: number;
  bay: number;
  /** Dynamic primitive ids (body first, then the tyres). */
  primIds: number[];
  /** Bay centre, mm, and heading (radians about +Y, 0 = +X). */
  pos: Vec3;
  yaw: number;
  arrivedTick: number;
}

/** A bait station placed by the reactive rule (GDD 04 §15.6; the gel source belongs to ecology). */
export interface HumanBait {
  /** Food source id of the gel (-1 once removed). */
  sourceId: number;
  /** Dynamic primitive id of the station body. */
  primId: number;
  pos: Vec3;
  placedTick: number;
  /** Tick the station is removed unless refreshed. */
  expiresTick: number;
  refreshes: number;
  /** Player-colony deliveries from the gel since placement or the last refresh. */
  visits: number;
}

/** A food source above the cut height removed by a mower; it comes back at `tick` (MOW_REGROW_GD). */
export interface HumanRegrow {
  tick: number;
  variant: FoodVariant;
  pos: Vec3;
  up: Vec3;
  objectId: number;
  plantId: number;
  anchorId: number;
}

export interface HumanExtraState {
  /** Next mowing stripe per lawn site ("mow:<siteId>"), and similar resumable progress. */
  progress: Record<string, number>;
  parked: HumanParkedCar[];
  baits: HumanBait[];
  regrow: HumanRegrow[];
  /** Day index of the last grass growth step (-1 = grass not initialised yet). */
  grassDay: number;
  /** Tick a bait station is due (reactive rule fired), -1 none; and where (null = busiest interior source). */
  baitDueTick: number;
  baitDuePatio: boolean;
  /** Day index the interiorVisits[0] counter belongs to. */
  visitDay: number;
  /** Consecutive GD with patio crumb exploitation (Harsh patio bait). */
  patioDays: number;
  patioVisitsToday: number;
  /** Day index on which the extra wipe was already added (-1 none). */
  extraWipeDay: number;
}
