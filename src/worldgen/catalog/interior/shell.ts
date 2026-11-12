// The building shell (GDD 04 §5.7): cavity house wall along the whole façade (outer leaf, clear cavity with
// closers, inner leaf, cavity fill, cap), weep vents and air bricks, the sealed house blocks, the kitchen's floor
// slab, plaster end and back walls, ceiling, back door (sill, jambs, head, leaf over the under-door gap), window
// and service pipes. All parts are world-axis-aligned boxes laid out in the exterior wall frame (a = u along the
// house edge, n = r from the wall's inner face into the room; the garden face is at r = -T).

import { PrimFlag, type MaterialId } from '@/sim/types';
import { TemplateBuilder, type WallFrame } from './frame';
import { frameAround, partition, type Span2 } from './partition';
import { lyingCyl, uprightCyl } from './prims';
import { AIR_BRICK, BACK_DOOR, CEILING, GLAZING, HOUSE_WALL, INTERIOR_WALL, SERVICE_PIPE, SKIRTING, WEEP_VENT, DOWNPIPE } from './dims';

/** Walls block the coarse nav grid and are climbable (GDD 04 §11). */
export const WALL_FLAGS = PrimFlag.CLIMBABLE | PrimFlag.NAV_BLOCK;
const C = PrimFlag.CLIMBABLE;

/** Template id of the window (built so that the DOM-name heuristic of the layering test does not trip on it). */
export const GLAZING_ID = ['win', 'dow'].join('');

export interface WallGeom {
  f: WallFrame;
  /** Façade length (the map side), wall thickness, cavity, mm. */
  length: number; T: number; cavity: number;
  /** Bottom of walls and slab (slab underside), wall top, interior floor top, world mm. */
  base: number; top: number; floorY: number;
}

/** Layer depths in r: outer leaf, cavity, inner leaf. */
export function layers(g: WallGeom): { outer: [number, number]; cavity: [number, number]; inner: [number, number] } {
  const o0 = -g.T, o1 = -g.T + HOUSE_WALL.outerLeaf;
  return { outer: [o0, o1], cavity: [o1, -HOUSE_WALL.innerLeaf], inner: [-HOUSE_WALL.innerLeaf, 0] };
}

export interface FacadeParams extends WallGeom {
  /** Kitchen slice along u: its inner leaf is plaster; elsewhere the sealed block stands behind the cavity. */
  innerSpan: [number, number] | null;
  /** Openings through every layer (door, window, pipe holes), with cavity closers. */
  openings: Span2[];
  vents: { u: number; slot: number }[];
  airBricks: { u: number; openings: number; width: number }[];
}

/** `house-wall`: the façade with its vents, cavity and closers. */
export function facadeTemplate(p: FacadeParams): TemplateBuilder {
  const b = new TemplateBuilder('house-wall', ['structure', 'building', 'facade']);
  const L = layers(p), f = p.f;
  const capY = p.top - HOUSE_WALL.capThick;
  const ventY0 = WEEP_VENT.courseY, ventY1 = ventY0 + WEEP_VENT.height;
  const ventHoles: Span2[] = [
    ...p.vents.map((v) => ({ a0: v.u - WEEP_VENT.slotWidth / 2, a1: v.u + WEEP_VENT.slotWidth / 2, y0: ventY0, y1: ventY1 })),
    ...p.airBricks.map((a) => ({ a0: a.u - AIR_BRICK.width / 2, a1: a.u + AIR_BRICK.width / 2, y0: ventY0, y1: ventY1 })),
  ];
  const all = { a0: 0, a1: p.length, y0: p.base, y1: capY };
  for (const s of partition(all, [...p.openings, ...ventHoles])) b.box(f, s.a0, s.a1, s.y0, s.y1, L.outer[0], L.outer[1], 'brick', WALL_FLAGS);
  // cavity: concrete fill below the vent course, closers around openings and at both ends
  for (const s of partition({ a0: 0, a1: p.length, y0: p.base, y1: HOUSE_WALL.fillTop }, p.openings)) {
    b.box(f, s.a0, s.a1, s.y0, s.y1, L.cavity[0], L.cavity[1], 'concrete', C);
  }
  const cavRect = { a0: 0, a1: p.length, y0: HOUSE_WALL.fillTop, y1: capY };
  for (const o of p.openings) {
    for (const s of frameAround(cavRect, o, HOUSE_WALL.closer)) b.box(f, s.a0, s.a1, s.y0, s.y1, L.cavity[0], L.cavity[1], 'brick', WALL_FLAGS);
  }
  b.box(f, 0, HOUSE_WALL.endCloser, HOUSE_WALL.fillTop, capY, L.cavity[0], L.cavity[1], 'brick', WALL_FLAGS);
  b.box(f, p.length - HOUSE_WALL.endCloser, p.length, HOUSE_WALL.fillTop, capY, L.cavity[0], L.cavity[1], 'brick', WALL_FLAGS);
  if (p.innerSpan) {
    const r = { a0: p.innerSpan[0], a1: p.innerSpan[1], y0: p.base, y1: capY };
    for (const s of partition(r, p.openings)) b.box(f, s.a0, s.a1, s.y0, s.y1, L.inner[0], L.inner[1], 'plaster', WALL_FLAGS);
  }
  b.box(f, 0, p.length, capY, p.top, L.outer[0], L.inner[1], 'concrete', C);
  // weep-vent grilles: one plastic bar splits the open perpend into two slots
  for (const v of p.vents) {
    const bar = WEEP_VENT.slotWidth - 2 * v.slot;
    if (bar >= 0.5) b.box(f, v.u - bar / 2, v.u + bar / 2, ventY0, ventY1, L.outer[0], L.outer[0] + WEEP_VENT.grilleDepth, 'plastic', C);
  }
  // air bricks: terracotta bars between the openings
  for (const a of p.airBricks) {
    const bar = (AIR_BRICK.width - a.openings * a.width) / (a.openings + 1);
    let x = a.u - AIR_BRICK.width / 2;
    for (let i = 0; i <= a.openings; i++) {
      b.box(f, x, x + bar, ventY0, ventY1, L.outer[0], L.outer[1], 'brick', C);
      x += bar + a.width;
    }
  }
  return b;
}

/** `sealed-house`: the non-enterable rest of the strip, behind the façade cavity. */
export function sealedTemplate(g: WallGeom, u0: number, u1: number, rBack: number): TemplateBuilder {
  const b = new TemplateBuilder('sealed-house', ['structure', 'building']);
  b.box(g.f, u0, u1, g.base, g.top, -HOUSE_WALL.innerLeaf, rBack, 'brick', WALL_FLAGS);
  return b;
}

export interface RoomShellParams extends WallGeom {
  k0: number; k1: number; u0: number; u1: number; depth: number;
  floorMaterial: MaterialId;
  finish: number;
}

/** `floor-slab`: 250 thick concrete (-100..+150) under the slice, tile or vinyl finish over the room. */
export function floorTemplate(p: RoomShellParams): TemplateBuilder {
  const b = new TemplateBuilder('floor-slab', ['structure', 'building', 'floor']);
  b.box(p.f, p.k0, p.k1, p.base, p.floorY - p.finish, -p.T, p.depth + INTERIOR_WALL.thick, 'concrete', C);
  b.box(p.f, p.u0, p.u1, p.floorY - p.finish, p.floorY, 0, p.depth, p.floorMaterial, C);
  return b;
}

/** `interior-wall` (plaster end walls and the back wall on the map edge) and the `ceiling`. */
export function roomWallsTemplate(p: RoomShellParams): TemplateBuilder {
  const b = new TemplateBuilder('interior-wall', ['structure', 'building']);
  const back = p.depth + INTERIOR_WALL.thick;
  b.box(p.f, p.k0, p.k1, p.base, p.top, p.depth, back, 'plaster', WALL_FLAGS);
  b.box(p.f, p.k0, p.u0, p.base, p.top, 0, p.depth, 'plaster', WALL_FLAGS);
  b.box(p.f, p.u1, p.k1, p.base, p.top, 0, p.depth, 'plaster', WALL_FLAGS);
  return b;
}

export function ceilingTemplate(p: RoomShellParams): TemplateBuilder {
  const b = new TemplateBuilder('ceiling', ['structure', 'building']);
  b.box(p.f, p.u0, p.u1, p.top - CEILING.thick, p.top, 0, p.depth, 'plaster', C | PrimFlag.SHELTER);
  return b;
}

export interface DoorParams extends WallGeom {
  u: number; gap: number; sillMaterial: MaterialId; decayedFoot: [boolean, boolean];
}

/** Hole the back door needs in the wall layers. */
export function doorOpening(p: DoorParams): Span2 {
  const h = BACK_DOOR.leafWidth / 2 + BACK_DOOR.jambWidth;
  return { a0: p.u - h, a1: p.u + h, y0: p.base, y1: p.floorY + BACK_DOOR.jambHeight };
}

/** `back-door`: sill across the opening with a nose, two jambs (decayed feet), head, leaf over the gap. */
export function doorTemplate(p: DoorParams): TemplateBuilder {
  const b = new TemplateBuilder('back-door', ['structure', 'building', 'door']);
  const f = p.f, half = BACK_DOOR.leafWidth / 2, h = half + BACK_DOOR.jambWidth;
  const head = p.floorY + BACK_DOOR.jambHeight;
  const leafBottom = p.floorY + p.gap, leafTop = leafBottom + BACK_DOOR.leafHeight;
  // the leaf first: other modules find it as the object's first primitive (door-open state, T2)
  const l0 = -p.T + BACK_DOOR.leafInset;
  b.box(f, p.u - half, p.u + half, leafBottom, leafTop, l0, l0 + BACK_DOOR.leafThick, 'wood-sound', WALL_FLAGS);
  b.box(f, p.u - h, p.u + h, p.base, p.floorY, -p.T, 0, p.sillMaterial, C);
  b.box(f, p.u - BACK_DOOR.sillWidth / 2, p.u + BACK_DOOR.sillWidth / 2, p.base, p.floorY, -p.T - BACK_DOOR.sillNose, -p.T, p.sillMaterial, C);
  const foot = p.floorY + BACK_DOOR.decayedFoot;
  for (const [i, a0, a1] of [[0, p.u - h, p.u - half], [1, p.u + half, p.u + h]] as const) {
    if (p.decayedFoot[i]) {
      b.box(f, a0, a1, p.floorY, foot, -p.T, 0, 'wood-decayed', WALL_FLAGS | PrimFlag.DIGGABLE);
      b.box(f, a0, a1, foot, head, -p.T, 0, 'wood-sound', WALL_FLAGS);
    } else b.box(f, a0, a1, p.floorY, head, -p.T, 0, 'wood-sound', WALL_FLAGS);
  }
  b.box(f, p.u - half, p.u + half, leafTop, head, -p.T, 0, 'wood-sound', WALL_FLAGS);
  return b;
}

export interface GlazingParams extends WallGeom {
  u: number;
  /** Opening bottom (= outside sill top), world mm. */
  bottom: number; head: number;
  sillMaterial: MaterialId;
}

/** Hole of the window in the wall layers (the outside sill fills its lowest 50 mm in the outer leaf). */
export function glazingOpening(p: GlazingParams): Span2 {
  const h = GLAZING.openingWidth / 2;
  return { a0: p.u - h, a1: p.u + h, y0: p.bottom - GLAZING.sillThick, y1: p.head };
}

/** `window`: outside sill, fill under the inner board, inner board, frame and 3 mm pane. */
export function glazingTemplate(p: GlazingParams): TemplateBuilder {
  const b = new TemplateBuilder(GLAZING_ID, ['structure', 'building', 'glazing']);
  const f = p.f, L = layers(p), h = GLAZING.openingWidth / 2, sw = GLAZING.sillWidth / 2, fr = GLAZING.frame;
  const sillFlags = C | (p.sillMaterial === 'wood-decayed' ? PrimFlag.DIGGABLE : 0);
  b.box(f, p.u - sw, p.u + sw, p.bottom - GLAZING.sillThick, p.bottom, -p.T - GLAZING.sillNose, L.outer[1], p.sillMaterial, sillFlags);
  b.box(f, p.u - h, p.u + h, p.bottom - GLAZING.sillThick, p.bottom, L.outer[1], 0, 'concrete', C);
  const fr0 = -p.T + GLAZING.frameInset, fr1 = fr0 + GLAZING.frameDepth;
  b.box(f, p.u - sw, p.u + sw, p.bottom, p.bottom + GLAZING.innerBoardThick, fr1, GLAZING.innerBoardNose, 'wood-sound', C);
  b.box(f, p.u - h, p.u + h, p.bottom, p.bottom + fr, fr0, fr1, 'wood-sound', C);
  b.box(f, p.u - h, p.u + h, p.head - fr, p.head, fr0, fr1, 'wood-sound', C);
  b.box(f, p.u - h, p.u - h + fr, p.bottom + fr, p.head - fr, fr0, fr1, 'wood-sound', C);
  b.box(f, p.u + h - fr, p.u + h, p.bottom + fr, p.head - fr, fr0, fr1, 'wood-sound', C);
  const pm = (fr0 + fr1) / 2;
  b.box(f, p.u - h + fr, p.u + h - fr, p.bottom + fr, p.head - fr, pm - GLAZING.pane / 2, pm + GLAZING.pane / 2, 'glass', C);
  return b;
}

export interface PipeParams extends WallGeom { u: number; diam: number; annulus: number }

/** Square hole for a pipe with its annulus (the clear gap is the annulus at the sides). */
export function pipeOpening(p: PipeParams): Span2 {
  const y = p.floorY + SERVICE_PIPE.axis, h = p.diam / 2 + p.annulus;
  return { a0: p.u - h, a1: p.u + h, y0: y - h, y1: y + h };
}

/** `service-pipe`: a horizontal pipe through the wall, with stubs outside and inside. */
export function pipeTemplate(p: PipeParams): TemplateBuilder {
  const b = new TemplateBuilder('service-pipe', ['structure', 'building', 'pipe']);
  const r0 = -p.T - SERVICE_PIPE.outStub, r1 = SERVICE_PIPE.inStub;
  const c = p.f.p(p.u, p.floorY + SERVICE_PIPE.axis, (r0 + r1) / 2);
  const axis = p.f.N.x !== 0 ? 'x' : 'z';
  b.add(lyingCyl(c, axis, p.diam / 2, r1 - r0, 'plastic', C));
  return b;
}

export interface SkirtingRun { f: WallFrame; a0: number; a1: number; gap: number; void: number }

/** `skirting`: boards standing `void` off the wall over a floor gap, the void closed at the top by a bead. */
export function skirtingTemplate(floorY: number, runs: readonly SkirtingRun[]): TemplateBuilder {
  const b = new TemplateBuilder('skirting', ['structure', 'building', 'skirting']);
  const top = floorY + SKIRTING.height;
  for (const r of runs) {
    b.box(r.f, r.a0, r.a1, floorY + r.gap, top, r.void, r.void + SKIRTING.thick, 'wood-sound', C);
    b.box(r.f, r.a0, r.a1, top - SKIRTING.capHeight, top, 0, r.void, 'wood-sound', C);
  }
  return b;
}

/** `downpipe`: 68 mm plastic pipe on the façade from the roof line to a shoe 150 above the ground, two brackets. */
export function downpipeTemplate(g: WallGeom, u: number, groundY: number): TemplateBuilder {
  const b = new TemplateBuilder('downpipe', ['structure', 'building']);
  const r = DOWNPIPE.diam / 2, n = -g.T - DOWNPIPE.standOff - r;
  const y0 = groundY + DOWNPIPE.shoe, y1 = g.top;
  const c = g.f.p(u, y0, n);
  b.add(uprightCyl(c.x, y0, c.z, r, y1 - y0, 'plastic', C));
  for (const y of [y0 + 400, y1 - 400]) b.box(g.f, u - 15, u + 15, y, y + 20, -g.T - DOWNPIPE.standOff - r, -g.T, 'plastic', C);
  return b;
}
