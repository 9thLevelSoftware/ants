// Kitchen run (GDD 04 §5.7, §10): base units (carcass on legs in the 150 plinth zone, doors with 3 mm gaps,
// kickboard set back 60 with its floor gap = the kick-space), the countertop with its 20 mm overhang cut around
// the sink, the sink basin, and the freestanding appliances (fridge, cooker with a greasy hob, washer) on feet.
// Laid out in a run frame: a along the run from its corner, n from the wall face into the room, y world height.

import { PrimFlag, type MaterialId } from '@/sim/types';
import type { Vec3 } from '@/core/math/vec3';
import { TemplateBuilder, type WallFrame } from './frame';
import { uprightCyl } from './prims';
import { BASE_UNIT, COOKER, COUNTER, FRIDGE, SINK, WASHER } from './dims';

const C = PrimFlag.CLIMBABLE;
const APPLIANCE = PrimFlag.CLIMBABLE | PrimFlag.NAV_BLOCK;

export type SlotKind = 'base' | 'sink' | 'cooker' | 'washer';
export interface Slot { kind: SlotKind; a0: number; a1: number }

/** Depths (n) of a run from the counter depth and its wall gap. */
export function runDepths(counterGap: number, counterDepth: number) {
  const counterFront = counterGap + counterDepth;
  const doorsFront = counterFront - COUNTER.overhang;
  const carcassFront = doorsFront - BASE_UNIT.doorThick;
  const carcassBack = carcassFront - BASE_UNIT.carcassDepth;
  const kickFront = doorsFront - BASE_UNIT.kickSetback;
  return { counterFront, doorsFront, carcassFront, carcassBack, kickFront, kickBack: kickFront - BASE_UNIT.kickThick };
}

/** Floor-relative levels of the run. */
export function runLevels(floorY: number) {
  return { plinthTop: floorY + BASE_UNIT.plinth, counterUnder: floorY + COUNTER.top - COUNTER.thick, counterTop: floorY + COUNTER.top };
}

export const isCabinet = (k: SlotKind) => k === 'base' || k === 'sink';

export interface RunParams {
  f: WallFrame;
  floorY: number;
  slots: Slot[];
  counterGap: number; counterDepth: number;
  /** Kickboard sections along the run: [a0, a1, floor gap mm, passable]. */
  kick: { a0: number; a1: number; gap: number; passable: boolean }[];
  /** a positions of the cabinet-to-counter climb routes. */
  routeAs: number[];
  /** Walker foot offset, mm (route nodes sit this far off the surface). */
  foot: number;
}

/** `base-cabinet-run`: carcasses, doors, legs, kickboards; climb routes and kick-space shelter POIs. */
export function runTemplate(p: RunParams): TemplateBuilder {
  const b = new TemplateBuilder('base-cabinet-run', ['furniture', 'kitchen', 'run']);
  const f = p.f, d = runDepths(p.counterGap, p.counterDepth), lv = runLevels(p.floorY);
  const W = BASE_UNIT;
  for (const s of p.slots) {
    if (!isCabinet(s.kind)) continue;
    const top = s.kind === 'sink' ? lv.counterTop - SINK.depth - 10 : lv.counterUnder;
    const back = s.kind === 'sink' ? d.carcassBack + SINK.serviceVoid : d.carcassBack;
    b.box(f, s.a0, s.a1, lv.plinthTop, top, back, d.carcassFront, 'wood-sound', C);
    b.box(f, s.a0 + W.doorGap / 2, s.a1 - W.doorGap / 2, lv.plinthTop, lv.counterUnder, d.carcassFront, d.doorsFront, 'wood-sound', C);
    const r = W.legDiam / 2, i = W.legInset;
    for (const a of [s.a0 + i, s.a1 - i]) for (const n of [back + i, d.kickBack - r - 2]) {
      b.add(uprightCyl(f.x(a, n), p.floorY, f.z(a, n), r, W.plinth, 'plastic', C));
    }
    b.poi('shelter', f.p((s.a0 + s.a1) / 2, p.floorY + p.foot, (d.carcassBack + d.kickBack) / 2));
  }
  for (const k of p.kick) {
    const flags = C | (k.passable ? 0 : PrimFlag.NAV_BLOCK);
    b.box(f, k.a0, k.a1, p.floorY + k.gap, lv.plinthTop, d.kickBack, d.kickFront, 'wood-sound', flags);
  }
  for (const a of p.routeAs) b.route('cabinet-to-counter', cabinetRoute(f, a, p, d, lv));
  return b;
}

/** Route sections of the kickboard sit on the floor (a floor-to-face corner the walker can take).
 *  kick-space mouth -> kickboard -> plinth underside (inverted) -> door face beside its gap -> under the 20 mm
 *  overhang (inverted) -> counter front edge -> counter top. */
function cabinetRoute(f: WallFrame, a: number, p: RunParams, d: ReturnType<typeof runDepths>, lv: ReturnType<typeof runLevels>): Vec3[] {
  const o = p.foot, e = 0.7 * o, y = p.floorY;
  return [
    f.p(a, y + o, d.kickFront + 40),
    f.p(a, y + o, d.kickFront + o),
    f.p(a, y + 25, d.kickFront + o),
    f.p(a, lv.plinthTop - 15, d.kickFront + o),
    f.p(a, lv.plinthTop - o, d.kickFront + 20),
    f.p(a, lv.plinthTop - o, d.doorsFront - 5),
    f.p(a, lv.plinthTop - e, d.doorsFront + e),
    f.p(a, lv.plinthTop + 15, d.doorsFront + o),
    f.p(a, lv.counterUnder - 10, d.doorsFront + o),
    f.p(a, lv.counterUnder - o, d.doorsFront + 10),
    f.p(a, lv.counterUnder - e, d.counterFront + e),
    f.p(a, (lv.counterUnder + lv.counterTop) / 2, d.counterFront + o),
    f.p(a, lv.counterTop + e, d.counterFront + e),
    f.p(a, lv.counterTop + o, d.counterFront - 20),
    f.p(a, lv.counterTop + o, p.counterGap + p.counterDepth / 2),
  ];
}

export interface CounterParams {
  f: WallFrame; floorY: number; counterGap: number; counterDepth: number;
  /** Counter segments along the run (cooker gaps already removed). */
  segments: [number, number][];
  /** Sink centre along the run, or null. */
  sinkA: number | null;
  material: MaterialId;
  foot: number;
}

/** Sink opening in run coordinates. */
export function sinkRect(p: Pick<CounterParams, 'counterGap' | 'counterDepth'>, sinkA: number) {
  const nc = p.counterGap + p.counterDepth / 2;
  return { a0: sinkA - SINK.width / 2, a1: sinkA + SINK.width / 2, n0: nc - SINK.frontBack / 2, n1: nc + SINK.frontBack / 2 };
}

/** `countertop`: 38 mm top at 910, split around the sink opening; one food-spot POI per segment. */
export function counterTemplate(p: CounterParams): TemplateBuilder {
  const b = new TemplateBuilder('countertop', ['furniture', 'kitchen', 'counter']);
  const f = p.f, lv = runLevels(p.floorY), n0 = p.counterGap, n1 = p.counterGap + p.counterDepth;
  const sr = p.sinkA === null ? null : sinkRect(p, p.sinkA);
  for (const [a0, a1] of p.segments) {
    if (sr && sr.a0 > a0 && sr.a1 < a1) {
      b.box(f, a0, sr.a0, lv.counterUnder, lv.counterTop, n0, n1, p.material, C);
      b.box(f, sr.a1, a1, lv.counterUnder, lv.counterTop, n0, n1, p.material, C);
      b.box(f, sr.a0, sr.a1, lv.counterUnder, lv.counterTop, n0, sr.n0, p.material, C);
      b.box(f, sr.a0, sr.a1, lv.counterUnder, lv.counterTop, sr.n1, n1, p.material, C);
    } else b.box(f, a0, a1, lv.counterUnder, lv.counterTop, n0, n1, p.material, C);
    const mid = (a0 + a1) / 2;
    const aSpot = sr && Math.abs(mid - p.sinkA!) < SINK.width ? (mid < p.sinkA! ? a0 + 100 : a1 - 100) : mid;
    b.poi('food-spot', f.p(aSpot, lv.counterTop + p.foot, n0 + 0.6 * p.counterDepth));
  }
  return b;
}

/** `sink`: stainless basin (bottom + 4 walls) hanging in the counter opening, drain disc; water-spot on the rim. */
export function sinkTemplate(p: CounterParams & { sinkA: number }): TemplateBuilder {
  const b = new TemplateBuilder('sink', ['furniture', 'kitchen', 'sink']);
  const f = p.f, lv = runLevels(p.floorY), sr = sinkRect(p, p.sinkA), w = SINK.wall;
  const y0 = lv.counterTop - SINK.depth;
  b.box(f, sr.a0, sr.a1, y0, y0 + w, sr.n0, sr.n1, 'metal', C);
  b.box(f, sr.a0, sr.a0 + w, y0, lv.counterTop, sr.n0, sr.n1, 'metal', C);
  b.box(f, sr.a1 - w, sr.a1, y0, lv.counterTop, sr.n0, sr.n1, 'metal', C);
  b.box(f, sr.a0, sr.a1, y0, lv.counterTop, sr.n0, sr.n0 + w, 'metal', C);
  b.box(f, sr.a0, sr.a1, y0, lv.counterTop, sr.n1 - w, sr.n1, 'metal', C);
  const c = f.p(p.sinkA, y0 + w, (sr.n0 + sr.n1) / 2);
  b.add(uprightCyl(c.x, y0 + w, c.z, SINK.drain / 2, 1.5, 'metal', C));
  // rim on the room side of the basin (the front wall faces the room: larger n)
  b.poi('water-spot', f.p(p.sinkA, lv.counterTop + p.foot, sr.n1 - w / 2));
  return b;
}

export interface ApplianceParams {
  f: WallFrame; floorY: number;
  /** Along-run start, wall gap (n of the back) and feet gap, mm. */
  a0: number; wallGap: number; feetGap: number;
  foot: number;
}

function feet(b: TemplateBuilder, f: WallFrame, y: number, a0: number, a1: number, n0: number, n1: number, d: number, h: number): void {
  const i = 40;
  for (const a of [a0 + i, a1 - i]) for (const n of [n0 + i, n1 - i]) b.add(uprightCyl(f.x(a, n), y, f.z(a, n), d / 2, h, 'plastic', C));
}

/** `fridge`: 600 x 1800 x 650 on feet (10-20 gap), 30-50 from the wall; shelter POI underneath. */
export function fridgeTemplate(p: ApplianceParams): TemplateBuilder {
  const b = new TemplateBuilder('fridge', ['furniture', 'kitchen', 'appliance']);
  const a1 = p.a0 + FRIDGE.width, n0 = p.wallGap, n1 = p.wallGap + FRIDGE.depth;
  b.box(p.f, p.a0, a1, p.floorY + p.feetGap, p.floorY + p.feetGap + FRIDGE.height, n0, n1, 'metal', APPLIANCE, 4);
  feet(b, p.f, p.floorY, p.a0, a1, n0, n1, FRIDGE.footDiam, p.feetGap);
  b.poi('shelter', p.f.p((p.a0 + a1) / 2, p.floorY + p.foot, (n0 + n1) / 2));
  return b;
}

/** `cooker`: 600 x 900 x 600 on feet, greasy (slippery) hob plate on top; grease food-spot on the hob. */
export function cookerTemplate(p: ApplianceParams): TemplateBuilder {
  const b = new TemplateBuilder('cooker', ['furniture', 'kitchen', 'appliance']);
  const a0 = p.a0 + (600 - COOKER.width) / 2, a1 = a0 + COOKER.width, n0 = COOKER.wallGap, n1 = n0 + COOKER.depth;
  const y0 = p.floorY + p.feetGap, yh = y0 + COOKER.height - COOKER.hobThick, yt = y0 + COOKER.height;
  b.box(p.f, a0, a1, y0, yh, n0, n1, 'metal', APPLIANCE, 2);
  b.box(p.f, a0, a1, yh, yt, n0, n1, 'metal', C | PrimFlag.SLIPPERY);
  feet(b, p.f, p.floorY, a0, a1, n0, n1, COOKER.footDiam, p.feetGap);
  b.poi('food-spot', p.f.p((a0 + a1) / 2, yt + p.foot, (n0 + n1) / 2));
  return b;
}

/** `washing-machine`: 600 x 850 x 600 under the counter, on feet. */
export function washerTemplate(p: ApplianceParams): TemplateBuilder {
  const b = new TemplateBuilder('washing-machine', ['furniture', 'kitchen', 'appliance']);
  const a0 = p.a0 + (600 - WASHER.width) / 2, a1 = a0 + WASHER.width, n0 = WASHER.wallGap, n1 = n0 + WASHER.depth;
  b.box(p.f, a0, a1, p.floorY + p.feetGap, p.floorY + p.feetGap + WASHER.height, n0, n1, 'metal', APPLIANCE, 3);
  feet(b, p.f, p.floorY, a0, a1, n0, n1, WASHER.footDiam, p.feetGap);
  return b;
}
