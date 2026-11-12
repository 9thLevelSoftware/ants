// Possession camera environment state (GDD 01 6.3): 8 lateral rays in the ant's tangent plane decide open /
// chamber / tunnel / crevice; a candidate must persist CAM_STATE_HOLD_S before the state switches.
import { v3AddScaled, v3Cross, type Vec3 } from '@/core';
import {
  CAM_PROBE_CREVICE_HITS, CAM_PROBE_CREVICE_L, CAM_PROBE_LEN_L, CAM_PROBE_LIFT_L, CAM_PROBE_RAYS, CAM_PROBE_TUNNEL_HITS,
  CAM_PROBE_TUNNEL_L, CAM_STATE_HOLD_S,
} from './constants';
import type { PossessionCamState, TraceFn } from './types';

export interface ProbeResult {
  /** Rays that hit within CAM_PROBE_TUNNEL_L / CAM_PROBE_CREVICE_L body lengths. */
  hitsTunnel: number;
  hitsCrevice: number;
}

const _o = { x: 0, y: 0, z: 0 }, _side = { x: 0, y: 0, z: 0 }, _d = { x: 0, y: 0, z: 0 };

/** Casts the lateral rays from just above the target. lengthMm = body length in mm. */
export function probeSurroundings(trace: TraceFn, pos: Vec3, up: Vec3, fwd: Vec3, lengthMm: number): ProbeResult {
  v3AddScaled(_o, pos, up, CAM_PROBE_LIFT_L * lengthMm);
  v3Cross(_side, fwd, up);
  const max = CAM_PROBE_LEN_L * lengthMm;
  let hitsTunnel = 0, hitsCrevice = 0;
  for (let i = 0; i < CAM_PROBE_RAYS; i++) {
    const a = (i / CAM_PROBE_RAYS) * Math.PI * 2;
    const c = Math.cos(a), s = Math.sin(a);
    _d.x = fwd.x * c + _side.x * s; _d.y = fwd.y * c + _side.y * s; _d.z = fwd.z * c + _side.z * s;
    const t = trace(_o, _d, max, 0);
    if (t < CAM_PROBE_TUNNEL_L * lengthMm) hitsTunnel++;
    if (t < CAM_PROBE_CREVICE_L * lengthMm) hitsCrevice++;
  }
  return { hitsTunnel, hitsCrevice };
}

/** Candidate state from one probe (no hysteresis). */
export function classify(p: ProbeResult, underground: boolean, airborne: boolean, flying: boolean): PossessionCamState {
  if (flying) return 'flight';
  if (airborne) return 'falling';
  if (p.hitsCrevice >= CAM_PROBE_CREVICE_HITS) return 'crevice';
  if (p.hitsTunnel >= CAM_PROBE_TUNNEL_HITS) return 'tunnel';
  return underground ? 'chamber' : 'open';
}

/** Applies the hold time. Falling and flight switch at once (the ant really left the surface). */
export class StateHold {
  state: PossessionCamState = 'open';
  private candidate: PossessionCamState = 'open';
  private since = 0;

  reset(s: PossessionCamState): void {
    this.state = s;
    this.candidate = s;
    this.since = 0;
  }

  /** Returns true when the state changed this frame. */
  update(dt: number, candidate: PossessionCamState): boolean {
    if (candidate === this.state) { this.candidate = candidate; this.since = 0; return false; }
    if (candidate !== this.candidate) { this.candidate = candidate; this.since = 0; }
    this.since += dt;
    const immediate = candidate === 'falling' || candidate === 'flight' || this.state === 'falling' || this.state === 'flight';
    if (immediate || this.since >= CAM_STATE_HOLD_S) {
      this.state = candidate;
      this.since = 0;
      return true;
    }
    return false;
  }
}
