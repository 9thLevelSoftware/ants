// Where people go (GDD 04 §15.2 "Zones" and "Spatial path"), derived once per world from what worldgen made: the
// kitchen's lanes and areas (worldgen interiorHumanAreas), outdoor zones from the zone raster (lanes = the longest
// walk across a zone on the 250 mm human grid, never through tall solids), and spots from catalogue objects
// (tables, seats, bins, play equipment, sprinkler heads, pots). A site exists only where the map has its zone, so
// no event can happen in a zone the map lacks. Runtime cache (WeakMap per WorldData), never saved.

import type { WorldData, ZoneDef } from '@/sim/types';
import { interiorHumanAreas, type InteriorHumanAreas } from '@/worldgen/place/interior';
import {
  CAR_BAY_D, CAR_BAY_W, HUMAN_GRID_MM, HUMAN_MIN_SITE_M2, STREET_STRIP_W, type HumanSiteKind,
} from '@/sim/balance/human';
import {
  freeCount, isFreeAt, longestLane, polylineLength, zoneBounds, zoneGrid, type HumanGrid, type Pt, type Rect,
} from './grid';

export interface SiteRect extends Rect { y: number }
export interface SiteSpot { x: number; z: number; y: number; tag: string }

/** A car bay: centre, heading into the bay (unit, XZ) and the point on the aisle in front of it. */
export interface CarBay { x: number; z: number; dx: number; dz: number; ax: number; az: number }

export interface HumanSite {
  id: number;
  kind: HumanSiteKind;
  /** Zone ids (ZoneDef.id) the site lies in. */
  zoneIds: number[];
  /** Bounds, mm. */
  rect: Rect;
  /** Floor height for interior sites, mm; NaN outdoors (ground height from the field). */
  y: number;
  /** Walkable human grid (floors, zones), null for spot-only sites. */
  grid: HumanGrid | null;
  /** Lanes (polylines) a pass can follow. */
  lanes: Pt[][];
  /** Rectangles the event covers (wipe tops, kerb strips, crevice runs). */
  rects: SiteRect[];
  /** Points of interest (seats, bins, play spots, sprinkler heads, pots). */
  spots: SiteSpot[];
  /** Car bays and the aisle entry (car park, driveway). */
  bays: CarBay[];
  entry: Pt | null;
  /** Plain words for the alert (`{area}`). */
  area: string;
}

export interface HumanSites {
  list: HumanSite[];
  interior: InteriorHumanAreas | null;
}

const cache = new WeakMap<WorldData, HumanSites>();

/** The world's human sites (built on first use). */
export function humanSites(world: WorldData): HumanSites {
  let s = cache.get(world);
  if (!s) { s = buildSites(world); cache.set(world, s); }
  return s;
}

export function sitesOf(world: WorldData, kind: HumanSiteKind): HumanSite[] {
  return humanSites(world).list.filter((s) => s.kind === kind);
}

export function siteById(world: WorldData, id: number): HumanSite | undefined {
  return humanSites(world).list[id];
}

function objectsOf(world: WorldData, ...templates: string[]) {
  return world.objects.filter((o) => templates.includes(o.templateId));
}

/** Conservative XZ bounds of an object's primitives. */
function objectRect(world: WorldData, primStart: number, primCount: number): SiteRect {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity, y = -Infinity;
  for (let i = primStart; i < primStart + primCount; i++) {
    const p = world.prims[i];
    if (!p) continue;
    const r = Math.hypot(p.size.x, p.size.z);
    x0 = Math.min(x0, p.pos.x - r); x1 = Math.max(x1, p.pos.x + r);
    z0 = Math.min(z0, p.pos.z - r); z1 = Math.max(z1, p.pos.z + r);
    y = Math.max(y, p.pos.y + p.size.y);
  }
  return { x0, z0, x1, z1, y };
}

const AREA_WORDS: Partial<Record<string, string>> = {
  'interior/kitchen': 'kitchen floor', 'pavement/patio': 'patio', 'pavement/path': 'path', 'pavement/sidewalk': 'pavement',
  lawn: 'lawn', forest: 'woodland floor', sand: 'sand pit', rubber: 'playground', 'garden-bed': 'flower bed',
  'asphalt/car-park': 'car park', 'asphalt/driveway': 'driveway',
};
function areaWords(z: ZoneDef): string {
  return AREA_WORDS[`${z.type}/${z.variant}`] ?? AREA_WORDS[z.type] ?? z.type;
}

function buildSites(world: WorldData): HumanSites {
  const list: HumanSite[] = [];
  const bounds = zoneBounds(world);
  const zoneRect = (ids: number[]): Rect | null => {
    let r: Rect | null = null;
    for (const id of ids) {
      const b = bounds.get(id);
      if (!b) continue;
      r = r ? { x0: Math.min(r.x0, b.x0), z0: Math.min(r.z0, b.z0), x1: Math.max(r.x1, b.x1), z1: Math.max(r.z1, b.z1) } : { ...b };
    }
    return r;
  };
  const add = (s: Omit<HumanSite, 'id'>): HumanSite => { const site = { ...s, id: list.length }; list.push(site); return site; };
  const blank = (kind: HumanSiteKind, zoneIds: number[], rect: Rect, area: string): Omit<HumanSite, 'id'> =>
    ({ kind, zoneIds, rect, y: NaN, grid: null, lanes: [], rects: [], spots: [], bays: [], entry: null, area });
  const minCells = (HUMAN_MIN_SITE_M2 * 1e6) / (HUMAN_GRID_MM * HUMAN_GRID_MM);

  const zonesOf = (type: string, variant?: string | null) =>
    world.zones.filter((z) => z.type === type && (variant === undefined || z.variant === variant) && bounds.has(z.id));

  // outdoor walking lanes and areas
  const laneSite = (kind: HumanSiteKind, zs: ZoneDef[], regionKind: HumanSiteKind | null): void => {
    if (zs.length === 0) return;
    const ids = zs.map((z) => z.id), rect = zoneRect(ids);
    if (!rect) return;
    const grid = zoneGrid(world, rect, ids);
    if (freeCount(grid) < minCells) return;
    const lane = longestLane(grid);
    if (lane.length >= 2 && polylineLength(lane) > HUMAN_GRID_MM * 2) add({ ...blank(kind, ids, rect, areaWords(zs[0])), grid, lanes: [lane] });
    if (regionKind) add({ ...blank(regionKind, ids, rect, areaWords(zs[0])), grid });
  };
  laneSite('patio-lane', zonesOf('pavement', 'patio'), 'patio');
  laneSite('path-lane', zonesOf('pavement', 'path'), 'path');
  laneSite('sidewalk-lane', zonesOf('pavement', 'sidewalk'), 'sidewalk');
  laneSite('lawn-lane', zonesOf('lawn'), null);
  laneSite('forest-lane', zonesOf('forest'), null);
  laneSite('playground-lane', [...zonesOf('sand'), ...zonesOf('rubber')], null);

  // mown lawns (mowing) and the suburban lawn children play on
  for (const z of zonesOf('lawn', 'mown')) {
    const rect = zoneRect([z.id]);
    if (!rect) continue;
    const grid = zoneGrid(world, rect, [z.id]);
    if (freeCount(grid) < minCells) continue;
    add({ ...blank('lawn-mown', [z.id], rect, areaWords(z)), grid });
    if (world.params.archetype === 'suburban-garden') add({ ...blank('suburban-lawn', [z.id], rect, areaWords(z)), grid, spots: [] });
  }

  // patio table (meals)
  const patio = list.find((s) => s.kind === 'patio');
  if (patio) for (const o of objectsOf(world, 'patio-table')) patio.spots.push({ x: o.pos.x, z: o.pos.z, y: objectRect(world, o.primStart, o.primCount).y, tag: 'table' });

  // playground: play spots on sand / rubber and their benches
  const play = [...zonesOf('sand'), ...zonesOf('rubber')];
  if (play.length > 0) {
    const ids = play.map((z) => z.id), rect = zoneRect(ids);
    if (rect) {
      const grid = zoneGrid(world, rect, ids);
      const spots: SiteSpot[] = [];
      for (const o of objectsOf(world, 'slide', 'swing-frame', 'bench', 'picnic-table', 'toy-bucket')) {
        spots.push({ x: o.pos.x, z: o.pos.z, y: NaN, tag: o.templateId });
      }
      for (const z of zonesOf('sand')) {
        const b = bounds.get(z.id)!;
        spots.push({ x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2, y: NaN, tag: 'sand-pit' });
      }
      if (freeCount(grid) >= minCells) add({ ...blank('playground', ids, rect, areaWords(play[0])), grid, spots });
    }
  }

  // beds (hose, can) and the lawn sprinkler
  const beds = zonesOf('garden-bed');
  if (beds.length > 0) {
    const ids = beds.map((z) => z.id), rect = zoneRect(ids);
    if (rect) {
      const grid = zoneGrid(world, rect, ids);
      const spots: SiteSpot[] = objectsOf(world, 'plant-pot', 'planter').map((o) => ({ x: o.pos.x, z: o.pos.z, y: NaN, tag: 'pot' }));
      if (freeCount(grid) >= minCells || spots.length > 0) add({ ...blank('bed', ids, rect, areaWords(beds[0])), grid, spots });
    }
  }
  const heads = objectsOf(world, 'sprinkler-head');
  if (heads.length > 0) {
    const lawn = zonesOf('lawn').map((z) => z.id);
    const s = blank('sprinkler', lawn, { x0: 0, z0: 0, x1: world.size, z1: world.size }, 'lawn');
    add({ ...s, spots: heads.map((o) => ({ x: o.pos.x, z: o.pos.z, y: NaN, tag: 'sprinkler-head' })) });
  }

  // bins (litter)
  const bins = objectsOf(world, 'litter-bin');
  if (bins.length > 0) {
    add({ ...blank('bin', [], { x0: 0, z0: 0, x1: world.size, z1: world.size }, 'path'), spots: bins.map((o) => ({ x: o.pos.x, z: o.pos.z, y: NaN, tag: 'bin' })) });
  }

  for (const z of zonesOf('asphalt', 'car-park')) carSite(world, add, blank, z, bounds.get(z.id)!, false);
  for (const z of zonesOf('asphalt', 'driveway')) carSite(world, add, blank, z, bounds.get(z.id)!, true);

  const interior = interiorHumanAreas(world);
  if (interior) interiorSites(world, interior, add, blank);
  return { list, interior };
}

type Add = (s: Omit<HumanSite, 'id'>) => HumanSite;
type Blank = (kind: HumanSiteKind, zoneIds: number[], rect: Rect, area: string) => Omit<HumanSite, 'id'>;

/**
 * Car park: one row of bays along the side nearest the map edge, the aisle beside it, the entry at the end of the
 * aisle on the map edge. Driveway: one bay at the inner end, entry at the map edge. Bays under a static solid are
 * left out. The kerb strip of the street broom runs along the kerb objects beside the car park.
 */
function carSite(world: WorldData, add: Add, blank: Blank, z: ZoneDef, b: Rect, driveway: boolean): void {
  const grid = zoneGrid(world, b, [z.id]);
  const alongX = b.x1 - b.x0 >= b.z1 - b.z0;
  const L0 = alongX ? b.x0 : b.z0, L1 = alongX ? b.x1 : b.z1, W0 = alongX ? b.z0 : b.x0, W1 = alongX ? b.z1 : b.x1;
  const toW = (along: number, across: number) => (alongX ? { x: along, z: across } : { x: across, z: along });
  // the long end on the map edge is the entry (else the nearer end)
  const startAtL0 = L0 <= world.size - L1;
  const entryAlong = startAtL0 ? L0 : L1;
  const bays: CarBay[] = [];
  if (driveway) {
    const across = (W0 + W1) / 2, along = startAtL0 ? L1 - CAR_BAY_D * 0.6 : L0 + CAR_BAY_D * 0.6;
    const p = toW(along, across), a = toW(along + (startAtL0 ? -CAR_BAY_D : CAR_BAY_D), across);
    const d = toW(startAtL0 ? 1 : -1, 0);
    if (isFreeAt(grid, p.x, p.z)) bays.push({ x: p.x, z: p.z, dx: alongX ? d.x : 0, dz: alongX ? 0 : d.z, ax: a.x, az: a.z });
    const e = toW(entryAlong, across);
    add({ ...blank('driveway', [z.id], b, 'driveway'), grid, bays, entry: e, lanes: [[e, toW(along, across)]] });
    return;
  }
  // bays on the side of the width nearer the map edge
  const sideW0 = W0 <= world.size - W1;
  const width = W1 - W0;
  // the aisle runs beside the bay row: bay depth plus half an aisle (at most 3 m) from the bay side
  const aisleOff = CAR_BAY_D + Math.max(0, Math.min(3000, (width - CAR_BAY_D) / 2));
  const aisle = sideW0 ? W0 + aisleOff : W1 - aisleOff;
  const bayAcross = sideW0 ? W0 + CAR_BAY_D / 2 : W1 - CAR_BAY_D / 2;
  const n = Math.floor((L1 - L0 - CAR_BAY_W) / CAR_BAY_W);
  for (let i = 0; i < n; i++) {
    const along = L0 + CAR_BAY_W * (i + 1);
    const p = toW(along, bayAcross), a = toW(along, aisle);
    if (!bayClear(world, grid, p.x, p.z, alongX)) continue;
    const l = Math.hypot(p.x - a.x, p.z - a.z) || 1;
    bays.push({ x: p.x, z: p.z, dx: (p.x - a.x) / l, dz: (p.z - a.z) / l, ax: a.x, az: a.z });
  }
  const entry = toW(entryAlong, aisle);
  add({ ...blank('car-park', [z.id], b, 'car park'), grid, bays, entry, lanes: [[entry, toW(startAtL0 ? L1 : L0, aisle)]] });
  // kerb strip for the street broom: the kerbs touching the car park
  const rects: SiteRect[] = [];
  for (const o of objectsOf(world, 'kerb')) {
    const r = objectRect(world, o.primStart, o.primCount);
    if (r.x1 < b.x0 - STREET_STRIP_W || r.x0 > b.x1 + STREET_STRIP_W || r.z1 < b.z0 - STREET_STRIP_W || r.z0 > b.z1 + STREET_STRIP_W) continue;
    rects.push({ x0: r.x0 - STREET_STRIP_W / 2, z0: r.z0 - STREET_STRIP_W / 2, x1: r.x1 + STREET_STRIP_W / 2, z1: r.z1 + STREET_STRIP_W / 2, y: NaN });
  }
  if (rects.length > 0) add({ ...blank('kerb-strip', [z.id], b, 'kerb'), rects });
}

/** A bay is clear when the car's footprint is walkable on the human grid (no static car, bollard, tree pit). */
function bayClear(_world: WorldData, grid: HumanGrid, x: number, z: number, alongX: boolean): boolean {
  const hw = CAR_BAY_W * 0.35, hd = CAR_BAY_D * 0.4;
  for (const u of [-1, 0, 1]) {
    for (const v of [-1, 0, 1]) {
      const px = x + (alongX ? u * hw : v * hd), pz = z + (alongX ? v * hd : u * hw);
      if (!isFreeAt(grid, px, pz)) return false;
    }
  }
  return true;
}

function interiorSites(world: WorldData, a: InteriorHumanAreas, add: Add, blank: Blank): void {
  const kitchen = world.zones.find((z) => z.type === 'interior' && z.variant === 'kitchen');
  const ids = kitchen ? [kitchen.id] : [];
  const rect: Rect = { ...a.room };
  const grid: HumanGrid = { x0: a.room.x0, z0: a.room.z0, cell: a.cell, nx: a.nx, nz: a.nz, free: a.free };
  const lanes = a.lanes.filter((l) => l.points.length >= 2).map((l) => l.points.map((p) => ({ x: p.x, z: p.z })));
  if (lanes.length > 0) add({ ...blank('interior-lane', ids, rect, 'kitchen floor'), y: a.floorY, grid, lanes });
  add({
    ...blank('interior-floor', ids, rect, 'kitchen floor'), y: a.floorY, grid,
    rects: a.crevice.map((r) => ({ ...r, y: a.floorY })),
  });
  if (a.wipe.length > 0) add({ ...blank('counter', ids, rect, 'worktop'), y: a.floorY, rects: a.wipe.map((r) => ({ ...r })) });
  const table = world.objects.find((o) => o.templateId === 'kitchen-table');
  if (table) {
    const seats = world.objects.filter((o) => o.templateId === 'chair').map((o) => ({ x: o.pos.x, z: o.pos.z, y: a.floorY, tag: 'seat' }));
    const top = a.wipe.find((r) => table.pos.x >= r.x0 && table.pos.x <= r.x1 && table.pos.z >= r.z0 && table.pos.z <= r.z1);
    add({ ...blank('table', ids, rect, 'kitchen floor'), y: a.floorY, grid, spots: seats, rects: top ? [{ ...top }] : [] });
  }
  const bowls = a.nodes.filter((n) => n.kind === 'pet-bowl');
  if (bowls.length > 0) add({ ...blank('pet-bowl', ids, rect, 'kitchen floor'), y: a.floorY, spots: bowls.map((n) => ({ x: n.x, z: n.z, y: a.floorY, tag: 'bowl' })) });
}
