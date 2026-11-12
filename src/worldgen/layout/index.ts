// Step 1 — zone layout (GDD 04 §4.2): roll the zones, place built zones, route paths, rasterise built shapes,
// grow natural zones on the 16 BU raster, merge islands, refine to the 4 BU terrain raster, then derive the zone
// table, raised beds, kerb lines and map-edge treatments.

import type { RngState } from '@/core/rng';
import { rngFloat, rngInt } from '@/core/rng';
import type { MapEdge, WorldParams, ZoneDef } from '@/sim/types';
import type { WorldDims } from '../params';
import { BUILT_SIZE, BUILT_ZONE, NATURAL_GROWTH, type BuiltKind } from '../tuning/archetypes';
import { MULCH } from '../tuning/maps';
import { TERRAIN } from '../tuning/terrain';
import { rollZones } from './roll';
import { placeBuilt } from './built';
import { routePath } from './paths';
import { FREE, growNatural, mergeIslands } from './natural';
import { SIDES } from './geom';
import { qmm } from '../kit/quantize';
import type { BuiltShape, KerbLine, Layout, LayoutZone, Point2, RaisedBed, Rect } from './types';

export function buildLayout(rng: RngState, params: WorldParams, dims: WorldDims, seed: number): Layout {
  const L = dims.size;
  const rolled = rollZones(rng, params.archetype);
  const plan = placeBuilt(rng, rolled.built, L, rolled.def.facade);
  const zones: LayoutZone[] = [];
  for (const nz of rolled.natural) {
    zones.push({ id: zones.length, type: nz.rule.type, variant: nz.variant, built: null, target: nz.frac, range: nz.rule.frac, mulched: false });
  }
  const builtZone = new Map<string, number>();
  const zoneFor = (kind: BuiltKind, sealed: boolean): number => {
    const key = `${kind}${sealed ? ':sealed' : ''}`;
    let id = builtZone.get(key);
    if (id === undefined) {
      id = zones.length;
      const bz = BUILT_ZONE[kind];
      zones.push({ id, type: bz.type, variant: sealed ? 'sealed' : bz.variant, built: kind, target: 0, range: null, mulched: false });
      builtZone.set(key, id);
    }
    return id;
  };
  const built: BuiltShape[] = plan.rects.map((r) => ({ kind: r.kind, zoneId: zoneFor(r.kind, !!r.sealed), rect: r.rect, line: null, width: 0, side: r.side }));
  const nodes = [...plan.nodes];
  if (rolled.built.includes('path')) {
    const p = routePath(rng, params.archetype, plan, L, seed);
    if (p) {
      built.push({ kind: 'path', zoneId: zoneFor('path', false), rect: null, line: p.line, width: p.width, side: null });
      for (const nd of p.nodes) if (!nodes.some((o) => o.kind === nd.kind && o.x === nd.x && o.z === nd.z)) nodes.push(nd);
    }
  }

  // 16 BU raster: built shapes at cell centres, then natural growth into the rest
  const nav = rasterBuilt(built, dims.navN, dims.navCell, L);
  const naturalIds = zones.filter((z) => !z.built).map((z) => z.id);
  const pathZones = new Set(built.filter((b) => b.kind === 'path').map((b) => b.zoneId));
  const passable = Uint8Array.from(nav, (v) => (pathZones.has(v) ? 1 : 0));
  growNatural(rng, {
    raster: nav, n: dims.navN, cell: dims.navCell, noiseSeed: seed ^ 0x2e1, passable,
    zones: rolled.natural.map((nz, i) => ({ id: naturalIds[i], frac: nz.frac, seed: nz.rule.seed })),
  });
  const minCells = Math.max(1, Math.round(NATURAL_GROWTH.minIslandMm2 / (dims.navCell * dims.navCell)));
  mergeIslands(nav, dims.navN, new Set(naturalIds), minCells);

  // 4 BU raster: built shapes exactly; elsewhere the natural zone of the nav cell (or a natural neighbour)
  const cells = rasterBuilt(built, dims.cells, dims.cell, L);
  const natural = new Set(naturalIds);
  const fallback = naturalIds[0] ?? 0;
  for (let k = 0; k < dims.cells; k++) for (let i = 0; i < dims.cells; i++) {
    const c = k * dims.cells + i;
    if (cells[c] !== FREE) continue;
    const ni = Math.min(dims.navN - 1, Math.floor(i / dims.sub)), nk = Math.min(dims.navN - 1, Math.floor(k / dims.sub));
    let z = nav[nk * dims.navN + ni];
    if (!natural.has(z)) z = nearestNatural(nav, dims.navN, ni, nk, natural, fallback);
    cells[c] = z;
  }
  for (const z of zones) if (z.type === 'garden-bed') z.mulched = rngFloat(rng) < MULCH.p;

  const layout: Layout = {
    zones, nav, cells, built, house: plan.house, facadeSide: plan.facadeSide, carPark: plan.carPark,
    kerbs: [], humanNodes: nodes, raisedBeds: [], edges: [],
  };
  layout.raisedBeds = raisedBeds(rng, layout, dims);
  layout.kerbs = kerbLines(layout, dims);
  layout.edges = mapEdges(rng, layout, plan.roadSides, rolled.def.edgeKind, rolled.def.edgeOnce);
  return layout;
}

/** Rasterises built shapes onto an n x n grid of cell edge `c` (FREE where none). Paths only fill free cells. */
function rasterBuilt(built: BuiltShape[], n: number, c: number, L: number): Uint8Array {
  const r = new Uint8Array(n * n).fill(FREE);
  for (const b of built) {
    if (!b.rect) continue;
    const i0 = Math.max(0, Math.ceil(b.rect.x0 / c - 0.5)), i1 = Math.min(n - 1, Math.ceil(b.rect.x1 / c - 0.5) - 1);
    const k0 = Math.max(0, Math.ceil(b.rect.z0 / c - 0.5)), k1 = Math.min(n - 1, Math.ceil(b.rect.z1 / c - 0.5) - 1);
    for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) r[k * n + i] = b.zoneId;
  }
  for (const b of built) if (b.line) rasterLine(r, n, c, L, b.line, b.width / 2, b.zoneId);
  return r;
}

function rasterLine(r: Uint8Array, n: number, c: number, _L: number, line: Point2[], half: number, id: number): void {
  for (let s = 0; s + 1 < line.length; s++) {
    const a = line[s], b = line[s + 1];
    const i0 = Math.max(0, Math.floor((Math.min(a.x, b.x) - half) / c)), i1 = Math.min(n - 1, Math.floor((Math.max(a.x, b.x) + half) / c));
    const k0 = Math.max(0, Math.floor((Math.min(a.z, b.z) - half) / c)), k1 = Math.min(n - 1, Math.floor((Math.max(a.z, b.z) + half) / c));
    const ex = b.x - a.x, ez = b.z - a.z, el = ex * ex + ez * ez;
    for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) {
      const j = k * n + i;
      if (r[j] !== FREE) continue;
      const x = (i + 0.5) * c, z = (k + 0.5) * c;
      const t = el > 0 ? Math.max(0, Math.min(1, ((x - a.x) * ex + (z - a.z) * ez) / el)) : 0;
      const dx = x - (a.x + ex * t), dz = z - (a.z + ez * t);
      if (dx * dx + dz * dz <= half * half) r[j] = id;
    }
  }
}

function nearestNatural(nav: Uint8Array, n: number, i: number, k: number, natural: Set<number>, fallback: number): number {
  for (let d = 1; d <= 3; d++) for (let dz = -d; dz <= d; dz++) for (let dx = -d; dx <= d; dx++) {
    const x = i + dx, z = k + dz;
    if (x < 0 || z < 0 || x >= n || z >= n) continue;
    const v = nav[z * n + x];
    if (natural.has(v)) return v;
  }
  return fallback;
}

/** Raised beds inside garden-bed zones (p 0.3 per bed zone, 1-3 rects fully inside the zone). */
function raisedBeds(rng: RngState, lay: Layout, dims: WorldDims): RaisedBed[] {
  const out: RaisedBed[] = [];
  const B = BUILT_SIZE;
  const zoneAt = (x: number, z: number) => lay.cells[Math.min(dims.cells - 1, Math.max(0, Math.floor(z / dims.cell))) * dims.cells + Math.min(dims.cells - 1, Math.max(0, Math.floor(x / dims.cell)))];
  for (const zn of lay.zones) {
    if (zn.type !== 'garden-bed' || rngFloat(rng) >= B.raisedBedP) continue;
    const count = rngInt(rng, B.raisedBedCount[0], B.raisedBedCount[1]);
    for (let b = 0, t = 0; b < count && t < 64; t++) {
      const len = B.raisedBedLen[0] + rngFloat(rng) * (B.raisedBedLen[1] - B.raisedBedLen[0]);
      const wid = B.raisedBedWidth[0] + rngFloat(rng) * (B.raisedBedWidth[1] - B.raisedBedWidth[0]);
      const [w, h] = rngFloat(rng) < 0.5 ? [len, wid] : [wid, len];
      const x0 = rngFloat(rng) * (dims.size - w), z0 = rngFloat(rng) * (dims.size - h);
      const r: Rect = { x0, z0, x1: x0 + w, z1: z0 + h };
      let inside = true;
      for (let s = 0; s <= 4 && inside; s++) for (let u = 0; u <= 4 && inside; u++) inside = zoneAt(x0 + (w * s) / 4, z0 + (h * u) / 4) === zn.id;
      if (!inside || out.some((o) => o.rect.x0 < r.x1 + 300 && r.x0 < o.rect.x1 + 300 && o.rect.z0 < r.z1 + 300 && r.z0 < o.rect.z1 + 300)) continue;
      out.push({ rect: r, lift: TERRAIN.raisedBedLift[0] + rngFloat(rng) * (TERRAIN.raisedBedLift[1] - TERRAIN.raisedBedLift[0]), zoneId: zn.id });
      b++;
    }
  }
  return out;
}

/** Kerb lines along every inner edge of an asphalt rect that borders a higher, non-asphalt zone. */
function kerbLines(lay: Layout, dims: WorldDims): KerbLine[] {
  const out: KerbLine[] = [];
  const L = dims.size, probe = dims.cell * 1.5;
  const typeAt = (x: number, z: number) => {
    if (x < 0 || z < 0 || x >= L || z >= L) return null;
    return lay.zones[lay.cells[Math.floor(z / dims.cell) * dims.cells + Math.floor(x / dims.cell)]].type;
  };
  for (const b of lay.built) {
    if (!b.rect || lay.zones[b.zoneId].type !== 'asphalt') continue;
    const r = b.rect;
    const edges: [number, number, number, number, number, number][] = [
      [r.x0, r.z0, r.x0, r.z1, 1, 0], [r.x1, r.z0, r.x1, r.z1, -1, 0], [r.x0, r.z0, r.x1, r.z0, 0, 1], [r.x0, r.z1, r.x1, r.z1, 0, -1],
    ];
    for (const [x0, z0, x1, z1, nx, nz] of edges) {
      const mx = (x0 + x1) / 2 - nx * probe, mz = (z0 + z1) / 2 - nz * probe;
      const t = typeAt(mx, mz);
      if (t === null || t === 'asphalt' || t === 'interior') continue;
      out.push({ x0, z0, x1, z1, nx, nz });
    }
  }
  return out;
}

function mapEdges(rng: RngState, lay: Layout, roadSides: string[], kind: MapEdge['kind'], once: boolean): MapEdge[] {
  const free = SIDES.filter((s) => s !== lay.facadeSide && !roadSides.includes(s));
  const onlyOne = once && free.length > 0 ? free[rngInt(rng, 0, free.length - 1)] : null;
  return SIDES.map((side) => ({
    side,
    kind: side === lay.facadeSide ? 'facade' : roadSides.includes(side) ? 'road' : once ? (side === onlyOne ? kind : 'open') : kind,
  }));
}

/** ZoneDef table from the layout (areas counted on the 4 BU raster). */
export function zoneDefs(lay: Layout, dims: WorldDims): ZoneDef[] {
  const count = new Float64Array(lay.zones.length);
  for (let i = 0; i < lay.cells.length; i++) count[lay.cells[i]]++;
  return lay.zones.map((z) => ({
    id: z.id, type: z.type, variant: z.variant,
    rects: lay.built.filter((b) => b.zoneId === z.id && b.rect).map((b) => [qmm(b.rect!.x0), qmm(b.rect!.z0), qmm(b.rect!.x1), qmm(b.rect!.z1)]),
    areaMm2: count[z.id] * dims.cell * dims.cell,
  }));
}

