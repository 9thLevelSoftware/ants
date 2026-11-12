// Game configuration chosen at New Game (GDD 01 §1, GDD 04 App. A `WorldParams`, GDD 06 §14).
// Stored in SimState.config; the static world is regenerated from `world` on load.

import type { DifficultyId, Season, SeasonLengthDays, SpeciesId } from './ids';
import type {
  HumanActivityLevel, PredatorSetting, WeatherSeverity, WinterRule,
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

/** Custom rule toggles (GDD 06 §14; GDD 03 `collapse`). Presets fill these; the player may override. */
export interface CustomRules {
  predators: PredatorSetting;
  /** Rival colony count 0-4. */
  rivals: number;
  humanActivity: HumanActivityLevel;
  weatherSeverity: WeatherSeverity;
  /** Season length in game days: 5, 7 (default) or 10. Calendar code must read this, never assume 7. */
  seasonLengthDays: SeasonLengthDays;
  winterMode: WinterRule;
  foundingAssist: boolean;
  queenSenescence: boolean;
  extinctionEndsGame: boolean;
  collapse: boolean;
}

export interface GameConfig {
  species: SpeciesId;
  difficulty: DifficultyId;
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
