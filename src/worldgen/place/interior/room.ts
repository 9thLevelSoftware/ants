// The building's coordinate frame from the zone layout (GDD 04 §1.4): the house strip along one map side, the
// garden face of the house wall at inward distance D, the cavity wall of thickness T, the kitchen slice and the
// room inside its plaster end walls. Coordinates: u along the house edge, r from the exterior wall's inner face
// into the room (r < 0 inside the wall, r < -T in the garden), y world height.

import { rngRange, type RngState } from '@/core/rng';
import type { GenContext, HouseLayout, Side } from '../../kit';
import { along, fromSide, inward, inwardNormal } from '../../layout/geom';
import { LEVELS } from '../../tuning/terrain';
import { HOUSE_WALL, INTERIOR_WALL } from '../../catalog/interior/dims';
import { WallFrame, type Axis2 } from '../../catalog/interior/frame';

export interface Room {
  side: Side;
  /** Map side length, strip depth (map edge to garden face), wall thickness, clear cavity, mm. */
  L: number; D: number; T: number; cavity: number;
  bu: number;
  /** Exterior wall frame: a = u, n = r. */
  ext: WallFrame;
  /** Unit axes of +u and +r in world (x, z). */
  eu: Axis2; er: Axis2;
  /** Kitchen slice along u (null: only a sealed façade), and the room inside the end walls. */
  slice: { k0: number; k1: number } | null;
  u0: number; u1: number;
  /** Room depth from the exterior wall's inner face to the back wall's face, mm. */
  depth: number;
  /** Door centre along u (on the garden face), or NaN. */
  doorU: number;
  /** Interior floor top, world mm. */
  floorY: number;
}

/**
 * Cavity width in [50, 75] mm, avoiding widths whose cavity would contain every 4 BU sample of a nav cell (an
 * isolated walkable strip of cavity floor in the nav grid; only possible when 3 sample steps < 75 mm, i.e. Lasius).
 */
function chooseCavity(ctx: GenContext, side: Side, D: number, rng: RngState): number {
  const [lo, hi] = HOUSE_WALL.cavity;
  const c0 = rngRange(rng, lo, hi);
  const s = ctx.dims.cell, L = ctx.dims.size;
  const bad = (c: number): boolean => {
    const d0 = D - HOUSE_WALL.outerLeaf - c, d1 = D - HOUSE_WALL.outerLeaf;
    const flip = side === 'x1' || side === 'z1';
    const w0 = flip ? L - d1 : d0, w1 = flip ? L - d0 : d1;
    const i = Math.ceil((w0 / s - 0.5) / 4);
    return (4 * i + 0.5) * s >= w0 && (4 * i + 3.5) * s <= w1;
  };
  if (!bad(c0)) return c0;
  for (let k = 1; k <= 2 * (hi - lo); k++) {
    const down = c0 - k / 2, up = c0 + k / 2;
    if (down >= lo && !bad(down)) return down;
    if (up <= hi && !bad(up)) return up;
  }
  return c0;
}

export function makeRoom(ctx: GenContext, house: HouseLayout, rng: RngState): Room {
  const L = ctx.dims.size, s = house.side;
  const D = inward(s, (house.strip.x0 + house.strip.x1) / 2, (house.strip.z0 + house.strip.z1) / 2, L) * 2;
  const cavity = chooseCavity(ctx, s, D, rng);
  const T = HOUSE_WALL.outerLeaf + cavity + HOUSE_WALL.innerLeaf;
  const n = inwardNormal(s);
  const er = { x: -n.x, z: -n.z };
  const eu = s[0] === 'x' ? { x: 0, z: 1 } : { x: 1, z: 0 };
  const o = fromSide(s, D - T, 0, L);
  const ext = new WallFrame(o.x, o.z, eu, er);
  let slice: Room['slice'] = null;
  let u0 = 0, u1 = 0;
  if (house.kitchen) {
    const a = along(s, house.kitchen.x0, house.kitchen.z0), b = along(s, house.kitchen.x1, house.kitchen.z1);
    slice = { k0: Math.min(a, b), k1: Math.max(a, b) };
    u0 = slice.k0 + INTERIOR_WALL.thick;
    u1 = slice.k1 - INTERIOR_WALL.thick;
  }
  const doorU = house.door ? along(s, house.door.x, house.door.z) : NaN;
  return {
    side: s, L, D, T, cavity, bu: ctx.dims.bu, ext, eu, er, slice, u0, u1,
    depth: D - T - INTERIOR_WALL.thick, doorU, floorY: LEVELS.floorTop,
  };
}
