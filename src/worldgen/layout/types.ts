// Zone layout data (GDD 04 §4.2 step 1): the zone table, the zone rasters and the analytic built shapes that
// later steps (heightfield, structures, catalogue placers) read through GenContext.layout. Lengths in mm.

import type { MapEdge, ZoneType, ZoneVariant } from '@/sim/types';
import type { BuiltKind } from '../tuning/archetypes';

export type Side = MapEdge['side'];

/** Axis-aligned rectangle [x0, x1) x [z0, z1), mm. */
export interface Rect { x0: number; z0: number; x1: number; z1: number }

export interface Point2 { x: number; z: number }

export interface LayoutZone {
  /** Zone id (index in Layout.zones, value in the zone rasters, ZoneDef.id). */
  id: number;
  type: ZoneType;
  variant: ZoneVariant;
  /** Built kind, or null for a natural zone. */
  built: BuiltKind | null;
  /** Natural zones: target share of the natural remainder (after fitting); the GDD range it was rolled from. */
  target: number;
  range: [number, number] | null;
  /** Garden beds: mulched surface (GDD 04 §2.1, p 0.6). */
  mulched: boolean;
}

/** One built shape: a rectangle or a polyline band. */
export interface BuiltShape {
  kind: BuiltKind;
  zoneId: number;
  rect: Rect | null;
  /** Path centreline (smoothed), with its full width. */
  line: Point2[] | null;
  width: number;
  /** Map side the shape is attached to (bands, house strip), or null. */
  side: Side | null;
}

export interface HouseLayout {
  /** Map side of the house strip (its back wall is that map edge). */
  side: Side;
  strip: Rect;
  /** Enterable kitchen slice inside the strip, or null when the house is only a façade beyond the map. */
  kitchen: Rect | null;
  /** Back door in the garden-side wall of the kitchen slice: centre (on the wall's outer face), outward normal. */
  door: { x: number; z: number; nx: number; nz: number; width: number } | null;
  /** Parts of the strip that are sealed house (solid façade block). */
  sealed: Rect[];
}

export interface CarParkLayout {
  rect: Rect;
  side: Side;
  /** Bays (2400 x 4800) in one row against the sidewalk; the aisle is the rest of the band. */
  bays: Rect[];
  aisle: Rect;
}

/** A kerb line between asphalt and a higher zone: segment and the unit normal pointing to the road side. */
export interface KerbLine { x0: number; z0: number; x1: number; z1: number; nx: number; nz: number }

export interface HumanNode { kind: 'door' | 'gate' | 'bench' | 'bay' | 'play'; x: number; z: number }

export interface RaisedBed { rect: Rect; lift: number; zoneId: number }

export interface Layout {
  zones: LayoutZone[];
  /** Zone id per nav cell (navN x navN). */
  nav: Uint8Array;
  /** Zone id per terrain cell (cells x cells). */
  cells: Uint8Array;
  built: BuiltShape[];
  house: HouseLayout | null;
  /** Side of the house façade (interior strip or, in a suburban garden without one, the map edge). */
  facadeSide: Side | null;
  carPark: CarParkLayout | null;
  kerbs: KerbLine[];
  humanNodes: HumanNode[];
  raisedBeds: RaisedBed[];
  edges: MapEdge[];
}
