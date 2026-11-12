// Archetype zone mixes, built-zone size rules and map-edge treatments (GDD 04 §1.3, §1.4, §4.2 step 1g).
// Fractions are "of the natural remainder" (the map minus the built zones). Lengths in mm.

import type { ArchetypeId, SpeciesId, ZoneType, ZoneVariant } from '@/sim/types';
import type { MapEdge } from '@/sim/types';

/** Built zones the layout places as analytic shapes (GDD 04 §1.4). */
export type BuiltKind = 'interior' | 'patio' | 'path' | 'sidewalk' | 'car-park' | 'driveway' | 'lane' | 'sand' | 'rubber';

export interface NaturalZoneRule {
  type: ZoneType;
  /** Variant choices with weights (rolled once per zone). */
  variants: { v: ZoneVariant; w: number }[];
  /** Fraction range of the natural remainder. */
  frac: [number, number];
  /** Where the zone's seed cells prefer to be. */
  seed: 'any' | 'corner' | 'edge' | 'center';
}

export interface OptionalZoneRule {
  /** Probability of the roll. Entries with the same `group` are "one of" (first success wins). */
  p: number;
  group?: string;
  natural?: NaturalZoneRule;
  built?: BuiltKind;
}

export interface ArchetypeDef {
  id: ArchetypeId;
  tier: 1 | 3;
  natural: NaturalZoneRule[];
  built: BuiltKind[];
  optional: OptionalZoneRule[];
  /** Map-edge treatment on edges that are not the house or a road. */
  edgeKind: MapEdge['kind'];
  /** Only one edge gets `edgeKind` (the others stay 'open'). */
  edgeOnce: boolean;
  /** The house façade edge exists even without an interior zone (suburban garden). */
  facade: boolean;
  /** Species fit 0-3 (random archetype weights; 0 excluded). */
  fit: Record<SpeciesId, number>;
}

const v = (...list: [ZoneVariant, number][]) => list.map(([vv, w]) => ({ v: vv, w }));

export const ARCHETYPE_DEFS: Record<ArchetypeId, ArchetypeDef> = {
  'woodland-edge': {
    id: 'woodland-edge', tier: 1,
    natural: [
      { type: 'forest', variants: v(['deciduous', 1]), frac: [0.55, 0.7], seed: 'edge' },
      { type: 'lawn', variants: v(['rough', 0.5], ['mown', 0.5]), frac: [0.25, 0.4], seed: 'any' },
    ],
    built: ['path'],
    optional: [
      { p: 0.4, natural: { type: 'garden-bed', variants: v(['flower', 1], ['vegetable', 1]), frac: [0.05, 0.1], seed: 'any' } },
      { p: 0.4, built: 'lane' },
    ],
    edgeKind: 'dry-stone-wall', edgeOnce: true, facade: false,
    fit: { 'lasius-niger': 3, 'camponotus-pennsylvanicus': 3, 'messor-barbarus': 1, 'atta-texana': 3 },
  },
  'suburban-garden': {
    id: 'suburban-garden', tier: 1,
    natural: [
      { type: 'lawn', variants: v(['mown', 1]), frac: [0.5, 0.65], seed: 'center' },
      { type: 'garden-bed', variants: v(['flower', 2], ['vegetable', 1], ['shrub', 1]), frac: [0.25, 0.35], seed: 'edge' },
    ],
    built: ['patio', 'path'],
    optional: [
      { p: 0.3, natural: { type: 'forest', variants: v(['deciduous', 1]), frac: [0.1, 0.15], seed: 'corner' } },
      { p: 0.35, built: 'interior' },
      { p: 0.3, built: 'driveway' },
    ],
    edgeKind: 'fence', edgeOnce: false, facade: true,
    fit: { 'lasius-niger': 3, 'camponotus-pennsylvanicus': 2, 'messor-barbarus': 1, 'atta-texana': 2 },
  },
  'playground-park': {
    id: 'playground-park', tier: 1,
    natural: [{ type: 'lawn', variants: v(['mown', 1]), frac: [0.65, 0.8], seed: 'center' }],
    built: ['sand', 'rubber', 'path'],
    optional: [
      { p: 0.5, group: 'belt', natural: { type: 'forest', variants: v(['deciduous', 1]), frac: [0.2, 0.35], seed: 'edge' } },
      { p: 0.3, group: 'belt', natural: { type: 'garden-bed', variants: v(['shrub', 1]), frac: [0.1, 0.2], seed: 'edge' } },
    ],
    edgeKind: 'hedge', edgeOnce: false, facade: false,
    fit: { 'lasius-niger': 3, 'camponotus-pennsylvanicus': 1, 'messor-barbarus': 2, 'atta-texana': 1 },
  },
  'car-park-verge': {
    id: 'car-park-verge', tier: 1,
    natural: [{ type: 'lawn', variants: v(['rough', 0.6], ['mown', 0.4]), frac: [0.6, 0.75], seed: 'any' }],
    built: ['car-park', 'sidewalk'],
    optional: [
      { p: 0.5, natural: { type: 'garden-bed', variants: v(['shrub', 1]), frac: [0.15, 0.25], seed: 'edge' } },
      { p: 0.3, natural: { type: 'forest', variants: v(['deciduous', 1]), frac: [0.15, 0.25], seed: 'corner' } },
    ],
    edgeKind: 'open', edgeOnce: false, facade: false,
    fit: { 'lasius-niger': 3, 'camponotus-pennsylvanicus': 1, 'messor-barbarus': 2, 'atta-texana': 1 },
  },
  'kitchen-door': {
    id: 'kitchen-door', tier: 1,
    natural: [
      { type: 'lawn', variants: v(['mown', 1]), frac: [0.55, 0.7], seed: 'center' },
      { type: 'garden-bed', variants: v(['flower', 2], ['vegetable', 1]), frac: [0.3, 0.45], seed: 'edge' },
    ],
    built: ['interior', 'patio'],
    optional: [{ p: 0.3, built: 'driveway' }],
    edgeKind: 'fence', edgeOnce: false, facade: false,
    fit: { 'lasius-niger': 3, 'camponotus-pennsylvanicus': 3, 'messor-barbarus': 0, 'atta-texana': 1 },
  },
  'field-margin': {
    id: 'field-margin', tier: 3,
    natural: [
      { type: 'lawn', variants: v(['rough', 1]), frac: [0.6, 0.75], seed: 'any' },
      { type: 'garden-bed', variants: v(['fallow', 1]), frac: [0.2, 0.3], seed: 'edge' },
    ],
    built: ['lane'],
    optional: [{ p: 0.5, natural: { type: 'forest', variants: v(['deciduous', 1]), frac: [0.1, 0.2], seed: 'edge' } }],
    edgeKind: 'dry-stone-wall', edgeOnce: true, facade: false,
    fit: { 'lasius-niger': 2, 'camponotus-pennsylvanicus': 1, 'messor-barbarus': 3, 'atta-texana': 1 },
  },
};

/** Zone type and variant of each built kind. */
export const BUILT_ZONE: Record<BuiltKind, { type: ZoneType; variant: ZoneVariant }> = {
  interior: { type: 'interior', variant: 'kitchen' },
  patio: { type: 'pavement', variant: 'patio' },
  path: { type: 'pavement', variant: 'path' },
  sidewalk: { type: 'pavement', variant: 'sidewalk' },
  'car-park': { type: 'asphalt', variant: 'car-park' },
  driveway: { type: 'asphalt', variant: 'driveway' },
  lane: { type: 'asphalt', variant: 'lane' },
  sand: { type: 'sand', variant: 'sand-pit' },
  rubber: { type: 'rubber', variant: 'poured' },
};

/** Placement order of built zones (GDD 04 §4.2 step 1b). */
export const BUILT_ORDER: readonly BuiltKind[] = ['interior', 'car-park', 'driveway', 'lane', 'sidewalk', 'patio', 'sand', 'rubber', 'path'];

/** Archetype zone count limits (GDD 04 §1.3: 3 to 5 zone types). */
export const ZONE_TYPES_MAX = 5;
export const ZONE_TYPES_MIN = 3;

/** clamp(f * L, lo, hi) size rules, mm (GDD 04 §1.4). */
export interface ClampRule { f: number; lo: number; hi: number }
export const BUILT_SIZE = {
  interiorDepth: { f: 0.22, lo: 3000, hi: 4500 } as ClampRule,
  kitchenWidth: { f: 0.5, lo: 3000, hi: 6000 } as ClampRule,
  /** Kitchen slice offset from the strip corners, mm. */
  kitchenCornerMin: 600,
  /** Back door: leaf width and minimum distance of its centre from the slice corners, mm. */
  doorWidth: 900,
  doorCornerMin: 900,
  patioWidth: { f: 0.3, lo: 2400, hi: 6000 } as ClampRule,
  patioDepth: { f: 0.15, lo: 1800, hi: 4000 } as ClampRule,
  pathWidth: [900, 1500] as [number, number],
  /** Path routing grid, mm; Chaikin passes; A* cost noise amplitude and wavelength (mm). */
  pathGrid: 250,
  pathChaikin: 2,
  pathNoise: 1.5,
  pathNoiseWavelength: 3000,
  sidewalkWidth: [1500, 2500] as [number, number],
  carParkDepth: { f: 0.45, lo: 5000, hi: 16000 } as ClampRule,
  bayWidth: 2400,
  bayDepth: 4800,
  roadWidth: [2500, 3500] as [number, number],
  sandSide: [2000, 4000] as [number, number],
  sandCapFrac: 0.25,
  sandEdgeMin: 1500,
  rubberSide: [3000, 6000] as [number, number],
  rubberCapFrac: 0.3,
  /** Raised beds inside a garden-bed zone: probability per bed zone, count, sizes (board lengths), mm. */
  raisedBedP: 0.3,
  raisedBedCount: [1, 3] as [number, number],
  raisedBedLen: [1200, 2400] as [number, number],
  raisedBedWidth: [600, 1200] as [number, number],
  /** Built zones may cover at most this share of the map; above it every rect shrinks by `shrinkStep`. */
  builtMaxFrac: 0.7,
  shrinkStep: 0.9,
  /** Candidates per built-zone placement (GDD 04 §4.2 step 1b). */
  candidates: 16,
};

/** Natural zone growth (GDD 04 §4.2 step 1d-e). */
export const NATURAL_GROWTH = {
  /** Seed cells per natural zone: 1 or 2. */
  seedsMax: 2,
  /** Probability that a natural zone gets a second seed. */
  secondSeedP: 0.5,
  /** Minimum seed spacing as a fraction of L. */
  seedSpacingFrac: 0.25,
  /** Step cost 1 + k * fbm(cell / wavelength). */
  costNoise: 0.8,
  costNoiseWavelength: 2000,
  /** Islands smaller than this merge into their majority neighbour, mm^2. */
  minIslandMm2: 0.5e6,
  /** Seeds of 'edge' / 'corner' zones lie within this share of L from the map edge. */
  edgeBandFrac: 0.15,
};

/** Residual fraction tolerance used when ranges cannot sum to 1 (sole natural zone), for tests and reports. */
export const FRACTION_TOLERANCE = 0.03;
