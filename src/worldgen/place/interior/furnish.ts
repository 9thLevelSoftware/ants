// Free-standing furniture in the kitchen (GDD 04 §5.7): table >= 700 from the counters with 2-4 chairs, the
// inner doormat, pet bowls against a wall within 1500 of the door, the pedal bin at the run end or by the door,
// a houseplant on the window board or the floor, and counter items. Positions vary with the seed; every object
// is placed with the collision test, so nothing interpenetrates.

import { rngChance, rngFork, rngInt, rngRange, type RngState } from '@/core/rng';
import type { Vec3 } from '@/core/math/vec3';
import { HOST_FLAGS } from '@/sim/types';
import { addPlant, addWaterBody, dcos, drad, dsin, placeObject, removeObject, type GenContext, type ObjectTemplate } from '../../kit';
import { interiorHumanAreas } from './lanes';
import {
  bowlPairTemplate, breadBoardTemplate, chairTemplate, doormatTemplate, fruitBowlTemplate, houseplantTemplate,
  pedalBinTemplate, sugarBowlTemplate, tableTemplate,
} from '../../catalog/interior/furniture';
import {
  BACK_DOOR, BREAD_BOARD, CHAIR, COUNTER, DOORMAT_INSIDE, FRUIT_BOWL, FURNISH, GLAZING, HOUSEPLANT, PEDAL_BIN, PET_BOWL, SUGAR_BOWL, TABLE,
} from '../../catalog/interior/dims';
import type { KitchenPlan } from './plan';
import type { Room } from './room';
import type { RunInfo } from './runPlace';
import { penetratesWorld, routesFree } from './solid';

type Rect = { x0: number; x1: number; z0: number; z1: number };

const rectDist = (a: Rect, b: Rect): number => {
  const dx = Math.max(0, a.x0 - b.x1, b.x0 - a.x1), dz = Math.max(0, a.z0 - b.z1, b.z0 - a.z1);
  return Math.sqrt(dx * dx + dz * dz);
};

/** World yaw that turns local +z to the axis-aligned world direction d. */
export function yawTo(d: { x: number; z: number }): number {
  if (d.z > 0.5) return 0;
  if (d.z < -0.5) return Math.PI;
  return d.x > 0 ? Math.PI / 2 : -Math.PI / 2;
}

/** Local (x, z) rotated by yaw into world offsets. */
function rot(x: number, z: number, yaw: number): { x: number; z: number } {
  const c = dcos(yaw), s = dsin(yaw);
  return { x: x * c + z * s, z: -x * s + z * c };
}

export interface FurnitureInfo {
  tableId: number;
  bowlsId: number;
  binId: number;
  /** World rects of floor-standing furniture (lanes, skirting). */
  footprints: Rect[];
}

interface WallSpot { x: number; z: number; N: { x: number; z: number }; doorDist: number; runSide: number }

/**
 * Spots `off` in front of every wall face of the room, FURNISH.wallSpotSpacing apart, at least `half` from the wall ends and never in
 * front of the door; with the distance to the door's inner face and whether the spot is on the run's side of it.
 */
function wallSpots(room: Room, plan: KitchenPlan, off: number, half: number): WallSpot[] {
  const f = room.ext, out: WallSpot[] = [];
  const door = f.p(plan.door.u, 0, 0), jamb = BACK_DOOR.leafWidth / 2 + BACK_DOOR.jambWidth;
  const neg = (a: { x: number; z: number }) => ({ x: -a.x, z: -a.z });
  const add = (u: number, r: number, N: { x: number; z: number }) => {
    const p = f.p(u, 0, r);
    const runSide = Math.sign(u - plan.door.u) === -Math.sign(plan.sigma) ? 1 : 0;
    out.push({ x: p.x, z: p.z, N, doorDist: Math.sqrt((p.x - door.x) ** 2 + (p.z - door.z) ** 2), runSide });
  };
  for (let u = room.u0 + half; u <= room.u1 - half; u += FURNISH.wallSpotSpacing) {
    if (Math.abs(u - plan.door.u) >= jamb + half) add(u, off, room.er);
    add(u, room.depth - off, neg(room.er));
  }
  for (let r = half; r <= room.depth - half; r += FURNISH.wallSpotSpacing) {
    add(room.u0 + off, r, room.eu);
    add(room.u1 - off, r, neg(room.eu));
  }
  return out;
}

/** The local x side (+1 / -1) whose point `dist` from the spot lies deeper inside the room. */
function roomSide(room: Rect, p: { x: number; z: number }, xDir: { x: number; z: number }, dist: number): 1 | -1 {
  const depth = (s: number) => {
    const x = p.x + s * xDir.x * dist, z = p.z + s * xDir.z * dist;
    return Math.min(x - room.x0, room.x1 - x, z - room.z0, room.z1 - z);
  };
  return depth(1) > depth(-1) ? 1 : -1;
}

/** Keeps a just-placed object only if every human node of the kitchen still has a walking lane from the door. */
function keep(ctx: GenContext, id: number): number {
  if (id < 0) return id;
  const a = interiorHumanAreas(ctx.world);
  if (a && a.unreachable.length === 0) return id;
  removeObject(ctx, id);
  return -1;
}

/**
 * Places with the kit's collision test, then rejects the object if the dense overlap test finds a penetration or
 * one of its climb routes runs through a solid (a wall or a neighbour).
 */
function place(ctx: GenContext, t: ObjectTemplate, x: number, z: number, y: number, yaw: number, cat: 'structures' | 'plants' = 'structures'): number {
  const id = placeObject(ctx, t, { x, z, y, yaw, snap: false, collide: true, category: cat });
  if (id < 0 || (!penetratesWorld(ctx, id) && routesFree(ctx, id))) return id;
  removeObject(ctx, id);
  return -1;
}

/** Footprint (world AABB) of a local rect after yaw. */
function footprint(cx: number, cz: number, hx: number, hz: number, yaw: number): Rect {
  const c = Math.abs(dcos(yaw)), s = Math.abs(dsin(yaw));
  const ex = hx * c + hz * s, ez = hx * s + hz * c;
  return { x0: cx - ex, x1: cx + ex, z0: cz - ez, z1: cz + ez };
}

export function placeFurniture(ctx: GenContext, room: Room, plan: KitchenPlan, runs: RunInfo, rng: RngState, foot: number): FurnitureInfo {
  const fy = room.floorY, f = room.ext;
  const info: FurnitureInfo = { tableId: -1, bowlsId: -1, binId: -1, footprints: [] };
  const roomRect = f.rect(room.u0, room.u1, 0, room.depth);
  const door = f.p(plan.door.u, fy, 0);
  const doorRect: Rect = { x0: door.x, x1: door.x, z0: door.z, z1: door.z };
  // doormat inside the door
  const [, , md] = DOORMAT_INSIDE.size;
  const mat = f.p(plan.door.u, fy, DOORMAT_INSIDE.doorGap + md / 2);
  place(ctx, doormatTemplate(), mat.x, mat.z, fy, yawTo(room.er));
  // pet bowls (kitchen-door p 0.8, elsewhere 0.5) against a wall within 1500 of the door, the far side from the
  // run first; local -z (where the bowl climb routes start) faces the room
  const bowlP = ctx.params.archetype === 'kitchen-door' ? PET_BOWL.pKitchenDoor : PET_BOWL.pOther;
  if (rngChance(rng, bowlP)) {
    const bp = bowlPairTemplate(rng, foot);
    const mw = Math.max(PET_BOWL.mat[0], 2 * (bp.water.radius + 60)), hd = PET_BOWL.mat[2] / 2;
    const spots = wallSpots(room, plan, 45 + hd, mw / 2 + 60)
      .filter((p) => p.doorDist + mw / 2 <= PET_BOWL.doorMax)
      .sort((p, q) => (p.runSide - q.runSide) || (p.doorDist - q.doorDist));
    for (const p of spots) {
      const yaw = yawTo({ x: -p.N.x, z: -p.N.z });
      const id = keep(ctx, place(ctx, bp.template, p.x, p.z, fy, yaw));
      if (id < 0) continue;
      info.bowlsId = id;
      info.footprints.push(footprint(p.x, p.z, mw / 2, hd, yaw));
      // the template's water centre is local; rotate it like the object
      const off = rot(bp.water.x, bp.water.z, yaw);
      addWaterBody(ctx, { kind: 'bowl-water', vesselObjectId: id, pos: { x: p.x + off.x, y: fy + PET_BOWL.mat[1] + PET_BOWL.wall, z: p.z + off.z }, radius: bp.water.radius, levelMm: bp.water.levelMm, capMm: bp.water.capMm });
      break;
    }
  }
  // pedal bin: against a wall, nearest the run's door-side end (GDD "run end or by the door")
  // one bin (material, seam) for both route sides; the side facing the room is chosen per spot
  const binSeed = rngInt(rng, 0, 0x7fffffff);
  const binT = (side: 1 | -1) => pedalBinTemplate(rngFork(binSeed, 'pedal-bin'), foot, side);
  const R = PEDAL_BIN.diam / 2 + 10;
  const runEndU = plan.uc + plan.sigma * Math.max(...plan.main.slots.map((s) => s.a1));
  const runEnd = f.p(runEndU, fy, 0);
  const binSpots = wallSpots(room, plan, R + 40, R + 20)
    .map((p) => ({ p, d: (p.x - runEnd.x) ** 2 + (p.z - runEnd.z) ** 2 }))
    .sort((a, b) => a.d - b.d);
  for (const { p } of binSpots) {
    const yaw = yawTo(p.N), side = roomSide(roomRect, p, rot(1, 0, yaw), R + PEDAL_BIN.routeBase);
    const id = keep(ctx, place(ctx, binT(side), p.x, p.z, fy, yaw));
    if (id >= 0) { info.binId = id; info.footprints.push(footprint(p.x, p.z, R, R, 0)); break; }
  }
  if (info.binId < 0) ctx.notes.push('interior: no room for the pedal bin');
  // table: long axis along u, >= 700 from runs and appliances, >= 600 from walls, >= 1000 from the door
  const [tw, , td] = TABLE.top;
  const baseYaw = yawTo(room.er); // local +z into the room, local x (the long side) along u
  for (let tries = 0; tries < TABLE.placeTries && info.tableId < 0; tries++) {
    const yaw = baseYaw + drad(rngRange(rng, -TABLE.yawJitterDeg, TABLE.yawJitterDeg)) + (rngChance(rng, 0.5) ? Math.PI : 0);
    const u = rngRange(rng, room.u0, room.u1), r = rngRange(rng, 0, room.depth);
    const c = f.p(u, fy, r);
    const fp = footprint(c.x, c.z, tw / 2, td / 2, yaw);
    const inner = Math.min(fp.x0 - roomRect.x0, roomRect.x1 - fp.x1, fp.z0 - roomRect.z0, roomRect.z1 - fp.z1);
    if (inner < TABLE.wallMin || rectDist(fp, doorRect) < TABLE.doorMin) continue;
    if (runs.footprints.some((q) => rectDist(fp, q) < TABLE.counterMin)) continue;
    const id = keep(ctx, place(ctx, tableTemplate(foot), c.x, c.z, fy, yaw));
    if (id < 0) continue;
    const chairs = placeChairs(ctx, rng, c, yaw, foot, fy);
    if (chairs.length < CHAIR.count[0]) {
      for (const ch of chairs) removeObject(ctx, ch.id);
      removeObject(ctx, id);
      continue;
    }
    info.tableId = id;
    info.footprints.push(fp, ...chairs.map((ch) => ch.fp));
  }
  if (info.tableId < 0) ctx.notes.push('interior: no room for the kitchen table');
  placePlant(ctx, room, plan, rng, foot, info);
  placeCounterItems(ctx, runs, rng, foot);
  return info;
}

/** Chairs around the table, each kept only if every human node still has a lane. */
function placeChairs(ctx: GenContext, rng: RngState, c: Vec3, yaw: number, foot: number, fy: number): { id: number; fp: Rect }[] {
  const [tw, , td] = TABLE.top, hs = CHAIR.seat[2] / 2;
  // seat centre: its front edge sits pullOut beyond the table edge
  const off = (half: number) => half + CHAIR.pullOut + hs;
  const slots: [number, number, number][] = [
    [-tw / 4, -off(td / 2), 0], [tw / 4, off(td / 2), Math.PI], [tw / 4, -off(td / 2), 0], [-tw / 4, off(td / 2), Math.PI],
    [-off(tw / 2), 0, Math.PI / 2], [off(tw / 2), 0, -Math.PI / 2],
  ];
  const want = rngInt(rng, CHAIR.count[0], CHAIR.count[1]);
  const out: { id: number; fp: Rect }[] = [];
  for (const [lx, lz, face] of slots) {
    if (out.length >= want) break;
    const w = rot(lx, lz, yaw);
    const id = keep(ctx, place(ctx, chairTemplate(rng, foot), c.x + w.x, c.z + w.z, fy, yaw + face));
    if (id >= 0) out.push({ id, fp: footprint(c.x + w.x, c.z + w.z, hs, hs, yaw + face) });
  }
  return out;
}

function placePlant(ctx: GenContext, room: Room, plan: KitchenPlan, rng: RngState, foot: number, info: FurnitureInfo): void {
  if (!rngChance(rng, HOUSEPLANT.p)) return;
  const t = houseplantTemplate(rng, foot, room.bu);
  const f = room.ext;
  let id = -1;
  if (plan.windowU !== null) {
    const boardY = room.floorY + COUNTER.top + GLAZING.aboveCounter + GLAZING.innerBoardThick;
    const fr1 = -room.T + GLAZING.frameInset + GLAZING.frameDepth, nose = GLAZING.innerBoardNose;
    const potR = HOUSEPLANT.potDiam[0] / 2; // larger pots hit the frame and fall back to the floor
    if ((nose - fr1) / 2 >= potR) {
      const c = f.p(plan.windowU + rngRange(rng, -HOUSEPLANT.boardJitter, HOUSEPLANT.boardJitter), boardY, (fr1 + nose) / 2);
      // the climb route runs along the board (local -z along u), so its base stays on the board
      id = place(ctx, t, c.x, c.z, boardY, yawTo(room.eu) + rngRange(rng, -HOUSEPLANT.boardYawJitter, HOUSEPLANT.boardYawJitter), 'plants');
    }
  }
  if (id < 0) {
    // floor: the back-wall corner on the far side from the run
    const u = plan.sigma > 0 ? room.u1 - HOUSEPLANT.cornerOff : room.u0 + HOUSEPLANT.cornerOff;
    const c = f.p(u, room.floorY, room.depth - HOUSEPLANT.cornerOff);
    id = keep(ctx, place(ctx, t, c.x, c.z, room.floorY, yawTo({ x: -room.er.x, z: -room.er.z }) + rngRange(rng, -HOUSEPLANT.floorYawJitter, HOUSEPLANT.floorYawJitter), 'plants'));
    const h = HOUSEPLANT.potDiam[1] / 2 + 5;
    if (id >= 0) info.footprints.push({ x0: c.x - h, x1: c.x + h, z0: c.z - h, z1: c.z + h });
  }
  if (id >= 0) addPlant(ctx, { objectId: id, hostFlags: rngChance(rng, HOUSEPLANT.scaleP) ? 1 << HOST_FLAGS.indexOf('scale') : 0, hostClass: 'herb' });
}

/** Fruit bowl, bread board and sugar bowl on free counter spans (never over the sink or the cooker). */
function placeCounterItems(ctx: GenContext, runs: RunInfo, rng: RngState, foot: number): void {
  const items: { p: number; make: () => ObjectTemplate; half: number }[] = [
    { p: FRUIT_BOWL.p, make: () => fruitBowlTemplate(rng, foot), half: FRUIT_BOWL.diam / 2 + 10 },
    { p: BREAD_BOARD.p, make: () => breadBoardTemplate(foot), half: BREAD_BOARD.size[0] / 2 + 10 },
    { p: SUGAR_BOWL.p, make: () => sugarBowlTemplate(rng, foot), half: SUGAR_BOWL.diam / 2 + 50 },
  ];
  for (const it of items) {
    if (!rngChance(rng, it.p)) continue;
    const t = it.make();
    for (let tries = 0; tries < FURNISH.counterTries; tries++) {
      const ci = rngInt(rng, 0, runs.counters.length - 1), cu = runs.counters[ci];
      const spans = cu.spans.filter(([a0, a1]) => a1 - a0 > 2 * it.half);
      if (spans.length === 0) continue;
      const [a0, a1] = spans[rngInt(rng, 0, spans.length - 1)];
      const a = rngRange(rng, a0 + it.half, a1 - it.half), n = cu.n0 + 0.5 * (cu.n1 - cu.n0) + rngRange(rng, FURNISH.counterNOffset[0], FURNISH.counterNOffset[1]);
      const c = cu.f.p(a, cu.topY, n);
      if (place(ctx, t, c.x, c.z, cu.topY, yawTo(cu.f.N) + rngRange(rng, -FURNISH.counterYawJitter, FURNISH.counterYawJitter)) >= 0) break;
    }
  }
}
