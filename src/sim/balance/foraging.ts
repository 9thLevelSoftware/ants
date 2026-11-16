// Outdoor behaviours and perception (GDD 02 §7, §8.3-8.4, §9.3, §10.1-10.3, §10.12, §12.2; owner: beh-forage).
// Lengths in BU, times in game seconds, pheromone in ph, food in loads. Constants that other modules already own
// (TRAIL_DETECT, CROP_RETURN_FRACTION, LEAD_VALID_S, TRAIL_IGNORE_P, SIZE_FACTOR_*, ...) are imported from their
// files, not repeated here.

// ---- perception (GDD 02 §7) ----
/** Antennation: centre distance and half-angle of the contact cone. */
export const CONTACT_DIST_BU = 1.2;
export const CONTACT_HALF_ANGLE_DEG = 60;
/** Antennal chemoreception: sample points ahead of the head at +-ANTENNA_ANGLE_DEG. */
export const ANTENNA_REACH_BU = 0.9;
export const ANTENNA_ANGLE_DEG = 35;
/**
 * Volatile smell: food radius is the source's own odour radius (SMELL_RANGE_FOOD x odourStrength, GDD 05 data);
 * creatures (predators, Tier 2). Corpse smell (3 BU) serves corpse hauling, an in-nest task (beh-nest), and is not
 * part of the outdoor percept.
 */
export const SMELL_CREATURE_BU = 6;
/** Perception cadence, ticks (0.5 s, GDD 02 §7 smell update); staggered by ant id. */
export const PERCEPTION_EVERY = 5;
/** Largest odour radius the smell query looks for, BU (sources farther than this cannot be smelled at all). */
export const SMELL_QUERY_MAX_BU = 100;
/** Human-event cues (tremor, shadow) are felt within the cue radius times this, and only before impact. */
export const HUMAN_CUE_FEEL_MULT = 1.5;
/** Alarm: the danger is taken to lie this far up the alarm gradient (flee runs from that point), BU. */
export const ALARM_THREAT_OFFSET_BU = 4;

// ---- think cadence, ticks ----
/** Behaviour think interval while travelling / working outside. */
export const THINK_TRAVEL_TICKS = 5;
/** Think interval while waiting in the nest (forage.wait, rest). */
export const THINK_WAIT_TICKS = 10;

// ---- departure (GDD 02 §1.4, §6.6) ----
/** Ration a departing forager / scout / tender takes from the pool (only if the pool holds >= RATION_POOL_MIN C). */
export const DEPART_RATION_C = 0.1;
export const RATION_POOL_MIN_C = 1;
/** How far a departing ant looks for a nestmate to beg its ration from, BU, and how long it tries, s. */
export const RATION_SEARCH_BU = 4;
export const RATION_MAX_S = 6;
/** Hungry return (GDD 02 §1.4): crop C below this and reserve below the fraction of its cap. */
export const HUNGER_RETURN_CROP = 0.05;
export const HUNGER_RETURN_RESERVE_FRAC = 0.5;
/**
 * The hungry return (GDD 02 §1.4) is a trip home to refuel: it applies only while the colony pool holds at least
 * this much C, loads. With an empty pool (the first workers after the founding) going home cannot feed the ant and
 * would end every trip at the entrance, so the colony could never find food (int-1B-sim ruling).
 */
export const HUNGER_RETURN_POOL_MIN_C = 0.1;
/** Arrival radius at the entrance chamber centre (waiting foragers, homing by the planner), BU. */
export const WAIT_SPREAD_BU = 2;
/** Arrival radius at the food chamber (solid unloading, receiver search), BU. */
export const FOOD_ROOM_ARRIVE_BU = 1.5;
/** Arrival radius of point legs: scout legs, avoid detours, flee runs, BU. */
export const LEG_ARRIVE_BU = 2;
/** A waiting forager re-evaluates its task after this long without departing, s (and restarts its wait). */
export const WAIT_REEVAL_S = 300;
/** Rest phase timeout, s (fatigue 0.9 -> 0.2 takes 105 s at FATIGUE_RECOVER). */
export const REST_MAX_S = 300;

// ---- source choice (GDD 02 §5.5) ----
/** Score multiplier for known sources inside a `forage` marker. */
export const FORAGE_MARKER_SCORE_MULT = 1.5;
/** Collection time assumed in the trip-time estimate, s (a full crop at DRINK_RATE). */
export const CHOICE_COLLECT_S = 20;
/** Lowest trip time of the estimate, s (a source next to the entrance is not infinitely attractive). */
export const CHOICE_MIN_TRIP_S = 10;
/** Floor of the crowding factor fCrowd (a full source still scores a little). */
export const CHOICE_CROWD_MIN = 0.05;

// ---- outbound (GDD 02 §8.4, §10.2) ----
/** Leaving the entrance: distance after which trail following may start, BU. */
export const EXIT_CLEAR_BU = 4;
/** A trail at the ant's position at least this strong is followed (TRAIL_DETECT is the sensor floor). */
export const FOLLOW_MIN_PH = 0.5;
/** Arrival tolerance at the expected source position (GDD 02 §10.2: 4 BU). */
export const ARRIVE_SOURCE_BU = 4;
/** Learned-route waypoint arrival radius, BU. */
export const ROUTE_WP_ARRIVE_BU = 2;
/** Arrival radius at a planner destination (source position, lead position, marker), BU. */
export const OUTBOUND_ARRIVE_BU = 1;
/** Walking to a source: arrive this many body lengths beyond its footprint edge. */
export const SOURCE_ARRIVE_L = 0.3;
/** Outbound state timeout: base + per BU of straight-line distance, s; never above OUTBOUND_MAX_S. */
export const OUTBOUND_BASE_S = 60;
export const OUTBOUND_PER_BU_S = 0.75;
export const OUTBOUND_MAX_S = 600;
/** Trail following without smelling the source for this long falls back to the planner, s. */
export const TRAIL_FOLLOW_MAX_S = 150;
/**
 * A recruit follows its own source's trail (GDD 02 §6.7), but a colony's trails are not labelled per source and meet
 * at the entrance: every TRAIL_COURSE_SEG_BU walked on a trail is one stretch; a stretch more than
 * TRAIL_COURSE_MAX_DEG off the bearing to the trip's destination is off course, and TRAIL_OFF_COURSE_SEGS such
 * stretches in a row mean the trail leads elsewhere (the ant leaves it for the planner). Within TRAIL_COURSE_NEAR_BU
 * of the destination the check is off (smell and the arrival rules take over there).
 */
export const TRAIL_COURSE_SEG_BU = 8;
export const TRAIL_COURSE_MAX_DEG = 50;
export const TRAIL_OFF_COURSE_SEGS = 2;
export const TRAIL_COURSE_NEAR_BU = 20;
/** Outbound trail followers lay at this fraction of a dab (GDD 02 §8.3). */
export const OUTBOUND_DAB_FACTOR = 0.3;
/** Trail-lost event: this many ants losing the same trail within the window (GDD 02 §8.4). */
export const TRAIL_LOST_EVENT_ANTS = 3;
export const TRAIL_LOST_EVENT_WINDOW_S = 60;

// ---- search, queue, collect (GDD 02 §10.2) ----
export const SEARCH_RADIUS_BU = 10;
export const SEARCH_S = 30;
/** Spiral legs of the search: angular step per leg, rad, and leg arrival radius, BU. */
export const SEARCH_STEP_RAD = 1.2;
export const SEARCH_ARRIVE_BU = 1.5;
/** Queue: wait within this of the source, up to QUEUE_S; alternative source within ALT_SOURCE_BU. */
export const QUEUE_DIST_BU = 4;
export const QUEUE_S = 20;
export const ALT_SOURCE_BU = 100;
/** Crowding feedback: waited longer than this in a full queue -> no trail on the way home (GDD 02 §8.3). */
export const QUEUE_NO_TRAIL_S = 15;
/** Collect state timeout, s (a honeydew film fills a crop in 80 s at x0.25). */
export const COLLECT_MAX_S = 120;
/** Contact distance for starting a harvest, beyond the source footprint, BU. */
export const HARVEST_REACH_PAD_BU = 1;
/** Minimum crop to count a liquid return as successful (GDD 02 §6.6: 0.5 load). */
export const SUCCESS_CROP = 0.5;

// ---- return and delivery (GDD 02 §5.3, §9.2, §10.2) ----
/** Return state timeout before the planner takes over, s; and when a failed planner leg forces a fresh plan, s. */
export const RETURN_STAGE_S = 400;
export const RETURN_REPLAN_S = 2 * RETURN_STAGE_S;
/**
 * Hard bound of a return: an ant still not home after this long is lost (death cause `lost`, "exposure after being
 * separated", GDD 06 §9.3). It never happened in the test scenarios; it guarantees that no ant wanders for ever.
 */
export const RETURN_LOST_S = 1200;
/**
 * Trip clock (time outside since leaving the nest, flee and queue detours included): after TRIP_TURN_S an ant still
 * heading away from home turns home (reason `timeout`); after TRIP_LOST_S it is lost (death cause `lost`). These
 * bound a whole trip, whatever chain of per-state timeouts, alternative sources and flees it went through.
 */
export const TRIP_TURN_S = 900;
export const TRIP_LOST_S = TRIP_TURN_S + RETURN_LOST_S;
/** Receiver search radius (RECEIVER_SEARCH) and the time before walking to a food chamber (UNLOAD_SEARCH_S), s. */
export const RECEIVER_SEARCH_BU = 8;
export const UNLOAD_SEARCH_S = 15;
/** Stores full: wait this long for room, then rest holding the crop (UNLOAD_MAX_WAIT), s; retry every UNLOAD_RETRY_S. */
export const UNLOAD_MAX_WAIT_S = 60;
export const UNLOAD_RETRY_S = 2;
/**
 * Crop margin above a floor (CROP_RETURN_MIN to start a delivery, TROPH_DONOR_MIN to keep unloading or rest holding
 * food), loads: below floor + margin the remainder is the ant's own and not worth an unload.
 */
export const UNLOAD_CROP_MARGIN = 0.05;
/** A forager hands its crop to any nestmate within this many body lengths. */
export const GIVE_REACH_L = 2;
/** Deliver state timeout, s (search + wait + walking inside). */
export const DELIVER_MAX_S = 120;
/** Arrival radius at a receiver ant, body lengths; give up on an unreachable receiver after RECEIVER_TRY_S. */
export const RECEIVER_ARRIVE_L = 0.25;
export const RECEIVER_TRY_S = 10;
/** Without any receiver for this long the forager searches the whole nest, BU. */
export const RECEIVER_SEARCH_WIDE_BU = 40;
/** A store worker counts as this much nearer when choosing a receiver (GDD 02 §5.3 "preferring store"), BU. */
export const RECEIVER_STORE_BONUS_BU = 1;

// ---- trail laying (GDD 02 §8.3) ----
export const TRAIL_LAY_P_FORAGER = 0.84;
export const TRAIL_LAY_NEED_BASE = 0.4;
export const TRAIL_DAB_NEED_BASE = 0.5;
export const SCOUT_DAB_MULT = 1.2;

// ---- route memory (GDD 02 §9.3) ----
export const ROUTE_SIMPLIFY_TOL_BU = 2;
export const ROUTE_MATCH_DIST_BU = 6;
export const ROUTE_MATCH_FRACTION = 0.7;
export const ROUTE_FIX_VISITS = 3;
export const ROUTE_FORGET_GD = 2;
/** Too many waypoints after simplification: the tolerance grows by this factor until they fit. */
export const ROUTE_SIMPLIFY_GROWTH = 1.5;
/** Depleted memory: one empty find blocks the source this long (GDD 02 §9.3: 1 gd). */
export const DEPLETED_GD = 1;

// ---- scout (GDD 02 §10.1) ----
export const SCOUT_DEPART_BU = 10;
/** Depart ends at this fraction of SCOUT_DEPART_BU from the entrance, or after SCOUT_DEPART_MAX_S. */
export const SCOUT_DEPART_DONE_FRAC = 0.8;
export const SCOUT_DEPART_MAX_S = 60;
/** Scout legs keep this far from the map edge, BU. */
export const SCOUT_EDGE_BU = 8;
/** A scout walking to a forage marker arrives within this fraction of its radius. */
export const SCOUT_MARKER_ARRIVE_FRAC = 0.5;
export const SCOUT_MAX_S = 300;
export const SCOUT_MAX_RANGE_BU = 700;
/**
 * Small colonies scout near home (viab-economy R3): below SMALL_COLONY_N workers (balance/colony.ts) a scout turns
 * home beyond this many BU instead of SCOUT_MAX_RANGE_BU. Its straight-ish outward legs sweep a strip only the odour
 * range wide; out to 700 BU two scouts left a flower 53 BU from the woodland-edge #1 nest unfound for a game day
 * (closest pass 12.7 BU, smell 10 BU) while food within the C13 300 BU budget radius lay all around.
 */
export const SMALL_SCOUT_RANGE_BU = 220;
/** Correlated random walk: heading noise per s (sigma), deg; leg length, BU; candidate headings per leg. */
export const SCOUT_TURN_SIGMA_DEG_S = 25;
export const SCOUT_LEG_BU = 12;
export const SCOUT_CANDIDATES = 7;
/** Candidate fan step around the walk's heading, rad; unexplored cells are looked up this many legs ahead. */
export const SCOUT_FAN_RAD = 0.45;
export const SCOUT_RAY_LEGS: readonly number[] = [1, 3, 6, 12, 20];
/** Bonus of keeping the walk's own heading, and random tie noise. */
export const SCOUT_W_STRAIGHT = 0.3;
export const SCOUT_W_NOISE = 0.2;
/** Candidate scoring weights: unexplored coarse cell, home-marked ground, toward the marker waypoint. */
export const SCOUT_W_UNEXPLORED = 1.0;
export const SCOUT_W_HOME = 0.6;
export const SCOUT_W_MARKER = 1.5;
export const SCOUT_W_AVOID = 4;
/** Share of departing scouts that take an open forage marker as first waypoint (GDD 02 §12.2). */
export const SCOUT_MARKER_SHARE = 0.5;
/** Investigate: no progress toward the odour for this long -> explore again, s. */
export const INVESTIGATE_S = 30;
/** Explored bitmap cell edge, BU (the coarse nav cell, seed §3). */
export const EXPLORED_CELL_BU = 16;

// ---- tend, Tier 1 static honeydew sites (GDD 02 §10.3; herds are Tier 2) ----
/** Tenders look for a known honeydew site within this of the entrance, BU. */
export const TEND_SITE_RANGE_BU = 600;

// ---- flee (GDD 02 §10.12) ----
export const FLEE_RUN_S = 4;
export const FLEE_FREEZE_S = 2;
export const FLEE_MAX_CYCLES = 3;
/** Threat out of range this long ends the flee, s. */
export const FLEE_CLEAR_S = 6;
/** Run leg length, BU (the run is a point goal this far away, re-aimed each cycle). */
export const FLEE_LEG_BU = 30;

// ---- markers (GDD 02 §12.2) ----
/** Avoid repulsion zone beyond the marker radius in which trail followers switch to the planner, BU. */
export const AVOID_LOOKAHEAD_BU = 8;
/** An ant inside an avoid marker walks out to this far beyond its radius before homing, BU. */
export const AVOID_EXIT_PAD_BU = 4;
/** At most this many detours round avoid markers per trip leg (then the planner's way is taken as it is). */
export const AVOID_DETOURS_MAX = 4;
/** marker-response events are emitted at most this often per marker, s. */
export const MARKER_RESPONSE_EVERY_S = 10;

// ---- trail monitor (GDD 02 §13.1, App. C trail-established) ----
/** A trail cell counts as connected at this strength, ph. */
export const TRAIL_CONNECTED_PH = 1;
/** How often the trail monitor runs, s. */
export const TRAIL_CHECK_S = 60;
/** Entrance and source are linked when the connected cells reach within this of each, BU. */
export const TRAIL_LINK_REACH_BU = 8;

// ---- stuck handling (GDD 02 §10.0) ----
/** 3 locomotion failures within this window drop the task to idle (at home) / force homing (outside), s. */
export const STUCK_WINDOW_S = 60;
export const STUCK_MAX = 3;
