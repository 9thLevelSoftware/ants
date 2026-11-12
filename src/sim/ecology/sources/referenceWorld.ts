// A stand-in "generated standard world" for the economy budget check (acceptance 6): the worldgen populate step
// (worldgen-life) does not exist yet, so this places T1 food anchors with the GDD 05 §1.3 per-plot densities on a
// standard 4000 BU map with suburban-garden zone shares (GDD 04 §1.4: lawn 0.50-0.65, garden-bed 0.25-0.35,
// shrubbery-corner forest 0.10-0.15, patio/path pavement; no optional interior). Test support only.

import { rngFork, rngFloat, type RngState } from '@/core/rng';
import type { FoodAnchor, FoodKind, WorldData, ZoneType } from '@/sim/types';
import { makeTestWorld } from '@/sim/testing';
import { PLOT_BU } from '@/sim/balance/ecology';

/** Zone stripes along X, share of the map width. */
export const REFERENCE_ZONES: readonly { type: ZoneType; share: number }[] = [
  { type: 'forest', share: 0.10 }, { type: 'garden-bed', share: 0.28 }, { type: 'lawn', share: 0.55 },
  { type: 'pavement', share: 0.07 },
];

/** GDD 05 §1.3 expected counts per plot for the T1 anchors, and the map caps. */
const DENSITY: { kind: FoodKind; state: string; perPlot: Partial<Record<ZoneType, number>>; cap: number }[] = [
  { kind: 'nectar', state: 'flower', perPlot: { forest: 0.03, lawn: 0.08, 'garden-bed': 0.15, pavement: 0.01, sand: 0.01 }, cap: 150 },
  { kind: 'crumb', state: 'full', perPlot: { lawn: 0.005, pavement: 0.02, asphalt: 0.01, sand: 0.03, rubber: 0.01, interior: 0.08 }, cap: 60 },
  { kind: 'sugar', state: 'full', perPlot: { pavement: 0.005, sand: 0.01, interior: 0.03 }, cap: 15 },
];
/** T1_HONEYDEW_SITES: 1 per 250 plots, at least 2 within 600 BU of the start. */
const HONEYDEW_PLOTS_PER_SITE = 250;
const HONEYDEW_NEAR_BU = 600;
const HONEYDEW_NEAR_MIN = 2;

/** Stochastic rounding. */
function roundRandom(rng: RngState, x: number): number {
  const f = Math.floor(x);
  return f + (rngFloat(rng) < x - f ? 1 : 0);
}

export function makeReferenceWorld(seed = 1, sizeBu = 4000): WorldData {
  const w = makeTestWorld({ sizeBu, seed });
  const size = w.size, bu = w.bu;
  const rng = rngFork(seed, 'reference-world');
  let x0 = 0;
  w.zones = REFERENCE_ZONES.map((z, id) => {
    const x1 = id === REFERENCE_ZONES.length - 1 ? size : x0 + z.share * size;
    const zd = { id, type: z.type, variant: null, rects: [[x0, 0, x1, size]], areaMm2: (x1 - x0) * size };
    x0 = x1;
    return zd;
  });
  const m = w.maps.zone;
  for (let k = 0; k < m.nz; k++) {
    for (let i = 0; i < m.nx; i++) {
      const x = (i + 0.5) * m.cell;
      m.data[k * m.nx + i] = w.zones.find((z) => x >= z.rects[0][0] && x < z.rects[0][2])?.id ?? 0;
    }
  }
  const plot = PLOT_BU * bu;
  const anchors: Omit<FoodAnchor, 'id'>[] = [];
  const put = (kind: FoodKind, state: string, x: number, z: number): void => {
    anchors.push({ kind, pos: { x, y: 0, z }, up: { x: 0, y: 1, z: 0 }, hostObjectId: -1, seasonMask: 15, initialState: state });
  };
  for (const d of DENSITY) {
    let placed = 0;
    for (const z of w.zones) {
      const n = roundRandom(rng, (d.perPlot[z.type] ?? 0) * (z.areaMm2 / (plot * plot)));
      for (let i = 0; i < n && placed < d.cap; i++, placed++) {
        const r = z.rects[0];
        put(d.kind, d.state, r[0] + (r[2] - r[0]) * rngFloat(rng), r[1] + (r[3] - r[1]) * rngFloat(rng));
      }
    }
  }
  const sites = Math.round((sizeBu / PLOT_BU) ** 2 / HONEYDEW_PLOTS_PER_SITE);
  const c = w.queenStart.pos;
  for (let i = 0; i < sites; i++) {
    const near = i < HONEYDEW_NEAR_MIN;
    const ang = 2 * Math.PI * rngFloat(rng);
    const r = near ? HONEYDEW_NEAR_BU * bu * Math.sqrt(rngFloat(rng)) : size * 0.5 * rngFloat(rng);
    put('honeydew', 'full', Math.min(size, Math.max(0, c.x + r * Math.cos(ang))), Math.min(size, Math.max(0, c.z + r * Math.sin(ang))));
  }
  w.placements.foodAnchors = anchors.map((a, id) => ({ ...a, id }));
  return w;
}
