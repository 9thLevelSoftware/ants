// Debug / cheat commands (GDD 01-07 App. B). Accepted only when config.cheats is true (test builds, ?test=1).
// Unused optional values use -1 / null; positions are mm.

import type { Vec3 } from '@/core/math/vec3';
import type { BroodStage, Caste, CreatureKind, FoodKind, HumanEventKind, Task, WeatherState } from './ids';
import type { CreatureVariant, FoodVariant, RelationState } from './ids/ecology';
import type { FoundingDigState } from './ids/nest';
import type { RainClass } from './ids/progression';
import type { HumanVariant } from './ids/world';
import type { SeedClass } from './ids/species';

export type CheatCommand =
  // GDD 02 colony
  | { type: 'cheat.addFood'; colonyId: number; c: number; p: number; toxin: number }
  | { type: 'cheat.setStores'; colonyId: number; c: number; p: number }
  | { type: 'cheat.spawnAnts'; colonyId: number; n: number; caste: Caste; ageGd: number; task: Task | null; pos: Vec3 | null }
  | { type: 'cheat.spawnBrood'; colonyId: number; stage: BroodStage; n: number; chamberId: number; progress: number; destined: Caste | null }
  | { type: 'cheat.setChamberClimate'; chamberId: number; tempC: number; rh: number }
  | { type: 'cheat.setQueen'; colonyId: number; values: Record<string, number> }
  | { type: 'cheat.injectReturn'; entranceId: number; success: boolean; sourceId: number }
  // GDD 01 / 06 general
  | { type: 'cheat.kill'; id: number; cause: string }
  | { type: 'cheat.killAll'; colonyId: number }
  | { type: 'cheat.killQueen'; colonyId: number; cause: string }
  | { type: 'cheat.teleport'; antId: number; pos: Vec3 }
  // GDD 03 nest
  | { type: 'cheat.carveSphere'; pos: Vec3; r: number }
  | { type: 'cheat.carveEllipsoid'; center: Vec3; radii: Vec3; yawDeg: number }
  | { type: 'cheat.fillSphere'; pos: Vec3; r: number; loose: boolean }
  | { type: 'cheat.instantPlan'; planId: number }
  | { type: 'cheat.setSoilMoisture'; center: Vec3; radius: number; m: number }
  | { type: 'cheat.setRain'; intensity: number }
  | { type: 'cheat.setDrainScale'; k: number }
  | { type: 'cheat.spawnPellets'; pos: Vec3; n: number; volume: number }
  | { type: 'cheat.completeFounding'; workers: number }
  | { type: 'cheat.setFoundingState'; nestId: number; state: FoundingDigState }
  // GDD 04 world / humans
  | { type: 'cheat.humanEvent'; kind: HumanEventKind; variant: HumanVariant | null; at: Vec3 | null; startInS: number }
  | { type: 'cheat.setGrass'; heightMm: number; center: Vec3 | null; radius: number }
  | { type: 'cheat.setWater'; bodyId: number; levelMm: number }
  | { type: 'cheat.revealMicro' }
  // GDD 05 ecology / rivals / combat
  | { type: 'cheat.spawnCreature'; kind: CreatureKind; variant: CreatureVariant | null; pos: Vec3; state: string | null }
  | { type: 'cheat.spawnFood'; kind: FoodKind; variant: FoodVariant | null; pos: Vec3; units: number; stage: string | null }
  | { type: 'cheat.setHerd'; herdId: number; values: Record<string, number> }
  | { type: 'cheat.spawnHerd'; plantId: number; aphids: number; k: number }
  | { type: 'cheat.freezeGrowth'; herdId: number }
  | { type: 'cheat.setRival'; colonyId: number; values: Record<string, number> }
  | { type: 'cheat.setRelation'; a: number; b: number; e: number; state: RelationState | null }
  | { type: 'cheat.triggerRaid'; attacker: number; target: number; force: boolean }
  | { type: 'cheat.triggerBird'; variant: CreatureVariant | null; pos: Vec3 | null; force: boolean }
  | { type: 'cheat.triggerNestInvasion'; colonyId: number; force: boolean }
  | { type: 'cheat.combatFlags'; noRetreat: boolean; noInjury: boolean; noRng: boolean }
  // GDD 06 environment / progression
  | { type: 'cheat.setTime'; tick: number }
  | { type: 'cheat.setWeather'; state: WeatherState; intensityClass: RainClass | null }
  | { type: 'cheat.setWind'; ms: number }
  | { type: 'cheat.setAnomaly'; c: number }
  | { type: 'cheat.noLag'; on: boolean }
  | { type: 'cheat.setQueenAge'; colonyId: number; days: number }
  | { type: 'cheat.forceFlight' }
  | { type: 'cheat.unlockCodex'; id: string }
  | { type: 'cheat.triggerWinter' }
  // GDD 07 species modules
  | { type: 'cheat.setWood'; primId: number; mc: number; decay: number }
  | { type: 'cheat.addSeeds'; granaryId: number; seedClass: SeedClass; hardness: number; loads: number; u: number; g: number }
  | { type: 'cheat.setGarden'; chamberId: number; values: Record<string, number> }
  | { type: 'cheat.supplySubstrate'; chamberId: number; luPerGd: number; q: number; p: number; t: number; plantId: number }
  | { type: 'cheat.infectGarden'; chamberId: number; i: number }
  | { type: 'cheat.setColonyAge'; colonyId: number; years: number };
