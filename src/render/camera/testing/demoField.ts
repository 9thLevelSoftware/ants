// A small analytic world for camera tests and the app-shell demo (mm, Y up, f > 0 in free space):
// a ground plane, a block wall the target climbs over, a long block with a narrow corridor through it, and a few
// boulders. Also a scripted target path along floor -> wall -> top -> back wall -> floor -> corridor -> floor.
import { sdRoundBox, sdSphere, v3Normalize, vec3, type Vec3 } from '@/core';
import type { CameraTarget } from '../types';

export const DEMO_BU = 4; // mm per BU (Lasius worker)
export const FOOT = 0.5; // mm: target height above the surface

export const WALL = { x0: 100, x1: 120, h: 40, z: 60 };
export const BLOCK = { x0: 160, x1: 260, h: 30, z: 40 };
export const CHANNEL = { halfW: 4, h: 8 }; // the corridor: 8 mm wide, 8 mm high (2 BU, the nest tunnel size)
export const BOULDERS: { c: Vec3; r: number }[] = [
  { c: vec3(30, -6, -45), r: 18 },
  { c: vec3(60, -10, 55), r: 22 },
  { c: vec3(300, -4, -40), r: 14 },
  { c: vec3(-20, -8, 30), r: 15 },
];

const _p = vec3();
const box = (x: number, y: number, z: number, cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, r = 0): number => {
  _p.x = x - cx; _p.y = y - cy; _p.z = z - cz;
  return sdRoundBox(_p, { x: hx, y: hy, z: hz }, r);
};

/** Free-space field (positive in air). */
export function demoField(x: number, y: number, z: number): number {
  let solid = y; // ground: solid below y = 0 (distance positive above)
  solid = Math.min(solid, box(x, y, z, (WALL.x0 + WALL.x1) / 2, WALL.h / 2, 0, (WALL.x1 - WALL.x0) / 2, WALL.h / 2, WALL.z));
  const blockD = box(x, y, z, (BLOCK.x0 + BLOCK.x1) / 2, BLOCK.h / 2, 0, (BLOCK.x1 - BLOCK.x0) / 2, BLOCK.h / 2, BLOCK.z);
  const channelD = box(x, y, z, (BLOCK.x0 + BLOCK.x1) / 2, CHANNEL.h / 2 - 1, 0, (BLOCK.x1 - BLOCK.x0) / 2 + 2, CHANNEL.h / 2 + 1, CHANNEL.halfW);
  solid = Math.min(solid, Math.max(blockD, -channelD));
  for (const b of BOULDERS) { _p.x = x - b.c.x; _p.y = y - b.c.y; _p.z = z - b.c.z; solid = Math.min(solid, sdSphere(_p, b.r)); }
  return solid;
}

/** Surface height under (x, z) for the observer/colony rigs (top of solids). */
export function demoGroundHeight(x: number, z: number): number {
  if (x >= WALL.x0 && x <= WALL.x1 && Math.abs(z) <= WALL.z) return WALL.h;
  if (x >= BLOCK.x0 && x <= BLOCK.x1 && Math.abs(z) <= BLOCK.z) return BLOCK.h;
  return 0;
}

// --- scripted path: a list of legs in the x-y plane (z = 0); edges are short arcs so the up vector turns smoothly
interface Leg { len: number; at(s: number, out: CameraTarget): void }

const C = 2.5; // concave edge radius (mm)

function straight(ax: number, ay: number, bx: number, by: number, ux: number, uy: number): Leg {
  const len = Math.hypot(bx - ax, by - ay);
  const fx = (bx - ax) / len, fy = (by - ay) / len;
  return { len, at(s, o) { o.pos.x = ax + fx * s + ux * FOOT; o.pos.y = ay + fy * s + uy * FOOT; o.pos.z = 0; o.up.x = ux; o.up.y = uy; o.up.z = 0; o.fwd.x = fx; o.fwd.y = fy; o.fwd.z = 0; } };
}

/** Arc around centre (cx, cy) with radius r, up rotating from angle a0 to a1 (up = (cos a, sin a)). Concave arcs use up pointing to the centre. */
function arc(cx: number, cy: number, r: number, a0: number, a1: number, concave: boolean): Leg {
  const len = Math.max(0.5, Math.abs(a1 - a0) * Math.max(r, FOOT));
  return {
    len,
    at(s, o) {
      const a = a0 + ((a1 - a0) * s) / len;
      const ux = Math.cos(a), uy = Math.sin(a);
      // position: on the arc; up points out of the solid (towards the centre for concave edges)
      const px = concave ? cx - ux * (r - FOOT) : cx + ux * (r + FOOT);
      const py = concave ? cy - uy * (r - FOOT) : cy + uy * (r + FOOT);
      o.pos.x = px; o.pos.y = py; o.pos.z = 0;
      o.up.x = ux; o.up.y = uy; o.up.z = 0;
      // forward = travel direction = derivative of the position
      const sign = Math.sign(a1 - a0) * (concave ? 1 : -1);
      o.fwd.x = -uy * -sign; o.fwd.y = ux * -sign; o.fwd.z = 0;
    },
  };
}

const D = Math.PI / 2;
const LEGS: Leg[] = [
  straight(-60, 0, WALL.x0 - C, 0, 0, 1),
  arc(WALL.x0 - C, C, C, D, Math.PI, true), // floor -> wall face (up +Y -> -X)
  straight(WALL.x0, C, WALL.x0, WALL.h, -1, 0),
  arc(WALL.x0, WALL.h, 0, Math.PI, D, false), // over the top edge (up -X -> +Y)
  straight(WALL.x0, WALL.h, WALL.x1, WALL.h, 0, 1),
  arc(WALL.x1, WALL.h, 0, D, 0, false), // top -> back face (up +Y -> +X)
  straight(WALL.x1, WALL.h, WALL.x1, C, 1, 0),
  arc(WALL.x1 + C, C, C, 0, D, true), // back face -> floor (up +X -> +Y)
  straight(WALL.x1 + C, 0, 340, 0, 0, 1), // floor, through the corridor (x 160..260) and out
];

export const DEMO_PATH_LENGTH = LEGS.reduce((s, l) => s + l.len, 0);
/** Target walking speed along the path (mm/s): 6 BU/s, the Lasius player cruise. */
export const DEMO_SPEED = 6 * DEMO_BU;
export const DEMO_PATH_DURATION = DEMO_PATH_LENGTH / DEMO_SPEED;

/** Target pose at time t (s); loops. */
export function demoPathAt(t: number, out: CameraTarget): CameraTarget {
  let s = ((t * DEMO_SPEED) % DEMO_PATH_LENGTH + DEMO_PATH_LENGTH) % DEMO_PATH_LENGTH;
  for (const leg of LEGS) {
    if (s <= leg.len) { leg.at(s, out); break; }
    s -= leg.len;
  }
  v3Normalize(out.fwd, out.fwd);
  return out;
}

/** Path times of interesting places (s), for screenshots and tests. */
export function demoTimeAtX(x: number): number {
  // first leg only (floor before the wall) or the last leg (after the wall)
  let s = 0;
  for (let i = 0; i < LEGS.length - 1; i++) s += LEGS[i].len;
  if (x < WALL.x0) return (x + 60) / DEMO_SPEED;
  return (s + (x - (WALL.x1 + C))) / DEMO_SPEED;
}

/** Time when the target is halfway up the wall face. */
export function demoTimeOnWall(): number {
  return (LEGS[0].len + LEGS[1].len + LEGS[2].len * 0.5) / DEMO_SPEED;
}

export function makeTargetObj(): CameraTarget {
  return { pos: vec3(), up: vec3(0, 1, 0), fwd: vec3(1, 0, 0) };
}
