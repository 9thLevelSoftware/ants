// Step 1b: built zones as analytic rectangles (GDD 04 §1.4), placed in the order interior, asphalt, sidewalk,
// patio, sand, rubber (paths are routed afterwards, paths.ts). Each placement draws up to 16 candidates and keeps
// the best non-overlapping one (adjacency rules +1 each). If built rects exceed 70 % of the map, every size
// shrinks by 10 % (to its minimum) and placement is redone.

import type { RngState } from '@/core/rng';
import { rngFloat, rngInt } from '@/core/rng';
import { BUILT_SIZE, type BuiltKind } from '../tuning/archetypes';
import type { CarParkLayout, HouseLayout, HumanNode, Rect, Side } from './types';
import { along, area, band, clampRule, fromSide, inwardNormal, opposite, overlap, perpendicular, SIDES, touches } from './geom';

export interface BuiltRect { kind: BuiltKind; rect: Rect; side: Side | null; sealed?: boolean }

export interface BuiltPlan {
  rects: BuiltRect[];
  house: HouseLayout | null;
  facadeSide: Side | null;
  carPark: CarParkLayout | null;
  /** Sides taken by a road (car park, lane). */
  roadSides: Side[];
  nodes: HumanNode[];
  /** Built kinds that could not be placed. */
  skipped: BuiltKind[];
}

const range = (rng: RngState, lo: number, hi: number) => lo + rngFloat(rng) * (hi - lo);

/** Shrinkable size: max(min, size * s) where min is the rule's lower bound. */
function sz(v: number, min: number, s: number): number {
  return Math.max(min, v * s);
}

export function placeBuilt(rng: RngState, kinds: readonly BuiltKind[], L: number, wantFacade: boolean): BuiltPlan {
  let shrink = 1;
  let plan = placeOnce(rng, kinds, L, wantFacade, shrink);
  for (let i = 0; i < 12 && builtShare(plan, L) > BUILT_SIZE.builtMaxFrac; i++) {
    shrink *= BUILT_SIZE.shrinkStep;
    plan = placeOnce(rng, kinds, L, wantFacade, shrink);
  }
  return plan;
}

function builtShare(p: BuiltPlan, L: number): number {
  let a = 0;
  for (const r of p.rects) a += area(r.rect);
  return a / (L * L);
}

function placeOnce(rng: RngState, kinds: readonly BuiltKind[], L: number, wantFacade: boolean, s: number): BuiltPlan {
  const B = BUILT_SIZE;
  const plan: BuiltPlan = { rects: [], house: null, facadeSide: null, carPark: null, roadSides: [], nodes: [], skipped: [] };
  const has = (k: BuiltKind) => kinds.includes(k);
  const free = (r: Rect) => plan.rects.every((b) => overlap(b.rect, r) <= 0);
  const usedSides = new Set<Side>();

  // --- interior: the house strip along a random edge, kitchen slice and back door ---
  const houseSide = SIDES[rngInt(rng, 0, 3)];
  if (has('interior') || wantFacade) plan.facadeSide = houseSide;
  if (has('interior')) {
    const depth = sz(clampRule(B.interiorDepth.f, L, B.interiorDepth.lo, B.interiorDepth.hi), B.interiorDepth.lo, s);
    const kw = Math.min(L - 2 * B.kitchenCornerMin, sz(clampRule(B.kitchenWidth.f, L, B.kitchenWidth.lo, B.kitchenWidth.hi), B.kitchenWidth.lo, s));
    const k0 = range(rng, B.kitchenCornerMin, L - B.kitchenCornerMin - kw);
    const strip = band(houseSide, depth, L);
    const kitchen = band(houseSide, depth, L, k0, k0 + kw);
    const doorA = range(rng, k0 + B.doorCornerMin, k0 + kw - B.doorCornerMin);
    const dp = fromSide(houseSide, depth, doorA, L);
    const n = inwardNormal(houseSide);
    const sealed = [band(houseSide, depth, L, 0, k0), band(houseSide, depth, L, k0 + kw, L)].filter((r) => area(r) > 0);
    plan.house = { side: houseSide, strip, kitchen, door: { x: dp.x, z: dp.z, nx: n.x, nz: n.z, width: B.doorWidth }, sealed };
    plan.rects.push({ kind: 'interior', rect: kitchen, side: houseSide });
    for (const r of sealed) plan.rects.push({ kind: 'interior', rect: r, side: houseSide, sealed: true });
    plan.nodes.push({ kind: 'door', x: dp.x, z: dp.z });
    usedSides.add(houseSide);
  } else if (plan.facadeSide) usedSides.add(houseSide);
  const stripDepth = plan.house ? inwardDepth(plan.house.strip, houseSide, L) : 0;

  // --- car park (opposite the house edge) and its sidewalk ---
  if (has('car-park')) {
    const side = plan.facadeSide ? opposite(plan.facadeSide) : SIDES[rngInt(rng, 0, 3)];
    const depth = sz(clampRule(B.carParkDepth.f, L, B.carParkDepth.lo, B.carParkDepth.hi), B.carParkDepth.lo, s);
    const rect = band(side, depth, L);
    plan.rects.push({ kind: 'car-park', rect, side });
    usedSides.add(side);
    plan.roadSides.push(side);
    const bays: Rect[] = [];
    const nb = Math.floor(L / B.bayWidth);
    const off = (L - nb * B.bayWidth) / 2;
    for (let i = 0; i < nb; i++) bays.push(band(side, depth, L, off + i * B.bayWidth, off + (i + 1) * B.bayWidth));
    // bays: the inner bayDepth of the band, against the sidewalk
    const bayRects = bays.map((b) => innerSlice(b, side, depth - Math.min(B.bayDepth, depth), depth, L));
    const aisle = innerSlice(rect, side, 0, depth - Math.min(B.bayDepth, depth), L);
    plan.carPark = { rect, side, bays: bayRects, aisle };
    for (const b of bayRects) plan.nodes.push({ kind: 'bay', x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2 });
    if (has('sidewalk')) {
      const w = sz(range(rng, B.sidewalkWidth[0], B.sidewalkWidth[1]), B.sidewalkWidth[0], s);
      plan.rects.push({ kind: 'sidewalk', rect: innerSlice(band(side, depth + w, L), side, depth, depth + w, L), side });
    }
  }

  // --- driveway (touches the house edge) and lane (any free edge), both full-length bands ---
  for (const k of ['driveway', 'lane'] as const) {
    if (!has(k)) continue;
    const w = sz(range(rng, B.roadWidth[0], B.roadWidth[1]), B.roadWidth[0], s);
    const cands = SIDES.filter((sd) => !usedSides.has(sd) && (k === 'lane' || !plan.facadeSide || perpendicular(sd, plan.facadeSide)));
    let done = false;
    for (let t = 0; t < BUILT_SIZE.candidates && cands.length > 0 && !done; t++) {
      const sd = cands[rngInt(rng, 0, cands.length - 1)];
      // runs from the house strip (or the façade edge) to the far edge
      let a0 = 0, a1 = L;
      if (plan.facadeSide && perpendicular(sd, plan.facadeSide)) {
        if (plan.facadeSide === 'x0' || plan.facadeSide === 'z0') a0 = stripDepth; else a1 = L - stripDepth;
      }
      const rect = band(sd, w, L, a0, a1);
      if (!free(rect)) continue;
      plan.rects.push({ kind: k, rect, side: sd });
      usedSides.add(sd);
      if (k === 'lane') plan.roadSides.push(sd);
      done = true;
    }
    if (!done) plan.skipped.push(k);
  }

  // --- patio against the house edge: centred on the back door, or anywhere along the façade ---
  if (has('patio')) {
    const pw = sz(clampRule(B.patioWidth.f, L, B.patioWidth.lo, B.patioWidth.hi), B.patioWidth.lo, s);
    const pd = sz(clampRule(B.patioDepth.f, L, B.patioDepth.lo, B.patioDepth.hi), B.patioDepth.lo, s);
    const side = plan.facadeSide ?? SIDES[rngInt(rng, 0, 3)];
    const door = plan.house?.door ?? null;
    let best: Rect | null = null;
    for (let t = 0; t < BUILT_SIZE.candidates && !best; t++) {
      const c = door ? along(side, door.x, door.z) + (t === 0 ? 0 : range(rng, -pw / 4, pw / 4)) : range(rng, pw / 2, L - pw / 2);
      const a0 = Math.max(0, Math.min(L - pw, c - pw / 2));
      const rect = innerSlice(band(side, stripDepth + pd, L, a0, a0 + pw), side, stripDepth, stripDepth + pd, L);
      if (free(rect) && (!door || (along(side, door.x, door.z) > a0 && along(side, door.x, door.z) < a0 + pw))) best = rect;
    }
    if (best) plan.rects.push({ kind: 'patio', rect: best, side }); else plan.skipped.push('patio');
  }

  // --- sand pit and the rubber surface next to it ---
  if (has('sand')) {
    let sand: Rect | null = null;
    for (let t = 0; t < BUILT_SIZE.candidates && !sand; t++) {
      const side = sz(Math.min(range(rng, B.sandSide[0], B.sandSide[1]), B.sandCapFrac * L), Math.min(B.sandSide[0], B.sandCapFrac * L), s);
      const m = B.sandEdgeMin;
      const x0 = range(rng, m, L - m - side), z0 = range(rng, m, L - m - side);
      const r = { x0, z0, x1: x0 + side, z1: z0 + side };
      if (free(r)) sand = r;
    }
    if (sand) {
      plan.rects.push({ kind: 'sand', rect: sand, side: null });
      plan.nodes.push({ kind: 'play', x: (sand.x0 + sand.x1) / 2, z: (sand.z0 + sand.z1) / 2 });
      if (has('rubber')) {
        let rub: Rect | null = null;
        for (let t = 0; t < BUILT_SIZE.candidates && !rub; t++) {
          const cap = B.rubberCapFrac * L;
          const w = sz(Math.min(range(rng, B.rubberSide[0], B.rubberSide[1]), cap), Math.min(B.rubberSide[0], cap), s);
          const h = sz(Math.min(range(rng, B.rubberSide[0], B.rubberSide[1]), cap), Math.min(B.rubberSide[0], cap), s);
          const r = besideRect(sand, rngInt(rng, 0, 3), w, h, range(rng, 0, 1));
          if (r.x0 >= 0 && r.z0 >= 0 && r.x1 <= L && r.z1 <= L && free(r) && touches(r, sand)) rub = r;
        }
        if (rub) {
          plan.rects.push({ kind: 'rubber', rect: rub, side: null });
          plan.nodes.push({ kind: 'play', x: (rub.x0 + rub.x1) / 2, z: (rub.z0 + rub.z1) / 2 });
        } else plan.skipped.push('rubber');
      }
    } else plan.skipped.push('sand', ...(has('rubber') ? ['rubber' as const] : []));
  }
  return plan;
}

/** Inward extent of a band rect from its side. */
function inwardDepth(r: Rect, s: Side, L: number): number {
  return s === 'x0' ? r.x1 : s === 'x1' ? L - r.x0 : s === 'z0' ? r.z1 : L - r.z0;
}

/** Part of a band-like rect between inward distances d0 and d1 from side `s`. */
function innerSlice(r: Rect, s: Side, d0: number, d1: number, L: number): Rect {
  switch (s) {
    case 'x0': return { ...r, x0: d0, x1: d1 };
    case 'x1': return { ...r, x0: L - d1, x1: L - d0 };
    case 'z0': return { ...r, z0: d0, z1: d1 };
    default: return { ...r, z0: L - d1, z1: L - d0 };
  }
}

/** A w x h rect beside `r` on one of its 4 sides, slid by t (0..1) along that side while still touching. */
function besideRect(r: Rect, side: number, w: number, h: number, t: number): Rect {
  // shared boundary of at least 30 % of the shorter side
  const cx = (len: number, own: number, lo: number) => {
    const m = 0.3 * Math.min(len, own);
    return lo - own + m + t * (len + own - 2 * m);
  };
  switch (side) {
    case 0: { const z0 = cx(r.z1 - r.z0, h, r.z0); return { x0: r.x0 - w, x1: r.x0, z0, z1: z0 + h }; }
    case 1: { const z0 = cx(r.z1 - r.z0, h, r.z0); return { x0: r.x1, x1: r.x1 + w, z0, z1: z0 + h }; }
    case 2: { const x0 = cx(r.x1 - r.x0, w, r.x0); return { x0, x1: x0 + w, z0: r.z0 - h, z1: r.z0 }; }
    default: { const x0 = cx(r.x1 - r.x0, w, r.x0); return { x0, x1: x0 + w, z0: r.z1, z1: r.z1 + h }; }
  }
}
