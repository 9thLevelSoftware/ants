// Built-in structures placer 'default/building-shell' (step 3): what the interior zone needs to exist physically
// (GDD 04 §5.7, §2.2): floor slab (-100..+150) with a tile finish, a solid garden-side wall with the back door
// (leaf over the sill with the under-door gap: the door-crack micro-connection), the back wall on the map edge,
// a ceiling at 2400 and the sealed rest of the house as one solid block. worldgen-interior replaces it by
// registering a placer with the same id (cavity walls, weep vents, furniture ...).

import { rngFloat } from '@/core/rng';
import { PrimFlag, type MaterialId } from '@/sim/types';
import type { GenContext } from '../kit/context';
import type { PlacerDef } from '../kit/registry';
import type { PrimSpec } from '../kit/template';
import { placeObject } from '../kit/template';
import { addMicro } from '../kit/records';
import { along, inward, inwardNormal } from '../layout/geom';
import type { Rect, Side } from '../layout/types';
import { LEVELS } from '../tuning/terrain';
import { MICRO } from '../tuning/pipeline';

export const SHELL = {
  /** Solid garden-side wall thickness (outer leaf + cavity + inner leaf), mm. */
  wallThick: 270,
  backWallThick: 100,
  height: 2400,
  ceilingThick: 30,
  finishThick: 10,
  doorHeight: 2000,
  doorThick: 45,
  /** Real gap under the door leaf, mm (GDD 04 §6.2 door-crack 3-10). */
  doorGap: [3, 10] as [number, number],
};

const WALL = PrimFlag.CLIMBABLE | PrimFlag.NAV_BLOCK;

/** World rect between inward distances d0..d1 and along coordinates a0..a1 of side s. */
function sideRect(s: Side, d0: number, d1: number, a0: number, a1: number, L: number): Rect {
  switch (s) {
    case 'x0': return { x0: d0, x1: d1, z0: a0, z1: a1 };
    case 'x1': return { x0: L - d1, x1: L - d0, z0: a0, z1: a1 };
    case 'z0': return { x0: a0, x1: a1, z0: d0, z1: d1 };
    default: return { x0: a0, x1: a1, z0: L - d1, z1: L - d0 };
  }
}

function box(r: Rect, y0: number, y1: number, ox: number, oz: number, material: MaterialId, flags: number): PrimSpec {
  return {
    shape: 'box', material, flags, round: 0,
    pos: { x: (r.x0 + r.x1) / 2 - ox, y: (y0 + y1) / 2, z: (r.z0 + r.z1) / 2 - oz },
    size: { x: (r.x1 - r.x0) / 2, y: (y1 - y0) / 2, z: (r.z1 - r.z0) / 2 },
  };
}

export function placeBuildingShell(ctx: GenContext): void {
  const house = ctx.layout.house;
  if (!house || !house.kitchen || !house.door) return;
  const L = ctx.dims.size, bu = ctx.dims.bu, s = house.side, S = SHELL;
  const rng = ctx.rng('wg/structures/building-shell');
  const k = house.kitchen;
  const D = inward(s, (house.strip.x0 + house.strip.x1) / 2, (house.strip.z0 + house.strip.z1) / 2, L) * 2;
  const a0 = along(s, k.x0, k.z0), a1 = along(s, k.x1, k.z1);
  const ka0 = Math.min(a0, a1), ka1 = Math.max(a0, a1);
  const door = house.door;
  const dA = along(s, door.x, door.z), half = door.width / 2;
  const ox = door.x, oz = door.z;
  const floorTop = LEVELS.floorTop, base = LEVELS.slabUnderside, top = S.height;
  const gapMin = Math.max(S.doorGap[0], MICRO.gapMinBu * bu);
  const gap = gapMin <= S.doorGap[1] ? gapMin + rngFloat(rng) * (S.doorGap[1] - gapMin) : S.doorGap[1];
  const doorTop = floorTop + gap + S.doorHeight;
  const wIn = D - S.wallThick;

  const floor: PrimSpec[] = [
    box(k, base, floorTop - S.finishThick, ox, oz, 'concrete', PrimFlag.CLIMBABLE),
    box(sideRect(s, S.backWallThick, wIn, ka0, ka1, L), floorTop - S.finishThick, floorTop, ox, oz, 'tile', PrimFlag.CLIMBABLE),
  ];
  placeObject(ctx, { id: 'floor-slab', prims: floor, tags: ['structure', 'building'] }, { x: ox, z: oz, y: 0, snap: false, category: 'structures', ground: true });
  const prims: PrimSpec[] = [
    box(sideRect(s, 0, S.backWallThick, ka0, ka1, L), base, top, ox, oz, 'plaster', WALL),
    box(sideRect(s, 0, D, ka0, ka1, L), top - S.ceilingThick, top, ox, oz, 'plaster', PrimFlag.CLIMBABLE | PrimFlag.SHELTER),
    box(sideRect(s, wIn, D, ka0, dA - half, L), base, top, ox, oz, 'brick', WALL),
    box(sideRect(s, wIn, D, dA + half, ka1, L), base, top, ox, oz, 'brick', WALL),
    box(sideRect(s, wIn, D, dA - half, dA + half, L), base, floorTop, ox, oz, 'stone', PrimFlag.CLIMBABLE), // sill
    box(sideRect(s, wIn, D, dA - half, dA + half, L), doorTop, top, ox, oz, 'brick', WALL), // lintel
    box(sideRect(s, D - S.wallThick / 2 - S.doorThick / 2, D - S.wallThick / 2 + S.doorThick / 2, dA - half, dA + half, L),
      floorTop + gap, doorTop, ox, oz, 'wood-sound', PrimFlag.CLIMBABLE), // door leaf
  ];
  placeObject(ctx, { id: 'house-shell', prims, tags: ['structure', 'building'] }, { x: ox, z: oz, y: 0, snap: false, category: 'structures' });
  for (const r of house.sealed) {
    placeObject(ctx, { id: 'sealed-house', prims: [box(r, base, top, (r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2, 'brick', WALL)], tags: ['structure', 'building'] },
      { x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2, y: 0, snap: false, category: 'structures' });
  }
  const n = inwardNormal(s); // points into the map, i.e. out of the house into the garden
  // mouths one terrain cell beyond each wall face: the zone raster puts the face within half a cell of its true
  // position, and a mouth closer than that can land on the wrong side of it
  const off = Math.max(2 * bu, ctx.dims.cell);
  if (gap >= MICRO.gapMinBu * bu) {
    addMicro(ctx, {
      kind: 'door-crack',
      posA: { x: door.x + n.x * off, y: floorTop, z: door.z + n.z * off },
      posB: { x: door.x - n.x * (S.wallThick + off), y: floorTop, z: door.z - n.z * (S.wallThick + off) },
      gapMm: gap, minClearanceBu: gap / bu, lengthBu: (S.wallThick + 2 * off) / bu, useful: true, reason: 'interior access',
    });
  }
}

export const shellPlacer: PlacerDef = { id: 'default/building-shell', step: 'structures', order: -100, run: placeBuildingShell };
