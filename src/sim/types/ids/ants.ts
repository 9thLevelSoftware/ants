// Identifier sets for individual ants: actions (GDD 01 §7), possession, allocation, physiology, behaviour states
// and reason codes (GDD 02), death causes (canonical list of docs/design/gdd/00-index.md §B3).

/** Action primitives (GDD 01 §7 + GDD 05 `dodge`/`cull-aphid` + GDD 06 `plant` + GDD 07 additions). */
export const ACTION_IDS = [
  'move', 'let-go', 'grip', 'pick-up', 'put-down', 'drop', 'dig-bite', 'seal-entrance', 'unseal-entrance',
  'lay-egg', 'feed-larva', 'trophallaxis-give', 'trophallaxis-receive', 'groom', 'antennate', 'sniff',
  'lay-trail', 'harvest-liquid', 'harvest-solid', 'tend-aphid', 'carry-aphid', 'bite', 'bite-hold',
  'spray-acid', 'sting', 'release-alarm', 'drag', 'fly', 'dealate', 'mate', 'cut-leaf', 'stridulate',
  'mill-seed', 'gnaw-radicle', 'tend-fungus', 'eject-frass', 'block-opening', 'hitchhike',
  'dodge', 'cull-aphid', // GDD 05
  'plant', // GDD 06 (Atta founding: plant the fungus pellet)
  'drum', 'cut-seed-head', 'process-leaf', // GDD 07
] as const;
export type ActionId = (typeof ACTION_IDS)[number];

/** Action lifecycle phases (GDD 01 §7.1). */
export const ACTION_PHASES = ['requested', 'validating', 'windup', 'active', 'recovery', 'done', 'failed', 'cancelled'] as const;
export type ActionPhase = (typeof ACTION_PHASES)[number];

/** Why an action could not start or was aborted (GDD 01 §7.2). */
export const ACTION_FAIL_REASONS = [
  'caste', 'species', 'no-target', 'out-of-reach', 'blocked', 'too-heavy', 'crop-full', 'crop-empty', 'hands-full',
  'not-diggable', 'no-reserve', 'cooldown', 'conditions', 'not-allowed-here', 'budget',
] as const;
export type ActionFailReason = (typeof ACTION_FAIL_REASONS)[number];

export const POSSESS_REJECT_REASONS = ['dead', 'not-colony', 'view', 'unknown'] as const;
export type PossessRejectReason = (typeof POSSESS_REJECT_REASONS)[number];

/** Reasons carried by the `release` command (GDD 01 App. B). */
export const RELEASE_REASONS = ['player', 'afk', 'colony-view', 'timelapse'] as const;
export type ReleaseReason = (typeof RELEASE_REASONS)[number];

/** Reasons carried by `possession-ended`: the release reasons plus `switch` and `death` (registry B2). */
export const POSSESSION_END_REASONS = ['player', 'afk', 'colony-view', 'timelapse', 'switch', 'death'] as const;
export type PossessionEndReason = (typeof POSSESSION_END_REASONS)[number];

/** How a possession was requested (GDD 01 §3.2). */
export const POSSESS_METHODS = ['click', 'cycle', 'role-key', 'roster', 'last', 'command', 'auto'] as const;
export type PossessMethod = (typeof POSSESS_METHODS)[number];

/** Role shortcuts for quick possession (GDD 01 §3.2, debug API `possess(role)`). */
export const POSSESS_ROLES = ['queen', 'forager', 'digger', 'nurse'] as const;
export type PossessRole = (typeof POSSESS_ROLES)[number];

/**
 * Render pose hints (GDD 01 §7.3 `pose.*`). The ids are the names after the `pose.` namespace (`walk` is
 * `pose.walk`). `Ant.pose` stores the index into this array.
 */
export const POSES = [
  'walk', 'hurry', 'fall', 'grip', 'pick', 'place', 'release', 'dig', 'tamp', 'lay', 'feed', 'troph-give',
  'troph-beg', 'groom-self', 'groom-other', 'antennate', 'sniff', 'trail-dab', 'drink', 'tear', 'stroke', 'bite',
  'hold', 'spray', 'sting', 'alarm', 'drag', 'fly', 'dealate', 'mate', 'cut', 'stridulate', 'mill', 'gnaw',
  'tend-fungus', 'flick', 'block', 'ride',
] as const;
export type PoseId = (typeof POSES)[number];

/** Directive allocation groups (GDD 02 §6, GDD 08 §4.2). */
export const ALLOCATION_GROUPS = ['forage', 'nurse', 'dig', 'defend'] as const;
export type AllocationGroup = (typeof ALLOCATION_GROUPS)[number];

export const AGE_BANDS = ['callow', 'young', 'mid', 'old'] as const;
export type AgeBand = (typeof AGE_BANDS)[number];

export const QUEEN_MODES = ['founding', 'established', 'orphan-dead'] as const;
export type QueenMode = (typeof QUEEN_MODES)[number];

export const METABOLIC_CLASSES = ['met-rest', 'met-light', 'met-active'] as const;
export type MetabolicClass = (typeof METABOLIC_CLASSES)[number];

/** Colony starvation stages S0..S4 (GDD 02 §5.8). */
export const STARVATION_STAGES = ['fed', 'lean', 'rationing', 'brood-sacrifice', 'adult-starvation'] as const;
export type StarvationStage = (typeof STARVATION_STAGES)[number];

/** Ant thermal state (GDD 06 §2.7). */
export const THERMAL_STATES = ['normal', 'heat-stupor', 'cold-coma'] as const;
export type ThermalState = (typeof THERMAL_STATES)[number];

/** Transient combat/predation conditions on an ant (GDD 05 §2.4, §4). */
export const ANT_CONDITIONS = ['seized', 'pinned', 'paralysed', 'stuck', 'disoriented'] as const;
export type AntCondition = (typeof ANT_CONDITIONS)[number];

/** Injury kinds (GDD 05 §4.7); stored as bits in `Ant.injuries` (bit = index). */
export const INJURIES = ['leg', 'antenna', 'gaster'] as const;
export type Injury = (typeof INJURIES)[number];

/** Nursery job kinds (GDD 02 §10.4). */
export const NURSERY_JOBS = ['rescue', 'evacuate', 'assist-eclosion', 'feed', 'move', 'tend-pile', 'groom'] as const;
export type NurseryJob = (typeof NURSERY_JOBS)[number];

/** Adult death causes (canonical, registry B3; GDD 06 §9.3 owns the list). */
export const DEATH_CAUSES = [
  'old-age', 'starvation', 'desiccation', 'heat', 'cold', 'drowning', 'crushed', 'predation', 'bird', 'antlion',
  'parasitoid', 'combat', 'disease', 'poison', 'fell', 'exhaustion', 'lost', 'dispersed', 'unknown',
] as const;
export type DeathCause = (typeof DEATH_CAUSES)[number];

/** Brood death causes (canonical, registry B3; GDD 02 §2.5). Raided brood is transferred, not killed. */
export const BROOD_DEATH_CAUSES = [
  'starvation', 'cannibalised', 'untended', 'temperature', 'humidity', 'hygiene', 'exposure', 'flooding',
  'eclosion-failed', 'predation', 'base',
] as const;
export type BroodDeathCause = (typeof BROOD_DEATH_CAUSES)[number];

/**
 * Behaviour states `<task>.<state>` (GDD 02 §10, GDD 03 digger/hauler states, GDD 07 tender states; registry B3).
 * Stored in `Ant.state` as a string.
 */
export const BEHAVIOUR_STATES = [
  'idle', 'rest',
  'scout.depart', 'scout.explore', 'scout.investigate', 'scout.assess', 'scout.collect', 'scout.return', 'scout.report',
  'forage.wait', 'forage.outbound', 'forage.search', 'forage.queue', 'forage.collect', 'forage.return', 'forage.deliver',
  'tend.outbound', 'tend.solicit', 'tend.guard-herd', 'tend.return', 'tend.deliver', 'tend.wait',
  'tend.travel', 'tend.guard', 'tend.full', 'tend.relocate', // GDD 07 tender states
  'nurse.select', 'nurse.load', 'nurse.feed', 'nurse.tend', 'nurse.carry', 'nurse.assist', 'nurse.cannibalise', 'nurse.groom',
  'queen-care.attend', 'queen-care.load', 'queen-care.feed', 'queen-care.collect-eggs', 'queen-care.escort',
  'store.post', 'store.receive', 'store.disperse', 'store.shift', 'store.clean',
  'dig.claim', 'dig.travel', 'dig.bite', 'dig.stow',
  'dig.seek-slot', 'dig.go-to-slot', 'dig.deposit', 'dig.carry-out', 'dig.interrupted',
  'haul.claim', 'haul.travel', 'haul.pick', 'haul.carry', 'haul.return',
  'haul.seek-pellet', 'haul.go-pickup', 'haul.carry-out', 'haul.internal-dump',
  'guard.post', 'guard.alarm-raise', 'patrol.loop',
  'queen.found-care', 'queen.reside', 'queen.relocate',
  'flee.run', 'flee.freeze', 'fight.engage',
] as const;
export type BehaviourState = (typeof BEHAVIOUR_STATES)[number];

/** Base reason codes for decisions (GDD 02 §7). Parametrised forms are `deficit:<task>`, `marker:<kind>`, `job:<kind>`. */
export const REASON_CODES = [
  'recruited', 'spontaneous', 'crop-full', 'item-collected', 'source-depleted', 'source-crowded', 'trail-lost',
  'stuck', 'stores-full', 'hungry', 'fatigue', 'threat', 'alarm', 'curfew', 'too-hot', 'too-cold', 'rain',
  'deficit', 'surplus', 'released', 'marker', 'job', 'timeout',
] as const;
export type ReasonBase = (typeof REASON_CODES)[number];
export type ReasonCode = ReasonBase | `deficit:${string}` | `marker:${string}` | `job:${string}`;
