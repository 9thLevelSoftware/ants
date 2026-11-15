// Rival colonies (GDD 05 §3, §5, §6; directions §K). Owner: rivals. Import this file directly (not in the barrel).
// Distances in BU unless named _L (body lengths of the acting ant) or _MM; times in game seconds (_S), game days
// (_GD) or ticks (_TICKS). Per-species numbers (N0, K_max, g, CP, aggression, field shares and caps, activity
// windows) live in the species data (src/sim/species/rivals.ts and src/sim/species/rivals/profiles.ts).

import type { DifficultyId, RelationState, Season } from '@/sim/types';

// ---- cadences ----

/** Fielding, raids in progress, queen checks, theft scan and the nest-attacked / raid-seen alerts, ticks. */
export const FIELD_EVERY_TICKS = 10;
export const FIELD_OFFSET = 3;
/** Territory deposits by ants on the surface, ticks (1 game s). */
export const TERR_DEPOSIT_EVERY_TICKS = 10;
export const TERR_DEPOSIT_OFFSET = 6;
/** Think interval of a rival agent, ticks (1 s: cheap, the walker does the steering between thinks). */
export const AGENT_THINK_TICKS = 10;
/** Think interval while displaying or fighting toward a target, ticks. */
export const AGENT_THINK_FAST_TICKS = 5;

// ---- agent budget (directions §K, GDD 05 §3.3, I7) ----

/** Total simulated ants of all colonies stay at or below this. */
export const ANT_TOTAL_CAP = 2500;
/** RIVAL_AGENT_BUDGET = min(RIVAL_BUDGET_MAX, ANT_TOTAL_CAP - playerAnts - RIVAL_BUDGET_MARGIN). */
export const RIVAL_BUDGET_MAX = 900;
export const RIVAL_BUDGET_MARGIN = 50;

// ---- fielding (GDD 05 §3.3) ----

export const GUARDS_PER_ENTRANCE = 2;
/** Guards and reinforcements need at least this many abstract workers. */
export const GUARD_MIN_N = 50;
/** Emergence: at most one surface agent per this many seconds per entrance; defenders one per 1.5 s. */
export const EMERGE_EVERY_S = 2;
export const DEFENDER_EVERY_S = 1.5;
/** Reinforcement: an agent attacked within this of its nest calls nestmates within JOIN_L and up to MAX more. */
export const REINFORCE_RADIUS_BU = 250;
export const REINFORCE_JOIN_L = 6;
export const REINFORCE_MAX = 10;
export const REINFORCE_EVERY_S = 3;
/** A reinforcement call lapses after this without a new attack, s. */
export const REINFORCE_LAPSE_S = 60;
/** Emerging agents walk this far out before taking a job, L. */
export const EMERGE_WALK_L = 5;
/** Arrival radius of agent legs, BU. */
export const AGENT_ARRIVE_BU = 2;
/** An agent this close to its own entrance (on the surface) re-enters and is absorbed, BU. */
export const ABSORB_RADIUS_BU = 2.5;
/** Forage: trip timeout, s; the fringe around claimed cells foragers may use, BU; dwell at the node, s. */
export const FORAGE_TIMEOUT_S = 300;
export const FORAGE_FRINGE_BU = 100;
export const FORAGE_DWELL_S: readonly [number, number] = [8, 20];
/** Forage: search radius for a real node around the chosen place, BU; units taken per trip (whole units / s). */
export const FORAGE_NODE_SEARCH_BU = 40;
export const FORAGE_TAKE_UNITS = 3;
/** Forage target: a random point this far from the entrance when the colony claims nothing yet, BU. */
export const FORAGE_RANGE_BU: readonly [number, number] = [30, 120];
/** Patrol: loiter at a contested / border cell, s; candidates considered. */
export const PATROL_LOITER_S: readonly [number, number] = [60, 120];
export const PATROL_TOP_CELLS = 5;
/** Guard: stays within this of the entrance, L; relieved after this, gd. */
export const GUARD_RADIUS_L = 3;
export const GUARD_RELIEF_GD = 0.25;
/** Defenders go home after this long without a hostile in or at the nest, s. */
export const DEFEND_IDLE_S = 30;
/** Defenders look for intruders this far from an entrance on the surface, BU. */
export const DEFEND_SURFACE_BU = 20;
/** War agents hold at a front cell this long before choosing another, s. */
export const WAR_HOLD_S: readonly [number, number] = [60, 120];
/** An agent cut off from home (no nav) for this long is absorbed in place, s (keeps the budget honest). */
export const LOST_ABSORB_S = 240;

// ---- abstract colony model (GDD 05 §3.2), per game day unless stated ----

export const SEASON_FACTOR: Readonly<Record<Season, number>> = { spring: 1.0, summer: 1.0, autumn: 0.4, winter: 0 };
/** Spring growth starts on this day of the season. */
export const SPRING_FROM_DAY = 2;
/** Linear ramp at both ends of the activity window, °C. */
export const ACTIVITY_RAMP_C = 2;
/** Lasius niger is also active on warm summer nights at or above this surface temperature, °C. */
export const WARM_NIGHT_C = 18;
/** Upkeep U = UPKEEP_PER_N x N + UPKEEP_PER_QUEEN x queens, C loads per gd. */
export const UPKEEP_PER_N = 0.12;
export const UPKEEP_PER_QUEEN = 0.3;
/** K_eff = K_max x rivalKMult x clamp(claimed / A_ref, lo, hi); A_ref default (species may override). */
export const A_REF_CELLS = 400;
export const K_CLAIM_CLAMP: readonly [number, number] = [0.3, 1];
/** Births b = g x max(N, BIRTH_N_MIN) x (1 - N / K_eff) x sR x rivalGrowthMult. */
export const BIRTH_N_MIN = 20;
/** Cost of one birth, loads. */
export const BIRTH_COST_P = 1.2;
export const BIRTH_COST_C = 0.4;
/** Brood pipeline: B / MATURATION_GD matures per gd. */
export const MATURATION_GD = 4;
/** Death rates per gd: base, starving (C_s = 0), orphan decline. */
export const DEATH_BASE = 0.03;
export const DEATH_STARVE = 0.15;
export const DEATH_ORPHAN = 0.15;
/** Virtual harvest capacity 0.6 N a loads per gd (15 % foragers x 4 trips). */
export const HARVEST_PER_N = 0.6;
/** Demand D_C = 1.2 U + 0.4 b, D_P = 1.2 b. */
export const DEMAND_C_PER_U = 1.2;
export const DEMAND_C_PER_BIRTH = 0.4;
export const DEMAND_P_PER_BIRTH = 1.2;
/** Store caps: C_s <= 10 U, P_s <= 0.2 N + 20. */
export const STORE_C_CAP_U = 10;
export const STORE_P_PER_N = 0.2;
export const STORE_P_BASE = 20;
/** Aggression season factors and the hungry factor (C_s < U). */
export const AGG_SEASON: Readonly<Record<Season, number>> = { spring: 1.2, summer: 1.0, autumn: 0.8, winter: 0.8 };
export const AGG_HUNGRY = 1.3;
/** Winter: N x (1 - LOSS - POOR x [C_s < POOR_U x U]); stores lose STORE_SHARE x summer upkeep x season days. */
export const WINTER_LOSS = 0.08;
export const WINTER_LOSS_POOR = 0.10;
export const WINTER_POOR_U = 0.35;
export const WINTER_STORE_SHARE = 0.05;
/** Strength S = N x CP x (S_AGG_BASE + S_AGG_SLOPE x agg); player S = workers x CP x PLAYER_S_FACTOR. */
export const S_AGG_BASE = 0.5;
export const S_AGG_SLOPE = 0.5;
export const PLAYER_S_FACTOR = 0.75;
/** Start values of an established rival: brood per N0, stores as multiples of upkeep / of the P cap. */
export const START_BROOD_PER_N = 0.2;
export const START_C_U = 5;
export const START_P_SHARE = 0.5;

// ---- orphaning, destruction, aftermath (GDD 05 §3.9) ----

export const ORPHAN_AGG_MULT = 0.5;
export const ORPHAN_FIELD_MULT = 0.5;
/** Destroyed when N < this while orphaned (or N = 0). */
export const DESTROYED_N = 5;
/** Agents left outside wander and die within this, gd. */
export const AFTERMATH_DIE_GD = 0.5;

// ---- incipient rivals (GDD 05 §3.8) ----

export const INCIPIENT_MAX = 60;
export const INCIPIENT_BROOD = 12;
export const INCIPIENT_FIRST_WORKERS_GD = 4.5;
export const INCIPIENT_FIELD_CAP = 6;
export const INCIPIENT_START_C = 3;
export const INCIPIENT_START_P = 3;

// ---- real nests (GDD 05 §3.4) ----

/** Queen hides in the deepest chamber with escorts when a hostile ant comes this close, BU. */
export const QUEEN_HIDE_BU = 10;
export const QUEEN_ESCORTS = 2;
/** Display brood: min(DISPLAY_MAX, ceil(B / DISPLAY_PER)). */
export const BROOD_DISPLAY_MAX = 24;
export const BROOD_DISPLAY_PER = 10;
/** Display brood stage shares (pupae, larvae, rest eggs) and progress range. */
export const DISPLAY_PUPA_SHARE = 0.4;
export const DISPLAY_LARVA_SHARE = 0.4;
export const DISPLAY_PROGRESS: readonly [number, number] = [0.1, 0.9];
/** Template chambers of an established rival nest: nursery and general chambers, anchor depths, BU. */
export const NEST_NURSERY_DEPTH_BU = 14;
export const NEST_GENERAL_DEPTHS_BU: readonly number[] = [20, 26, 32];
/** General chambers: 1 + one per this many N0 workers, at most the depths listed above. */
export const NEST_GENERAL_PER_N0 = 400;
/** The shaft starts on open ground: no primitive within SITE_CLEAR_BU, diggability >= SITE_DIG_MIN (else the nearest such point). */
export const SITE_CLEAR_BU = 4;
export const SITE_DIG_MIN = 0.3;
/** A nest whose shaft opened under cover gets an entrance tunnel to free ground at these distances, BU. */
export const ENTRANCE_SEARCH_BU: readonly number[] = [4, 6, 9, 12, 16, 24];
/** A brood item stolen from a nest of another species is food for the thief: P loads per item. */
export const RAIDED_BROOD_FOOD_P = 0.3;

// ---- territory (GDD 05 §3.5) ----

/** Marks per ant per game second on the surface. */
export const TERR_DEPOSIT = 1.0;
/** Core deposit around each entrance: per cell per game second while N >= CORE_MIN_N and a > 0. */
export const CORE_DEPOSIT = 0.05;
export const CORE_MIN_N = 20;
/** R_core = min(CORE_R_MAX, CORE_R_BASE + CORE_R_PER_N x N), BU. */
export const CORE_R_BASE_BU = 40;
export const CORE_R_PER_N = 0.1;
export const CORE_R_MAX_BU = 150;
/** Marks halve in this many gd (home-range marks); every rain event halves exposed marks once. */
export const TERR_HALF_LIFE_GD = 2;
/** Core cells start at this share of their equilibrium mark at game start (territory exists from day one). */
export const CORE_START_SHARE = 0.8;

// ---- encounters (GDD 05 §3.6) ----

/** Awareness radius, L; recognition = antennal contact (combat RECOGNITION_L) plus both bodies' radii. */
export const AWARE_L = 3;
/** Ritual display duration, s; withdrawal turn, degrees; walk-away distance, L. */
export const DISPLAY_S: readonly [number, number] = [1, 3];
export const WITHDRAW_TURN_DEG: readonly [number, number] = [120, 180];
export const WITHDRAW_WALK_L = 5;
/** Escalation gains for one ant pair at most once per this, s. */
export const RECOGNITION_PAIR_S = 60;
/** A fight entry of the same agent counts again after this, s. */
export const FIGHT_COUNT_S = 20;

// ---- escalation (GDD 05 §3.7) ----

export const E_GAIN = { recognition: 1, fight: 2, death: 3, raid: 10 } as const;
/** +E per contested cell per hourly update. */
export const E_PER_CONTESTED_CELL = 0.05;
export const E_HALF_LIFE_GD = 1;
export const E_PEACE_BELOW = 1.5;
export const E_TENSION_AT = 3;
export const E_SKIRMISH_AT = 10;
export const E_SKIRMISH_DOWN = 6;
export const E_WAR_AT = 30;
export const WAR_MIN_N = 50;
export const E_WAR_DOWN = 15;
/** War lasting this long without a claim change ends in truce, gd; a change is >= this many cells. */
export const WAR_STALE_GD = 1.5;
export const WAR_CLAIM_CHANGE_CELLS = 2;
export const TRUCE_GD = 1;
export const TRUCE_E_CAP = 25;
/** Share of the fielded agents sent on patrol to contested cells, by relation state. */
export const PATROL_SHARE: Readonly<Partial<Record<RelationState, number>>> = { tension: 0.2, skirmish: 0.4, war: 0.4 };
/** War front: contested cells kept per relation (nearest both nests first). */
export const WAR_FRONT_CELLS = 24;

// ---- raids (GDD 05 §3.7, §3.8) ----

export const RAID_RATIO = 2.0;
export const RAID_P = 0.25;
export const RAID_PARTY_SHARE = 0.25;
/** End rules: party <= 30 % of its peak, after 0.3 gd, or >= 50 % of the party carries loot. */
export const RAID_END_PARTY_SHARE = 0.3;
export const RAID_MAX_GD = 0.3;
export const RAID_END_LOOT_SHARE = 0.5;
/** An agent this close to a foreign entrance tells its colony where that nest is, BU (incipients: L). */
export const KNOWS_NEST_BU = 20;
export const KNOWS_NEST_INCIPIENT_L = 3;
/** Formica predatory raids at any relation against colonies with S_def <= this x S_formica. */
export const PREDATORY_RATIO = 0.5;
/** Raiders: attack a hostile this close, L; pick up brood this close, BU; target-search radius in the nest, BU. */
export const RAID_ENGAGE_L = 3;
export const RAID_LOOT_REACH_BU = 1.2;
export const RAID_LOOT_SEARCH_BU = 30;
/** Raid parties gather at the target entrance (this close, BU) until this share is there or this long has passed, s. */
export const RAID_GATHER_BU = 8;
export const RAID_GATHER_SHARE = 0.7;
export const RAID_GATHER_MAX_S = 45;
/** Player raids: a rally `attack` marker this close to a known foreign entrance; party share and cap. */
export const RALLY_ATTACK_BU = 30;
export const PLAYER_RAID_SHARE = 0.3;
export const PLAYER_RAID_MAX = 200;
/** Brood raids among incipients: strength ratio, party share, cooldown of the victim, gd. */
export const BROOD_RAID_RATIO = 1.3;
export const BROOD_RAID_SHARE = 0.6;
export const BROOD_RAID_COOLDOWN_GD = 1;
/** After losing all workers and brood the queen dies within this, gd; the last workers may join the raider. */
export const ABANDON_QUEEN_GD = 1;
export const JOIN_LAST_WORKERS = 5;
export const JOIN_P = 0.5;
/** Raids on the player before this many player workers (GDD 05 §5 lever). */
export const RAID_PLAYER_MIN_WORKERS = 50;

// ---- new foundations (GDD 05 §3.9) ----

export const FOUNDATION_HOUR = 16;
export const FOUNDATION_P = 0.3;
export const FOUNDATION_P_EMPTY = 1.0;
export const FOUNDATION_SITE_MIN_BU = 250;

// ---- the founding queen (GDD 05 §3.10) ----

/** Digging-in: p per gd = DIG_P x min(1, m_c / DIG_MC_REF) x foundingRivalMult; 3-6 diggers. */
export const DIG_P = 0.1;
export const DIG_MC_REF = 100;
export const DIG_PARTY: readonly [number, number] = [3, 6];
/** Diggers that have nothing left to fight go back after this, s. */
export const DIG_IDLE_S = 30;

// ---- alerts (GDD 05 App. C) ----

export const RAID_SEEN_AGENTS = 3;
export const RAID_SEEN_BU = 40;
export const RAID_PARTY_SEEN_BU = 80;
export const NEST_ATTACKED_ANTS = 3;
export const ALERT_CLEAR_S = 30;

// ---- difficulty levers GDD 05 §5 that DifficultyParams does not hold ----

export interface RivalLevers {
  rivalGrowthMult: number;
  warThresholdMult: number;
  foundingRivalMult: number;
  /** Raids on the player before RAID_PLAYER_MIN_WORKERS: never, incipient brood raids only, or allowed. */
  earlyRaids: 'never' | 'incipient' | 'allowed';
  /** Rival incipients may brood-raid the player (naturalist / harsh only). */
  incipientRaidsPlayer: boolean;
}

export const RIVAL_LEVERS: Readonly<Record<DifficultyId, RivalLevers>> = {
  gentle: { rivalGrowthMult: 0.7, warThresholdMult: 1.5, foundingRivalMult: 0, earlyRaids: 'never', incipientRaidsPlayer: false },
  naturalist: { rivalGrowthMult: 1, warThresholdMult: 1, foundingRivalMult: 1, earlyRaids: 'incipient', incipientRaidsPlayer: true },
  harsh: { rivalGrowthMult: 1.2, warThresholdMult: 0.75, foundingRivalMult: 1.5, earlyRaids: 'allowed', incipientRaidsPlayer: true },
};

// ---- diagnostics ----

/** `diag-rivals`: R at or above this with a known nest in war is "raid risk". */
export const DIAG_RAID_RISK_R = RAID_RATIO;
