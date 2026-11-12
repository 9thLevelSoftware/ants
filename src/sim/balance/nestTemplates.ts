// Species nest templates as GDD 03 §8.2 specifies them (GDD 03 owns the Lasius template, E-49; the T3 columns
// are GDD 03's values, which species-data may refine). SpeciesDef.nestTemplate predates these numbers; the nest
// module reads this table (recorded in the nestops report).

import type { ChamberSize, ChamberType, SpeciesId } from '@/sim/types';

/** Chamber dimensions W x H x L, BU (ellipsoid diameters: width, height, long axis). */
export interface ChamberDims {
  w: number;
  h: number;
  l: number;
}

export interface NestTemplateDef {
  /** Standard tunnel and queen-route diameters, BU. */
  tunnelD: number;
  royalD: number;
  footprintR: number;
  maxDepth: number;
  maxPathToEntrance: number;
  /** Open entrances allowed, and the larger cap from `extraEntranceWorkers` adult workers. */
  maxEntrances: number;
  maxEntrancesLarge: number;
  extraEntranceWorkers: number;
  volumeCap: number;
  /** The founding cell becomes royal at this many adult workers. */
  royalAt: number;
  /** Chamber sizes by type (missing type or size = not built by this species). */
  chambers: Partial<Record<ChamberType, Partial<Record<ChamberSize, ChamberDims>>>>;
  /** Depth bands below the surface or cover, BU. */
  depthBands: Partial<Record<ChamberType, [number, number]>>;
}

const d = (w: number, h: number, l: number): ChamberDims => ({ w, h, l });
const LN_SML = { s: d(6, 2.5, 8), m: d(8, 2.5, 12), l: d(10, 3, 16) };

/** Chamber types a species may plan (GDD 03 §6.3; `founding` and `royal` are never player-planned). */
export const PLANNABLE_TYPES: Record<SpeciesId, readonly ChamberType[]> = {
  'lasius-niger': ['nursery', 'food', 'midden', 'rest', 'general'],
  'camponotus-pennsylvanicus': ['nursery', 'food', 'midden', 'rest', 'general'],
  'messor-barbarus': ['nursery', 'food', 'granary', 'midden', 'rest', 'general'],
  'atta-texana': ['nursery', 'fungus', 'midden', 'rest', 'general'],
};

/** Chamber types a species may designate (GDD 03 §6.3: everything but `founding`). */
export const DESIGNATABLE_TYPES: Record<SpeciesId, readonly ChamberType[]> = {
  'lasius-niger': ['royal', 'nursery', 'food', 'midden', 'rest', 'general'],
  'camponotus-pennsylvanicus': ['royal', 'nursery', 'food', 'midden', 'rest', 'general'],
  'messor-barbarus': ['royal', 'nursery', 'food', 'granary', 'midden', 'rest', 'general'],
  'atta-texana': ['royal', 'nursery', 'fungus', 'midden', 'rest', 'general'],
};

export const NEST_TEMPLATES: Record<SpeciesId, NestTemplateDef> = {
  'lasius-niger': {
    tunnelD: 2.0, royalD: 2.5, footprintR: 80, maxDepth: 175, maxPathToEntrance: 120,
    maxEntrances: 3, maxEntrancesLarge: 4, extraEntranceWorkers: 800, volumeCap: 12000, royalAt: 8,
    chambers: {
      general: LN_SML, nursery: LN_SML, rest: LN_SML, midden: LN_SML,
      food: { s: d(6, 2, 8), m: d(8, 2.5, 10) },
      royal: { s: d(6, 2.5, 8), m: d(6, 2.5, 8), l: d(6, 2.5, 8) },
    },
    depthBands: { founding: [6, 15], royal: [12, 40], nursery: [4, 30], food: [8, 30], rest: [10, 60], general: [5, 60] },
  },
  'messor-barbarus': {
    tunnelD: 2.0, royalD: 2.5, footprintR: 150, maxDepth: 285, maxPathToEntrance: 200,
    maxEntrances: 6, maxEntrancesLarge: 6, extraEntranceWorkers: 0, volumeCap: 14000, royalAt: 10,
    chambers: {
      nursery: { s: d(8, 2.5, 10), m: d(10, 3, 12), l: d(12, 3, 14) },
      general: { s: d(8, 2.5, 10), m: d(10, 3, 12), l: d(12, 3, 14) },
      rest: { s: d(8, 2.5, 10), m: d(10, 3, 12), l: d(12, 3, 14) },
      food: { s: d(8, 2.5, 10), m: d(10, 3, 12) },
      granary: { s: d(10, 4, 12), m: d(13, 5, 14), l: d(16, 6, 16) },
      midden: { s: d(8, 2.5, 10) },
    },
    depthBands: { nursery: [15, 80], royal: [40, 150], granary: [60, 200], rest: [20, 150], general: [10, 150] },
  },
  'atta-texana': {
    tunnelD: 2.5, royalD: 3.0, footprintR: 150, maxDepth: 450, maxPathToEntrance: 300,
    maxEntrances: 40, maxEntrancesLarge: 40, extraEntranceWorkers: 0, volumeCap: 30000, royalAt: 20,
    chambers: {
      fungus: { s: d(12, 6, 12), m: d(18, 9, 18), l: d(30, 12, 30) },
      midden: { s: d(10, 4, 12), m: d(10, 4, 12), l: d(10, 4, 12) },
      nursery: { s: d(8, 2.5, 10), m: d(10, 3, 12) },
      general: { s: d(8, 2.5, 10), m: d(10, 3, 12) },
      rest: { s: d(8, 2.5, 10), m: d(10, 3, 12) },
    },
    depthBands: { fungus: [40, 400], midden: [100, 400], royal: [150, 400], general: [20, 400] },
  },
  'camponotus-pennsylvanicus': {
    tunnelD: 2.0, royalD: 2.5, footprintR: 600, maxDepth: 175, maxPathToEntrance: 120,
    maxEntrances: 6, maxEntrancesLarge: 6, extraEntranceWorkers: 0, volumeCap: 8000, royalAt: 8,
    chambers: {
      general: { s: d(5, 2.5, 9), m: d(8, 2.5, 14), l: d(12, 3, 20) },
      nursery: { s: d(5, 2.5, 9), m: d(8, 2.5, 14), l: d(12, 3, 20) },
      rest: { s: d(5, 2.5, 9), m: d(8, 2.5, 14), l: d(12, 3, 20) },
      food: { s: d(5, 2.5, 9), m: d(8, 2.5, 14) },
      midden: { s: d(5, 2.5, 9) },
    },
    depthBands: { general: [2, 175], nursery: [2, 10] },
  },
};

/** The species' nest template (Lasius for unknown ids). */
export function nestTemplate(species: SpeciesId | string): NestTemplateDef {
  return NEST_TEMPLATES[species as SpeciesId] ?? NEST_TEMPLATES['lasius-niger'];
}

/** Open-entrance cap for a nest of this species with `workers` adult workers (GDD 03 §4.3). */
export function maxEntrancesFor(species: SpeciesId | string, workers: number): number {
  const t = nestTemplate(species);
  return t.extraEntranceWorkers > 0 && workers >= t.extraEntranceWorkers ? t.maxEntrancesLarge : t.maxEntrances;
}

/** Caste dig values (GDD 03 §1.2): head scale of the bite brush (T1 Lasius; others default to 1). */
export const DIG_HEAD_SCALE: Partial<Record<string, number>> = { worker: 1.0, queen: 1.0, minor: 0.85, media: 1.0, major: 1.3 };
/** Lasius nanitic head scale. */
export const DIG_HEAD_SCALE_NANITIC = 0.85;
