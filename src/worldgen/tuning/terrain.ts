// Heightfield relief, built levels and strata (GDD 04 §2.1-2.3, §4.2 step 2). Lengths in mm.

import type { MaterialId, RegionId, SpeciesId, ZoneType } from '@/sim/types';

/** Macro and micro relief per natural zone type (GDD 04 §2.1). Built zones are planar. */
export interface Relief {
  /** fBm amplitude, mm (height = amp * fbm, fbm in [-1, 1]). */
  macroAmp: number;
  /** Macro wavelength range, mm (rolled once per world for the zone type). */
  macroWave: [number, number];
  microAmp: number;
  /** Micro wavelength in terrain cells (never below 3 cells). */
  microWaveCells: number;
  /** Mean level offset, mm (beds +30 soil heave). */
  offset: number;
}

export const RELIEF: Partial<Record<ZoneType, Relief>> = {
  forest: { macroAmp: 120, macroWave: [3000, 6000], microAmp: 8, microWaveCells: 3, offset: 0 },
  lawn: { macroAmp: 40, macroWave: [4000, 4000], microAmp: 3, microWaveCells: 3, offset: 0 },
  'garden-bed': { macroAmp: 30, macroWave: [3000, 3000], microAmp: 6, microWaveCells: 3, offset: 30 },
};

export const TERRAIN = {
  macroOctaves: 3,
  /** Micro relief: one octave at this wavelength in terrain cells (>= the 3-cell minimum of GDD 04 §4.2). */
  microOctaves: 1,
  microWaveCells: 4,
  /** Map-wide tilt, grade 0..1 % (GDD 04 step 2). */
  tiltMax: 0.01,
  /** Natural cells within this distance of a built zone blend to its edge level (smoothstep), mm. */
  blendDist: 300,
  /** Radius of the box blur that smooths zone amplitudes across zone borders, mm. */
  ampBlur: 500,
  /** Forest hollows per forest zone, diameter and depth, mm. */
  hollowCount: [2, 4] as [number, number],
  hollowDiam: [600, 1500] as [number, number],
  hollowDepth: [40, 80] as [number, number],
  /** Raised-bed soil offset, mm. */
  raisedBedLift: [150, 300] as [number, number],
  /** Worm casts on lawns: per m^2, diameter, height (mm); skipped when narrower than 2 terrain cells. */
  wormCastPerM2: 0.5,
  wormCastDiam: [20, 40] as [number, number],
  wormCastHeight: [10, 20] as [number, number],
  /** Heights are stored quantised to 1/256 mm (DET-5). */
  heightQuantum: 256,
};

/** Built-zone surface levels and falls (GDD 04 §2.2, §2.1). */
export const LEVELS = {
  patioTop: 10,
  /** Patio fall away from the house (1:60). */
  patioFall: 1 / 60,
  sidewalkTop: 0,
  sidewalkFall: 1 / 60,
  /** Kerb top next to asphalt (the blend target of natural ground beside a road). */
  kerbTop: 0,
  carParkSurface: -125,
  /**
   * The kerb step is a smooth ramp from the kerb top down to the road across the kerb's own width (the kerb
   * primitive, 125 wide, covers it): no sharp heightfield kink a surface walker could stall in.
   */
  kerbRamp: 125,
  /** Asphalt fall toward the kerb gullies (1:80). */
  asphaltFall: 1 / 80,
  laneSurface: -125,
  /** Driveway: dropped kerb (decision, the level table lists only car park and lane). */
  drivewaySurface: -40,
  sandSurface: 10,
  rubberSurface: 0,
  /** Interior floor top and the slab underside (terrain level under the building). */
  floorTop: 150,
  slabUnderside: -100,
  /** Level of the ground just outside the house wall (blend target). */
  houseOutside: 0,
};

/** Strata column per zone (GDD 04 §2.3), mapped onto GroundLayers (surface + crust thickness + subsoil). */
export interface StrataRule {
  surface: MaterialId;
  /** Crust (surface layer) thickness range, mm; 0 = subsoil from the surface. Capped at 255 (byte map). */
  crust: [number, number];
  subsoil: MaterialId;
}

export const STRATA: Record<ZoneType, StrataRule> = {
  forest: { surface: 'humus', crust: [20, 60], subsoil: 'loam' },
  lawn: { surface: 'loam', crust: [250, 250], subsoil: 'clay' },
  'garden-bed': { surface: 'loam', crust: [255, 255], subsoil: 'clay' },
  // Stand-in slab crust (concrete, slab thickness) over the gravel sub-base until slab primitives are laid.
  pavement: { surface: 'concrete', crust: [50, 50], subsoil: 'gravel' },
  asphalt: { surface: 'asphalt', crust: [60, 60], subsoil: 'gravel' },
  sand: { surface: 'sand', crust: [229, 255], subsoil: 'loam' },
  rubber: { surface: 'rubber', crust: [40, 100], subsoil: 'gravel' },
  // Under the floor slab primitive: sand blinding 50 mm, then clay fill.
  interior: { surface: 'sand', crust: [50, 50], subsoil: 'clay' },
};

/** Region overrides of the top of soft zones (forest, lawn, garden-bed), GDD 04 §2.3. */
export const REGION_STRATA: Partial<Record<RegionId, { surface: MaterialId; crust: number; subsoil: MaterialId }>> = {
  mediterranean: { surface: 'loam', crust: 255, subsoil: 'gravel' },
  'southern-us': { surface: 'sand', crust: 255, subsoil: 'loam' },
};
export const SOFT_ZONES: readonly ZoneType[] = ['forest', 'lawn', 'garden-bed'];

/** Strata boundary jitter: +-20 % by 2D noise of wavelength 1 m. */
export const STRATA_JITTER = { amp: 0.2, wavelength: 1000 };

/** Bedrock depth per species, BU (GDD 04 §2.3; informational: the nest template's maxDepth limits digging). */
export const DIG_FLOOR_BU: Record<SpeciesId, number> = {
  'lasius-niger': 200, 'camponotus-pennsylvanicus': 150, 'messor-barbarus': 300, 'atta-texana': 500,
};

/** Base moisture offset per region (GDD 04 §1.2). */
export const REGION_MOISTURE: Record<RegionId, number> = {
  'temperate-eu': 0, 'ne-america': 0, mediterranean: -0.15, 'southern-us': 0,
};
