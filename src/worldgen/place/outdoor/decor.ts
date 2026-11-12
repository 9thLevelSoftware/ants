// Decor descriptors (GDD 04 §9) for the renderer, written to WorldData.decor: per-zone layer rules (grass, tufts,
// leaves, litter, grit, fine mulch and pebbles, moss), density maps for decor tied to objects (leaf fringe within
// 3 m of trees, petals under flowering shrubs and fruit trees, litter within 1 m of bins), and the decals the
// placers collected (painted bay lines, asphalt cracks, rubber seams). Also drops props that would float (v-rest).

import type { ByteMap, DecorDensityMap, DecorLayerRule, WorldDecor, ZoneDecor } from '@/sim/types';
import type { GenContext } from '../../kit/context';
import { restViolations } from '../../validate/checks';
import { PROP_MIN_SOLID_BU } from '../../tuning/pipeline';
import { dropObject, outdoorState } from './commit';
import { snapRoutes } from './routeSnap';

export const DECOR = {
  tileBu: 64,
  grass: { mown: 3000, rough: 1500, mownMm: [25, 80] as [number, number], roughMm: [100, 300] as [number, number], widthMm: [2, 6] as [number, number] },
  tuft: { edge: 200, clearing: 100, bandMm: 1000, sizeMm: [30, 120] as [number, number], widthMm: [8, 20] as [number, number] },
  leaf: { forest: 250, season: [1.6, 1, 2.4, 1.6] as [number, number, number, number], sizeMm: [60, 120] as [number, number], widthMm: [40, 70] as [number, number], fringeMm: 3000 },
  petal: { density: 80, radiusMm: 1500, sizeMm: [8, 20] as [number, number], season: [1, 0, 0, 0] as [number, number, number, number] },
  litter: { base: 0.05, nearBin: 0.5, binMm: 1000, sizeMm: [50, 150] as [number, number] },
  grit: { density: 500, bandMm: 500 },
  mulchFineK: 3, mulch: 12, pebbleFine: 9,
};

const rule = (layer: DecorLayerRule['layer'], densityPerM2: number, sizeMm: [number, number], widthMm: [number, number], palette: string, where: DecorLayerRule['where'], extra: Partial<DecorLayerRule> = {}): DecorLayerRule =>
  ({ layer, densityPerM2, sizeMm, widthMm, palette, where, ...extra });

function zoneRules(ctx: GenContext): ZoneDecor[] {
  const bu = ctx.dims.bu, G = DECOR.grass, T = DECOR.tuft, Lf = DECOR.leaf;
  const grit: [number, number] = [0.15 * bu, PROP_MIN_SOLID_BU * bu];
  return ctx.layout.zones.map((z) => {
    const L: DecorLayerRule[] = [];
    switch (z.type) {
      case 'lawn':
        L.push(z.variant === 'rough' ? rule('decor-grass', G.rough, G.roughMm, G.widthMm, 'grass-rough', 'area') : rule('decor-grass', G.mown, G.mownMm, G.widthMm, 'grass-mown', 'area'));
        L.push(rule('decor-grass-tuft', T.edge, T.sizeMm, T.widthMm, 'grass-tuft', 'edge', { bandMm: T.bandMm }));
        L.push(rule('decor-moss-lichen', 0, [10, 60], [10, 60], 'moss', 'shade'));
        break;
      case 'forest':
        L.push(rule('decor-leaf', Lf.forest, Lf.sizeMm, Lf.widthMm, z.variant === 'pine-hardwood' ? 'leaf-mixed' : 'leaf-deciduous', 'area', { season: Lf.season }));
        L.push(rule('decor-grass-tuft', T.clearing, T.sizeMm, T.widthMm, 'grass-forest', 'area'));
        L.push(rule('decor-pebble-fine', DECOR.pebbleFine, grit, grit, 'pebble', 'area'));
        L.push(rule('decor-moss-lichen', 0, [10, 80], [10, 80], 'moss', 'shade'));
        break;
      case 'garden-bed':
        if (z.mulched) L.push(rule('decor-mulch-fine', DECOR.mulch * DECOR.mulchFineK, [5, 20], [3, 10], 'mulch-bark', 'area'));
        L.push(rule('decor-pebble-fine', DECOR.pebbleFine, grit, grit, 'pebble', 'area'));
        break;
      case 'pavement':
        L.push(rule('decor-litter', DECOR.litter.base, DECOR.litter.sizeMm, [30, 80], 'litter', 'area'));
        L.push(rule('decor-moss-lichen', 0, [5, 30], [2, 6], 'moss-joint', 'shade'));
        L.push(rule('decor-grass-tuft', T.edge, T.sizeMm, T.widthMm, 'grass-tuft', 'edge', { bandMm: T.bandMm }));
        break;
      case 'asphalt':
        L.push(rule('decor-litter', DECOR.litter.base, DECOR.litter.sizeMm, [30, 80], 'litter', 'area'));
        L.push(rule('decor-grit', DECOR.grit.density, grit, grit, 'grit-asphalt', 'edge', { bandMm: DECOR.grit.bandMm }));
        break;
      case 'sand':
        L.push(rule('decor-grit', DECOR.grit.density, grit, grit, 'grit-sand', 'edge', { bandMm: DECOR.grit.bandMm }));
        L.push(rule('decor-litter', DECOR.litter.base, DECOR.litter.sizeMm, [30, 80], 'litter', 'area'));
        L.push(rule('decor-grass-tuft', T.edge, T.sizeMm, T.widthMm, 'grass-tuft', 'edge', { bandMm: T.bandMm }));
        break;
      case 'rubber':
        L.push(rule('decor-litter', DECOR.litter.base, DECOR.litter.sizeMm, [30, 80], 'litter', 'area'));
        L.push(rule('decor-grass-tuft', T.edge, T.sizeMm, T.widthMm, 'grass-tuft', 'edge', { bandMm: T.bandMm }));
        break;
      default:
        break;
    }
    return { zoneId: z.id, type: z.type, variant: z.variant, layers: L };
  });
}

/** Byte map on the decor tile grid: value = max over sources of (1 - d / r) (linear fringe). */
function fringeMap(ctx: GenContext, sources: { x: number; z: number; r: number }[]): ByteMap {
  const cell = DECOR.tileBu * ctx.dims.bu, n = Math.ceil(ctx.dims.size / cell);
  const data = new Uint8Array(n * n);
  for (const s of sources) {
    const i0 = Math.max(0, Math.floor((s.x - s.r) / cell)), i1 = Math.min(n - 1, Math.floor((s.x + s.r) / cell));
    const k0 = Math.max(0, Math.floor((s.z - s.r) / cell)), k1 = Math.min(n - 1, Math.floor((s.z + s.r) / cell));
    for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) {
      const dx = (i + 0.5) * cell - s.x, dz = (k + 0.5) * cell - s.z, d = Math.sqrt(dx * dx + dz * dz);
      const v = Math.round(255 * Math.max(0, 1 - d / s.r));
      if (v > data[k * n + i]) data[k * n + i] = v;
    }
  }
  return { cell, nx: n, nz: n, data };
}

function densityMaps(ctx: GenContext): DecorDensityMap[] {
  const objs = ctx.world.objects;
  const at = (ids: string[], r: number) => objs.filter((o) => ids.includes(o.templateId)).map((o) => ({ x: o.pos.x, z: o.pos.z, r }));
  const Lf = DECOR.leaf, Pt = DECOR.petal, Li = DECOR.litter;
  return [
    { layer: 'decor-leaf', maxPerM2: Lf.forest, map: fringeMap(ctx, at(['standing-tree', 'park-tree', 'fruit-tree', 'tree-pit'], Lf.fringeMm)), palette: 'leaf-deciduous', sizeMm: Lf.sizeMm, widthMm: Lf.widthMm, season: Lf.season },
    { layer: 'decor-petal', maxPerM2: Pt.density, map: fringeMap(ctx, at(['shrub', 'fruit-tree'], Pt.radiusMm)), palette: 'petal', sizeMm: Pt.sizeMm, widthMm: Pt.sizeMm, season: Pt.season },
    { layer: 'decor-litter', maxPerM2: Li.nearBin, map: fringeMap(ctx, at(['litter-bin', 'bench', 'picnic-table'], Li.binMm)), palette: 'litter', sizeMm: Li.sizeMm, widthMm: [30, 80] },
  ];
}

/** Drops props whose lowest point would float (v-rest), with their sockets; returns how many were dropped. */
export function dropFloatingProps(ctx: GenContext): number {
  const bad = restViolations(ctx);
  for (const id of [...bad].sort((a, b) => b - a)) dropObject(ctx, id);
  return bad.length;
}

export function placeDecor(ctx: GenContext): void {
  const dropped = dropFloatingProps(ctx);
  if (dropped > 0) ctx.notes.push(`outdoor: dropped ${dropped} floating props`);
  const snap = snapRoutes(ctx, outdoorState(ctx).objects);
  ctx.notes.push(`outdoor: route nodes snapped ${snap.nodes}, not converged ${snap.failed}`);
  const decor: WorldDecor = { tileBu: DECOR.tileBu, zones: zoneRules(ctx), maps: densityMaps(ctx), decals: outdoorState(ctx).decals };
  ctx.world.decor = decor;
}
