// Game configuration chosen at New Game (GDD 01 §1, GDD 04 App. A `WorldParams`, GDD 06 §14).
// Stored in SimState.config; the static world is regenerated from `world` on load.

import type { DifficultyId, Season, SeasonLengthDays, SpeciesId } from './ids';
import type {
  AutoSlowMode, FoundingLeniency, HumanActivityLevel, PredatorSetting, StartSeasonRule, WeatherSeverity, WinterRule,
} from './ids/progression';
import type { ArchetypeId, RegionId, WorldSizeId } from './ids/world';

/** Inputs of the world generator. Same params + generator version => identical WorldData. */
export interface WorldParams {
  generatorVersion: number;
  /** Seed as typed by the player (shown in UI); '' when random. */
  seedText: string;
  /** uint32 seed. */
  seed: number;
  speciesId: SpeciesId;
  archetype: ArchetypeId;
  region: RegionId;
  sizeClass: WorldSizeId;
  difficulty: DifficultyId;
  /** Number of established rival colonies to site (0-4). */
  rivalCount: number;
  /** Number of incipient conspecific rivals to site. */
  incipientCount: number;
  humanActivity: HumanActivityLevel;
}

/**
 * Effective custom rules (registry B6 keys; GDD 06 §14.1). Built from the difficulty preset and the player's
 * overrides (`config.difficulty.custom`); systems read these, never the preset.
 */
export interface CustomRules {
  predators: PredatorSetting;
  /** Established rival colony count 0-4 (incipient conspecifics are extra, from the preset). */
  rivals: number;
  humanActivity: HumanActivityLevel;
  weatherSeverity: WeatherSeverity;
  /** Season length in game days: 5, 7 (default) or 10. Calendar code must read this, never assume 7. */
  seasonLengthDays: SeasonLengthDays;
  /** Start season rule; `natural` = the species' founding day (resolved into GameConfig.startSeason). */
  startSeason: StartSeasonRule;
  foundingLeniency: FoundingLeniency;
  winterMode: WinterRule;
  foundingAssist: boolean;
  queenSenescence: boolean;
  collapse: boolean;
  extinctionEndsGame: boolean;
}

/**
 * Parameters of a difficulty preset (GDD 06 §14 `DifficultyDef`, values copied from the owning chapters; registry
 * C10, C11). Values in src/sim/balance/difficulty.ts. Rule toggles of the preset (foundingAssist, queenSenescence,
 * collapse ...) are CustomRules, not params.
 */
export interface DifficultyParams {
  // Founding (GDD 06 §5)
  foundingExposureRate: number;
  foundingBroodMortalityMult: number;
  reserveDrainMult: number;
  openingThreatsMax: number;
  openingInterruptMax: number;
  openingGraceGd: number;
  openingRetries: number;
  forecastPanel: boolean;
  // Weather and climate (GDD 06 §2-3; scaled by the weatherSeverity rule)
  rainFreqMult: number;
  stormFreqMult: number;
  heatWaveFreqMult: number;
  heatOffsetMult: number;
  frostFreqMult: number;
  pDrySpell: number;
  rainHitMult: number;
  floodInflowMult: number;
  heatToleranceOffsetC: number;
  // Threats, rivals, humans (GDD 04 §15.7, GDD 05 §5)
  predatorDensityMult: number;
  rivalAggMult: number;
  raidCooldownGd: number;
  rivalKMult: number;
  /** Incipient conspecific foundations placed at game start (GDD 05 §3.1 INCIPIENT_RIVALS). */
  incipientRivals: number;
  humanFreqMult: number;
  humanLethalMult: number;
  humanTelegraphMult: number;
  baitEnabled: 'off' | 'interior' | 'interior-garden';
  /** Threat director (GDD 05 §6): quiet game days between major threats; quiet share of daytime hours (I11). */
  threatMinQuietGd: number;
  quietShareMin: number;
  // Food
  foodAbundanceMult: number;
  honeydewYieldMult: number;
  // Colony
  broodSurvivalMult: number;
  workerLifespanMult: number;
  starvationToleranceMult: number;
  queenLifespanMult: number;
  winterLossMult: number;
  winterQueenDeathP: number;
  orphanDeclineMult: number;
  /** Damage taken by the possessed ant. */
  damageTakenMult: number;
  // Progression
  matureGateMult: number;
  alateCapMult: number;
  flightLossMult: number;
  /** Predator events during a nuptial flight, [min, max]. */
  flightPredatorEvents: [number, number];
  // Time and interface
  /** Initial `env.time.autoSlow`. */
  autoSlowDefault: AutoSlowMode;
  alertLeadWarnings: 'strong' | 'normal' | 'minimal';
  /** Speed floor of the possessed ant at low body temperature (GDD 01 PLAYER_TEMP_FLOOR). */
  playerTempFloor: number;
}

/** Difficulty choice (D1.12): the preset, its parameters and the player's rule overrides. */
export interface DifficultyConfig {
  preset: DifficultyId;
  params: DifficultyParams;
  /**
   * Rules the player changed from the preset. The keys present are the overrides (this one object uses
   * presence as meaning, like the `setDifficulty` payload it mirrors); values are never undefined.
   */
  custom: Partial<CustomRules>;
}

export interface GameConfig {
  species: SpeciesId;
  difficulty: DifficultyConfig;
  /** Effective rules = preset rules + difficulty.custom. */
  rules: CustomRules;
  /**
   * Starting season (never winter: createNewGame throws) and 1-based day of that season in the CONFIGURED season
   * length (values past the season's end are clamped to its last day). Default: the species' founding day.
   */
  startSeason: Season;
  startDayOfSeason: number;
  /** Start hour 0..24. */
  startHour: number;
  world: WorldParams;
  /** Enables `cheat.*` commands (test builds and ?test=1). */
  cheats: boolean;
}
