// Creature tunables (GDD 05 §2, §1.4 aphid predators, §1.5 prey, §5 levers, §6 threat director; owner: creatures).
// Creature sizes, speeds, strike ranges and senses are ABSOLUTE (GDD 05 §0): senses the chapter writes in BU are
// Lasius BU (4 mm), converted here with REF_BU_MM. Ant-centric distances (L = the ant's body length) stay in L.
// Imported directly as '@/sim/balance/creatures' (not re-exported from the balance barrel, to avoid name clashes).

import type { CreatureKind, DifficultyId, PredatorSetting, ZoneType } from '@/sim/types';

/** The BU of GDD 05's creature sense column (Lasius BU, §0). */
export const REF_BU_MM = 4;

/** Families: who the director culls first over the global cap (§2.7: neutral, prey, aphid predators; never ant predators). */
export type CreatureFamily = 'prey' | 'neutral' | 'aphid-predator' | 'ant-predator' | 'event';

/** One row of the §2.2 catalogue (a/b). Speeds mm/s, sizes mm, senses mm. */
export interface CreatureStats {
  family: CreatureFamily;
  sizeMm: number;
  massMg: number;
  walkMmS: number;
  burstMmS: number;
  /** Main sense range, mm (vision / vibration / chemical; 0 = touch only). */
  senseMm: number;
  maxHp: number;
  armour: number;
  pull: number;
  acidSens: number;
  /** Naturalist map maximum (§2.2b cap), before the setting multiplier. */
  cap: number;
  /** Prey value when killed: nutrients (loads) and bulk (loads of carry capacity) of the carcass. */
  deadC: number;
  deadP: number;
  deadBulk: number;
}

const s = (o: CreatureStats): CreatureStats => o;

/**
 * §2.2 catalogue. Dead values: the chapter's where given (springtail 0.25 P, fly larva 3 P, caterpillar 4 / 20 P,
 * fruit fly 0.4 P + 0.05 C, woodlouse 10 P, earthworm 120 P + 5 C, snail 40 P, millipede 15 P, ladybird 6 P,
 * ladybird larva 3 P). Otherwise (decision) the §4.7 corpse rule P = 0.4 x massMg with C = 2.5 % of P (the
 * insect-small ratio); bulk = massMg / REF_CARRY_MG (2 mg) except where §2.2 gives a bulk.
 */
export const CREATURE_STATS: Record<CreatureKind, CreatureStats> = {
  aphid: s({ family: 'prey', sizeMm: 2, massMg: 0.3, walkMmS: 0, burstMmS: 0, senseMm: 0, maxHp: 1, armour: 0, pull: 0, acidSens: 1, cap: 0, deadC: 0.02, deadP: 0.08, deadBulk: 0.15 }),
  ladybird: s({ family: 'aphid-predator', sizeMm: 6.5, massMg: 35, walkMmS: 10, burstMmS: 300, senseMm: 200 * REF_BU_MM, maxHp: 40, armour: 0.6, pull: 6, acidSens: 0.5, cap: 8, deadC: 0.15, deadP: 6, deadBulk: 17.5 }),
  'ladybird-larva': s({ family: 'aphid-predator', sizeMm: 8, massMg: 15, walkMmS: 5, burstMmS: 5, senseMm: 0, maxHp: 25, armour: 0.2, pull: 3, acidSens: 1, cap: 10, deadC: 0.08, deadP: 3, deadBulk: 7.5 }),
  'lacewing-larva': s({ family: 'aphid-predator', sizeMm: 7, massMg: 5, walkMmS: 6, burstMmS: 6, senseMm: 0, maxHp: 20, armour: 0.3, pull: 2, acidSens: 1, cap: 8, deadC: 0.05, deadP: 2, deadBulk: 2.5 }),
  springtail: s({ family: 'prey', sizeMm: 1.5, massMg: 0.1, walkMmS: 5, burstMmS: 60, senseMm: 0, maxHp: 1, armour: 0, pull: 0.2, acidSens: 1, cap: 40, deadC: 0, deadP: 0.25, deadBulk: 0.1 }),
  mite: s({ family: 'prey', sizeMm: 0.5, massMg: 0.05, walkMmS: 1, burstMmS: 1, senseMm: 0, maxHp: 1, armour: 0.5, pull: 0.1, acidSens: 1, cap: 10, deadC: 0, deadP: 0.08, deadBulk: 0.05 }),
  'fly-larva': s({ family: 'prey', sizeMm: 8, massMg: 15, walkMmS: 1, burstMmS: 1, senseMm: 0, maxHp: 20, armour: 0, pull: 3, acidSens: 1, cap: 60, deadC: 0.08, deadP: 3, deadBulk: 3 }),
  caterpillar: s({ family: 'prey', sizeMm: 10, massMg: 8, walkMmS: 3, burstMmS: 3, senseMm: 0, maxHp: 15, armour: 0, pull: 4, acidSens: 1, cap: 12, deadC: 0.1, deadP: 4, deadBulk: 4 }),
  'fruit-fly': s({ family: 'prey', sizeMm: 2.5, massMg: 1, walkMmS: 10, burstMmS: 400, senseMm: 10 * REF_BU_MM, maxHp: 2, armour: 0, pull: 0.5, acidSens: 1, cap: 20, deadC: 0.05, deadP: 0.4, deadBulk: 0.5 }),
  woodlouse: s({ family: 'neutral', sizeMm: 10, massMg: 30, walkMmS: 10, burstMmS: 10, senseMm: 0, maxHp: 50, armour: 0.5, pull: 10, acidSens: 0.3, cap: 30, deadC: 0.25, deadP: 10, deadBulk: 15 }),
  earthworm: s({ family: 'neutral', sizeMm: 100, massMg: 1000, walkMmS: 2, burstMmS: 2, senseMm: 0, maxHp: 300, armour: 0, pull: 100, acidSens: 1, cap: 8, deadC: 5, deadP: 120, deadBulk: 500 }),
  snail: s({ family: 'neutral', sizeMm: 20, massMg: 1000, walkMmS: 1.5, burstMmS: 1.5, senseMm: 0, maxHp: 200, armour: 0.8, pull: 60, acidSens: 0.2, cap: 10, deadC: 2, deadP: 40, deadBulk: 100 }),
  millipede: s({ family: 'neutral', sizeMm: 30, massMg: 100, walkMmS: 8, burstMmS: 8, senseMm: 0, maxHp: 80, armour: 0.5, pull: 20, acidSens: 0.3, cap: 12, deadC: 0.4, deadP: 15, deadBulk: 50 }),
  'jumping-spider': s({ family: 'ant-predator', sizeMm: 6, massMg: 15, walkMmS: 8, burstMmS: 160, senseMm: 30 * REF_BU_MM, maxHp: 35, armour: 0, pull: 12, acidSens: 1, cap: 4, deadC: 0.15, deadP: 6, deadBulk: 7.5 }),
  'wolf-spider': s({ family: 'ant-predator', sizeMm: 10, massMg: 60, walkMmS: 20, burstMmS: 250, senseMm: 8 * REF_BU_MM, maxHp: 70, armour: 0, pull: 25, acidSens: 1, cap: 3, deadC: 0.6, deadP: 24, deadBulk: 30 }),
  'ant-spider': s({ family: 'ant-predator', sizeMm: 3, massMg: 3, walkMmS: 15, burstMmS: 80, senseMm: 20 * REF_BU_MM, maxHp: 15, armour: 0, pull: 4, acidSens: 1, cap: 3, deadC: 0.03, deadP: 1.2, deadBulk: 1.5 }),
  antlion: s({ family: 'ant-predator', sizeMm: 10, massMg: 30, walkMmS: 0, burstMmS: 0, senseMm: 0, maxHp: 60, armour: 0.4, pull: 20, acidSens: 0.5, cap: 12, deadC: 0.3, deadP: 12, deadBulk: 15 }),
  centipede: s({ family: 'ant-predator', sizeMm: 20, massMg: 40, walkMmS: 30, burstMmS: 120, senseMm: 6 * REF_BU_MM, maxHp: 90, armour: 0.2, pull: 20, acidSens: 0.8, cap: 2, deadC: 0.4, deadP: 16, deadBulk: 20 }),
  'rove-beetle': s({ family: 'ant-predator', sizeMm: 5, massMg: 3, walkMmS: 60, burstMmS: 60, senseMm: 3 * REF_BU_MM, maxHp: 18, armour: 0.3, pull: 5, acidSens: 0.5, cap: 6, deadC: 0.03, deadP: 1.2, deadBulk: 1.5 }),
  'phorid-fly': s({ family: 'ant-predator', sizeMm: 2.5, massMg: 0.5, walkMmS: 0, burstMmS: 0, senseMm: 15 * REF_BU_MM, maxHp: 2, armour: 0, pull: 0.5, acidSens: 1, cap: 0, deadC: 0, deadP: 0.2, deadBulk: 0.25 }),
  bird: s({ family: 'event', sizeMm: 200, massMg: 0, walkMmS: 0, burstMmS: 0, senseMm: 0, maxHp: 1, armour: 1, pull: 0, acidSens: 0, cap: 1, deadC: 0, deadP: 0, deadBulk: 0 }),
};

/** Medium caterpillar (§2.2a/b): 22 mm, 60 mg, 60 HP, pull 15; 20 P, bulk 25 (butchered). Hairy variant share 20 %. */
export const CATERPILLAR_MEDIUM = { sizeMm: 22, massMg: 60, maxHp: 60, pull: 15, deadP: 20, deadC: 0.5, deadBulk: 25 };
export const CATERPILLAR_MEDIUM_SHARE = 0.4;
export const CATERPILLAR_HAIRY_SHARE = 0.2;

/** Creature kinds that hold worldgen territories (§2.7 residents). */
export const RESIDENT_KINDS: readonly CreatureKind[] = ['jumping-spider', 'wolf-spider', 'ant-spider', 'antlion', 'woodlouse'];
/** Kinds that come out of their worldgen territories while active (night / rain) and leave at dawn. */
export const VISITOR_KINDS: readonly CreatureKind[] = ['centipede', 'rove-beetle', 'millipede', 'earthworm', 'snail'];
/** Chance per director run that a free visitor territory sends out its animal while the kind is active. */
export const VISITOR_SPAWN_P = 0.1;
/** Chance per director run that a fruit-fly source below its share gets one more fly. */
export const FRUIT_FLY_SPAWN_P = 0.2;
/** Share of woodlice that roll when bitten (§2.2b). */
export const WOODLOUSE_ROLLERS = 0.5;
/** Kinds the director never culls over the global cap (§2.7). */
export const NEVER_CULLED: readonly CreatureFamily[] = ['ant-predator', 'event'];
/** Global live-agent cap (§2.7, I5). */
export const CREATURE_AGENT_CAP = 260;
/** Spawn / despawn distances, Lasius BU (§2.7). */
export const SPAWN_MIN_DIST_FOCUS_BU = 40;
export const SPAWN_MIN_DIST_ANT_BU = 20;
export const DESPAWN_MIN_DIST_BU = 60;
export const STUCK_DESPAWN_S = 30;
/** Territory re-occupation after a resident died, gd (§2.2b; antlion: worldgen-only, never re-occupied). */
export const RESPAWN_DELAY_GD: Partial<Record<CreatureKind, number>> = {
  'jumping-spider': 1, 'wolf-spider': 1.5, 'ant-spider': 1, woodlouse: 1, antlion: 1e9,
};

/** Predators setting -> caps and spawn multiplier (§5; registry C: off 0, few 0.4, normal 1, many 1.6). */
export const PREDATOR_SETTING_MULT: Record<PredatorSetting, number> = { off: 0, few: 0.4, normal: 1, many: 1.6 };

/** Difficulty levers of §5 that DifficultyParams does not carry. */
export interface CreatureLevers {
  predatorDamageMult: number;
  telegraphMult: number;
  aiDodgeP: number;
  aphidPredatorMult: number;
  /** May predators target the player's founding queen. */
  targetFoundingQueen: boolean;
  /** Predator exclusion radius around the player nest until it has 5 workers, Lasius BU. */
  nestExclusionBu: number;
}
export const CREATURE_LEVERS: Record<DifficultyId, CreatureLevers> = {
  gentle: { predatorDamageMult: 0.6, telegraphMult: 1.5, aiDodgeP: 0.5, aphidPredatorMult: 0.5, targetFoundingQueen: false, nestExclusionBu: 120 },
  naturalist: { predatorDamageMult: 1.0, telegraphMult: 1.0, aiDodgeP: 0.3, aphidPredatorMult: 1.0, targetFoundingQueen: true, nestExclusionBu: 40 },
  harsh: { predatorDamageMult: 1.25, telegraphMult: 0.75, aiDodgeP: 0.2, aphidPredatorMult: 1.3, targetFoundingQueen: true, nestExclusionBu: 0 },
};
/** Workers below which the nest exclusion applies (§5). */
export const NEST_EXCLUSION_WORKERS = 5;

// ---- predator attack framework (§2.4) ----

/** Wind-up lead before each strike, s (naturalist, x telegraphMult). Wolf spider adds its freeze cue before. */
export const TELEGRAPH_S: Partial<Record<CreatureKind, number>> = {
  'jumping-spider': 0.6, 'wolf-spider': 0.5, 'ant-spider': 0.3, centipede: 0.5, 'rove-beetle': 0.4,
};
export const WOLF_FREEZE_CUE_S = 1.0;
/** A strike misses if the target centre is farther than this from the aim point when it lands, mm. */
export const STRIKE_HIT_RADIUS_MM: Partial<Record<CreatureKind, number>> = {
  'jumping-spider': 4, 'wolf-spider': 5, centipede: 4, 'rove-beetle': 3, 'ant-spider': 3,
};
/** Strike damage and venom per second while seized (§2.2b), damage points before predatorDamageMult. */
export const STRIKE_DAMAGE: Partial<Record<CreatureKind, number>> = {
  'jumping-spider': 9, 'wolf-spider': 12, 'ant-spider': 1, centipede: 10, 'rove-beetle': 3,
};
export const VENOM_PER_S: Partial<Record<CreatureKind, number>> = {
  'jumping-spider': 0.5, 'wolf-spider': 0.8, centipede: 1.0, 'rove-beetle': 1.5, antlion: 1.5,
};
/** Largest ant a predator takes, mg (§2.2b "Eats"). */
export const PREY_MAX_MG: Partial<Record<CreatureKind, number>> = {
  'jumping-spider': 3, 'wolf-spider': 25, 'ant-spider': 3, centipede: 30, 'rove-beetle': 1.5, antlion: 30,
};
/** Distance from which the predator launches its strike (stalk / approach end), mm. */
export const STRIKE_RANGE_MM: Partial<Record<CreatureKind, number>> = {
  'jumping-spider': 16, 'wolf-spider': 30, 'ant-spider': 6, centipede: 15, 'rove-beetle': 8,
};
/**
 * Wind-up starts only on a target this slow, mm/s (decision: aim points are fixed when the wind-up starts, §2.4
 * "no prediction", so a predator waits for a pause - ants stop to antennate, harvest, tend - rather than wasting
 * strikes on a cruising ant). = hit radius / lead time, so a target that keeps its speed is still hit.
 */
export function windupMaxTargetSpeed(kind: CreatureKind, telegraphMult: number): number {
  const r = STRIKE_HIT_RADIUS_MM[kind] ?? 3, lead = (TELEGRAPH_S[kind] ?? 0.5) * telegraphMult;
  return r / Math.max(0.1, lead);
}
/** Flee conditions (§2.4 table): holders, deterrence, health fraction. Rove beetle: secretion instead. */
export const FLEE_RULE: Partial<Record<CreatureKind, { holders: number; deterrence: number; health: number }>> = {
  'jumping-spider': { holders: 2, deterrence: 0.6, health: 0.5 },
  'wolf-spider': { holders: 3, deterrence: 0.6, health: 0.4 },
  centipede: { holders: 5, deterrence: 0.5, health: 0.5 },
  'ant-spider': { holders: 1, deterrence: 0.3, health: 0.99 },
};
/** Ant detection of a predator: 4 L x stealth factor by predator state (§2.4 AI column). */
export const DETECT_L = 4;
export const DETECT_STEALTH: Partial<Record<CreatureKind, Record<string, number>>> = {
  'jumping-spider': { default: 1, stalk: 0.5 },
  'wolf-spider': { default: 0.75, ambush: 0.4, freeze: 0.4 },
  'ant-spider': { default: 0.25 },
  centipede: { default: 0.8 },
  'rove-beetle': { default: 0.8 },
};
/** Deterrence (§2.1): half-life 20 s; +0.08 per bite x attacker mass^(2/3); +0.35 x acid sensitivity per spray. */
export const DETERRENCE_HALF_LIFE_S = 20;
export const DETERRENCE_PER_BITE = 0.08;
export const DETERRENCE_PER_SPRAY = 0.35;
/**
 * Hp a creature loses within this long after a hit combat reported belongs to that hit, s: acid and stings deal
 * their damage over 2 s (§4.4) and combat may report before or after it applies the damage. Only hp lost outside
 * this window, with no report at all, counts as an extra (unreported) bite.
 */
export const HIT_ATTRIBUTION_S = 2.5;
/** Biter records (noteCreatureHit) older than this are dropped, s. */
export const BITER_MEMORY_S = 5;
/** Struggle meter (§2.4). */
export const STRUGGLE_PER_INPUT = 0.08;
export const STRUGGLE_MAX_INPUTS_PER_S = 4;
export const STRUGGLE_REASSERT_PER_S = 0.05;
export const STRUGGLE_NESTMATE_PER_S = 0.1;
export const STRUGGLE_AI_INPUTS_PER_S = 2;
export const STRIKE_IMMUNITY_S = 1;
/** A struggle direction change counts above this angle, degrees. */
export const STRUGGLE_TURN_DEG = 90;
/** Nestmate within this many L of a jumping spider / rove beetle target protects it (§2.2b, §2.4). */
export const LONE_ANT_L = 3;
/** Feed after a kill: retreat distance (mm) and duration (s). */
export const FEED_RETREAT_MM: Partial<Record<CreatureKind, number>> = { 'jumping-spider': 12, 'wolf-spider': 16, 'ant-spider': 16, centipede: 12, 'rove-beetle': 6 };
export const FEED_S: Partial<Record<CreatureKind, number>> = { 'jumping-spider': 120, 'wolf-spider': 120, 'ant-spider': 120, centipede: 60, 'rove-beetle': 60, antlion: 120 };
/** After a missed strike or a lost target, s. */
export const RECOVER_S = 2;
/** A predator gives up a stalk after this long, s. */
export const STALK_GIVE_UP_S = 60;
/** Flight from mobbers: distance (mm) and time (s). */
export const FLEE_DIST_MM = 60;
export const FLEE_S = 12;
/** Stalk rhythm of the jumping spider: move, then pause facing the ant, s (§2.4 cues). */
export const STALK_MOVE_S = 1.5;
export const STALK_PAUSE_S = 0.5;
/** Wolf spider rhythm (§2.2b): ambush 30-120 s, wander 30-90 s; by day activity x0.4; orientation 0.3 s. */
export const WOLF_AMBUSH_S: [number, number] = [30, 120];
export const WOLF_WANDER_S: [number, number] = [30, 90];
export const WOLF_DAY_ACTIVITY = 0.4;
export const WOLF_HOME_RADIUS_MM = 120 * REF_BU_MM;
export const WOLF_ORIENT_S = 0.3;
/** Wolf spider: chance per cycle to switch from wander to ambush (an ambush always ends in a wander or rest). */
export const WOLF_AMBUSH_CHANCE = 0.5;
/** Wolf spider gives up a frozen ambush on a target that has not come closer within this long, s. */
export const WOLF_FREEZE_MAX_S = 4;
/** Jumping spider: active in daylight at or above this air temperature, C (§2.2a "day, >= 15 C"). */
export const JUMPING_SPIDER_MIN_C = 15;
/** Ant-spider (§2.2b, §2.4): venom 6 over 15 s, paralysed 60 s at health <= 0.3, detection 1 L, retreat 4 L. */
export const ANT_SPIDER_VENOM_TOTAL = 6;
export const ANT_SPIDER_VENOM_S = 15;
export const PARALYSE_HEALTH = 0.3;
export const PARALYSE_S = 60;
export const ANT_SPIDER_DETECT_L = 1;
export const ANT_SPIDER_RETREAT_L = 4;
export const ANT_SPIDER_APPROACH_MMS = 6;
/** Rove beetle secretion (§2.2b): >= 2 biters within 2 s; ants within 1.5 L flee 3 s; cooldown 10 s. */
export const ROVE_SECRETION_BITERS = 2;
export const ROVE_SECRETION_WINDOW_S = 2;
export const ROVE_SECRETION_RADIUS_L = 1.5;
export const ROVE_SECRETION_FLEE_S = 3;
export const ROVE_SECRETION_COOLDOWN_S = 10;
/** Centipede nest invasion (§2.5): entrance within 20 BU, p 0.2 per night (x setting), 1 brood per 40 s. */
export const CENTIPEDE_INVADE_ENTRANCE_BU = 20;
export const CENTIPEDE_INVADE_P = 0.2;
export const CENTIPEDE_BROOD_EAT_S = 40;
/** An invading centipede eats a brood item within this reach of its body, mm. */
export const CENTIPEDE_EAT_REACH_MM = 6;
/** Centipedes and rove beetles out of their active time slip under litter for this long before they are gone, s
 *  (§2.2b "burrows (despawns) at dawn unless engaged"; visible, so never a pop-out next to the focus). */
export const BURROW_S = 3;
/** Generic wander speed share of the walk speed and home radius for residents without a stated one, mm. */
export const RESIDENT_HOME_RADIUS_MM = 400;

// ---- antlion (§2.2b, §2.4) ----
export const ANTLION_FLICK_EVERY_S = 0.8;
export const ANTLION_FLICK_P = 0.6;
export const ANTLION_FLICK_L = 1.5;
export const ANTLION_GRAB_L = 0.8;
export const ANTLION_UPSLOPE_MULT = 0.4;
export const ANTLION_REBUILD_S = 300;
export const ANTLION_RAIN_REBUILD_GD = 0.3;
export const ANTLION_DORMANT_C = 10;
/** A pit whose antlion is gone (killed) stops working at once and fills in over this long, gd. */
export const ANTLION_EMPTY_PIT_FILL_GD = 0.3;
/** Default pit radius / depth when the territory gives none, mm (Ø 20-75, depth 10-50). */
export const ANTLION_PIT_RADIUS_MM: [number, number] = [10, 37];
export const ANTLION_PIT_DEPTH_PER_R = 0.7;
/** Nestmates within this many L pull a grabbed nestmate (+0.10/s each) and witness the pit. */
export const ANTLION_HELP_L = 1;
export const WITNESS_L = 6;

// ---- prey (§1.5, §2.2b, §2.3) ----
/** Springtail escape per bite attempt: open ground / litter, humus, thatch. Mite: hit x0.5. Fruit fly: catch 0.15. */
export const SPRINGTAIL_ESCAPE_OPEN = 0.6;
export const SPRINGTAIL_ESCAPE_LITTER = 0.25;
export const SPRINGTAIL_JUMP_MM = 60;
export const MITE_EVADE = 0.5;
export const FRUIT_FLY_CATCH_P = 0.15;
/** Prey agents vanish after this long without an ant within CONTACT_L, s. */
export const PREY_VANISH_S = 30;
export const PREY_CONTACT_L = 2;
/** Prey patch (§2.3): K = 0.08 x area BU^2 x zone factor, r 0.8 per gd, immigration 0.05 K per gd, spawn lambda. */
export const PATCH_K_PER_BU2 = 0.08;
export const PATCH_ZONE_FACTOR: Partial<Record<ZoneType, number>> = { forest: 1.0, 'garden-bed': 0.8, lawn: 0.5 };
export const PATCH_COMPOST_FACTOR = 2.0;
export const PATCH_R_PER_GD = 0.8;
export const PATCH_IMMIGRATION_PER_GD = 0.05;
export const PATCH_LAMBDA: Partial<Record<CreatureKind, number>> = { springtail: 0.05, mite: 0.01 };
export const PATCH_SPAWN_AHEAD_L: [number, number] = [2, 4];
export const PATCH_RADIUS_BU_DEFAULT = 30;
/**
 * Pop-in rule for the possessed ant (§2.3): patch prey appears outside its front cone. Half-angle of that cone and
 * the widest bearing used (beyond 90 degrees = slightly behind, still close to its path), degrees.
 */
export const PATCH_POPIN_CONE_DEG = 60;
export const PATCH_POPIN_MAX_DEG = 110;
/** Lateral scatter of patch prey for an autonomous ant (fraction of the distance ahead, each side). */
export const PATCH_SPAWN_SIDE = 0.5;
/** Subdue (§1.5): pinned this long at health <= 0.5 stops struggling, dies 4 s later. */
export const SUBDUE_PIN_S = 8;
export const SUBDUE_HEALTH = 0.5;
export const SUBDUE_DIE_S = 4;
/** A dead creature heavier than this many carry loads cannot be moved by 12 Lasius workers: it becomes a tear source. */
export const COOP_MAX_ANTS = 12;
export const COOP_SHARE = 0.75;
/** Caterpillar defences (§1.5): thrash p 0.3 per s per holder, regurgitate every 10 s within 1 L, silk drop p 0.5 for 30 s. */
export const CATERPILLAR_THRASH_P = 0.3;
export const CATERPILLAR_REGURGITATE_S = 10;
export const CATERPILLAR_SILK_P = 0.5;
/** Regurgitation stuns biters within this many L for this long, s; a hairy caterpillar repels a biter for 3 s. */
export const CATERPILLAR_REGURGITATE_L = 1;
export const CATERPILLAR_REGURGITATE_STUN_S = 2;
export const CATERPILLAR_HAIRY_REPEL_S = 3;
export const CATERPILLAR_SILK_S = 30;
export const CATERPILLAR_PUPATE_GD = 3;
export const CATERPILLAR_PER_PLOT_GD = 0.002;
export const CATERPILLAR_DAYS: [number, number] = [3, 14];
export const CATERPILLAR_FEED_S: [number, number] = [60, 180];
/** Fly larvae (§1.6, §2.2b): 4-20 per ripe carcass of bulk >= 5 at >= 12 C; burrow after 1.5 gd; wriggle 0.1/s. */
export const FLY_LARVA_COUNT: [number, number] = [4, 20];
export const FLY_LARVA_MIN_BULK = 5;
export const FLY_LARVA_MIN_C = 12;
export const FLY_LARVA_LIFE_GD = 1.5;
/** Tier 1 carrion has no decay stages: it counts as ripe for fly larvae at this age window, gd (§1.6). */
export const FLY_LARVA_RIPE_AGE_GD: [number, number] = [0.5, 1.5];
export const FLY_LARVA_WRIGGLE_P = 0.1;
/** Maggots eat 10 % of the carcass' remaining P per gd per 5 maggots (§1.6). */
export const MAGGOT_P_PER_GD_PER_5 = 0.1;
/** Fruit flies (§2.2b): <= 5 per source, day, >= 15 C; feed 20-60 s; hop 15-40 mm between feeds. */
export const FRUIT_FLY_PER_SOURCE = 5;
export const FRUIT_FLY_MIN_C = 15;
export const FRUIT_FLY_FEED_S: [number, number] = [20, 60];
export const FRUIT_FLY_FLY_S: [number, number] = [2, 6];
export const FRUIT_FLY_HOP_MM: [number, number] = [15, 40];
export const FRUIT_FLY_SOURCE_RADIUS_MM = 40;

// ---- neutral fauna (§2.2b) ----
export const WOODLOUSE_ROLL_BITES = 2;
export const WOODLOUSE_ROLL_SHARE = 0.5;
export const WOODLOUSE_ROLLED_ARMOUR = 0.9;
export const WOODLOUSE_ROLL_S = 20;
export const MILLIPEDE_COIL_S = 15;
/** Millipede secretion: the biter flees this long (§2.2b "biter flees 4 s"). */
export const MILLIPEDE_REPEL_S = 4;
/** Snails and millipedes heading into cover: one cover leg of the walk, s (the cover state lasts 4 legs). */
export const COVER_S = 8;
export const SNAIL_RETRACT_S = 20;
export const SLIME_SPEED_MULT = 0.7;
export const SLIME_LIFE_GD = 0.5;
export const SLIME_SPACING_MM = 20;
export const SLIME_RADIUS_MM = 4;
export const SLIME_MAX = 120;
/** Hazard speed factors apply only to an ant on the hazard's own surface: its feet within this height of the slime
 *  (or of the pit, between rim and floor), BU. Ants in tunnels underneath or on a stem above are not slowed. */
export const HAZARD_SURFACE_TOL_BU = 1;
/** Earthworms: 0-3 stranded per rain event on hard ground, dying after 0.3 gd in sun. */
export const WORM_STRANDED_PER_RAIN: [number, number] = [0, 3];
/** Share of stranded worms placed on pavement (the rest on asphalt). */
export const WORM_STRANDED_PAVEMENT_SHARE = 0.5;
export const WORM_DYING_GD = 0.3;
export const WORM_SURFACE_PER_TERRITORY = 1;
/** Graze / wander rhythm of neutral fauna, s. */
export const GRAZE_S: [number, number] = [20, 60];
export const WANDER_S: [number, number] = [10, 40];

// ---- aphid predators (§1.4) ----
export const APHID_PRED_MIN_A = 40;
export const APHID_PRED_DAYS: [number, number] = [3, 19];
export const APHID_PRED_MIN_C = 12;
export const LADYBIRD_ARRIVAL_PER_H = 0.02;
export const LADYBIRD_AUTUMN_MULT = 0.5;
export const LADYBIRD_EAT_S = 6;
export const LADYBIRD_HARASS_LEAVE = 6;
export const LADYBIRD_MAX_EATEN = 60;
export const LADYBIRD_BLEED_P = 0.25;
export const LADYBIRD_BLEED_STUN_S = 2;
export const LADYBIRD_APHIDS_PER = 300;
export const LADYBIRD_LARVA_APHIDS_PER = 200;
export const LACEWING_APHIDS_PER = 250;
export const LARVA_TRIGGER_EATEN = 20;
export const LARVA_DELAY_GD = 0.5;
export const LARVA_P = 0.5;
export const LARVA_COUNT: [number, number] = [1, 3];
export const LARVA_DAYS: [number, number] = [4, 16];
export const LADYBIRD_LARVA_EAT_S = 10;
export const LADYBIRD_LARVA_HARASS_LEAVE = 10;
export const LADYBIRD_LARVA_DROP_BU = 50;
export const LACEWING_ARRIVAL_PER_H = 0.01;
export const LACEWING_DAYS: [number, number] = [8, 19];
export const LACEWING_EAT_S = 8;
export const LACEWING_HARASS_LEAVE = 8;
export const LACEWING_BITE_DMG = 2;
export const LACEWING_BITE_EVERY_S = 2;
export const LACEWING_DETECT_L = 1;
export const LACEWING_DETECT_P_PER_S = 0.3;
export const PUPATE_GD = 3;
/** Harassment per hit kind (§1.4: bite +1, spray +3). */
export const HARASS_BITE = 1;
export const HARASS_SPRAY = 3;
/** Visual fly-in / fly-off phase length, s (flight itself is not simulated: see README). */
export const FLY_PHASE_S = 2;
/** Herd sites: the predator stands this far from the herd point, mm. */
export const HERD_STAND_MM = 3;

// ---- bird event (§2.6) ----
/** Bird events per game day by predators setting: the same numbers as the predator density (bird.ts reads `predatorDensityMult`). */
export const BIRD_RATE: Record<PredatorSetting, number> = PREDATOR_SETTING_MULT;
export const BIRD_MIN_WORKERS = 30;
export const BIRD_GAP_GD = 0.5;
export const BIRD_TARGET_RADIUS_BU = 25;
export const BIRD_MIN_EXPOSED = 15;
export const BIRD_APPROACH_S = 3.0;
export const BIRD_DURATION_S: [number, number] = [20, 40];
export const BIRD_PECK_EVERY_S = 1.5;
export const BIRD_HEAD_COCK_S = 0.5;
export const BIRD_KILL_RADIUS_MM = 3;
export const BIRD_KILL_P = 0.7;
export const BIRD_MAX_KILLS = 12;
export const BIRD_ALATE_RADIUS_BU = 30;
export const BIRD_ALATE_P_PER_S = 0.05;
export const BIRD_RESPONSE_RADIUS_BU = 40;
export const BIRD_LEAVE_S = 2;
/** Sparrow / pigeon also eats crumbs within the target radius: up to this many crumb units per event (§2.6). */
export const BIRD_CRUMBS_MAX = 10;
/** Share of bird events at a forest / lawn mound that are woodpeckers (§2.6 variants). */
export const WOODPECKER_SHARE = 0.2;
/** Woodpecker: a carve of this radius (BU) every 5 s into the mound / entrance throat, at most 6 (§2.6). */
export const WOODPECKER_CARVE_BU = 3;
export const WOODPECKER_CARVE_EVERY_S = 5;
export const WOODPECKER_CARVES_MAX = 6;
/** Daylight window: SR + 1 h .. SS - 1 h. */
export const BIRD_DAY_MARGIN_H = 1;
/** Overhead cover test (GDD 06 "exposed"): no solid within this many BU straight up. */
export const EXPOSED_COVER_BU = 3;
/** Damage that kills any ant outright (bird pecks). */
export const LETHAL_DAMAGE = 1e4;
/** Alarm strength of a witnessed strike / bird landing (§4.5: deposit 1.0). */
export const STRIKE_ALARM = 1.0;

// ---- danger grid (§2.4) ----
export const DANGER_ADD = 1.0;
export const DANGER_HALF_LIFE_GD = 0.5;
export const DANGER_WITNESS_L = 6;
export const DANGER_AVOID_MARKER = 3;
export const DANGER_COST_MAX = 3;
export const DANGER_COST_PER = 2;
/** Cells below this danger are reset to cost 1. */
export const DANGER_EPS = 0.01;

// ---- threat director (§6, I11) ----
/** Trailing window of the quiet share, gd; an hour is loud when a warning/critical alert is active >= 25 % of it. */
export const QUIET_WINDOW_GD = 3;
export const QUIET_ALERT_SHARE = 0.25;
export const QUIET_MARGIN = 0.05;
/** Loud hours a new major threat is assumed to add when the director checks the trailing share (an event can span
 *  an hour boundary). */
export const LOUD_HOURS_PER_THREAT = 2;
/** Alert samples per hour (every 10 ticks). */
export const QUIET_SAMPLE_EVERY = 10;
/** Major threat ids this module starts. */
export const THREAT_BIRD = 'bird';
export const THREAT_CENTIPEDE = 'centipede-invasion';

// ---- alerts (GDD 05 App. C, GDD 08 §6.5) ----
/** predator-near: lurking predator within this many BU of the possessed ant or of >= 3 foragers. */
export const PREDATOR_NEAR_BU = 15;
export const PREDATOR_NEAR_FORAGERS = 3;
export const PREDATOR_NEAR_COOLDOWN_GD = 0.1;
/** predator-near clears once its condition has not held for this long, s (decision: alerts need a clearer). */
export const PREDATOR_NEAR_CLEAR_S = 30;
/** nest-attacked clears this long after the last invader left, s. */
export const NEST_ATTACKED_CLEAR_S = 30;

// ---- director cadence and ambience ----
/** Hourly sub-step of the director (ticks); aphid-predator arrivals, patch regrowth, bird checks. */
export const DIRECTOR_HOURLY_TICKS = 250;
/** Night-time cricket call and daytime bird song: chance per director run while the condition holds. */
export const AMBIENT_CRICKET_P = 0.05;
export const AMBIENT_BIRD_P = 0.03;
/** Earthworms, snails and woodlice active (out) at night or in rain; day phases treated as dusk for activity. */
export const DUSK_PHASES: readonly string[] = ['dusk', 'dawn'];
