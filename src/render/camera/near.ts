// Near-plane management (GDD 01 6.1): near = clamp(0.02 x distance, 0.005 BU, 0.2 BU), and at most a fraction of
// the camera sphere radius so the near-plane corners stay inside the clearance the collision guarantees.
import { CAM_NEAR_K, CAM_NEAR_MAX_BU, CAM_NEAR_MIN_BU, CAM_NEAR_RADIUS_FRACTION } from './constants';

export function cameraNear(distanceMm: number, bu: number, radiusMm: number): number {
  const n = Math.min(Math.max(CAM_NEAR_K * distanceMm, CAM_NEAR_MIN_BU * bu), CAM_NEAR_MAX_BU * bu);
  return Math.max(CAM_NEAR_MIN_BU * bu, Math.min(n, CAM_NEAR_RADIUS_FRACTION * radiusMm));
}
