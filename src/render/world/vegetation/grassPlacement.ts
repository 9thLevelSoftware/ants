// Grass blade placement per tile (pure, deterministic): the lawn sward (decor-grass) and grass tufts along hard
// edges and in forest clearings (decor-grass-tuft), GDD 04 §9. Blades are generated at full density and thinned at
// draw time by rank (distance LOD), so the records of a tile never depend on the camera or the quality preset.
import { rngFloat, type RngState } from '@/core';
import type { MaterialId } from '@/sim/types';
import { countFor, tileAreaM2, tileRng, type BlockContext } from '../decor/blockContext';
import { BLADE_RANK, BLADE_STRIDE, InstanceBuilder } from '../decor/instances';
import { tileMm, tilesOfBlock } from '../decor/tiles';
import { GRASS, GRASS_TUFT } from '../decor/tuning';

const SOIL_LIKE: ReadonlySet<MaterialId> = new Set(['loam', 'humus', 'sand', 'clay', 'gravel']);
const TUFT_EDGE_ZONES = new Set(['sand', 'rubber', 'pavement', 'asphalt', 'garden-bed']);

const range = (s: RngState, lo: number, hi: number) => lo + (hi - lo) * rngFloat(s);

/** Ground under a root is open (no hole, not under a solid): the blade may grow there. */
function rootOk(ctx: BlockContext, x: number, z: number, h: number): boolean {
  const g = ctx.ground;
  if (g.hole(x, z)) return false;
  return !g.prims.inside(x, h + Math.min(1.5, 0.4 * g.bu), z);
}

function pushBlade(out: InstanceBuilder, s: RngState, x: number, y: number, z: number, rank: number, len: number, width: number, yaw: number, lean: number): void {
  out.push(x, y, z, rank, len, width, yaw, rngFloat(s), lean, range(s, 0.2, 1.1), rngFloat(s) * 2 - 1, Math.floor(rngFloat(s) * GRASS.strips));
}

function sward(out: InstanceBuilder, ctx: BlockContext, tx: number, tz: number): void {
  const g = ctx.ground, t = tileMm(g.bu), s = tileRng(g.seed, 'decor-grass', tx, tz);
  const n = countFor(GRASS.densityMown * tileAreaM2(g.bu), rngFloat(s));
  for (let i = 0; i < n; i++) {
    const x = (tx + rngFloat(s)) * t, z = (tz + rngFloat(s)) * t, u = rngFloat(s), lenU = rngFloat(s);
    const yaw = rngFloat(s) * Math.PI * 2, width = range(s, GRASS.widthMm[0], GRASS.widthMm[1]), lean = range(s, 0.05, 0.4), rank = rngFloat(s);
    if (x >= g.world.size || z >= g.world.size) continue;
    const zone = g.zone(x, z);
    if (zone.type !== 'lawn') continue;
    const rough = zone.variant === 'rough';
    if (rough && u >= GRASS.densityRough / GRASS.densityMown) continue;
    const h = g.height(x, z);
    if (!rootOk(ctx, x, z, h)) continue;
    const len = rough
      ? GRASS.roughLenMm[0] + (GRASS.roughLenMm[1] - GRASS.roughLenMm[0]) * lenU
      : g.swardMm(x, z, GRASS.mownDefaultMm) * (GRASS.mownLenK[0] + (GRASS.mownLenK[1] - GRASS.mownLenK[0]) * lenU);
    pushBlade(out, s, x, h - GRASS.rootSinkMm, z, rank, len, width, yaw, lean);
  }
}

function tufts(out: InstanceBuilder, ctx: BlockContext, tx: number, tz: number): void {
  const g = ctx.ground, t = tileMm(g.bu), s = tileRng(g.seed, 'decor-grass-tuft', tx, tz);
  const n = countFor(GRASS_TUFT.densityEdge * tileAreaM2(g.bu), rngFloat(s));
  for (let i = 0; i < n; i++) {
    const x = (tx + rngFloat(s)) * t, z = (tz + rngFloat(s)) * t, u = rngFloat(s), rank = rngFloat(s);
    const blades = Math.floor(range(s, GRASS_TUFT.blades[0], GRASS_TUFT.blades[1] + 1));
    const base = range(s, GRASS_TUFT.lenMm[0], GRASS_TUFT.lenMm[1]);
    if (x >= g.world.size || z >= g.world.size) continue;
    const zone = g.zone(x, z);
    let p = 0;
    if (TUFT_EDGE_ZONES.has(zone.type)) p = g.zoneEdgeMm(x, z) < GRASS_TUFT.bandMm ? 1 : 0;
    else if (zone.type === 'forest') p = g.map01('shade', x, z) < 0.35 ? GRASS_TUFT.densityClearing / GRASS_TUFT.densityEdge : 0;
    if (u >= p || !SOIL_LIKE.has(g.surface(x, z))) continue;
    const h = g.height(x, z);
    if (!rootOk(ctx, x, z, h)) continue;
    for (let b = 0; b < blades; b++) {
      const a = rngFloat(s) * Math.PI * 2, r = GRASS_TUFT.radiusMm * Math.sqrt(rngFloat(s));
      const bx = x + Math.cos(a) * r, bz = z + Math.sin(a) * r, bh = g.height(bx, bz);
      const len = base * range(s, 0.6, 1.05), width = range(s, 1.5, 4), yaw = Math.PI / 2 - a + range(s, -0.4, 0.4), lean = range(s, 0.3, 0.75);
      if (!rootOk(ctx, bx, bz, bh)) continue; // a tuft in a joint keeps only the blades in the gap
      // blades of a tuft fan outward from its centre
      pushBlade(out, s, bx, bh - GRASS.rootSinkMm, bz, rank, len, width, yaw, lean);
    }
  }
}

/** All blades of a block, sorted by rank. */
export function placeGrass(ctx: BlockContext): Float32Array {
  const out = new InstanceBuilder(BLADE_STRIDE, 4096);
  for (const { tx, tz } of tilesOfBlock(ctx.block)) { sward(out, ctx, tx, tz); tufts(out, ctx, tx, tz); }
  return out.sorted(BLADE_RANK);
}
