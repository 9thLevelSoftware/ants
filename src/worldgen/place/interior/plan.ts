// Kitchen plan (GDD 04 §5.7): the base-cabinet run along the exterior wall on the longer side of the back door,
// an optional L-run on the end wall (p 0.6), the fridge at the run end, sink under the window, cooker and washer
// slots, the door gap (or weather strip) and the service pipes. Pure data; the builders turn it into primitives.
//
// Decision (recorded in the report): the main run stands against the exterior (garden) wall, not the map-edge
// back wall, because the sink must sit under the window and the pipe penetrations and washer pipe lead outside.

import { rngChance, rngInt, rngRange, type RngState } from '@/core/rng';
import { WallFrame } from '../../catalog/interior/frame';
import type { Slot, SlotKind } from '../../catalog/interior/cabinets';
import { BACK_DOOR, BASE_UNIT, COUNTER, FRIDGE, GLAZING, SERVICE_PIPE, WASHER } from '../../catalog/interior/dims';
import { MICRO } from '../../tuning/pipeline';
import type { Room } from './room';


/** A straight run of units: a along the run from its corner, n from the wall face into the room. */
export interface RunPlan {
  name: 'main' | 'l';
  f: WallFrame;
  slots: Slot[];
  /** Counter extent along the run (corner side to far end), mm. */
  counterA0: number; counterA1: number;
  /** Kickboard extent along the run. */
  kickA0: number; kickA1: number;
}

export interface FridgePlan { f: WallFrame; a0: number; wallGap: number; feetGap: number }
export interface PipePlan {
  u: number; diam: number; annulus: number; at: 'sink' | 'washer';
  /** Pipe axis, world mm (set by the shell placer: high enough that the hole never reads as walkable floor). */
  axisY: number;
}

export interface DoorPlan {
  u: number;
  /** Clear gap under the leaf, mm (0 = weather strip). */
  gap: number;
  sealed: boolean;
  decayedFoot: [boolean, boolean];
}

export interface KitchenPlan {
  door: DoorPlan;
  /** +1 or -1: direction of +a of the main run in terms of +u. */
  sigma: number;
  /** u of the corner the main run starts from (a room end). */
  uc: number;
  main: RunPlan;
  l: RunPlan | null;
  fridge: FridgePlan;
  counterDepth: number;
  counterGap: number;
  /** Window opening centre along u (over the sink), or null. */
  windowU: number | null;
  pipes: PipePlan[];
}

/** A value in [lo, hi] that is at least `min` when the range allows it (GDD 04 §6.1 clamp), else the real max. */
export function clampGap(rng: RngState, lo: number, hi: number, min: number): number {
  if (min > hi) return rngRange(rng, lo, hi);
  return rngRange(rng, Math.max(lo, min), hi);
}

function door(rng: RngState, room: Room): DoorPlan {
  const sealed = rngChance(rng, BACK_DOOR.weatherStripP);
  const min = MICRO.gapMinBu * room.bu;
  const gap = sealed ? 0 : clampGap(rng, BACK_DOOR.gap[0], BACK_DOOR.gap[1], min);
  return { u: room.doorU, gap, sealed, decayedFoot: [rngChance(rng, BACK_DOOR.decayedFootP), rngChance(rng, BACK_DOOR.decayedFootP)] };
}

export function planKitchen(room: Room, rng: RngState): KitchenPlan {
  const W = BASE_UNIT.width;
  const d = door(rng, room);
  const jamb = BACK_DOOR.leafWidth / 2 + BACK_DOOR.jambWidth;
  // the longer side of the door takes the run; its corner is that room end
  const leftLen = d.u - jamb - room.u0, rightLen = room.u1 - (d.u + jamb);
  const sigma = leftLen >= rightLen ? 1 : -1;
  const uc = sigma > 0 ? room.u0 : room.u1;
  const avail = Math.max(leftLen, rightLen) - BASE_UNIT.doorClear;
  const counterDepth = rngRange(rng, COUNTER.depth[0], COUNTER.depth[1]);
  const counterGap = rngRange(rng, COUNTER.wallGap[0], COUNTER.wallGap[1]);
  const main = new WallFrame(room.ext.x(uc, 0), room.ext.z(uc, 0), room.ext.axis(sigma, 0), room.ext.axis(0, 1));
  const endWall = new WallFrame(room.ext.x(uc, 0), room.ext.z(uc, 0), room.ext.axis(0, 1), room.ext.axis(sigma, 0));
  const fridgeW = FRIDGE.width + 2 * FRIDGE.sideGap;
  const maxUnits = Math.floor(BASE_UNIT.run[1] / W), minUnits = Math.floor(BASE_UNIT.run[0] / W);
  // L-run: units along the end wall, fridge at its far end; it must leave free floor before the back wall
  const lRoom = room.depth - (counterGap + counterDepth) - fridgeW - BASE_UNIT.lFrontClear;
  let lUnits = Math.min(BASE_UNIT.lUnits[1], Math.floor(lRoom / W));
  const wantL = rngChance(rng, BASE_UNIT.lRunP) && lUnits >= BASE_UNIT.lUnits[0];
  let mainUnits = Math.min(maxUnits, Math.floor((avail - (wantL ? 0 : fridgeW)) / W));
  let fridgeOnEnd = wantL;
  if (!wantL && mainUnits < minUnits && lRoom >= 0) { fridgeOnEnd = true; lUnits = 0; mainUnits = Math.min(maxUnits, Math.floor(avail / W)); }
  if (wantL) lUnits = rngInt(rng, BASE_UNIT.lUnits[0], lUnits);
  else if (!fridgeOnEnd) lUnits = 0;
  mainUnits = Math.max(1, mainUnits);
  const feetGap = rngRange(rng, FRIDGE.feetGap[0], FRIDGE.feetGap[1]);
  const fridgeWall = rngRange(rng, FRIDGE.wallGap[0], FRIDGE.wallGap[1]);
  // main run slots (a from the corner)
  const start = fridgeOnEnd ? 0 : fridgeW;
  const kinds = mainKinds(rng, room, mainUnits, uc, sigma, start, d.u, fridgeOnEnd && lUnits > 0);
  const slots: Slot[] = kinds.kinds.map((kind, i) => ({ kind, a0: start + i * W, a1: start + (i + 1) * W }));
  const counterA0 = fridgeOnEnd ? counterGap : start;
  const mainRun: RunPlan = { name: 'main', f: main, slots, counterA0, counterA1: start + mainUnits * W, kickA0: fridgeOnEnd ? 0 : start, kickA1: start + mainUnits * W };
  let lRun: RunPlan | null = null;
  const cFront = counterGap + counterDepth;
  let fridge: FridgePlan;
  if (fridgeOnEnd) {
    const l0 = cFront + 2;
    const ls: Slot[] = [];
    for (let i = 0; i < lUnits; i++) ls.push({ kind: 'base', a0: l0 + i * W, a1: l0 + (i + 1) * W });
    if (lUnits > 0) {
      const doorsFront = cFront - COUNTER.overhang;
      lRun = { name: 'l', f: endWall, slots: ls, counterA0: cFront, counterA1: l0 + lUnits * W, kickA0: doorsFront - BASE_UNIT.kickSetback - BASE_UNIT.kickThick, kickA1: l0 + lUnits * W };
    }
    fridge = { f: endWall, a0: l0 + lUnits * W + FRIDGE.sideGap, wallGap: fridgeWall, feetGap };
  } else {
    fridge = { f: main, a0: FRIDGE.sideGap, wallGap: fridgeWall, feetGap };
  }
  // pipes: under the sink (p 0.8, 1.0 when the door is sealed), behind the washer
  const sink = slots.find((s) => s.kind === 'sink')!;
  const uOf = (a: number) => uc + sigma * a;
  const pipes: PipePlan[] = [];
  const pipe = (at: PipePlan['at'], u: number) => {
    const diam = rngRange(rng, SERVICE_PIPE.diam[0], SERVICE_PIPE.diam[1]);
    const annulus = clampGap(rng, SERVICE_PIPE.annulus[0], SERVICE_PIPE.annulus[1], MICRO.gapMinBu * room.bu);
    pipes.push({ u, diam, annulus, at, axisY: room.floorY + SERVICE_PIPE.axis });
  };
  if (d.sealed || rngChance(rng, SERVICE_PIPE.sinkP)) pipe('sink', uOf((sink.a0 + sink.a1) / 2 + rngRange(rng, -120, 120)));
  const washer = slots.find((s) => s.kind === 'washer');
  if (washer && rngChance(rng, SERVICE_PIPE.washerP)) {
    const toSink = sink.a0 > washer.a0 ? 1 : -1;
    const edge = toSink > 0 ? washer.a1 - SERVICE_PIPE.washerEdge : washer.a0 + SERVICE_PIPE.washerEdge;
    pipe('washer', uOf(edge));
  }
  const windowU = kinds.window ? uOf((sink.a0 + sink.a1) / 2) : null;
  return { door: d, sigma, uc, main: mainRun, l: lRun, fridge, counterDepth, counterGap, windowU, pipes };
}

/** Slot kinds of the main run: a sink where a window fits over it (p 0.7), a cooker away from it, a washer beside it. */
function mainKinds(rng: RngState, room: Room, n: number, uc: number, sigma: number, start: number, doorU: number, cornerBlind: boolean): { kinds: SlotKind[]; window: boolean } {
  const W = BASE_UNIT.width;
  const centreU = (i: number) => uc + sigma * (start + (i + 0.5) * W);
  const half = GLAZING.openingWidth / 2;
  const jamb = BACK_DOOR.leafWidth / 2 + BACK_DOOR.jambWidth;
  const fits = (i: number) => {
    const u = centreU(i);
    return u - half >= room.u0 + GLAZING.endClear && u + half <= room.u1 - GLAZING.endClear && Math.abs(u - doorU) >= half + jamb + GLAZING.doorClear;
  };
  // not the corner slot (a corner sink is unusable) unless the run has a single unit
  const cand = n === 1 ? [0] : [...Array(n).keys()].filter((i) => i > 0);
  const winOk = cand.filter(fits);
  const wantWindow = rngChance(rng, GLAZING.p) && winOk.length > 0;
  const pool = wantWindow ? winOk : cand;
  const sink = pool[rngInt(rng, 0, pool.length - 1)];
  const kinds: SlotKind[] = new Array(n).fill('base');
  kinds[sink] = 'sink';
  if (n >= 2 + (cornerBlind ? 1 : 0)) {
    // with an L-run the corner unit is a blind cabinet (the L's kickboard runs in front of it)
    const ok = (i: number) => i !== sink && !(cornerBlind && i === 0);
    const far = [...Array(n).keys()].filter((i) => ok(i) && Math.abs(i - sink) >= 2);
    const near = [...Array(n).keys()].filter(ok);
    const pc = far.length > 0 ? far : near;
    kinds[pc[rngInt(rng, 0, pc.length - 1)]] = 'cooker';
  }
  if (rngChance(rng, WASHER.p)) {
    const side = [sink - 1, sink + 1].filter((i) => i >= 0 && i < n && kinds[i] === 'base' && !(cornerBlind && i === 0));
    if (side.length > 0) kinds[side[rngInt(rng, 0, side.length - 1)]] = 'washer';
  }
  return { kinds, window: wantWindow };
}
