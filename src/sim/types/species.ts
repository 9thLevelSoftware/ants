// Species data schema (GDD 07 §3). Static data, not part of SimState (saves store only the species id).
// Piecewise-linear tables are arrays of [x, y] pairs with strictly increasing x.

import type { Caste, ChamberType, FoodKind, Material, Season, SpeciesId, Task, BroodStage } from './ids';
import type { ActionId } from './ids/ants';
import type { Weapon } from './ids/ecology';
import type { ClimateId, DayPhase, WinterMode } from './ids/progression';
import type {
  AlarmMode, DirectiveExtra, EconomyModuleId, FlightSynchrony, FoodRoute, FoundingMode, LarvaFood, MiddenStyle,
  MoundStyle, SpeciesTier, Subfamily, TaskSubtype,
} from './ids/species';

/** [x, y] breakpoints of a piecewise-linear curve. */
export type Curve = [number, number][];

export interface CasteDef {
  caste: Caste;
  /** Optional sub-bins (e.g. Atta 'small-media', nanitic). */
  sizeClasses: { id: string; minBu: number; maxBu: number }[];
  /** Triangular draw of body length, BU. */
  lengthBu: { min: number; mean: number; max: number };
  /** Mass at mean length, mg. */
  casteMassMg: number;
  /** Caps on the derived crop / carry capacities, loads; null = formula. */
  cropMax: number | null;
  carryOverride: number | null;
  mandibleFactor: number;
  macrocephalic: boolean;
  /** Cruise multiplier relative to species cruise; sprint absolute, BU/s. */
  cruiseMult: number;
  sprintBuS: number;
  /** Lifespan in game days (worker lifespans may depend on colony size: see `lifespanBySize`). */
  lifespanGd: { mean: number; sd: number };
  /** [colony size N, mean lifespan GD] (Lasius 33 at N<100 to 24 at N>=250); empty = use lifespanGd. */
  lifespanBySize: Curve;
  ageRateOutside: number;
  ageRateDormant: number;
  /**
   * Fixed combat stats from the GDD 05 §4.1 table (queens, gynes, males; D2.26); null = the mass formula
   * (maxHp = HP_PER_MG23 x mg^(2/3), bite = BITE_PER_MG23 x mg^(2/3) x mandibleFactor). `foundingMaxHp` is the
   * founding queen's value (Lasius 40 vs 50 established), null = maxHp.
   */
  fixedStats: { maxHp: number; bite: number; foundingMaxHp: number | null } | null;
  /** Explicit upkeep for queens/gynes/males, loads per GD; null = mass formula. */
  upkeepOverride: { restC: number; activeC: number; p: number } | null;
  /** Stage duration multiplier. */
  devMult: number;
  actions: ActionId[];
  /** Task propensity 0..1 multiplying response thresholds; 0 = never. Missing task = 1. */
  taskWeights: Partial<Record<Task, number>>;
  /** Earliest point a larva can be destined to this caste. */
  unlock: { minWorkers: number; minColonyAgeYears: number };
}

export interface LifeHistory {
  /** Stage durations of the standard worker at devRefC, GD. */
  stageGd: Record<BroodStage, number>;
  devRefC: number;
  /** [°C, rate] (1.0 at devRefC, zeros at both ends). */
  devRate: Curve;
  larvaFood: LarvaFood;
  animalProteinMinFrac: number;
  qMax: number;
  sizeBase: number;
  sizeK: number;
  /** [1-based day D, factor] over the default 28-day year (scaled with season length by the calendar). */
  fSeason: Curve;
  /** Laying windows [d0, d1] in year days, null = all year. */
  layWindows: [number, number][] | null;
  /** [°C, factor] royal-chamber temperature factor. */
  fTempQ: Curve;
  queenUpkeep: { c: number; p: number };
  queenLifespanYears: { min: number; max: number };
  /** [workers N, minor share, media share, major share]. */
  casteMixTarget: [number, number, number, number][];
  /** Species-specific extra brood hazards per GD. */
  broodHazard: Record<string, number>;
}

export interface FoundingDef {
  mode: FoundingMode;
  /** Site suitability per material 0..1; missing = refused. */
  siteMaterials: Partial<Record<Material, number>>;
  /** Hard refusal / bonus rules (ids interpreted by the opening module). */
  siteHard: string[];
  siteBonuses: string[];
  /**
   * Founding readiness geometry (GDD 03 §13.1 `D_MIN`, `V_MIN`, `W_MIN`; D2.28): minimum founding-cell depth in
   * open ground / under cover, BU; minimum cell volume, BU^3; minimum cell width, BU; shaft depth the AI aims for, BU.
   */
  dMinOpenBu: number;
  dMinCoverBu: number;
  vMinBu3: number;
  wMinBu: number;
  shaftTargetBu: number;
  seal: boolean;
  /** Founding reserves, single C+P pool, loads (`FOUND_R0`). */
  R0: number;
  /** Most eggs of the founding clutch (`FOUND_CLUTCH_MAX_EGGS`). */
  clutchCap: number;
  trophicFraction: number;
  firstBroodClass: { caste: Caste; nanitic: boolean };
  expectedFirstWorkers: { min: number; max: number };
  special: string[];
  /** Natural start window: days of year (default 28-day year) and default day / hour range. */
  startDoy: { min: number; max: number; default: number };
  startHours: [number, number];
}

/** Colony size data. Every threshold is in SIMULATED workers N (ruling 4; no per-agent weights). */
export interface ScaleDef {
  simCapWorkers: number;
  /** Real colony sizes, used ONLY by codex text (D2.25): typical range and maximum, real workers. */
  wildColonySize: { typical: [number, number]; max: number };
  /** Stage thresholds `growThreshold` / `matureThreshold` (GDD 06 §7, x difficulty matureGateMult), workers. */
  growThreshold: number;
  matureThreshold: number;
  /** [yearEnd, minN, maxN] headless balance targets. */
  growthTargets: [number, number, number][];
}

export interface ReproductionDef {
  matureAgeYears: number;
  /** Day-of-year windows over the default 28-day year. */
  alateLayWindow: [number, number];
  reproMaxFrac: number;
  reproGyneShare: number;
  sexualCostMult: { gyne: number; male: number };
  alateFlightWindow: [number, number];
  flightPeak: [number, number];
  launchHours: [number, number];
  flightGate: { minAirC: number; maxWindMs: number; noRain: boolean };
  synchrony: FlightSynchrony;
  alatesOverwinter: boolean;
  /** p_air, p_mate, p_found (GDD 06 §11.2). */
  pAir: number;
  pMate: number;
  pFound: number;
  /** Alate upkeep, C loads per GD. */
  gyneUpkeepC: number;
  maleUpkeepC: number;
}

export interface DietDef {
  foods: Partial<Record<FoodKind, { pref: number; route: FoodRoute; tier: 'T1' | 'T2' | 'T3' }>>;
  /** Protein share targeted with / without larvae present. */
  pTargetFrac: number;
  pTargetFracNoLarvae: number;
  sapPerCut: number;
}

export interface ChamberTemplate {
  type: ChamberType;
  widthBu: number;
  heightBu: number;
  depthBu: [number, number];
  /** Count rule: perUnit chambers per unitOf (workers or brood), plus a minimum colony size. */
  perUnit: number;
  unitOf: 'workers' | 'brood' | 'fixed';
  minWorkers: number;
}

export interface NestTemplate {
  /** Dig-speed multiplier per material for nesting; missing = not diggable by this species. */
  nestMaterials: Partial<Record<Material, number>>;
  coverBonus: Material[];
  tunnelWidthBu: number;
  shaftWidthBu: number;
  chambers: ChamberTemplate[];
  entrances: { start: number; perWorkers: number; max: number };
  maxDepthBu: number;
  footprintRBu: number;
  volumeCapBu3: number;
  maxPathToEntranceBu: number;
  mound: MoundStyle;
  midden: MiddenStyle;
  broodClimate: { stage: BroodStage; tMin: number; tOpt: [number, number]; tMax: number; rh: [number, number] }[];
}

export interface ThermalDef {
  thermalShiftC: number;
  forageGate: { a: number; b: number; c: number; d: number };
  stressC: number;
  shadeSeekC: number;
  chillC: number;
  freezeC: number;
  lightPref: Record<DayPhase, number>;
  /** Seasonal overrides of lightPref (e.g. Messor summer nights). */
  lightPrefSeason: Partial<Record<Season, Partial<Record<DayPhase, number>>>>;
}

export interface SignalsDef {
  trailHalfLifeS: number;
  trailRefC: number;
  trunkTrail: { enabled: boolean; unusedHalfLifeGd: number; ghostAfterGd: number; ghostFadeGd: number; clearing: boolean };
  homeHalfLifeGd: number;
  ignorerFrac: number;
  recruitUnlockWorkers: number;
  recruitGroup: { min: number; max: number };
  patrolGate: { patrollers: number; returnsNeeded: number; windowS: number } | null;
  alarmMode: AlarmMode;
  alarmRadiusBu: number;
}

export interface CombatDef {
  weapons: Weapon[];
  acid: { max: number; regenS: number; coneDeg: number; rangeL: number } | null;
  sting: { damage: number; intervalS: number } | null;
  aggression: number;
  guardCastes: Caste[];
}

export interface WinterDef {
  mode: WinterMode;
  tColdStress: number;
  wintBaseLoss: number;
  wintMetBase: number;
  wintQ10: number;
  broodCarried: BroodStage;
  heatedNestRule: boolean;
}

export interface AppearanceDef {
  bodyColour: string;
  gasterColour: string;
  hairiness: number;
  waistNodes: 1 | 2;
  rearWeapon: 'acidopore' | 'sting';
  spines: number;
  headWidthRatio: Partial<Record<Caste, number>>;
  queenThoraxScale: number;
  alateWingTint: string;
}

export interface SpeciesDef {
  id: SpeciesId;
  binomial: string;
  commonName: string;
  subfamily: Subfamily;
  /** Body unit: length of the standard worker, mm. */
  buMm: number;
  /** Mass of the standard worker (m = 1), mg. */
  stdMassMg: number;
  available: boolean;
  tier: SpeciesTier;
  complexity: 1 | 2 | 3;
  playstyleLine: string;
  foundingSeason: Season;
  economyModules: EconomyModuleId[];
  codexIds: string[];
  /** AI cruise speed at speed multiplier 1, BU/s; loaded speed multiplier. */
  cruiseBuS: number;
  loadSpeedMult: number;
  castes: CasteDef[];
  life: LifeHistory;
  opening: FoundingDef;
  scale: ScaleDef;
  reproduction: ReproductionDef;
  diet: DietDef;
  nestTemplate: NestTemplate;
  thermal: ThermalDef;
  signals: SignalsDef;
  combat: CombatDef;
  climate: ClimateId;
  winter: WinterDef;
  directiveTasks: Task[];
  directiveExtras: DirectiveExtra[];
  taskSubtypes: TaskSubtype[];
  appearance: AppearanceDef;
  /** Economy module parameter blocks keyed by module id (present only for listed modules). */
  modules: Partial<Record<EconomyModuleId, Record<string, number>>>;
}
