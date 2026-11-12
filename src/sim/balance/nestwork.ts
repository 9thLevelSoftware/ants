// Tunables of the in-nest behaviours (beh-nest): nursing, queen care, storing, digging, hauling, idle / rest,
// guarding and the established queen (GDD 02 §10.0, §10.4-10.11, §10.14; GDD 03 §7.5-7.7). Times are game
// seconds, distances BU, food loads.

import type { ChamberType } from '@/sim/types';

// ---- nursery job board (GDD 02 §10.4) ----
/** Job priorities; feed = FEED_BASE + FEED_URGENCY x urgency; tend = TEND + TEND_URGENT when untended long. */
export const JOB_PRIORITY = {
  rescue: 10, evacuate: 9, assistEclosion: 6, feedBase: 5, feedUrgency: 3, move: 3, moveMarker: 4, tend: 2,
  tendUrgent: 4, groom: 1,
  /**
   * A hungry larva with a move target: one job, carry then feed, at its feed priority plus moveHungryBonus, at most
   * moveHungryMax (below rescue), and without the distance penalty.
   */
  moveHungryBonus: 1, moveHungryMax: 9.5,
} as const;
/** The nursery board is rebuilt this often, s (GDD 02 §10.4: every 2 s), on aligned windows of game time. */
export const NURSERY_BOARD_PERIOD_S = 2;
/** A job is claimed by one nurse; the claim lapses after this (GDD 02 §10.4 claim timeout). */
export const JOB_CLAIM_TIMEOUT_S = 60;
/** Score penalty per BU of straight distance to the job (GDD 02 §10.4 distance penalty). */
export const JOB_DIST_PENALTY_PER_BU = 0.05;
/** Egg / pupa piles get a tend job once untended this long, gd (well inside UNTENDED_GD 0.25). */
export const TEND_DUE_GD = 0.12;
/** Tend job priority rises by tendUrgent once untended this long, gd. */
export const TEND_URGENT_GD = 0.15;
/** A tend round grooms the brood within this radius of the nurse, BU (GDD 02 §10.4: 2 BU). */
export const TEND_PILE_RADIUS_BU = 2;
/** A nurse ending a round grooms a pile due for tending within this distance first, BU. */
export const TEND_NEAR_BU = 3;
/** Nurse crop load, loads (NURSE_LOAD), and the time to load it from the pool, s (GDD 02 §10.4 timed actions). */
export const NURSE_LOAD = 0.6;
export const LOAD_S = 6;
/** A nurse goes to load when her crop is below this, loads. */
export const CROP_MIN_FEED = 0.1;
/** A nurse without a job loads ahead of the next request while larvae are about and her crop is below this. */
export const PRELOAD_BELOW = 0.4;
/** Feeds chained to other requesting larvae within this radius, BU, up to this many per round. */
export const FEED_CHAIN_RADIUS_BU = 6;
export const FEED_CHAIN_MAX = 6;
/** Pool too empty to load: feed jobs are skipped by this nurse for this long, s (S2 rationing). */
export const LOAD_EMPTY_BACKOFF_S = 30;
/** Below this the pool counts as empty for loading, loads. */
export const LOAD_EMPTY_MIN = 0.02;
/** Eclosion help and cannibalism, s (GDD 02 §2.9 ECLOSE_ASSIST_S, §10.4). */
export const ASSIST_S = 10;
export const CANNIBALISE_S = 6;
/** Idle nurse: groom self, s of standing before the next select. */
export const GROOM_IDLE_S = 8;
/** A grooming nurse looks at the board this often, ticks, and stops grooming for any job (GDD 02 §10.4 groom = 1). */
export const GROOM_JOB_CHECK_TICKS = 10;

// ---- brood sorting by microclimate (GDD 02 §10.4.1) ----
/** r(T) at its plateau (30-32 C), the normaliser of the temperature term. */
export const SORT_R_MAX = 1.818;
/** Move when best > current x SORT_TRIGGER_MULT + SORT_TRIGGER_ADD. */
export const SORT_TRIGGER_MULT = 1.15;
export const SORT_TRIGGER_ADD = 0.05;
/** At most this many move jobs per available nurse are offered at a time. */
export const SORT_MOVES_PER_NURSE = 4;
/** Crowding: (items + incoming) / cap above CROWD_START reaches 1 at CROWD_START + CROWD_SPAN. */
export const SORT_CROWD_START = 0.8;
export const SORT_CROWD_SPAN = 0.2;
export const SORT_FLOOD_WEIGHT = 0.8;
/** Waste items in the chamber at which the hygiene term reaches 0. */
export const SORT_WASTE_FULL = 10;
export const SORT_NURSERY_BONUS = 0.1;
export const SORT_ROYAL_EGG_BONUS = 0.1;
/** Score penalty per BU of nest-path distance to the royal chamber. */
export const SORT_ROYAL_DIST_PER_BU = 0.002;
/** Larvae below this progress sort with the eggs ("eggs + young larvae"). */
export const SORT_YOUNG_LARVA_PROGRESS = 0.5;
/** Humidity curves [RH, factor] (GDD 02 §10.4.1 `hum`); pupae below 50 % are not specified: 0.7 at 30 % (decision). */
export const SORT_HUM_EGG_LARVA: readonly [number, number][] = [[0.5, 0.6], [0.7, 1], [0.95, 1], [0.98, 0.5]];
export const SORT_HUM_PUPA: readonly [number, number][] = [[0.3, 0.7], [0.5, 1], [0.85, 1], [0.95, 0.7]];
/** Flooded fraction or alarm (ph) from which a chamber is evacuated (GDD 02 §10.4 `evacuate`). */
export const EVACUATE_FLOOD = 0.25;
/** Brood is put down within this fraction of the target chamber's horizontal radii from its centre. */
export const PILE_SPREAD = 0.45;
/** Items of a pile lie within this radius of the pile point, BU. */
export const PILE_RADIUS_BU = 1.5;
/** Arrival radius at a brood pile slot (put-down), BU; at a brood item for a care act (eclosion help, cannibalism), BU. */
export const BROOD_DROP_ARRIVE_BU = 0.5;
export const CARE_ARRIVE_BU = 0.8;
/** Walking to a chamber: arrived within this fraction of its smaller horizontal radius from the centre (work trips),
 * or ROOM_WAIT_FRAC (waiting places: idle wander, nurse waiting by the larvae, queen moving in). */
export const ROOM_ARRIVE_FRAC = 0.6;
export const ROOM_WAIT_FRAC = 0.5;
/** Things lying farther than this from the nearest surface float in a cavity and cannot be reached, BU. */
export const REACHABLE_ABOVE_BU = 0.5;

// ---- queen care (GDD 02 §10.5) and the established queen (§10.14) ----
export const QUEEN_ATTEND_BU = 3;
export const QUEEN_FEED_LOADS = 0.1;
export const QUEEN_FEED_S = 4;
/**
 * In starvation S2 a carer feeds the queen from its own fat reserve (GDD 02 §5.7) while it holds more than this, C
 * (decision: without a floor the carers starve before the old workers, against GDD 02 App. E 9).
 */
export const CARER_KEEP_RESERVE = 0.25;
/** Eggs within this distance of the queen are collected, BU. */
export const EGG_COLLECT_BU = 2;
/** Carers groom the queen every this many s while attending (cosmetic). */
export const QUEEN_GROOM_EVERY_S = 30;
/** The queen walks home when farther than this from her chamber centre, BU. */
export const QUEEN_HOME_SLACK_BU = 3;
/** Fraction of chamber radius from the centre the queen sits at; the egg pile is on the other side. */
export const QUEEN_SEAT_OFFSET = 0.5;
/** Chamber types a queen may flee to from a flooded or alarmed home (not food stores, middens). */
export const QUEEN_REFUGE_TYPES: readonly ChamberType[] = ['royal', 'founding', 'nursery', 'general', 'rest'];
export const EGG_PILE_OFFSET = 0.6;
/** Eggs of the queen's pile lie within this radius of its point, BU. */
export const EGG_PILE_RADIUS_BU = 0.5;
/** A carer feeding the queen stands within this distance of her, BU. */
export const QUEEN_FEED_ARRIVE_BU = 1.2;

// ---- store (GDD 02 §10.6) ----
export const STORE_DISPERSE_S = 15;
/** A store ant waiting at its post re-stamps its state (a new waiting cycle) this often, s. */
export const STORE_POST_CYCLE_S = 60;
/** The post: this fraction of the entrance chamber's radius from its centre; arrival radius there, BU. */
export const STORE_POST_FRAC = 0.25;
export const STORE_POST_ARRIVE_BU = 0.8;
/** Solid food is put down on a pile this fraction of the store chamber's radius from its centre. */
export const STORE_PILE_FRAC = 0.3;
/** Food lying in its own store chamber is picked up and put down again (booked) only if the pool takes this much, loads. */
export const STORE_REBOOK_MIN = 0.05;
/** Solid food lying within this distance of an entrance (outside a food chamber) is shifted in, BU. */
export const DROP_ZONE_BU = 8;

// ---- dig and haul (GDD 02 §10.7-10.8, GDD 03 §7.5-7.7) ----
/** No free slot: retry claiming after this, s; give the task back after this many tries. */
export const DIG_RETRY_S = 10;
export const DIG_CLAIM_TRIES = 3;
/** Failed bites at a slot before it is given up. */
export const DIG_BITE_FAILS_MAX = 4;
/** A biting digger checks this often that its slot still exists (a cancelled plan stops its bites), ticks. */
export const DIG_BITE_CHECK_TICKS = 2;
/** Arrival radius at a dig slot, BU (inside SLOT_REACH_BU 1.5). */
export const SLOT_ARRIVE_BU = 0.6;
/** A digger farther than this from its slot walks back to it before biting, BU (inside SLOT_REACH_BU 1.5). */
export const SLOT_HOLD_BU = 1.4;
/** A walk to the slot that stalls this close to it counts as arrived, BU (inside SLOT_HOLD_BU). */
export const SLOT_STALL_ACCEPT_BU = 1.35;
/** Turning toward the face before a bite: walk toward a point this far along the aim, at most this long, s. */
export const DIG_TURN_BU = 1.5;
export const DIG_TURN_S = 1;
/** Arrival radius of that turning walk, BU; a digger bites once facing the aim within this cone, deg. */
export const DIG_TURN_ARRIVE_BU = 0.2;
export const DIG_FACE_CONE_DEG = 45;
/** The bite is aimed at a point this far ahead along the plan heading (dropped by the ramp slope), BU. */
export const DIG_AIM_BU = 2;
/** Pellets within this distance of a plan's spoil point count as its spoil pile, BU. */
export const SPOIL_PILE_RADIUS_BU = 2;
/** Haul job priorities (GDD 02 §10.8) and the extra cost of clutter pellets (GDD 03 §7.7). */
export const HAUL_PRIORITY = { corpse: 3, waste: 2, pellet: 1 } as const;
export const HAUL_CLUTTER_COST = 1.4;
/** Corpses are hauled once dead this long, s, and only within this distance of an entrance, BU. */
export const CORPSE_DETECT_S = 60;
export const CORPSE_HAUL_RADIUS_BU = 60;
/** Default surface midden: this far from the main entrance, downhill (GDD 02 §10.8: 15-40 BU). */
export const MIDDEN_DIST_BU = 18;
export const MIDDEN_DIRECTIONS = 16;
/** Waste / corpses lying within this distance of the midden point are at the midden, BU. */
export const MIDDEN_RADIUS_BU = 6;
/** Arrival radius at a drop point (dump point, spoil point, midden), BU. */
export const DROP_ARRIVE_BU = 0.6;
/** No haul job: wait this long, s, then give the task back (GDD 03 seek-pellet 10 s). */
export const HAUL_IDLE_S = 10;

// ---- idle, rest, guard (GDD 02 §10.9, §10.11) ----
/** Idle ants wander within this fraction of their chamber's horizontal radius. */
export const IDLE_WANDER_FRAC = 0.6;
/** Wander speed factor of idle ants ("wander slowly"). */
export const IDLE_SPEED_MULT = 0.5;
export const GUARD_RIM_BU = 3;
export const GUARD_SHIFT_S = 300;
/** Contact distance for guard antennation, BU (CONTACT_DIST) and the predator watch radius, BU. */
export const GUARD_CONTACT_BU = 1.2;
export const GUARD_CREATURE_BU = 6;

// ---- reaching a target (walking up to it before a primitive) ----
/** First approach to a target before a primitive: arrival radius, BU (at least one nest voxel, 0.5 BU). */
export const REACH_APPROACH_BU = 0.8;
/**
 * Still out of reach after the approach: walk to a point this far beyond the target (on the line from the ant
 * through it), arriving within PASS_ARRIVE_BU, at most PASS_TRIES times; the target comes into reach on the way.
 */
export const PASS_BEYOND_BU = 2;
export const PASS_ARRIVE_BU = 0.5;
export const PASS_TRIES = 2;
/** Approaches that start within this distance of the target, and passes, walk at this fraction of cruise (BU). */
export const SHORT_HOP_BU = 3;
export const SHORT_HOP_SPEED_MULT = 0.5;
/** A walk still 'moving' whose ant has been slower than WALK_STALL_SPEED_BU (BU/s) for WALK_STALL_S, s, has stalled. */
export const WALK_STALL_S = 0.8;
export const WALK_STALL_SPEED_BU = 0.1;
/** A stalled approach this close to its target counts as arrived (care acts need no contact reach), BU. */
export const STALL_ACCEPT_BU = 1.2;

// ---- common failure handling (GDD 02 §10.0) ----
/** Within this distance of a target that stays out of reach for REACH_STALL_S, the job is given up and the
 * target passed over by that ant for REACH_SKIP_S (BU, s). */
export const REACH_NEAR_BU = 2.5;
export const REACH_STALL_S = 20;
export const REACH_SKIP_S = 30;
/** Stuck rule: this many nav failures within STUCK_WINDOW_S drop the task to idle. */
export const STUCK_MAX = 3;
export const STUCK_WINDOW_S = 60;
/** Per-state timeouts, s: no ant stays longer in a state (a timeout releases claims and restarts the task). */
export const STATE_TIMEOUT_S: Readonly<Record<string, number>> = {
  'idle': 60, 'rest': 600,
  'nurse.select': 30, 'nurse.load': 90, 'nurse.feed': 120, 'nurse.tend': 90, 'nurse.carry': 150, 'nurse.assist': 60,
  'nurse.cannibalise': 60, 'nurse.groom': 30,
  'queen-care.attend': 120, 'queen-care.load': 120, 'queen-care.feed': 90, 'queen-care.collect-eggs': 150,
  'queen-care.escort': 300,
  'store.post': 120, 'store.receive': 30, 'store.disperse': 40, 'store.shift': 150, 'store.clean': 240,
  'dig.claim': 40, 'dig.travel': 90, 'dig.bite': 60, 'dig.stow': 240,
  'haul.claim': 40, 'haul.travel': 120, 'haul.pick': 30, 'haul.carry': 240, 'haul.return': 150,
  'guard.post': 360, 'guard.alarm-raise': 20,
  'queen.reside': 300, 'queen.relocate': 600,
};
/** Waiting ants (no job, standing post) think every this many ticks (the runner's default is 5). */
export const WAIT_THINK_TICKS = 10;
/** Timeout of a state missing from the table, s. */
export const STATE_TIMEOUT_DEFAULT_S = 120;

/** Ambient trophallaxis (visual only, GDD 02 §5.4.1): one per this many idle-ant game minutes. */
export const AMBIENT_TROPH_IDLE_MIN = 20;
/** An idle ant's ambient trophallaxis partner is another idle ant within this distance, BU. */
export const AMBIENT_TROPH_RADIUS_BU = 1.5;
/** Idle ants re-stamp their state (and re-pick a wander spot) this often, s. */
export const IDLE_CYCLE_S = 30;
