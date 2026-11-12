// Free-standing furniture in the kitchen (GDD 04 §5.7): table >= 700 from the counters with 2-4 chairs, the
// inner doormat, pet bowls against a wall within 1500 of the door, the pedal bin at the run end or by the door,
// a houseplant on the window board or the floor, and counter items. Positions vary with the seed; every object
// is placed with the collision test, so nothing interpenetrates.

import { rngChance, rngInt, rngRange, type RngState } from '@/core/rng';
import type { Vec3 } from '@/core/math/vec3';
import { HOST_FLAGS } from '@/sim/types';
import { addPlant, addWaterBody, dcos, drad, dsin, placeObject, type GenContext, type ObjectTemplate } from '../../kit';
import {
  bowlPairTemplate, breadBoardTemplate, chairTemplate, doormatTemplate, fruitBowlTemplate, houseplantTemplate,
  pedalBinTemplate, sugarBowlTemplate, tableTemplate,
} from '../../catalog/interior/furniture';
import {
  BACK_DOOR, BREAD_BOARD, CHAIR, COUNTER, DOORMAT_INSIDE, FRUIT_BOWL, GLAZING, HOUSEPLANT, PEDAL_BIN, PET_BOWL, SUGAR_BOWL, TABLE,
} from '../../catalog/interior/dims';
import type { KitchenPlan } from './plan';
import type { Room } from './room';
import type { RunInfo } from './runPlace';

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

function place(ctx: GenContext, t: ObjectTemplate, x: number, z: number, y: number, yaw: number, cat: 'structures' | 'plants' = 'structures'): number {
  return placeObject(ctx, t, { x, z, y, yaw, snap: false, collide: true, category: cat });
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
  const jamb = BACK_DOOR.leafWidth / 2 + BACK_DOOR.jambWidth;
  // doormat inside the door
  const [, , md] = DOORMAT_INSIDE.size;
  const mat = f.p(plan.door.u, fy, DOORMAT_INSIDE.doorGap + md / 2);
  place(ctx, doormatTemplate(), mat.x, mat.z, fy, yawTo(room.er));
  // table: long axis along u, >= 700 from runs and appliances, >= 600 from walls, >= 1000 from the door
  const [tw, , td] = TABLE.top;
  const baseYaw = yawTo(room.er); // local +z into the room, local x (the long side) along u
  for (let tries = 0; tries < 60 && info.tableId < 0; tries++) {
    const yaw = baseYaw + drad(rngRange(rng, -TABLE.yawJitterDeg, TABLE.yawJitterDeg)) + (rngChance(rng, 0.5) ? Math.PI : 0);
    const u = rngRange(rng, room.u0, room.u1), r = rngRange(rng, 0, room.depth);
    const c = f.p(u, fy, r);
    const fp = footprint(c.x, c.z, tw / 2, td / 2, yaw);
    const inner = Math.min(fp.x0 - roomRect.x0, roomRect.x1 - fp.x1, fp.z0 - roomRect.z0, roomRect.z1 - fp.z1);
    if (inner < TABLE.wallMin || rectDist(fp, doorRect) < TABLE.doorMin) continue;
    if (runs.footprints.some((q) => rectDist(fp, q) < TABLE.counterMin)) continue;
    const id = place(ctx, tableTemplate(foot), c.x, c.z, fy, yaw);
    if (id < 0) continue;
    info.tableId = id;
    info.footprints.push(fp);
    placeChairs(ctx, rng, c, yaw, foot, fy, info);
  }
  if (info.tableId < 0) ctx.notes.push('interior: no room for the kitchen table');
  // pet bowls (kitchen-door p 0.8, elsewhere 0.5) on the far side of the door from the run, against the wall
  const sigma = plan.sigma;
  const bowlP = ctx.params.archetype === 'kitchen-door' ? PET_BOWL.pKitchenDoor : PET_BOWL.pOther;
  if (rngChance(rng, bowlP)) {
    const bp = bowlPairTemplate(rng, foot);
    const mw = Math.max(PET_BOWL.mat[0], 2 * (bp.water.radius + 60)), hd = PET_BOWL.mat[2] / 2;
    for (let k = 0; k < 8 && info.bowlsId < 0; k++) {
      const u = plan.door.u - sigma * (jamb + 120 + mw / 2 + k * 120 + rngRange(rng, 0, 60));
      const c = f.p(u, fy, 45 + hd);
      if (u - mw / 2 < room.u0 + 40 || u + mw / 2 > room.u1 - 40 || Math.abs(u - plan.door.u) > PET_BOWL.doorMax) continue;
      // local -z (where the climb routes start) faces the room
      const yaw = yawTo({ x: -room.er.x, z: -room.er.z });
      const id = place(ctx, bp.template, c.x, c.z, fy, yaw);
      if (id < 0) continue;
      info.bowlsId = id;
      info.footprints.push(footprint(c.x, c.z, mw / 2, hd, yaw));
      // the template's water centre is local; rotate it like the object
      const off = rot(bp.water.x, bp.water.z, yaw);
      addWaterBody(ctx, { kind: 'bowl-water', vesselObjectId: id, pos: { x: c.x + off.x, y: fy + PET_BOWL.mat[1] + PET_BOWL.wall, z: c.z + off.z }, radius: bp.water.radius, levelMm: bp.water.levelMm, capMm: bp.water.capMm });
    }
  }
  // pedal bin: at the run end next to the door, else by the door on the other side, else by the fridge
  const binT = pedalBinTemplate(rng, foot);
  const R = PEDAL_BIN.diam / 2 + 10;
  const runEndU = plan.uc + sigma * Math.max(...plan.main.slots.map((s) => s.a1));
  const cands = [runEndU + sigma * (R + 15), plan.door.u - sigma * (jamb + R + 40), plan.door.u + sigma * (jamb + R + 40)];
  for (const u of cands) {
    if (info.binId >= 0) break;
    if (Math.abs(u - plan.door.u) < jamb + R) continue; // never in front of the door
    const c = f.p(u, fy, R + 40);
    const fp = footprint(c.x, c.z, R, R, 0);
    if (Math.min(fp.x0 - roomRect.x0, roomRect.x1 - fp.x1, fp.z0 - roomRect.z0, roomRect.z1 - fp.z1) < 30) continue;
    const id = place(ctx, binT, c.x, c.z, fy, yawTo(room.er));
    if (id >= 0) { info.binId = id; info.footprints.push(fp); }
  }
  placePlant(ctx, room, plan, rng, foot, info);
  placeCounterItems(ctx, runs, rng, foot);
  return info;
}

function placeChairs(ctx: GenContext, rng: RngState, c: Vec3, yaw: number, foot: number, fy: number, info: FurnitureInfo): void {
  const [tw, , td] = TABLE.top, hs = CHAIR.seat[2] / 2;
  // seat centre: its front edge sits pullOut beyond the table edge
  const off = (half: number) => half + CHAIR.pullOut + hs;
  const slots: [number, number, number][] = [
    [-tw / 4, -off(td / 2), 0], [tw / 4, off(td / 2), Math.PI], [tw / 4, -off(td / 2), 0], [-tw / 4, off(td / 2), Math.PI],
    [-off(tw / 2), 0, Math.PI / 2], [off(tw / 2), 0, -Math.PI / 2],
  ];
  const want = rngInt(rng, CHAIR.count[0], CHAIR.count[1]);
  let n = 0;
  for (const [lx, lz, face] of slots) {
    if (n >= want) break;
    const w = rot(lx, lz, yaw);
    const id = place(ctx, chairTemplate(rng, foot), c.x + w.x, c.z + w.z, fy, yaw + face);
    if (id >= 0) { n++; info.footprints.push(footprint(c.x + w.x, c.z + w.z, hs, hs, yaw + face)); }
  }
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
      const c = f.p(plan.windowU + rngRange(rng, -250, 250), boardY, (fr1 + nose) / 2);
      id = place(ctx, t, c.x, c.z, boardY, rngRange(rng, -Math.PI, Math.PI), 'plants');
    }
  }
  if (id < 0) {
    // floor: the back-wall corner on the far side from the run
    const u = plan.sigma > 0 ? room.u1 - 200 : room.u0 + 200;
    const c = f.p(u, room.floorY, room.depth - 200);
    id = place(ctx, t, c.x, c.z, room.floorY, rngRange(rng, -Math.PI, Math.PI), 'plants');
    if (id >= 0) info.footprints.push({ x0: c.x - 130, x1: c.x + 130, z0: c.z - 130, z1: c.z + 130 });
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
    for (let tries = 0; tries < 12; tries++) {
      const ci = rngInt(rng, 0, runs.counters.length - 1), cu = runs.counters[ci];
      const spans = cu.spans.filter(([a0, a1]) => a1 - a0 > 2 * it.half);
      if (spans.length === 0) continue;
      const [a0, a1] = spans[rngInt(rng, 0, spans.length - 1)];
      const a = rngRange(rng, a0 + it.half, a1 - it.half), n = cu.n0 + 0.5 * (cu.n1 - cu.n0) + rngRange(rng, -40, 60);
      const c = cu.f.p(a, cu.topY, n);
      if (place(ctx, t, c.x, c.z, cu.topY, yawTo(cu.f.N) + rngRange(rng, -0.3, 0.3)) >= 0) break;
    }
  }
}
