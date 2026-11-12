/**
 * Render-side state kept per ant between frames (never written back to the sim): gait phase advanced by the
 * distance walked, smoothed up vector (walls, ceilings, edges), blended pose values, last rendered frame.
 */
import type { Vec3 } from '@/core/math/vec3';
import { advanceGait, newGaitState, type GaitState } from './gait';
import { NEUTRAL_POSE, POSE_FIELDS, type PoseTarget } from './poses';
import { GAIT, SMOOTH } from './tuning';
import type { AntSample } from './simAdapter';

export interface AntRenderState {
  id: number;
  gait: GaitState;
  pose: PoseTarget;
  up: Vec3;
  fwd: Vec3;
  lastPos: Vec3;
  /** Per-ant random 0..1 (antenna rhythm, groom side) and colour variation. */
  seed: number;
  tint: [number, number, number];
  /** update() stamp when last seen; states not seen for a frame are recycled. */
  seen: number;
  fresh: boolean;
  /** Cached variant index and the (species, caste, size class) it was resolved for. */
  vi: number; vSpecies: string; vCaste: string; vSize: string | null;
}

export class AntStateTable {
  private byId = new Map<number, AntRenderState>();
  private pool: AntRenderState[] = [];

  get size(): number { return this.byId.size; }

  get(id: number, stamp: number): AntRenderState {
    let s = this.byId.get(id);
    if (!s) {
      s = this.pool.pop() ?? {
        id, gait: newGaitState(), pose: { ...NEUTRAL_POSE }, up: { x: 0, y: 1, z: 0 }, fwd: { x: 0, y: 0, z: 1 }, lastPos: { x: 0, y: 0, z: 0 },
        seed: 0, tint: [1, 1, 1], seen: 0, fresh: true, vi: -1, vSpecies: '', vCaste: '', vSize: null,
      };
      s.id = id; s.fresh = true; s.vi = -1;
      const h = hash01(id);
      s.seed = h;
      s.gait.phase = hash01(id * 7 + 3); s.gait.share = 1; s.gait.yawPerCycle = 0;
      const v = (hash01(id * 13 + 5) - 0.5) * 2;
      s.tint[0] = 1 + v * 0.12; s.tint[1] = 1 + v * 0.11; s.tint[2] = 1 + v * 0.1;
      this.byId.set(id, s);
    }
    s.seen = stamp;
    return s;
  }

  peek(id: number): AntRenderState | undefined { return this.byId.get(id); }

  /** Recycles states of ants that were not seen in this update. */
  sweep(stamp: number): void {
    for (const [id, s] of this.byId) if (s.seen !== stamp) { this.byId.delete(id); this.pool.push(s); }
  }
}

/** Per-frame smoothing factors (computed once per frame instead of per ant). */
export interface SmoothFactors { up: number; pose: number }
export function smoothFactors(dt: number, out: SmoothFactors): SmoothFactors {
  out.up = 1 - Math.exp(-dt / SMOOTH.up); out.pose = 1 - Math.exp(-dt / SMOOTH.pose);
  return out;
}

/** Integer hash of an id to [0, 1). */
export function hash01(n: number): number {
  let h = Math.imul(n | 0, 0x9e3779b1);
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/**
 * Advances one ant's render state toward this frame's sample: smoothed up, re-orthogonalised forward, gait phase by
 * the forward displacement and heading change since the last frame, pose blended toward `target`.
 */
export function stepAntState(s: AntRenderState, a: AntSample, target: PoseTarget, strideMm: number, dt: number, k?: SmoothFactors): void {
  const L = a.lengthMm;
  const jump = Math.hypot(a.pos.x - s.lastPos.x, a.pos.y - s.lastPos.y, a.pos.z - s.lastPos.z);
  const snap = s.fresh || jump > GAIT.teleportBodyLengths * L;
  if (snap) {
    copy(a.up, s.up);
    for (const k of POSE_FIELDS) s.pose[k] = target[k];
  } else {
    const ku = k ? k.up : 1 - Math.exp(-dt / SMOOTH.up);
    s.up.x += (a.up.x - s.up.x) * ku; s.up.y += (a.up.y - s.up.y) * ku; s.up.z += (a.up.z - s.up.z) * ku;
    normalize(s.up, a.up);
    const kp = k ? k.pose : 1 - Math.exp(-dt / SMOOTH.pose);
    for (const k of POSE_FIELDS) s.pose[k] += (target[k] - s.pose[k]) * kp;
  }
  // forward: the sample's heading made tangent to the smoothed up
  const prevFwd = PREV; copy(s.fwd, prevFwd);
  const d = a.fwd.x * s.up.x + a.fwd.y * s.up.y + a.fwd.z * s.up.z;
  s.fwd.x = a.fwd.x - s.up.x * d; s.fwd.y = a.fwd.y - s.up.y * d; s.fwd.z = a.fwd.z - s.up.z * d;
  if (Math.hypot(s.fwd.x, s.fwd.y, s.fwd.z) < 1e-6) perpTo(s.up, s.fwd);
  normalize(s.fwd, s.up);
  if (!snap) {
    const dx = a.pos.x - s.lastPos.x, dy = a.pos.y - s.lastPos.y, dz = a.pos.z - s.lastPos.z;
    const fwdMm = dx * s.fwd.x + dy * s.fwd.y + dz * s.fwd.z;
    // signed heading change about up: atan2((prev x cur) . up, prev . cur)
    const cx = prevFwd.y * s.fwd.z - prevFwd.z * s.fwd.y, cy = prevFwd.z * s.fwd.x - prevFwd.x * s.fwd.z, cz = prevFwd.x * s.fwd.y - prevFwd.y * s.fwd.x;
    const yaw = Math.atan2(cx * s.up.x + cy * s.up.y + cz * s.up.z, prevFwd.x * s.fwd.x + prevFwd.y * s.fwd.y + prevFwd.z * s.fwd.z);
    advanceGait(s.gait, fwdMm, yaw, strideMm, GAIT.turnLever * L);
  }
  copy(a.pos, s.lastPos);
  s.fresh = false;
}

function copy(a: Vec3, out: Vec3): void { out.x = a.x; out.y = a.y; out.z = a.z; }
function normalize(v: Vec3, fallback: Vec3): void {
  const l = Math.hypot(v.x, v.y, v.z);
  if (l < 1e-6) { v.x = fallback.x; v.y = fallback.y; v.z = fallback.z; return; }
  v.x /= l; v.y /= l; v.z /= l;
}
function perpTo(u: Vec3, out: Vec3): void {
  if (Math.abs(u.y) < 0.9) { out.x = -u.z; out.y = 0; out.z = u.x; } else { out.x = 0; out.y = u.z; out.z = -u.y; }
}
const PREV: Vec3 = { x: 0, y: 0, z: 1 };

/**
 * Cheap path for an off-screen ant: keep position and frame current (no smoothing, no gait), so it neither
 * teleport-snaps nor lags when it comes back into view. The phase just continues from where it was.
 */
export function trackOffscreen(s: AntRenderState, a: AntSample): void {
  copy(a.pos, s.lastPos); copy(a.up, s.up); copy(a.fwd, s.fwd);
  s.fresh = false;
}
