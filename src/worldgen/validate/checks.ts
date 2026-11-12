// Validation checks (GDD 04 §4.3). Checks about content that is not generated yet (no placer provides it) report
// 'n/a' and count as passed. Counts scale with the size class (compact x0.75, large x1.25, rounded).

import type { FoodKind, WorldgenCheck } from '@/sim/types';
import { HUMAN_EVENT_KINDS } from '@/sim/types';
import { heightAt } from '@/sim/world/terrainSample';
import { primEval } from '@/sim/world/primHash';
import type { GenContext } from '../kit/context';
import { primIndex } from '../kit/surface';
import { mapState } from '../maps/state';
import { walkable } from '../maps/nav';
import { cellAt, navDistances } from './graph';
import { evaluateMicro, usefulInteriorAccess } from './micro';
import { SUIT, SUITABILITY } from '../tuning/maps';
import { LANE_ZONES, MICRO, SIZE_SCALE, VALID } from '../tuning/pipeline';

export type CheckStatus = 'pass' | 'fail' | 'n/a';
export interface CheckResult {
  id: WorldgenCheck;
  status: CheckStatus;
  detail: string;
  /** false: regenerating cannot fix this failure (missing content); the pipeline repairs the attempt at once. */
  regenerate?: boolean;
}

/**
 * A wood-nesting species founds in wood primitives (logs, stumps) that only the catalogue places: with no prop
 * placer registered there is no founding site on any attempt, so the failure goes straight to repair R2.
 */
function contentLimited(ctx: GenContext, good: number): boolean {
  return good === 0 && SUITABILITY[ctx.params.speciesId].woodNester && !ctx.provides.has('props');
}

const CARB_RENEWABLE: readonly FoodKind[] = ['honeydew', 'nectar', 'sugar', 'crumb', 'fruit'];
const PROTEIN: readonly FoodKind[] = ['carrion', 'prey', 'pet-food'];

const scaled = (ctx: GenContext, n: number) => Math.max(1, Math.round(n * SIZE_SCALE[ctx.params.sizeClass]));
const ok = (id: WorldgenCheck, pass: boolean, detail: string): CheckResult => ({ id, status: pass ? 'pass' : 'fail', detail });
const na = (id: WorldgenCheck, why: string): CheckResult => ({ id, status: 'n/a', detail: why });

function startCell(ctx: GenContext): number {
  return cellAt(ctx, ctx.world.queenStart.pos.x, ctx.world.queenStart.pos.z);
}

export function checkFound(ctx: GenContext): CheckResult {
  const q = mapState(ctx).q[ctx.params.speciesId];
  const { navN, navCell, bu } = ctx.dims;
  const good: number[] = [];
  for (let c = 0; c < q.length; c++) if (q[c] >= SUIT.good) good.push(c);
  const need = scaled(ctx, VALID.foundGoodMin);
  // two good sites at least the cluster separation apart (farthest pair from the first good cell, then back)
  const far = (from: number) => {
    let best = from, bd = -1;
    for (const c of good) {
      const dx = (c % navN) - (from % navN), dz = Math.floor(c / navN) - Math.floor(from / navN), d = dx * dx + dz * dz;
      if (d > bd) { bd = d; best = c; }
    }
    return { best, d: Math.sqrt(bd) * (navCell / bu) };
  };
  const sep = good.length > 0 ? far(far(good[0]).best).d : 0;
  const d = navDistances(ctx, [startCell(ctx)], { maxBu: VALID.startRadiusBu });
  const nearStart = good.filter((c) => d[c] <= VALID.startRadiusBu).length;
  const pass = good.length >= need && sep >= VALID.foundClusterSepBu && nearStart >= VALID.startGoodMin;
  const r = ok('v-found', pass, `good=${good.length}/${need} spread=${sep.toFixed(0)}BU nearStart=${nearStart}`);
  if (!pass && contentLimited(ctx, good.length)) r.regenerate = false;
  return r;
}

export function checkConnect(ctx: GenContext): CheckResult {
  const cls = ctx.world.nav.cls.data;
  const lay = ctx.layout;
  const q = mapState(ctx).q[ctx.params.speciesId];
  const start = startCell(ctx);
  const d = navDistances(ctx, [start]);
  let walk = 0, reach = 0;
  const zoneWalk = new Uint8Array(lay.zones.length), zoneReach = new Uint8Array(lay.zones.length);
  for (let c = 0; c < cls.length; c++) {
    if (!walkable(cls[c])) continue;
    walk++;
    zoneWalk[lay.nav[c]] = 1;
    if (d[c] < Infinity) { reach++; zoneReach[lay.nav[c]] = 1; }
  }
  const share = walk > 0 ? reach / walk : 0;
  const missing = lay.zones.filter((z) => zoneWalk[z.id] && !zoneReach[z.id]).map((z) => `${z.type}/${z.variant}`);
  const dq = navDistances(ctx, [start], { clearanceBu: VALID.queenClearanceBu });
  let queenGood = 0;
  for (let c = 0; c < q.length && queenGood < VALID.queenGoodMin; c++) if (q[c] >= SUIT.good && dq[c] < Infinity) queenGood++;
  const pass = share >= VALID.connectShare && missing.length === 0 && queenGood >= VALID.queenGoodMin;
  const r = ok('v-connect', pass, `reach=${(share * 100).toFixed(1)}% missing=[${missing.join(',')}] queenGood=${queenGood}`);
  let good = 0;
  for (let c = 0; c < q.length; c++) if (q[c] >= SUIT.good) good++;
  if (!pass && share >= VALID.connectShare && missing.length === 0 && contentLimited(ctx, good)) r.regenerate = false;
  return r;
}

export function checkFood(ctx: GenContext): CheckResult {
  if (!ctx.provides.has('food')) return na('v-food', 'no food placer yet');
  const d = navDistances(ctx, [startCell(ctx)], { maxBu: VALID.foodKindRadiusBu });
  const at = (p: { x: number; z: number }) => d[cellAt(ctx, p.x, p.z)];
  const anchors = ctx.world.placements.foodAnchors;
  const near = anchors.filter((a) => at(a.pos) <= VALID.foodRadiusBu).length;
  const carb = anchors.some((a) => CARB_RENEWABLE.includes(a.kind) && at(a.pos) <= VALID.foodKindRadiusBu);
  const prot = anchors.some((a) => PROTEIN.includes(a.kind) && at(a.pos) <= VALID.foodKindRadiusBu);
  return ok('v-food', near >= VALID.foodMin && carb && prot, `near=${near} carb=${carb} protein=${prot}`);
}

export function checkMicro(ctx: GenContext): CheckResult {
  if (!ctx.provides.has('micro')) return na('v-micro', 'no micro-connection placer yet');
  const useful = evaluateMicro(ctx);
  const need = MICRO.usefulMin[ctx.params.sizeClass];
  const kitchen = ctx.layout.house?.kitchen ? usefulInteriorAccess(ctx) : 1;
  return ok('v-micro', useful >= need && kitchen >= 1, `useful=${useful}/${need} interior=${kitchen}`);
}

export function checkRivals(ctx: GenContext): CheckResult {
  if (!ctx.provides.has('rivals')) return na('v-rivals', 'no rival placer yet');
  const { size: L, bu } = ctx.dims;
  const est = ctx.world.placements.rivalSites.filter((r) => !r.incipient);
  const s = ctx.world.queenStart.pos;
  let spaced = true;
  for (let i = 0; i < est.length; i++) {
    const o = est[i].origin;
    if (Math.sqrt((o.x - s.x) ** 2 + (o.z - s.z) ** 2) < VALID.startRivalMinBu * bu) spaced = false;
    for (let j = i + 1; j < est.length; j++) {
      const p = est[j].origin;
      if (Math.sqrt((o.x - p.x) ** 2 + (o.z - p.z) ** 2) < VALID.rivalSpacingBu * bu) spaced = false;
    }
  }
  const edgeOk = est.every((r) => Math.min(r.origin.x, r.origin.z, L - r.origin.x, L - r.origin.z) >= VALID.rivalEdgeMinBu * bu || r.species === 'formica-rufa');
  const countOk = ctx.params.rivalCount >= 1 ? est.length >= 1 && est.length <= ctx.params.rivalCount : est.length === 0;
  return ok('v-rivals', countOk && spaced && edgeOk,
    `placed=${est.length}/${ctx.params.rivalCount} spaced=${spaced} edge=${edgeOk}`);
}

export function checkRest(ctx: GenContext): CheckResult {
  if (!ctx.provides.has('props')) return na('v-rest', 'no prop placer yet');
  const bad = restViolations(ctx);
  return ok('v-rest', bad.length === 0, `violations=${bad.length}`);
}

/** Objects tagged 'prop' whose lowest point floats more than 1 mm above the surface below it. */
export function restViolations(ctx: GenContext): number[] {
  const ix = primIndex(ctx);
  const out: number[] = [];
  for (const ob of ctx.world.objects) {
    if (!ob.tags.includes('prop')) continue;
    let low = Infinity, lx = 0, lz = 0;
    for (let i = ob.primStart; i < ob.primStart + ob.primCount; i++) {
      const e = ix.entries[i];
      if (e.minY < low) { low = e.minY; lx = (e.minX + e.maxX) / 2; lz = (e.minZ + e.maxZ) / 2; }
    }
    if (low - heightAt(ctx.world.terrain, lx, lz) > 1 && !supported(ctx, ob.id, lx, low, lz)) out.push(ob.id);
  }
  return out;
}

function supported(ctx: GenContext, objectId: number, x: number, y: number, z: number): boolean {
  const ix = primIndex(ctx);
  const hits: number[] = [];
  ix.query(x - 1, z - 1, x + 1, z + 1, hits);
  return hits.some((i) => ix.entries[i].prim.objectId !== objectId && primEval(ix.entries[i], x, y - 1, z, null) <= 0);
}

export function checkBudget(ctx: GenContext): CheckResult {
  const b = ctx.budget, w = ctx.world;
  const over: string[] = [];
  if (w.prims.length > b.limit.primTotal) over.push(`prims ${w.prims.length}`);
  if (b.chunks.size > b.limit.precarveChunks) over.push(`chunks ${b.chunks.size}`);
  if (w.climbRoutes.length > b.limit.climbRoutes) over.push(`routes ${w.climbRoutes.length}`);
  for (const k of ['props', 'plants', 'trees'] as const) if (b.used[k] > b.limit[k]) over.push(`${k} ${b.used[k]}`);
  return ok('v-budget', over.length === 0, `prims=${w.prims.length} chunks=${b.chunks.size} routes=${w.climbRoutes.length}${over.length ? ' over: ' + over.join(',') : ''}`);
}

export function checkStart(ctx: GenContext): CheckResult {
  const st = mapState(ctx);
  const s = ctx.world.queenStart.pos;
  const c = cellAt(ctx, s.x, s.z);
  const zone = ctx.layout.zones[ctx.layout.nav[c]].type;
  const flood = st.water.flood[c];
  const bu = ctx.dims.bu;
  const rivalOk = ctx.world.placements.rivalSites.filter((r) => !r.incipient)
    .every((r) => Math.sqrt((r.origin.x - s.x) ** 2 + (r.origin.z - s.z) ** 2) >= VALID.startRivalMinBu * bu);
  const pass = flood <= VALID.startFloodMax && zone !== 'asphalt' && zone !== 'interior' && rivalOk && walkable(ctx.world.nav.cls.data[c]);
  return ok('v-start', pass, `zone=${zone} flood=${flood.toFixed(2)} rivals=${rivalOk}`);
}

/** Never fails: lists the human event kinds without an eligible zone in meta.disabledEvents. */
export function checkLanes(ctx: GenContext): CheckResult {
  if (ctx.params.humanActivity === 'off') { ctx.world.meta.disabledEvents = []; return na('v-lanes', 'human activity off'); }
  const present = new Set<string>();
  for (const z of ctx.layout.zones) { present.add(z.type); present.add(`${z.type}/${z.variant}`); }
  const disabled = HUMAN_EVENT_KINDS.filter((k) => !(LANE_ZONES[k] ?? []).some((z) => present.has(z)));
  ctx.world.meta.disabledEvents = [...disabled];
  return { id: 'v-lanes', status: 'pass', detail: `disabled=[${disabled.join(',')}]` };
}

export function checkEnclose(ctx: GenContext): CheckResult {
  const holes = ctx.world.terrainHoles;
  if (!holes || !holes.data.some((v) => v !== 0)) return na('v-enclose', 'no terrain holes');
  const ix = primIndex(ctx);
  const hits: number[] = [];
  let open = 0;
  for (let k = 0; k < holes.nz; k++) for (let i = 0; i < holes.nx; i++) {
    if (!holes.data[k * holes.nx + i]) continue;
    const x = (i + 0.5) * holes.cell, z = (k + 0.5) * holes.cell, top = heightAt(ctx.world.terrain, x, z);
    ix.query(x, z, x, z, hits);
    const base = hits.some((h) => {
      const e = ix.entries[h];
      for (let y = top; y >= top - VALID.holeProbeMaxMm; y -= ctx.dims.bu) if (primEval(e, x, y, z, null) <= 0) return true;
      return false;
    });
    if (!base) open++;
  }
  return ok('v-enclose', open === 0, `open hole cells=${open}`);
}

export function runChecks(ctx: GenContext): CheckResult[] {
  return [
    checkFound(ctx), checkConnect(ctx), checkFood(ctx), checkMicro(ctx), checkRivals(ctx), checkRest(ctx), checkBudget(ctx),
    checkStart(ctx), checkLanes(ctx), checkEnclose(ctx),
  ];
}
