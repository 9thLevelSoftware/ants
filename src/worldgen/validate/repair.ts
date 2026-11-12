// Built-in repairs (GDD 04 §4.3), applied to the best attempt after the last regeneration failed:
// R2 founding sites (loam strata + a flat stone, or a decayed log for Camponotus, near the start and at a second
// cluster), R3 baseline food anchors near the start, R4 a 1.5 BU channel under the barrier that cuts a zone off,
// R5 rival sites moved to the farthest valid cells. R1 (open closed sockets) belongs to the micro-connection
// module and arrives as a module repair.

import { PrimFlag } from '@/sim/types';
import type { GenContext } from '../kit/context';
import type { RepairDef } from '../kit/registry';
import type { ObjectTemplate } from '../kit/template';
import { placeObject } from '../kit/template';
import { paintGround } from '../kit/terrainEdit';
import { supportAt } from '../kit/surface';
import { mapState } from '../maps/state';
import { walkable } from '../maps/nav';
import { cellAt, navDistances } from './graph';
import { REPAIR, VALID } from '../tuning/pipeline';
import { carveChannel } from '../populate/channel';
import { placeAnchor } from '../populate/food';
import { finalizeFood } from '../populate/finalize';
import { placeRivals } from '../populate/rivals';

const centre = (ctx: GenContext, c: number) => ({ x: ((c % ctx.dims.navN) + 0.5) * ctx.dims.navCell, z: (Math.floor(c / ctx.dims.navN) + 0.5) * ctx.dims.navCell });

/** Outdoor soil cells (no hard crust, not interior) by distance band from the start, best Q first. */
function soilCells(ctx: GenContext, d: Float64Array, lo: number, hi: number): number[] {
  const st = mapState(ctx), q = st.q[ctx.params.speciesId];
  const lay = ctx.layout, cls = ctx.world.nav.cls.data;
  const out: number[] = [];
  for (let c = 0; c < d.length; c++) {
    if (!(d[c] >= lo && d[c] <= hi) || !walkable(cls[c])) continue;
    const z = lay.zones[lay.nav[c]];
    if (z.built) continue;
    if (st.water.flood[c] > VALID.startFloodMax) continue;
    out.push(c);
  }
  return out.sort((a, b) => q[b] - q[a] || a - b);
}

function coverTemplate(ctx: GenContext): ObjectTemplate {
  if (ctx.params.speciesId === 'camponotus-pennsylvanicus') {
    const [dia, len] = REPAIR.r2LogSize;
    return { id: 'repair-log', tags: ['repair', 'prop'], prims: [{ shape: 'cylinder', pos: { x: 0, y: dia / 2, z: 0 }, rot: { x: 0, y: 0, z: 0.7071068, w: 0.7071068 }, size: { x: dia / 2, y: len / 2, z: 0 }, material: 'wood-decayed', flags: PrimFlag.CLIMBABLE | PrimFlag.DIGGABLE | PrimFlag.SHELTER }] };
  }
  const [sx, sy, sz] = REPAIR.r2StoneSize;
  return { id: 'repair-stone', tags: ['repair', 'prop'], prims: [{ shape: 'ellipsoid', pos: { x: 0, y: sy / 2, z: 0 }, size: { x: sx / 2, y: sy / 2, z: sz / 2 }, material: 'stone', flags: PrimFlag.CLIMBABLE | PrimFlag.SHELTER }] };
}

/** R2: founding sites near the start and at a second cluster 320-700 BU away. */
export function repairFoundingSites(ctx: GenContext): boolean {
  const s = ctx.world.queenStart.pos;
  const d = navDistances(ctx, [cellAt(ctx, s.x, s.z)]);
  const tpl = coverTemplate(ctx);
  const embed = ctx.params.speciesId === 'camponotus-pennsylvanicus' ? REPAIR.r2LogSize[0] * REPAIR.r2LogEmbed : REPAIR.r2StoneSize[1] * REPAIR.r2StoneEmbed;
  const sep = 3 * ctx.dims.navCell;
  const picked: { x: number; z: number }[] = [];
  const place = (cands: number[], n: number) => {
    let placed = 0;
    for (const c of cands) {
      if (placed >= n) break;
      const p = centre(ctx, c);
      if (picked.some((o) => Math.abs(o.x - p.x) < sep && Math.abs(o.z - p.z) < sep)) continue;
      const half = ctx.dims.navCell;
      paintGround(ctx, { x0: p.x - half, z0: p.z - half, x1: p.x + half, z1: p.z + half }, { surface: 'loam', crustMm: 0, subsoil: 'loam' });
      if (placeObject(ctx, tpl, { x: p.x, z: p.z, embed, tilt: false, category: 'props' }) >= 0) { picked.push(p); placed++; }
    }
    return placed;
  };
  const bu = ctx.dims.bu;
  const near = place(soilCells(ctx, d, 2 * ctx.dims.navCell / bu, VALID.startRadiusBu * 0.8), REPAIR.r2Near);
  const far = place(soilCells(ctx, d, REPAIR.r2FarMinBu, REPAIR.r2FarMaxBu), REPAIR.r2Far);
  return near + far > 0;
}

/**
 * R3: food near the start. The populate guarantees (finalizeFood) already add the cheapest natural food where the
 * chapter's distances fall short; the repair adds a sugar patch, a protein crumb cluster and a starch crumb
 * cluster within 400 BU of the start on top, then runs those guarantees again.
 */
export function repairFood(ctx: GenContext): boolean {
  const s = ctx.world.queenStart.pos;
  const d = navDistances(ctx, [cellAt(ctx, s.x, s.z)], { maxBu: REPAIR.r3RadiusBu });
  const cands: number[] = [];
  for (let c = 0; c < d.length; c++) if (d[c] >= REPAIR.r3MinBu && d[c] <= REPAIR.r3RadiusBu && ctx.layout.zones[ctx.layout.nav[c]].type !== 'interior') cands.push(c);
  if (cands.length === 0) return false;
  const before = ctx.world.placements.foodAnchors.length;
  const variants = [['sugar-granules', 'sugar'], ['crumb-protein', 'crumb'], ['crumb-starch', 'crumb']] as const;
  variants.forEach(([variant, kind], i) => {
    const c = cands[Math.floor(((i + 0.5) * cands.length) / variants.length)];
    const p = centre(ctx, c);
    placeAnchor(ctx, variant, kind, { x: p.x, y: supportAt(ctx, p.x, p.z), z: p.z }, -1, 'full repair');
  });
  finalizeFood(ctx);
  return ctx.world.placements.foodAnchors.length > before;
}

/** R4: for each zone with walkable but unreachable cells, a carved channel and portal under the barrier. */
export function repairConnect(ctx: GenContext): boolean {
  const { navN } = ctx.dims;
  const s = ctx.world.queenStart.pos;
  const cls = ctx.world.nav.cls.data;
  let changed = false;
  for (let round = 0; round < 8; round++) {
    const d = navDistances(ctx, [cellAt(ctx, s.x, s.z)]);
    // nearest unreachable walkable cell to the reached set, across at most r4MaxCells of barrier
    let best: { a: number; b: number; len: number } | null = null;
    for (let c = 0; c < d.length && !best; c++) {
      if (!walkable(cls[c]) || d[c] < Infinity) continue;
      const ci = c % navN, ck = Math.floor(c / navN);
      for (let r = 1; r <= REPAIR.r4MaxCells && !best; r++) {
        for (const [di, dk] of [[r, 0], [-r, 0], [0, r], [0, -r]] as const) {
          const x = ci + di, z = ck + dk;
          if (x < 0 || z < 0 || x >= navN || z >= navN) continue;
          const j = z * navN + x;
          if (walkable(cls[j]) && d[j] < Infinity) { best = { a: j, b: c, len: r }; break; }
        }
      }
    }
    if (!best) break;
    if (!carveChannel(ctx, { a: best.a, b: best.b, kind: 'root-channel', reason: 'repair R4', radiusBu: REPAIR.r4RadiusBu, depthBu: REPAIR.r4DepthBu })) break;
    changed = true;
  }
  return changed;
}

/**
 * R5: rival sites placed again against the current start with the full rules (spacing, start distance, edge),
 * relaxing the top-suitability share down to every valid cell (populate/rivals.ts).
 */
export function repairRivals(ctx: GenContext): boolean {
  const before = JSON.stringify(ctx.world.placements.rivalSites);
  ctx.world.placements.rivalSites = [];
  placeRivals(ctx);
  return JSON.stringify(ctx.world.placements.rivalSites) !== before;
}

export const BUILTIN_REPAIRS: RepairDef[] = [
  { id: 'R2', check: 'v-found', run: repairFoundingSites },
  { id: 'R3', check: 'v-food', run: repairFood },
  { id: 'R4', check: 'v-connect', run: repairConnect },
  { id: 'R5', check: 'v-rivals', run: repairRivals },
  { id: 'R5', check: 'v-start', run: repairRivals },
];
