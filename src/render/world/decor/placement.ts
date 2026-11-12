// Draped decor placement per tile (pure, deterministic): fallen leaves, needles, petals, litter, grit, fine mulch
// and pebbles, moss in paving joints (GDD 04 §9). Every layer has its own RNG stream per tile, so a layer never
// shifts another and a tile looks the same on every visit. Seasonal density is NOT decided here: items are placed
// at the largest seasonal density and thinned at draw time by their rank.
import { rngFloat, type RngState } from '@/core';
import type { MaterialId } from '@/sim/types';
import { countFor, nearestObjectMm, tileAreaM2, tileRng, type BlockContext } from './blockContext';
import { DRAPED_KIND, DRAPED_STRIDE, InstanceBuilder, NO_FIXED_Y, type DrapedKind } from './instances';
import { LEAF_MAX_DENSITY } from './season';
import { tileMm, tilesOfBlock } from './tiles';
import { GRIT, LEAF, LITTER, MOSS, MULCH_FINE, NEEDLE, PEBBLE_FINE, PETAL } from './tuning';

const SOIL_LIKE: ReadonlySet<MaterialId> = new Set(['loam', 'humus', 'sand', 'clay', 'gravel']);

const range = (s: RngState, lo: number, hi: number) => lo + (hi - lo) * rngFloat(s);

interface Item {
  kind: DrapedKind;
  x: number;
  z: number;
  length: number;
  width: number;
  curl: number;
}

/** Where an item rests: on the terrain (fixedY = NO_FIXED_Y) or on a flat primitive top; null = nowhere. */
function restingY(ctx: BlockContext, it: Item, yaw: number): number | null {
  const g = ctx.ground;
  if (g.hole(it.x, it.z)) return null;
  const h = g.height(it.x, it.z);
  const probe = Math.min(1.5, 0.4 * g.bu);
  if (!g.prims.inside(it.x, h + probe, it.z)) return NO_FIXED_Y;
  // covered: lie on the solid's top if it is flat under the whole item (slabs), else skip
  const top = g.prims.topAt(it.x, it.z, h - 1, h + 400);
  if (!top || top.prim.shape !== 'box') return null;
  const c = Math.cos(yaw), s = Math.sin(yaw), hl = it.length / 2, hw = it.width / 2;
  for (const [u, v] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const x = it.x + c * u * hl - s * v * hw, z = it.z + s * u * hl + c * v * hw;
    const t = g.prims.topAt(x, z, top.y - 2, top.y + 2);
    if (!t || Math.abs(t.y - top.y) > 0.6) return null;
  }
  return top.y;
}

function emit(out: InstanceBuilder, ctx: BlockContext, s: RngState, it: Item): void {
  const yaw = range(s, 0, Math.PI * 2), rank = rngFloat(s), rndA = rngFloat(s), rndB = rngFloat(s), order = Math.floor(rngFloat(s) * 4);
  const y = restingY(ctx, it, yaw);
  if (y === null) return;
  out.push(it.x, it.z, yaw, rank, it.length, it.width, it.curl, y, DRAPED_KIND[it.kind], rndA, rndB, order);
}

type Layer = (out: InstanceBuilder, ctx: BlockContext, tx: number, tz: number) => void;

/** Shared loop: `expected` candidates per tile, each accepted with probability `accept(x, z)` (0..1). */
function scatter(layer: string, perM2: number, accept: (ctx: BlockContext, x: number, z: number) => number, make: (s: RngState, x: number, z: number) => Item): Layer {
  return (out, ctx, tx, tz) => {
    const g = ctx.ground, t = tileMm(g.bu), s = tileRng(g.seed, layer, tx, tz);
    const n = countFor(perM2 * tileAreaM2(g.bu), rngFloat(s));
    for (let i = 0; i < n; i++) {
      const x = (tx + rngFloat(s)) * t, z = (tz + rngFloat(s)) * t, u = rngFloat(s);
      const it = make(s, x, z); // always consumes the same draws, accepted or not
      if (x >= g.world.size || z >= g.world.size || u >= accept(ctx, x, z)) continue;
      emit(out, ctx, s, it);
    }
  };
}

const leafShare = (ctx: BlockContext, x: number, z: number): number => {
  const zone = ctx.ground.zone(x, z);
  if (zone.type === 'forest') return zone.variant === 'pine-hardwood' ? 0.5 : 1;
  if (zone.type !== 'lawn' && zone.type !== 'pavement' && zone.type !== 'garden-bed') return 0;
  const fringe = Math.max(0, 1 - nearestObjectMm(ctx.trees, x, z) / LEAF.fringeMm);
  return Math.max(fringe, ctx.ground.map01('litter', x, z));
};

const leaves = scatter('decor-leaf', LEAF_MAX_DENSITY, leafShare, (s, x, z) => {
  const small = rngFloat(s) < LEAF.smallShare;
  const length = small ? range(s, LEAF.smallLengthMm[0], LEAF.smallLengthMm[1]) : range(s, LEAF.lengthMm[0], LEAF.lengthMm[1]);
  return { kind: small ? 'smallLeaf' : 'leaf', x, z, length, width: length * range(s, LEAF.aspect[0], LEAF.aspect[1]), curl: range(s, LEAF.curl[0], LEAF.curl[1]) };
});

const needles = scatter('decor-needle', NEEDLE.density, (ctx, x, z) => {
  const zone = ctx.ground.zone(x, z);
  return zone.type === 'forest' && zone.variant === 'pine-hardwood' ? 1 : 0;
}, (s, x, z) => ({ kind: 'needle', x, z, length: range(s, NEEDLE.lengthMm[0], NEEDLE.lengthMm[1]), width: NEEDLE.widthMm, curl: 0 }));

const petals = scatter('decor-petal', PETAL.density, (ctx, x, z) => {
  const d = nearestObjectMm(ctx.flowering, x, z);
  return d < PETAL.radiusMm ? 1 - 0.5 * (d / PETAL.radiusMm) : 0;
}, (s, x, z) => {
  const size = range(s, PETAL.sizeMm[0], PETAL.sizeMm[1]);
  return { kind: 'petal', x, z, length: size, width: size * range(s, 0.6, 0.85), curl: range(s, 0.3, 1) };
});

const LITTER_ZONES = new Set(['pavement', 'asphalt', 'sand', 'rubber']);
const litter = scatter('decor-litter', LITTER.binDensity, (ctx, x, z) => {
  if (!LITTER_ZONES.has(ctx.ground.zone(x, z).type)) return 0;
  return nearestObjectMm(ctx.bins, x, z) < LITTER.binRadiusMm ? 1 : LITTER.density / LITTER.binDensity;
}, (s, x, z) => {
  const receipt = rngFloat(s) < LITTER.receiptShare, length = range(s, LITTER.sizeMm[0], LITTER.sizeMm[1]);
  return { kind: receipt ? 'receipt' : 'wrapper', x, z, length, width: length * (receipt ? range(s, 0.35, 0.5) : range(s, 0.5, 0.9)), curl: range(s, 0.2, 1) };
});

const grit = scatter('decor-grit', GRIT.density, (ctx, x, z) => {
  const g = ctx.ground, zone = g.zone(x, z);
  if (zone.variant === 'gravel') return 1;
  if (zone.type !== 'asphalt' && zone.type !== 'sand') return 0;
  return g.zoneEdgeMm(x, z) < GRIT.edgeBandMm ? 1 : 0;
}, (s, x, z) => ({ kind: 'grit', x, z, length: 0, width: 0, curl: rngFloat(s) }));

const mulch = scatter('decor-mulch-fine', MULCH_FINE.density, (ctx, x, z) => {
  const zone = ctx.ground.zone(x, z);
  if (zone.type === 'forest') return 0.5;
  return zone.type === 'garden-bed' && ctx.ground.map01('litter', x, z) > 0.2 ? 1 : 0;
}, (s, x, z) => {
  const length = range(s, MULCH_FINE.sizeMm[0], MULCH_FINE.sizeMm[1]);
  return { kind: 'chip', x, z, length, width: length * range(s, 0.3, 0.6), curl: rngFloat(s) };
});

const pebbles = scatter('decor-pebble-fine', PEBBLE_FINE.density, (ctx, x, z) => {
  const t = ctx.ground.zone(x, z).type;
  return t === 'forest' || t === 'garden-bed' ? 1 : 0;
}, (s, x, z) => ({ kind: 'pebble', x, z, length: 0, width: 0, curl: rngFloat(s) }));

const jointMoss = scatter('decor-moss-lichen', MOSS.jointCandidates, (ctx, x, z) => {
  const g = ctx.ground;
  if (g.zone(x, z).type !== 'pavement' || !SOIL_LIKE.has(g.surface(x, z))) return 0;
  if (g.prims.inside(x, g.height(x, z) + Math.min(1.5, 0.4 * g.bu), z)) return 0; // under a slab: not a joint
  return g.map01('shade', x, z) >= MOSS.minShade ? 1 : MOSS.jointSunShare;
}, (s, x, z) => {
  const size = range(s, MOSS.jointSizeMm[0], MOSS.jointSizeMm[1]);
  return { kind: 'moss', x, z, length: size, width: size * range(s, 0.6, 1), curl: 0 };
});

/** Grit and pebble sizes scale with the body unit (sub-threshold grains, GDD 04 §9); applied after placement. */
function sizeGrains(rec: Float32Array, bu: number): void {
  for (let i = 0; i < rec.length; i += DRAPED_STRIDE) {
    const k = rec[i + 8], u = rec[i + 6];
    if (k === DRAPED_KIND.grit) { const d = (GRIT.sizeBU[0] + (GRIT.sizeBU[1] - GRIT.sizeBU[0]) * u * u) * bu; rec[i + 4] = d; rec[i + 5] = d * 0.8; rec[i + 6] = 0; }
    if (k === DRAPED_KIND.pebble) { const d = (PEBBLE_FINE.sizeBU[0] + (PEBBLE_FINE.sizeBU[1] - PEBBLE_FINE.sizeBU[0]) * u) * bu; rec[i + 4] = d; rec[i + 5] = d * 0.75; rec[i + 6] = 0; }
  }
}

export const DRAPED_LAYERS: Record<string, Layer> = { leaves, needles, petals, litter, grit, mulch, pebbles, jointMoss };

/** All draped items of a block, sorted by rank. */
export function placeDraped(ctx: BlockContext): Float32Array {
  const out = new InstanceBuilder(DRAPED_STRIDE, 1024);
  for (const { tx, tz } of tilesOfBlock(ctx.block)) for (const layer of Object.values(DRAPED_LAYERS)) layer(out, ctx, tx, tz);
  const rec = out.sorted(3);
  sizeGrains(rec, ctx.ground.bu);
  return rec;
}
