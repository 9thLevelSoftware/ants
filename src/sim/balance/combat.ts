// Combat constants (GDD 05 §4; 00-index C8). Rules live in src/sim/combat. Durations in game seconds, distances in
// L (body lengths of the acting ant) unless the name says otherwise. The barrel re-exports this file, so every new
// name carries a combat-specific word to stay unique.

/** maxHp = HP_PER_MG23 * massMg^(2/3) unless the caste has fixed stats (Lasius worker 1 mg -> 10 HP). */
export const HP_PER_MG23 = 10;
/** bite = BITE_PER_MG23 * massMg^(2/3) * mandibleFactor, damage per 1.0 s strike (Lasius worker 1.0). */
export const BITE_PER_MG23 = 1.0;
/** Carry capacity exponent: carryCap = m^CARRY_EXPONENT unless overridden. */
export const CARRY_EXPONENT = 0.6;

// ---- stats (§4.1) ----

/** Pull of an ant = PULL_PER_MG23 x massMg^(2/3) (Lasius worker 3.0). */
export const PULL_PER_MG23 = 3;
/** Default bite cycle (strike 0.5 s + cooldown), s. */
export const COMBAT_BITE_CYCLE_S = 1.0;

/**
 * Per species and caste values the species data do not carry (GDD 05 §4.1 table): pull, armour and bite cycle.
 * Keys are `<species>:<caste>`, with `:founding` for the founding queen; a missing entry uses the formulas above,
 * armour 0 and the default cycle. Rival-only species use their RivalSpeciesDef armour and the formulas.
 */
export const CASTE_COMBAT_OVERRIDES: Readonly<Record<string, { pull?: number; armour?: number; biteCycleS?: number }>> = {
  'lasius-niger:queen:founding': { pull: 8, armour: 0.2, biteCycleS: 1.2 },
  'lasius-niger:queen': { pull: 9, armour: 0.3, biteCycleS: 1.4 },
  'lasius-niger:gyne': { pull: 6, armour: 0.2, biteCycleS: 1.2 },
  'lasius-niger:male': { pull: 1.0 },
  'camponotus-pennsylvanicus:major': { armour: 0.1, biteCycleS: 1.2 },
  'messor-barbarus:minor': { armour: 0.1 },
  'messor-barbarus:media': { armour: 0.1 },
  'messor-barbarus:major': { armour: 0.1, biteCycleS: 1.4 },
  'atta-texana:major': { armour: 0.25, biteCycleS: 1.4 },
};

// ---- bite, hit, damage (§4.2) ----

/** Hit chance against a free target, x clamp(sqrt(targetLen / attackerLen), lo, hi). */
export const HIT_CHANCE_FREE = 0.7;
export const HIT_SIZE_CLAMP: readonly [number, number] = [0.5, 1];
/** Hit chance when the attacker holds the target; when the target is pinned, seized or paralysed. */
export const HIT_CHANCE_HOLDING = 0.9;
export const HIT_CHANCE_HELPLESS = 1.0;
/** Hit chance multiplier while the attacker is disoriented, and against a target that dodged within DODGE_S. */
export const HIT_MULT_DISORIENTED = 0.5;
export const HIT_MULT_DODGED = 0.5;
/** Outnumbering M(n) = min(OUTNUMBER_MAX, 1 + OUTNUMBER_STEP (n - 1)), n = distinct hitters within the window. */
export const OUTNUMBER_STEP = 0.25;
export const OUTNUMBER_MAX = 2.0;
export const OUTNUMBER_WINDOW_S = 2;
/** recentHitters entries older than this are pruned, s (>= OUTNUMBER_WINDOW_S and GDD 01 RESUME_COMBAT_WINDOW_S). */
export const RECENT_HITTER_KEEP_S = 4;

// ---- grapple (§4.3) ----

/** Contact slots = clamp(round(SLOTS_PER_LEN x targetLen / attackerLen), SLOTS_MIN, SLOTS_MAX); TUNNEL_SLOTS in tunnels. */
export const SLOTS_PER_LEN = 4;
export const SLOTS_MIN = 2;
export const SLOTS_MAX = 12;
export const TUNNEL_SLOTS = 2;
/** A place is a tunnel when the free radius around the target is below this, L (probed sideways and upward). */
export const TUNNEL_FREE_RADIUS_L = 1.5;
/** ... in at least this many of the five probe directions (forward, back, both sides, up). */
export const TUNNEL_CLOSED_PROBES = 2;
/** Holders of a creature are searched within radius + HOLDER_SEARCH_SIZE_MULT x its size + HOLDER_SEARCH_BU. */
export const HOLDER_SEARCH_SIZE_MULT = 4;
export const HOLDER_SEARCH_BU = 4;
/** Holder speed multiplier (GDD 01 bite-hold). */
export const HOLDER_SPEED_MULT = 0.3;
/** A single holder stronger than the target drags it at this fraction of cruise. */
export const DRAG_CRUISE_FRAC = 0.3;
/** First hold bite after the lock, s (the 0.5 s strike, E9: first hit 0.5 s after the lock). */
export const HOLD_FIRST_BITE_S = 0.5;
/** Lock break: once per this many seconds the target shakes one random holder off with p pull_t / (pull_t + k Σ pull_h). */
export const LOCK_BREAK_EVERY_S = 1;
export const LOCK_BREAK_HOLDER_WEIGHT = 2;
/** A shaken-off holder is stunned (cannot bite or hold), s. */
export const SHAKEN_STUN_S = 0.5;
/** Pin: holders >= PIN_MIN_HOLDERS and Σ pull_h >= PIN_PULL_RATIO x pull_t. */
export const PIN_MIN_HOLDERS = 2;
export const PIN_PULL_RATIO = 1.5;
/** A pinned target may still bite a holder within this half-angle of its forward, degrees (front 60°). */
export const PIN_FRONT_HALF_DEG = 30;
/** Contact gap kept between holder and target bodies, L. */
export const LOCK_CONTACT_GAP_L = 0.2;
/** A lock whose bodies drift apart beyond this many contact distances breaks (teleport, fall). */
export const LOCK_BREAK_DIST_MULT = 3;

// ---- specials (§4.4) ----

/** Acid = SPRAY_ACID_PER_MG23 x massMg^(2/3) x species spray multiplier, delivered over SPRAY_ACID_S. */
export const SPRAY_ACID_PER_MG23 = 2.5;
export const SPRAY_ACID_S = 2;
/** A hostile ant hit by acid releases its locks with this probability and is disoriented for SPRAY_DISORIENT_S. */
export const SPRAY_RELEASE_P = 0.5;
export const SPRAY_DISORIENT_S = 1;
/** Disoriented: speed multiplier (hit chance uses HIT_MULT_DISORIENTED). */
export const DISORIENTED_SPEED_MULT = 0.5;
/** The free-segment test of the spray cone uses a sphere of this radius, L. */
export const SPRAY_SEGMENT_RADIUS_L = 0.1;
/** Acid and venom doses running at once on one body, each over its own 2 s (more doses merge into the latest). */
export const ACID_DOSE_SLOTS = 4;
/** The executing attacker of a library bite / spray is searched within this distance of the target, BU. */
export const ATTACKER_SEARCH_BU = 12;

// ---- dodge (§4.8) ----

/** Displacement, L, over DODGE_S; cooldown; not while carrying more than DODGE_MAX_LOAD x carryCap. */
export const DODGE_DIST_L = 3;
export const DODGE_S = 0.25;
export const DODGE_COOLDOWN_S = 1.5;
export const DODGE_MAX_LOAD = 0.5;

// ---- alarm and recruitment (§4.5; pheromone deposits are GDD 02 §8's) ----

/** alarmLevel half-life, s (00-index C8). */
export const ALARM_LEVEL_HALF_LIFE_S = 10;
/** alarmLevel values below this are cleared; the ALARMED flag is set at or above ALARM_FLAG_LEVEL. */
export const ALARM_LEVEL_EPS = 1e-3;
export const ALARM_FLAG_LEVEL = 0.3;
/** alarmLevel never exceeds this (several bursts stack). */
export const ALARM_LEVEL_MAX = 3;
/** Triggers: burst radius (L), alarmLevel added to nestmates, pheromone deposit (ph). */
export const ALARM_BITTEN = { radiusL: 6, add: 0.5, deposit: 1.0 } as const;
export const ALARM_SPRAYED = { radiusL: 6, add: 0.5, deposit: 1.0 } as const;
export const ALARM_NESTMATE_KILLED = { radiusL: 6, add: 0.7, deposit: 1.5 } as const;
export const ALARM_PREDATOR_STRIKE = { radiusL: 6, add: 0.5, deposit: 1.0 } as const;
/** release-alarm: the primitive deposits its own puff (GDD 02 ALARM_RELEASE 4 ph); combat adds the burst. */
export const ALARM_RELEASE_BURST = { radiusL: 10, add: 0.8 } as const;
/** raiseAlarm(strength) at or above this is the release-alarm primitive's call (its puff is already deposited). */
export const ALARM_RELEASE_MIN_STRENGTH = 4;
/** A nestmate death raises the killed trigger when a nestmate stands within this distance, L. */
export const ALARM_KILLED_WITNESS_L = 3;
/** The bitten trigger fires at most once per this interval per victim, s. */
export const ALARM_BITTEN_EVERY_S = 1;
/** θ_fight by role (GDD 05 §4.5). */
export const THETA_FIGHT_FRONT = 0.3;
export const THETA_FIGHT_SURFACE = 0.5;
export const THETA_FIGHT_NURSE = 0.9;
export const THETA_FIGHT_NURSE_INVADED = 0.6;
/** Recruit cap: max(FIGHT_RECRUIT_MIN, FIGHT_RECRUIT_SHARE x workers); FIGHT_RECRUIT_SHARE_INVADED while invaded. */
export const FIGHT_RECRUIT_MIN = 10;
export const FIGHT_RECRUIT_SHARE = 0.25;
export const FIGHT_RECRUIT_SHARE_INVADED = 0.6;
/** Recruitment and encounter scans run for each ant every this many ticks (staggered by id). */
export const COMBAT_SCAN_EVERY = 5;
/** GDD 02 §8 ALARM_FIGHT_RATE (balance/pheromone) is deposited by fighting ants in chunks every this many ticks. */
export const ALARM_FIGHT_DEPOSIT_EVERY_TICKS = 10;

// ---- encounters and engagement (§3.6, §4.9) ----

/** Recognition distance (antennal contact), L. */
export const RECOGNITION_L = 1.0;
/** Awareness distance of a fighting ant looking for a hostile, L; while alarmed, ALERT_AWARE_L. */
export const AWARE_L = 3;
export const ALERT_AWARE_L = 6;
/** The same pair rolls again only after this, s. */
export const ENCOUNTER_REROLL_S = 20;
/** Attack roll: p = agg x terrF x stanceF x clamp(myMass / theirMass, lo, hi)^0.5, capped at 1. */
export const ATTACK_MASS_CLAMP: readonly [number, number] = [0.5, 1.5];
export const TERR_FACTOR = { own: 1.3, contested: 1.0, foreign: 0.6, nearEntrance: 2.0 } as const;
export const TERR_NEAR_ENTRANCE_BU = 20;
export const STANCE_ATTACK_MULT = { cautious: 0.5, defensive: 1.0, aggressive: 1.3 } as const;
export const ATTACK_VS_FOUNDING_QUEEN = 1.5;
/** Relation modifiers of the roll: truce multiplies, skirmish adds in contested cells. */
export const ATTACK_TRUCE_MULT = 0.6;
export const ATTACK_SKIRMISH_ADD = 0.1;
/** Territory claim rule (GDD 05 §3.5): marks >= CLAIM_MIN and >= CLAIM_RATIO x the second highest. */
export const TERR_CLAIM_MIN = 20;
export const TERR_CLAIM_RATIO = 1.5;

// ---- retreat (§4.6) ----

export const RETREAT_HEALTH_OUT = 0.35;
export const RETREAT_HEALTH_IN = 0.15;
/** Flee when hostile strength within RETREAT_RADIUS_L >= RETREAT_RATIO x friendly (not in own-claimed cells). */
export const RETREAT_RATIO = 2.5;
export const RETREAT_RADIUS_L = 5;
/** Stalemate: no damage either way for this long, then each holder releases with p STALEMATE_RELEASE_P per s. */
export const STALEMATE_S = 30;
export const STALEMATE_RELEASE_P = 0.5;
/** GDD 02 §10.13: a fight ending below this health goes to flee (then rest). */
export const FIGHT_EXIT_FLEE_HEALTH = 0.25;

// ---- the fight behaviour ----

/** Think interval of a fighting ant, ticks. */
export const FIGHT_THINK_TICKS = 2;
/** Gives up a target out of contact for this long, s; ends the fight after FIGHT_SEARCH_S without any target. */
export const FIGHT_LOSE_TARGET_S = 10;
export const FIGHT_SEARCH_S = 15;
/** Arrival distance at the alarm source, L. */
export const FIGHT_SOURCE_ARRIVE_L = 1.5;
/** Holders of the same colony a target gets before newcomers bite instead (E10: 2 hold, 2 bite). */
export const FIGHT_HOLDERS_WANTED = 2;
/** AI sprays when it has at least this many charges (keeps one in reserve), or always against predators. */
export const FIGHT_SPRAY_MIN_ACID = 2;
/** A fight record ends this long after the last lock, hit or damage, s (then injuries are rolled). */
export const FIGHT_END_QUIET_S = 5;
/** Arrival gap when closing on a target, and the gap that counts as contact, L (bodies' radii added). */
export const FIGHT_ARRIVE_GAP_L = 0.3;
export const FIGHT_CONTACT_GAP_L = 0.6;
/** A target within this many contact distances counts as seen (keeps it from being lost). */
export const FIGHT_SEEN_CONTACT_MULT = 2;
/** A queen (not possessed, never sent to fight) bites back at a hostile that hit her within this window, s. */
export const QUEEN_DEFENCE_WINDOW_S = 2;

// ---- injuries and recovery (§4.7) ----

/** Survivors that lost at least this health fraction in the fight roll injuries. */
export const INJURY_HEALTH_LOST = 0.3;
export const INJURY_P = { leg: 0.3, antenna: 0.15, gaster: 0.1 } as const;
/** Leg loss: speed x LEG_SPEED_MULT per lost leg, cumulative floor LEG_SPEED_FLOOR (climb x0.75 is locomotion's). */
export const LEG_SPEED_MULT = 0.85;
export const LEG_SPEED_FLOOR = 0.7;
/** Remaining mean lifespan of an injured worker is multiplied by this (once per fight with injuries). */
export const INJURY_LIFESPAN_MULT = 0.7;
/** Recovery, health per game day: in the nest with crop C > 0, and elsewhere (GDD 05 §4.7). */
export const RECOVERY_IN_NEST_PER_GD = 0.25;
export const RECOVERY_ELSEWHERE_PER_GD = 0.1;
/** Recovery top-up cadence, ticks. */
export const RECOVERY_EVERY_TICKS = 100;

// ---- rally markers (GDD 02 §12.2, GDD 05 §4.9) ----

/** Up to this share of idle / waiting workers answer a rally marker; they hold within RALLY_HOLD_BU. */
export const RALLY_MAX_FRACTION = 0.25;
export const RALLY_HOLD_BU = 8;
/** Rally recruitment cadence, ticks. */
export const RALLY_EVERY_TICKS = 50;

// ---- patrol (GDD 02 §10.10) ----

export const PATROL_TRIP_S = 180;
/** Waypoints lie on the home-range edge: home pheromone within this band, ph. */
export const PATROL_HOME_BAND: readonly [number, number] = [1, 3];
/** Waypoint search ring around the home entrance, BU, and candidates per pick. */
export const PATROL_RING_BU: readonly [number, number] = [20, 80];
export const PATROL_CANDIDATES = 12;
export const PATROL_ARRIVE_BU = 3;
/** Patrols see hostile ants within this distance (vision), BU, and predators within PATROL_PREDATOR_BU. */
export const PATROL_SEE_BU = 15;
export const PATROL_PREDATOR_BU = 6;
/** A sighting within this distance of the entrance or a trail (trail >= PATROL_TRAIL_PH) raises the alarm, BU. */
export const PATROL_ALARM_NEAR_BU = 15;
export const PATROL_TRAIL_PH = 0.3;
export const PATROL_THINK_TICKS = 5;

// ---- alerts and diagnostics ----

/** queen-in-danger: a hostile within this distance of the player queen, L; cleared this long after, s. */
export const QUEEN_DANGER_L = 3;
export const QUEEN_DANGER_CLEAR_S = 30;
/** diag-combat-losses: workers lost in fights in the last game day at which the status turns warn / bad. */
export const COMBAT_LOSSES_WARN = 3;
export const COMBAT_LOSSES_BAD = 10;
/** Diagnostics and alert checks cadence, ticks. */
export const COMBAT_DIAG_EVERY = 50;

// ---- sting (§4.4; GDD 01 §7.3) ----

/** Sting damage = STING_PER_MG23 x massMg^(2/3) x species venom (rival-only species: their catalogue damage). */
export const STING_PER_MG23 = 2.0;
export const STING_VENOM: Readonly<Record<string, number>> = { 'messor-barbarus': 0.8 };
/** Strike 0.6 s with a 0.3 s wind-up; venom over 2 s; cooldown 5 s; contact within 0.3 L (or a lock either way). */
export const STING_S = 0.6;
export const STING_WINDUP_S = 0.3;
export const STING_ACID_S = 2;
export const STING_COOLDOWN_S = 5;
export const STING_CONTACT_L = 0.3;
/** Species whose sting is repellent: the target flees (GDD 05: fugax, target flees 3 s). */
export const STING_REPEL_SPECIES: readonly string[] = ['solenopsis-fugax'];
