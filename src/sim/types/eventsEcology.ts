// Sim events: food sources, herds, creatures, rivals, combat (GDD 05 App. C) and species modules (GDD 07 App. C).

import type { Vec3 } from '@/core/math/vec3';
import type { Caste, ColonySpeciesId, CreatureKind, FoodKind } from './ids';
import type { Injury } from './ids/ants';
import type {
  CarrionStage, CreatureVariant, EncounterOutcome, FoodVariant, HitKind, RelationState,
} from './ids/ecology';
import type { GardenState } from './ids/species';

export type EcologyEvent =
  | { type: 'food-source-spawned'; sourceId: number; kind: FoodKind; variant: FoodVariant | null; pos: Vec3 }
  | { type: 'food-source-discovered'; sourceId: number; colonyId: number }
  | { type: 'food-source-exhausted'; sourceId: number; colonyId: number }
  | { type: 'food-source-removed'; sourceId: number; cause: string }
  | { type: 'carrion-stage-changed'; sourceId: number; itemId: number; stage: CarrionStage }
  | { type: 'herd-founded'; herdId: number; a: number }
  | { type: 'herd-collapsed'; herdId: number; a: number; cause: string }
  | { type: 'herd-dormant'; herdId: number; a: number }
  | { type: 'herd-hatched'; herdId: number; a: number }
  | { type: 'herd-predator-arrived'; herdId: number; creatureId: number; kind: CreatureKind }
  | { type: 'herd-predator-repelled'; herdId: number; creatureId: number; kind: CreatureKind }
  | { type: 'herd-predator-left'; herdId: number; creatureId: number; kind: CreatureKind }
  | { type: 'aphid-moved'; fromHerd: number; toHerd: number; antId: number }
  | { type: 'aphid-culled'; fromHerd: number; antId: number }
  | { type: 'prey-subdued'; creatureId: number; kind: CreatureKind; antIds: number[] }
  | { type: 'prey-escaped'; creatureId: number; kind: CreatureKind; antIds: number[] }
  | { type: 'carcass-butchered'; itemId: number; carriers: number[]; bulk: number }
  | { type: 'creature-spawned'; id: number; kind: CreatureKind; variant: CreatureVariant | null }
  | { type: 'creature-despawned'; id: number; kind: CreatureKind; cause: string }
  | { type: 'creature-died'; id: number; kind: CreatureKind; cause: string }
  | { type: 'predator-telegraph'; creatureId: number; targetId: number; strikeAtTick: number; aimPoint: Vec3; kind: CreatureKind }
  | { type: 'predator-strike'; creatureId: number; targetId: number; hit: boolean; damage: number }
  | { type: 'ant-seized'; antId: number; by: number }
  | { type: 'ant-freed'; antId: number; by: number }
  | { type: 'ant-paralysed'; antId: number; by: number }
  | { type: 'ant-stuck'; antId: number; by: number }
  | { type: 'antlion-flick'; hazardId: number; antId: number }
  | { type: 'antlion-grab'; hazardId: number; antId: number }
  | { type: 'bird-approach'; variant: CreatureVariant; pos: Vec3 }
  | { type: 'bird-landed'; variant: CreatureVariant; pos: Vec3 }
  | { type: 'bird-peck'; variant: CreatureVariant; pos: Vec3; targetId: number }
  | { type: 'bird-left'; variant: CreatureVariant; pos: Vec3; kills: number };

export type RivalCombatEvent =
  | { type: 'rival-encounter'; a: number; b: number; pos: Vec3; outcome: EncounterOutcome }
  | { type: 'rival-relation-changed'; a: number; b: number; from: RelationState; to: RelationState; e: number }
  | { type: 'rival-raid-started'; attacker: number; target: number; partySize: number }
  | { type: 'rival-raid-ended'; attacker: number; target: number; partySize: number; loot: number }
  | { type: 'brood-raided'; from: number; to: number; count: number; stage: string }
  | { type: 'rival-queen-killed'; colonyId: number; species: ColonySpeciesId; pos: Vec3 }
  | { type: 'rival-orphaned'; colonyId: number; species: ColonySpeciesId; pos: Vec3 }
  | { type: 'rival-destroyed'; colonyId: number; species: ColonySpeciesId; pos: Vec3 }
  | { type: 'rival-founded'; colonyId: number; species: ColonySpeciesId; pos: Vec3 }
  | { type: 'combat-hit'; attackerId: number; targetId: number; dmg: number; kind: HitKind }
  | { type: 'combat-lock'; holderId: number; targetId: number }
  | { type: 'combat-unlock'; holderId: number; targetId: number }
  | { type: 'combat-pin'; holderId: number; targetId: number }
  | { type: 'combat-spray'; antId: number; pos: Vec3; dir: Vec3; hitIds: number[] }
  | { type: 'ant-injured'; antId: number; injury: Injury }
  | { type: 'toxin-delivered'; colonyId: number; loads: number }
  | { type: 'toxin-deaths'; colonyId: number; deaths: number }
  | { type: 'thief-tunnel-breach'; thiefColony: number; hostColony: number; chamberId: number }
  | { type: 'thief-tunnel-closed'; thiefColony: number; hostColony: number; chamberId: number };

export type SpeciesEvent =
  | { type: 'herd-claimed'; herdId: number; colonyId: number; cause: string }
  | { type: 'herd-lost'; herdId: number; colonyId: number; cause: string }
  | { type: 'honeydew-relay'; fromAnt: number; toAnt: number; loads: number }
  | { type: 'frass-ejected'; siteId: number; pos: Vec3 }
  | { type: 'frass-pile-grew'; pileId: number; units: number }
  | { type: 'wood-moisture-alert'; siteId: number; mc: number; status: string }
  | { type: 'satellite-state'; siteId: number; state: string }
  | { type: 'brood-shuttled'; broodId: number; fromSite: number; toSite: number }
  | { type: 'queen-relocation'; fromSite: number; toSite: number; phase: 'proposed' | 'started' | 'done' | 'cancelled' }
  | { type: 'drum'; antId: number; pos: Vec3; wood: boolean }
  | { type: 'granary-state'; granaryId: number; damp: number; germinating: number; sprouted: number; rotting: number }
  | { type: 'seed-milled'; antId: number; loads: number; pasteOut: number }
  | { type: 'radicle-gnawed'; antId: number; loads: number }
  | { type: 'midden-seedling'; pos: Vec3 }
  | { type: 'midden-plant'; pos: Vec3 }
  | { type: 'garden-state'; chamberId: number; state: GardenState; cause: string }
  | { type: 'garden-infected'; chamberId: number; visible: boolean }
  | { type: 'all-gardens-lost'; colonyId: number; cause: string }
  | { type: 'plant-rejected'; plantId: number; reason: 'toxin' | 'protein'; untilTick: number }
  | { type: 'leaf-cache-spoiled'; chamberId: number; loads: number }
  | { type: 'hitchhiker-mounted'; antId: number; carrier: number }
  | { type: 'phorid-strike'; antId: number; carrier: number }
  | { type: 'caste-unlocked'; colonyId: number; caste: Caste };
