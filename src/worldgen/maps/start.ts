// Step 10 — start pose of the dealate queen (GDD 04 §12.5 with directions §K and the worldgen-life addendum).
// The start is outdoors on walkable natural ground (forest, lawn, garden bed; never a built zone, a primitive top
// or a plant pot), on fair-or-worse founding ground, with flood risk <= 0.3, >= 300 BU from the map edge, with at
// least START_RULE.goodMin good-or-better sites reachable by walking (queen clearance) within START_RADIUS_BU, a
// diggable founding patch within a short walk, >= 800 BU from established rival nests and >= 300 BU from incipient
// ones (and <= 800 BU, their band), and no hazard on top of her (water, terrain holes, ant-predator territories). Among the valid cells the
// GDD score 0.5 (good sites within 250 BU, capped 4)/4 + 0.3 shelter + 0.2 (1 - exposure) decides.
// The populate module places a provisional start before rivals and food (placeProvisionalStart); the final
// placer keeps it when it is still valid after the maps are re-derived.

import type { GenContext } from '../kit/context';
import type { PlacerDef } from '../kit/registry';
import { terrainAt, primIndex } from '../kit/surface';
import { qmm } from '../kit/quantize';
import { primEval } from '@/sim/world/primHash';
import { digFactor } from '@/sim/balance';
import { materialFromCode } from '@/sim/types';
import { mapState, type MapState } from './state';
import { walkable } from './nav';
import { forEachWithin, navDistances } from '../validate/graph';
import { SUIT, SUITABILITY } from '../tuning/maps';
import { START, VALID } from '../tuning/pipeline';
import { ANT_PREDATORS, INCIPIENT, START_RULE, TOP_UP, topUpZones } from '../populate/tuning';

const NATURAL = new Set(['forest', 'lawn', 'garden-bed']);
/** The opening's dig-site search keeps this far from primitives (src/sim/testing/e2e findDigSite), BU. */
const DIG_PRIM_CLEAR_BU = 6;

interface Cand { c: number; score: number; good: number }

const centreOf = (ctx: GenContext, c: number) => ({ x: ((c % ctx.dims.navN) + 0.5) * ctx.dims.navCell, z: (Math.floor(c / ctx.dims.navN) + 0.5) * ctx.dims.navCell });

/** True if no solid primitive lies within r of (x, y, z). */
export function clearOfPrims(ctx: GenContext, x: number, y: number, z: number, r: number): boolean {
  const ix = primIndex(ctx);
  const hits: number[] = [];
  ix.query(x - r, z - r, x + r, z + r, hits);
  for (const h of hits) {
    const e = ix.entries[h];
    if (e.minY > y + r || e.maxY < y - r) continue;
    if (primEval(e, x, y, z, null) <= r) return false;
  }
  return true;
}

/** Diggability of the soil at depth d below terrain cell j for the played species (GDD 03 §2.1 factor). */
function digAtDepth(ctx: GenContext, j: number, depthMm: number): number {
  const g = ctx.world.ground;
  const code = depthMm < g.crustMm.data[j] ? g.surface.data[j] : g.subsoil.data[j];
  return digFactor(ctx.params.speciesId, materialFromCode(code));
}

/**
 * 1 per nav cell holding a founding patch: patchCells x patchCells terrain cells around its centre all diggable
 * (>= START_RULE.digMin at 1.5 BU depth), bare ground (no object on top), no primitive within 6 BU of the centre;
 * for wood nesters, diggable wood in the cell.
 */
const patchCache = new WeakMap<MapState, Uint8Array>();

export function digPatchMap(ctx: GenContext): Uint8Array {
  const { navN, cells, cell, sub, bu } = ctx.dims;
  const st = mapState(ctx);
  const hit = patchCache.get(st);
  if (hit) return hit;
  const out = new Uint8Array(navN * navN);
  const half = Math.floor(START_RULE.patchCells / 2), depth = START_RULE.digDepthBu * bu;
  const holes = ctx.world.terrainHoles?.data;
  const wood = SUITABILITY[ctx.params.speciesId].woodNester;
  for (let c = 0; c < out.length; c++) {
    if (!walkable(ctx.world.nav.cls.data[c])) continue;
    const ci = (c % navN) * sub + (sub >> 1), ck = Math.floor(c / navN) * sub + (sub >> 1);
    if (wood) {
      // wood nesters found in wood (GDD 07 Camponotus, directions B): a decayed log or stump in the cell
      out[c] = woodPatch(ctx, st, c) ? 1 : 0;
      continue;
    }
    let ok = true;
    for (let dk = -half; dk <= half && ok; dk++) for (let di = -half; di <= half && ok; di++) {
      const i = ci + di, k = ck + dk;
      if (i < 0 || k < 0 || i >= cells || k >= cells) { ok = false; break; }
      const j = k * cells + i;
      const wt = st.col.walkTop[j];
      ok = !Number.isNaN(wt) && wt - st.col.base[j] <= 1 && !(holes && holes[j]) && digAtDepth(ctx, j, depth) >= START_RULE.digMin;
    }
    if (!ok) continue;
    const x = (ci + 0.5) * cell, z = (ck + 0.5) * cell;
    if (clearOfPrims(ctx, x, terrainAt(ctx, x, z), z, DIG_PRIM_CLEAR_BU * bu)) out[c] = 1;
  }
  patchCache.set(st, out);
  return out;
}

/** A primitive of diggable wood (dig factor >= START_RULE.digMin) under one of the cell's terrain cells. */
function woodPatch(ctx: GenContext, st: MapState, c: number): boolean {
  const { navN, cells, sub } = ctx.dims;
  const i0 = (c % navN) * sub, k0 = Math.floor(c / navN) * sub;
  for (let k = k0; k < Math.min(cells, k0 + sub); k++) for (let i = i0; i < Math.min(cells, i0 + sub); i++) {
    const p = st.col.wood[k * cells + i];
    if (p >= 0 && digFactor(ctx.params.speciesId, ctx.world.prims[p].material) >= START_RULE.digMin) return true;
  }
  return false;
}

/** Hazard and rival clearance of a point (water, holes, ant predators, rival nests). */
function hazardFree(ctx: GenContext, x: number, z: number, withRivals: boolean): boolean {
  const bu = ctx.dims.bu, w = ctx.world;
  const clear = START_RULE.hazardClearBu * bu;
  for (const b of w.waterBodies) if ((b.pos.x - x) ** 2 + (b.pos.z - z) ** 2 < (b.radius + clear) ** 2) return false;
  const holes = w.terrainHoles;
  if (holes) {
    const r = Math.ceil(clear / holes.cell), i0 = Math.floor(x / holes.cell), k0 = Math.floor(z / holes.cell);
    for (let k = Math.max(0, k0 - r); k <= Math.min(holes.nz - 1, k0 + r); k++)
      for (let i = Math.max(0, i0 - r); i <= Math.min(holes.nx - 1, i0 + r); i++) if (holes.data[k * holes.nx + i]) return false;
  }
  for (const t of w.placements.territories) {
    if (ANT_PREDATORS.includes(t.creatureKind) && (t.center.x - x) ** 2 + (t.center.z - z) ** 2 < (t.radiusMm + clear) ** 2) return false;
  }
  if (withRivals) {
    for (const r of w.placements.rivalSites) {
      const min = (r.incipient ? START_RULE.incipientMinBu : VALID.startRivalMinBu) * bu, d2 = (r.origin.x - x) ** 2 + (r.origin.z - z) ** 2;
      if (d2 < min * min || (r.incipient && d2 > (INCIPIENT.maxBu * bu) ** 2)) return false;
    }
  }
  return true;
}

/** A bare terrain point inside nav cell c for the queen (first of its 4 quadrant centres that is clear). */
function standPoint(ctx: GenContext, c: number): { x: number; y: number; z: number } | null {
  const { navN, sub, cell, cells, bu } = ctx.dims;
  const st = mapState(ctx);
  for (const [oi, ok] of [[1, 1], [3, 1], [1, 3], [3, 3]] as const) {
    const i = (c % navN) * sub + Math.floor((oi * sub) / 4), k = Math.floor(c / navN) * sub + Math.floor((ok * sub) / 4);
    if (i >= cells || k >= cells) continue;
    const j = k * cells + i;
    if (Number.isNaN(st.col.walkTop[j]) || st.col.walkTop[j] - st.col.base[j] > 1) continue;
    const x = (i + 0.5) * cell, z = (k + 0.5) * cell, y = terrainAt(ctx, x, z);
    if (clearOfPrims(ctx, x, y, z, 2 * bu)) return { x, y, z };
  }
  return null;
}

/** The map-edge rule of the start (VALID.startEdgeMinBu), for a point. */
function clearOfEdge(ctx: GenContext, x: number, z: number): boolean {
  const edge = VALID.startEdgeMinBu * ctx.dims.bu, L = ctx.dims.size;
  return x >= edge && z >= edge && x <= L - edge && z <= L - edge;
}

function candidates(ctx: GenContext, withRivals: boolean): Cand[] {
  const { navN, navCell, bu } = ctx.dims;
  const st = mapState(ctx);
  const w = ctx.world, lay = ctx.layout;
  const q = st.q[ctx.params.speciesId];
  // summed-area table of good cells for the window pre-filter
  const sat = new Int32Array((navN + 1) * (navN + 1));
  for (let k = 0; k < navN; k++) for (let i = 0; i < navN; i++) {
    sat[(k + 1) * (navN + 1) + i + 1] = (q[k * navN + i] >= SUIT.good ? 1 : 0) + sat[k * (navN + 1) + i + 1] + sat[(k + 1) * (navN + 1) + i] - sat[k * (navN + 1) + i];
  }
  const r = Math.max(1, Math.round((VALID.startRadiusBu * bu) / navCell));
  const out: Cand[] = [];
  for (let c = 0; c < navN * navN; c++) {
    const i = c % navN, k = Math.floor(c / navN);
    const x = (i + 0.5) * navCell, z = (k + 0.5) * navCell;
    // the whole cell clears the edge rule, so the stand point inside it does too
    if (!clearOfEdge(ctx, x - navCell / 2, z - navCell / 2) || !clearOfEdge(ctx, x + navCell / 2, z + navCell / 2)) continue;
    if (!walkable(w.nav.cls.data[c]) || q[c] >= SUIT.good) continue;
    const zone = lay.zones[lay.nav[c]];
    if (zone.built || !NATURAL.has(zone.type)) continue;
    if (st.water.flood[c] > VALID.startFloodMax) continue;
    const i0 = Math.max(0, i - r), i1 = Math.min(navN, i + r + 1), k0 = Math.max(0, k - r), k1 = Math.min(navN, k + r + 1);
    const good = sat[k1 * (navN + 1) + i1] - sat[k0 * (navN + 1) + i1] - sat[k1 * (navN + 1) + i0] + sat[k0 * (navN + 1) + i0];
    if (good < START_RULE.goodMin) continue;
    if (!hazardFree(ctx, x, z, withRivals)) continue;
    const shelter = w.maps.shelter.data[c] / 255, exposure = st.surface.exposure[c];
    out.push({ c, good, score: START.wGood * Math.min(good, START.goodCap) / START.goodCap + START.wShelter * shelter + START.wExposure * (1 - exposure) });
  }
  // ties (the good-site term is capped): more good sites in the window first, then cell index
  return out.sort((a, b) => b.score - a.score || b.good - a.good || a.c - b.c);
}

/** Good-or-better cells within the start radius (walking, queen clearance) of cell c, and the nearest one. */
export function goodNear(ctx: GenContext, c: number): { count: number; nearest: number } {
  const q = mapState(ctx).q[ctx.params.speciesId];
  const d = navDistances(ctx, [c], { maxBu: VALID.startRadiusBu, clearanceBu: VALID.queenClearanceBu });
  let count = 0, nearest = -1;
  for (let j = 0; j < d.length; j++) {
    if (q[j] < SUIT.good || !(d[j] <= VALID.startRadiusBu)) continue;
    count++;
    if (nearest < 0 || d[j] < d[nearest]) nearest = j;
  }
  return { count, nearest };
}

/** Walking distance (BU) from cell c to the nearest founding patch, Infinity beyond START_RULE.digWalkBu. */
export function digPatchWalk(ctx: GenContext, c: number, patches: Uint8Array): number {
  const d = navDistances(ctx, [c], { maxBu: START_RULE.digWalkBu, clearanceBu: VALID.queenClearanceBu });
  let best = Infinity;
  for (let j = 0; j < d.length; j++) if (patches[j] && d[j] < best) best = d[j];
  return best;
}

export interface StartVerdict { ok: boolean; good: number; digWalkBu: number; point: { x: number; y: number; z: number } | null; nearest: number }

/** Checks cell c against the path-distance parts of the rule. */
function verify(ctx: GenContext, c: number, patches: Uint8Array): StartVerdict {
  const g = goodNear(ctx, c);
  const dig = g.count >= START_RULE.goodMin ? digPatchWalk(ctx, c, patches) : Infinity;
  const point = dig <= START_RULE.digWalkBu ? standPoint(ctx, c) : null;
  return { ok: point !== null, good: g.count, digWalkBu: dig, point, nearest: g.nearest };
}

function setStart(ctx: GenContext, v: StartVerdict, c: number): void {
  const { navN, navCell } = ctx.dims;
  const p = v.point ?? { ...centreOf(ctx, c), y: terrainAt(ctx, centreOf(ctx, c).x, centreOf(ctx, c).z) };
  let fx = 1, fz = 0;
  if (v.nearest >= 0) {
    const tx = ((v.nearest % navN) + 0.5) * navCell - p.x, tz = (Math.floor(v.nearest / navN) + 0.5) * navCell - p.z;
    const l = Math.sqrt(tx * tx + tz * tz);
    if (l > 0) { fx = tx / l; fz = tz / l; }
  }
  ctx.world.queenStart = { pos: { x: qmm(p.x), y: qmm(p.y), z: qmm(p.z) }, fwd: { x: Math.round(fx * 1e6) / 1e6, y: 0, z: Math.round(fz * 1e6) / 1e6 } };
}

const provisional = new WeakMap<GenContext, number>();

/**
 * Whether the Tier 1 food set can feed a young colony at cell c (registry C13 floor at 300 BU): its protein comes
 * from carrion and crumb-protein clusters, and carrion alone falls short of the floor, so the colony needs ground
 * where the catalogue places crumbs (lawn, paving, sand...) within the top-up reach. A preference among valid
 * starts, not part of the rule: a deep-forest start would otherwise fail the food check and regenerate the world.
 */
function feedable(ctx: GenContext, c: number): boolean {
  const lay = ctx.layout, cls = ctx.world.nav.cls.data, zones = topUpZones('crumb-starch');
  let ok = false;
  forEachWithin(ctx, c, { maxBu: TOP_UP.maxBu }, (j, d) => {
    if (!ok && d >= TOP_UP.minBu && walkable(cls[j]) && zones.includes(lay.zones[lay.nav[j]].type)) ok = true;
  });
  return ok;
}

/**
 * Picks the start; keeps `prefer` when it still passes. Among the candidates (best score first) the first valid
 * one that is feedable wins, else the first valid one. Returns false (and notes why) if no cell passes.
 */
function pick(ctx: GenContext, withRivals: boolean, prefer: number): boolean {
  const patches = digPatchMap(ctx);
  const list = candidates(ctx, withRivals);
  if (prefer >= 0 && list.some((x) => x.c === prefer)) {
    const v = verify(ctx, prefer, patches);
    if (v.ok) { setStart(ctx, v, prefer); return true; }
  }
  let bestC = -1, best: StartVerdict | null = null, validC = -1, valid: StartVerdict | null = null;
  for (const cand of list.slice(0, START_RULE.candidates)) {
    const v = verify(ctx, cand.c, patches);
    if (v.ok && feedable(ctx, cand.c)) { setStart(ctx, v, cand.c); return true; }
    if (v.ok && !valid) { valid = v; validC = cand.c; }
    if (!best || v.good > best.good || (v.good === best.good && v.digWalkBu < best.digWalkBu)) { best = v; bestC = cand.c; }
  }
  if (valid) {
    ctx.notes.push('start: no valid start has crumb ground within reach; the food guarantees may fail');
    setStart(ctx, valid, validC);
    return true;
  }
  ctx.notes.push(`start: no cell passes the start rule (${list.length} candidates)`);
  if (best) setStart(ctx, best, bestC);
  return false;
}

/** Provisional start (populate, before rivals and food): the rule without rival clearances. */
export function placeProvisionalStart(ctx: GenContext): boolean {
  const ok = pick(ctx, false, -1);
  if (ok) provisional.set(ctx, cellOfStart(ctx));
  return ok;
}

function cellOfStart(ctx: GenContext): number {
  const { navN, navCell } = ctx.dims;
  const p = ctx.world.queenStart.pos;
  return Math.min(navN - 1, Math.floor(p.z / navCell)) * navN + Math.min(navN - 1, Math.floor(p.x / navCell));
}

export function placeStartPose(ctx: GenContext): void {
  pick(ctx, true, provisional.get(ctx) ?? -1);
}

/** Full rule check of the current start (validation v-start / v-found). */
export function checkStartRule(ctx: GenContext): { ok: boolean; detail: string; good: number; onlyContentShort: boolean } {
  const c = cellOfStart(ctx);
  const st = mapState(ctx);
  const q = st.q[ctx.params.speciesId];
  const s = ctx.world.queenStart.pos;
  const zone = ctx.layout.zones[ctx.layout.nav[c]];
  const natural = !zone.built && NATURAL.has(zone.type);
  const notGood = q[c] < SUIT.good;
  const hazard = hazardFree(ctx, s.x, s.z, true);
  const edge = clearOfEdge(ctx, s.x, s.z);
  const dry = st.water.flood[c] <= VALID.startFloodMax;
  const ground = Math.abs(s.y - terrainAt(ctx, s.x, s.z)) <= 1 && clearOfPrims(ctx, s.x, s.y, s.z, 1 * ctx.dims.bu);
  const v = verify(ctx, c, digPatchMap(ctx));
  // place rules; what remains (good sites, a diggable patch nearby) depends on the content the map carries
  const place = natural && notGood && hazard && edge && dry && ground;
  const ok = place && v.good >= START_RULE.goodMin && v.digWalkBu <= START_RULE.digWalkBu;
  return { ok, good: v.good, onlyContentShort: place && !ok, detail: `zone=${zone.type} q=${q[c].toFixed(2)} good=${v.good} dig=${Number.isFinite(v.digWalkBu) ? v.digWalkBu.toFixed(0) : 'none'}BU ground=${ground} hazardFree=${hazard} edge=${edge} flood=${st.water.flood[c].toFixed(2)}` };
}

export const startPlacer: PlacerDef = { id: 'default/start-pose', step: 'start', order: -100, run: placeStartPose };
