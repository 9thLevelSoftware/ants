// The cell camera (look pass 6, item 1; constants.ts CELLCAM_*): the possession camera in a room barely larger than the ant. Pure maths, millimetres,
// Y up, no three. `CellCam` decides when it takes over (the rig's camera is squeezed against the ant, underground), which of the two views it
// shows and keeps its azimuth; `cellShotSubject` / `cellSideShotAt` are the two pictures:
//  - top: the founding shot (foundingShot.ts) over an ant on a floor: above and behind her, a horizontal slice through the open space at her back;
//  - side: for an ant on a steep wall or tunnel slope (a horizontal slice would cut her), a view from her side through a vertical section a little
//    in front of her, so the soil between the camera and her is cut away along her tunnel (the section the nest renderer already has).
import { clampN, DEG, wrapPi } from './frameMath';
import {
  CAM_FAR_BU, CELLCAM_BLEND_S, CELLCAM_CUT_ABOVE_BU, CELLCAM_FILL, CELLCAM_FOLLOW_DELAY_S, CELLCAM_FOLLOW_MAX_DEG_S, CELLCAM_FOLLOW_TAU_S, CELLCAM_OFF_L,
  CELLCAM_OFF_S, CELLCAM_ON_L, CELLCAM_ON_S, CELLCAM_RADIUS_L, CELLCAM_SIDE_ENTER_UP_Y, CELLCAM_SIDE_EXIT_UP_Y, CELLCAM_SIDE_FREE_FRACTION,
  CELLCAM_SIDE_OFFSET_L, CELLCAM_SIDE_PITCH_DEG, CELLCAM_TEXEL_BU, CELLCAM_TOP_HOLD_S, CELLCAM_SIDE_MIN_FREE_L, CELLCAM_PULL_DEG_S, FSHOT_FOV_DEG,
} from './constants';
import type { CutawayParams } from './colonyRig';
import type { FoundingShotSubject } from './foundingShot';
import { makePose, type CameraPose, type CameraTarget } from './types';
import type { FieldFn } from './sphereTrace';

/** Roof probe (as shotSubject.ts): the field is sampled down from over her back to her thorax in steps of ROOF_STEP_BU / 2 BU. */
const ROOF_STEP_BU = 0.1;
const ROOF_START_BU = 0.12;
/** The plane's column is open when the field there is above this (mm): the carve field's iso surface is not exact to a tenth of a millimetre. */
const ROOF_CLEAR_MM = 0.12;
/** Step of the free-room probe sideways, BU. */
const FREE_STEP_BU = 0.1;

export class CellCam {
  /** 0 = the rig's camera, 1 = the cell camera; eased over CELLCAM_BLEND_S. */
  weight = 0;
  /** 0 = the view from above, 1 = the side view; eased over CELLCAM_BLEND_S. */
  sideWeight = 0;
  /** Camera azimuth about +Y, from +Z toward +X (the founding shot's convention), radians. */
  azimuth = 0;
  private on = false;
  private side = false;
  private since = 0;
  private sinceOrbit = 99;
  private aimNow = false;
  private topFor = 0;
  private scanIn = 0;
  private aimed = 0;

  reset(): void { this.weight = 0; this.sideWeight = 0; this.on = false; this.side = false; this.since = 0; this.sinceOrbit = 99; this.aimNow = false; this.scanIn = 0; this.topFor = 0; }

  /** True while the cell camera is (or is becoming) the picture. */
  get active(): boolean { return this.on || this.weight > 0; }
  /** True while the side view is the one chosen (hysteresis on the ant's up). */
  get sideView(): boolean { return this.side; }

  /**
   * One frame. `distMm` is the rig's camera-to-thorax distance, `lengthMm` the body length; `candidate` is false outside the cases the cell camera
   * is for (above ground, airborne). `rigAzimuth` is the azimuth of the rig's camera round the ant, used when the cell camera takes over so the
   * view does not swing; `upY` is the ant's surface normal's height (1 on a floor). Returns the weight.
   */
  update(dt: number, distMm: number, lengthMm: number, candidate: boolean, rigAzimuth: number | null, upY: number, openAbove: boolean): number {
    const squeezed = candidate && distMm < CELLCAM_ON_L * lengthMm;
    const roomy = !candidate || distMm > CELLCAM_OFF_L * lengthMm;
    if (!this.on) {
      this.since = squeezed ? this.since + dt : 0;
      if (this.since >= CELLCAM_ON_S) {
        this.on = true; this.since = 0;
        this.side = upY < CELLCAM_SIDE_ENTER_UP_Y || !openAbove;
        this.sideWeight = this.side ? 1 : 0;
        this.topFor = 0;
        if (rigAzimuth !== null) this.azimuth = rigAzimuth;
        this.aimNow = true;
      }
    } else {
      this.since = roomy ? this.since + dt : 0;
      if (this.since >= CELLCAM_OFF_S) { this.on = false; this.since = 0; }
      // the view from above needs a floor under her and open air over her back; it comes back only after both have held a moment
      if (!this.side && (upY < CELLCAM_SIDE_ENTER_UP_Y || !openAbove)) this.side = true;
      else if (this.side) {
        this.topFor = upY > CELLCAM_SIDE_EXIT_UP_Y && openAbove ? this.topFor + dt : 0;
        if (this.topFor >= CELLCAM_TOP_HOLD_S) { this.side = false; this.topFor = 0; }
      }
    }
    const rate = dt / CELLCAM_BLEND_S;
    this.weight = clampN(this.weight + (this.on ? rate : -rate), 0, 1);
    this.sideWeight = clampN(this.sideWeight + (this.side ? rate : -rate), 0, 1);
    return this.weight;
  }

  /**
   * Orbit input (degrees to the right this frame) and the auto-follow: behind her heading while she walks in the view from above; in the side view
   * toward the open side of her room (the way the section can stand in free space, `openAzimuth`), found afresh a few times a second. The
   * first frame of a take-over aims at once (the cell camera is not on screen yet).
   */
  steer(dt: number, yawDeg: number, t: CameraTarget, walking: boolean, autoFollow: boolean, lengthMm: number, bu: number, field: FieldFn | undefined): void {
    if (yawDeg !== 0) { this.azimuth = wrapPi(this.azimuth - yawDeg * DEG); this.sinceOrbit = 0; this.aimNow = false; } else this.sinceOrbit += dt;
    const hx = t.fwd.x, hz = t.fwd.z;
    if (!this.side && yawDeg !== 0) return;
    if (this.side) {
      this.scanIn -= dt;
      if (this.scanIn <= 0 || this.aimNow) { this.scanIn = SIDE_SCAN_S; this.aimed = openAzimuth(t, lengthMm, bu, field, this.azimuth); }
      if (this.aimNow) { this.azimuth = this.aimed; this.aimNow = false; return; }
      // the camera never stands on the closed side of her room (a section there would cut through her): the player's orbit is turned away from it
      if (freeToward(t, lengthMm, bu, field, this.azimuth, CELLCAM_SIDE_MIN_FREE_L * lengthMm) < CELLCAM_SIDE_MIN_FREE_L * lengthMm) { this.pull(dt, this.aimed); return; }
      if (autoFollow && this.sinceOrbit >= CELLCAM_FOLLOW_DELAY_S) this.follow(dt, this.aimed);
      return;
    }
    if (this.aimNow) { this.aimNow = false; }
    if (!autoFollow || this.sinceOrbit < CELLCAM_FOLLOW_DELAY_S || !walking) return;
    if (hx * hx + hz * hz < 0.25) return; // climbing (or hanging): the heading has no horizontal side to stay behind
    this.follow(dt, Math.atan2(-hx, -hz));
  }

  /** A fast turn toward `target` (off a closed side), whatever the player is doing. */
  private pull(dt: number, target: number): void {
    const delta = wrapPi(target - this.azimuth), cap = CELLCAM_PULL_DEG_S * DEG * dt;
    this.azimuth = wrapPi(this.azimuth + clampN(delta, -cap, cap));
  }

  private follow(dt: number, target: number): void {
    const delta = wrapPi(target - this.azimuth), cap = CELLCAM_FOLLOW_MAX_DEG_S * DEG * dt;
    this.azimuth = wrapPi(this.azimuth + clampN(delta * (1 - Math.exp(-dt / CELLCAM_FOLLOW_TAU_S)), -cap, cap));
  }
}

/** Seconds between two looks for the open side of the room (side view). */
const SIDE_SCAN_S = 0.25;
const SCAN_DIRECTIONS = 12;

/** Free horizontal room from the ant's thorax toward `azimuth`, mm, up to `cap` (the carve field, in steps of FREE_STEP_BU). */
export function freeToward(t: CameraTarget, lengthMm: number, bu: number, field: FieldFn | undefined, azimuth: number, cap: number): number {
  if (!field) return cap;
  const L = lengthMm, cx = t.pos.x + t.up.x * 0.2 * L, cy = t.pos.y + t.up.y * 0.2 * L, cz = t.pos.z + t.up.z * 0.2 * L;
  const sa = Math.sin(azimuth), ca = Math.cos(azimuth);
  let free = 0;
  for (let x = FREE_STEP_BU * bu; x < cap; x += FREE_STEP_BU * bu) { if (field(cx + sa * x, cy, cz + ca * x) <= 0) break; free = x; }
  return free;
}

/**
 * The azimuth (from +Z toward +X) the side view looks from: of twelve directions round the ant, the one with the most free room from her thorax
 * horizontally (the section has to stand in open space between her and the camera), a little preferring the sides of her heading (her length then
 * lies along the section) and the direction the camera already has (no flicker between equals). Allocation-free.
 */
export function openAzimuth(t: CameraTarget, lengthMm: number, bu: number, field: FieldFn | undefined, current: number): number {
  const L = lengthMm;
  const hl = Math.hypot(t.fwd.x, t.fwd.z), headAz = hl > 0.2 ? Math.atan2(t.fwd.x, t.fwd.z) : null;
  let best = current, bestScore = -Infinity;
  for (let k = 0; k < SCAN_DIRECTIONS; k++) {
    const az = (k / SCAN_DIRECTIONS) * 2 * Math.PI;
    const free = freeToward(t, L, bu, field, az, 2.5 * L);
    const score = free + (headAz === null ? 0 : 0.4 * L * Math.abs(Math.sin(az - headAz))) + 0.3 * L * Math.cos(az - current);
    if (score > bestScore) { bestScore = score; best = az; }
  }
  return wrapPi(best);
}

/** Azimuth (from +Z toward +X, about +Y) of the horizontal direction from `from` to `to`, or null when they are nearly above each other. */
export function azimuthBetween(from: { x: number; z: number }, to: { x: number; z: number }, minMm: number): number | null {
  const dx = to.x - from.x, dz = to.z - from.z;
  return dx * dx + dz * dz < minMm * minMm ? null : Math.atan2(dx, dz);
}

/**
 * The cell camera's subject: a sphere round the ant's thorax and the slice height. The plane passes a little above the ant's highest point and
 * is held under the roof of the cell over her (the carve field sampled upward from her thorax), so the cut face has the cell as a hole in it.
 * Allocation-free.
 */
export function cellShotSubject(out: FoundingShotSubject, t: CameraTarget, lengthMm: number, bu: number, field: FieldFn | undefined): FoundingShotSubject {
  const L = lengthMm;
  // highest point of the body: half the length along the heading, half the width across it, the height of the body above a floor
  const sx = t.fwd.y * t.up.z - t.fwd.z * t.up.y, sy = t.fwd.z * t.up.x - t.fwd.x * t.up.z, sz = t.fwd.x * t.up.y - t.fwd.y * t.up.x;
  const side = Math.hypot(sx, sy, sz) || 1;
  const top = t.pos.y + L * (0.5 * Math.abs(t.fwd.y) + 0.15 * Math.abs(sy / side) + 0.3 * Math.max(t.up.y, 0) + 0.1 * (1 - Math.abs(t.up.y)));
  const wanted = top + CELLCAM_CUT_ABOVE_BU * bu;
  // the air over the ant is probed from her thorax, not from her feet: on a steep wall her reference point touches the soil beside her
  const cx = t.pos.x + t.up.x * 0.2 * L, cy = t.pos.y + t.up.y * 0.2 * L, cz = t.pos.z + t.up.z * 0.2 * L;
  // the plane stands at the highest height, up to a little over her back, where the column through her thorax is open air: a roof lower than
  // her back (a tunnel barely higher than she is, on a slope) lowers the plane, and never above the roof (the cut face would then cover her)
  let plane = cy + ROOF_START_BU * bu;
  out.open = true;
  if (field) {
    out.open = false;
    // her head, tail and flanks, as seen from above: the plane must stand over open air at all of them, or the cut face would cover part of her
    const fx = t.fwd.x * 0.4 * L, fz = t.fwd.z * 0.4 * L, wx = sx / side * 0.18 * L, wz = sz / side * 0.18 * L;
    for (let h = wanted; h > cy; h -= ROOF_STEP_BU * 0.5 * bu) {
      if (field(cx, h, cz) > ROOF_CLEAR_MM && field(cx + fx, h, cz + fz) > ROOF_CLEAR_MM && field(cx - fx, h, cz - fz) > ROOF_CLEAR_MM
        && field(cx + wx, h, cz + wz) > ROOF_CLEAR_MM && field(cx - wx, h, cz - wz) > ROOF_CLEAR_MM) { plane = h; out.open = true; break; }
    }
  } else plane = wanted;
  out.x = cx; out.y = cy; out.z = cz;
  out.radius = CELLCAM_RADIUS_L * L;
  out.cutY = plane;
  out.lift = 0;
  out.fill = CELLCAM_FILL;
  return out;
}

export interface CellSideShot {
  pose: CameraPose;
  cutaway: CutawayParams;
  /** Distance camera to subject, mm (the depth-of-field focus). */
  distance: number;
}

export function makeCellSideShot(): CellSideShot {
  return {
    pose: makePose(),
    cutaway: { mode: 'slice', planeY: 0, radius: 0, center: { x: 0, z: 0 }, outsideDarken: 0.3, minPlaneY: -1e9, section: 'vertical', viewDir: { x: 0, z: 1 }, offset: 0 },
    distance: 0,
  };
}

/**
 * The side view of the subject from `azimuth` (a vertical section stands between the camera and her): the camera at CELLCAM_SIDE_PITCH_DEG over
 * the horizontal looks at her thorax, the section plane stands toward the camera from her by what her body reaches that way (half her length
 * when the camera is behind her, half her width when it is at her side) plus a margin, but no farther than CELLCAM_SIDE_FREE_FRACTION of the
 * open room that way (the carve field), so the plane passes through the open space and the cut face has her tunnel as a hole in it. Allocation-free.
 */
export function cellSideShotAt(out: CellSideShot, s: FoundingShotSubject, t: CameraTarget, lengthMm: number, azimuth: number, bu: number, field: FieldFn | undefined): CellSideShot {
  const r = Math.max(s.radius, 0.5 * bu), fov = FSHOT_FOV_DEG * DEG;
  const d = r / ((s.fill ?? CELLCAM_FILL) * Math.sin(fov / 2)), p = CELLCAM_SIDE_PITCH_DEG * DEG, cp = Math.cos(p);
  const sa = Math.sin(azimuth), ca = Math.cos(azimuth);
  const o = out.pose;
  o.pos.x = s.x + sa * cp * d; o.pos.y = s.y + Math.sin(p) * d; o.pos.z = s.z + ca * cp * d;
  o.look.x = s.x; o.look.y = s.y; o.look.z = s.z;
  o.up.x = 0; o.up.y = 1; o.up.z = 0;
  o.fov = FSHOT_FOV_DEG;
  o.near = Math.max(0.02 * d, 0.05 * bu);
  o.far = CAM_FAR_BU * bu;
  out.distance = d;
  const along = Math.abs(t.fwd.x * sa + t.fwd.z * ca);
  const reach = lengthMm * (0.5 * along + 0.15 * (1 - along));
  let offset = Math.max(reach + 0.1 * lengthMm, 0.5 * CELLCAM_SIDE_OFFSET_L * lengthMm);
  if (field) {
    let free = 0;
    for (let x = FREE_STEP_BU * bu; x < offset * 3; x += FREE_STEP_BU * bu) {
      if (field(s.x + sa * x, s.y, s.z + ca * x) <= 0) break;
      free = x;
    }
    offset = Math.min(offset, Math.max(free * CELLCAM_SIDE_FREE_FRACTION, 0.2 * lengthMm));
  }
  const c = out.cutaway, vd = c.viewDir!;
  c.mode = 'slice'; c.section = 'vertical';
  vd.x = -sa; vd.z = -ca;
  c.center.x = s.x; c.center.z = s.z; c.offset = offset;
  c.planeY = s.y;
  c.radius = d * cp * 1.4 + 4 * lengthMm;
  c.texelMm = CELLCAM_TEXEL_BU * bu;
  return out;
}
