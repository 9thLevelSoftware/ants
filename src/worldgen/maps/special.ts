// fSpecial per species (GDD 04 §12.1): Camponotus decayed-wood volume within 50 BU; Messor open sky x seed anchors
// within 300 BU; Atta leaf biomass within 600 BU x no paving within 100 BU. T3 species: coarse, area-based.

import type { SpeciesId } from '@/sim/types';
import type { GenContext } from '../kit/context';
import { mapState } from './state';
import { markDisc } from './nav';
import { SUIT } from '../tuning/maps';

/** Volume of a primitive's bounding solid, mm^3 (box/ellipsoid/cylinder/capsule formulas). */
function primVolume(s: { x: number; y: number; z: number }, shape: string): number {
  switch (shape) {
    case 'box': return 8 * s.x * s.y * s.z;
    case 'ellipsoid': return (4 / 3) * 3.141592653589793 * s.x * s.y * s.z;
    case 'cylinder': return 3.141592653589793 * s.x * s.x * 2 * s.y;
    default: return 3.141592653589793 * s.x * s.x * (2 * s.y + (4 / 3) * s.x);
  }
}

/**
 * Adds `value(item)` to every nav cell whose centre lies within r of the item (a disc splat: cost per item, not
 * per cell x item, so thousands of plant primitives stay cheap).
 */
function splat<T extends { x: number; z: number }>(ctx: GenContext, items: readonly T[], r: number, value: (t: T) => number): Float32Array {
  const { navN } = ctx.dims;
  const out = new Float32Array(navN * navN);
  for (const it of items) {
    const v = value(it);
    markDisc(ctx, it.x, it.z, r, (c) => { out[c] += v; });
  }
  return out;
}

/** Per-nav-cell fSpecial of a species (0..1). */
export function specialFactor(ctx: GenContext, species: SpeciesId): (c: number) => number {
  const { navCell, bu } = ctx.dims;
  const w = ctx.world;
  if (species === 'camponotus-pennsylvanicus') {
    const wood = w.prims.filter((p) => p.material === 'wood-decayed').map((p) => ({ x: p.pos.x, z: p.pos.z, v: primVolume(p.size, p.shape) }));
    const need = SUIT.woodVolumeBu3 * bu * bu * bu;
    const vol = splat(ctx, wood, SUIT.woodRadiusBu * bu, (q) => q.v);
    return (c) => Math.min(1, vol[c] / need);
  }
  if (species === 'messor-barbarus') {
    const shade = mapState(ctx).shade.mean;
    const seeds = w.placements.foodAnchors.filter((a) => a.kind === 'seed').map((a) => ({ x: a.pos.x, z: a.pos.z }));
    const count = splat(ctx, seeds, SUIT.seedRadiusBu * bu, () => 1);
    return (c) => (shade[c] >= SUIT.seedOpenShade ? 0 : Math.min(1, count[c] * SUIT.seedEach));
  }
  if (species === 'atta-texana') {
    const plants = w.prims.filter((p) => p.material === 'plant').map((p) => ({ x: p.pos.x, z: p.pos.z }));
    const count = splat(ctx, plants, SUIT.leafRadiusBu * bu, () => 1);
    const nearPaving = pavingWithin(ctx, Math.ceil((SUIT.pavingClearBu * bu) / navCell));
    return (c) => (nearPaving[c] ? 0 : Math.min(1, count[c] / SUIT.leafPrimsFull));
  }
  return () => 0;
}

/** 1 where a pavement nav cell lies within r cells (Chebyshev square, as before), by a separable max filter. */
function pavingWithin(ctx: GenContext, r: number): Uint8Array {
  const { navN: n } = ctx.dims;
  const lay = ctx.layout;
  const pav = new Uint8Array(n * n);
  for (let c = 0; c < n * n; c++) pav[c] = lay.zones[lay.nav[c]].type === 'pavement' ? 1 : 0;
  const rows = new Uint8Array(n * n), out = new Uint8Array(n * n);
  for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) {
    let v = 0;
    for (let d = Math.max(0, i - r); d <= Math.min(n - 1, i + r) && !v; d++) v = pav[k * n + d];
    rows[k * n + i] = v;
  }
  for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) {
    let v = 0;
    for (let d = Math.max(0, k - r); d <= Math.min(n - 1, k + r) && !v; d++) v = rows[d * n + i];
    out[k * n + i] = v;
  }
  return out;
}
