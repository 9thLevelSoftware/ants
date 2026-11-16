// Identifier sets for environment, opening, overwintering, reproduction, progression, alerts, cues (GDD 06, 08).

export const CLIMATE_IDS = ['temperate-maritime', 'temperate-continental', 'mediterranean', 'subtropical'] as const;
export type ClimateId = (typeof CLIMATE_IDS)[number];

export const DAY_PHASES = ['night', 'dawn', 'morning', 'midday', 'afternoon', 'dusk'] as const;
export type DayPhase = (typeof DAY_PHASES)[number];

export const RAIN_CLASSES = ['drizzle', 'shower', 'downpour'] as const;
export type RainClass = (typeof RAIN_CLASSES)[number];

export const MOISTURE_CLASSES = ['dry', 'slightly-damp', 'damp', 'wet', 'waterlogged'] as const;
export type MoistureClass = (typeof MOISTURE_CLASSES)[number];

export const OPENING_PHASES = ['intro-card', 'dealation', 'search', 'dig', 'seal', 'lay', 'timelapse', 'handover', 'done', 'failed'] as const;
export type OpeningPhase = (typeof OPENING_PHASES)[number];

/** Opening site-assessment factors (GDD 06 §5.7) and their words. */
export const SITE_FACTORS = ['diggability', 'moisture', 'warmth', 'cover', 'floodSafety', 'rivalScent', 'exposure'] as const;
export type SiteFactor = (typeof SITE_FACTORS)[number];
export const SITE_WORDS = ['poor', 'fair', 'good', 'excellent'] as const;
export type SiteWord = (typeof SITE_WORDS)[number];

export const FOUNDING_HAZARDS = ['flood', 'intruder', 'fungus', 'collapse', 'outbreak'] as const;
export type FoundingHazard = (typeof FOUNDING_HAZARDS)[number];

/** Colony / founding failure causes (canonical, registry B3). */
export const FOUNDING_FAIL_CAUSES = [
  'desiccation', 'predation', 'crushed', 'heat', 'cold', 'drowning', 'exhaustion', 'brood-lost', 'no-workers',
  'garden-lost', 'starvation', 'retired',
] as const;
export type FoundingFailCause = (typeof FOUNDING_FAIL_CAUSES)[number];

export const STAGES = ['founding', 'first-workers', 'growing', 'mature'] as const;
export type StageId = (typeof STAGES)[number];

export const WINTER_MODES = ['diapause-lapse', 'rest-lapse', 'active'] as const;
export type WinterMode = (typeof WINTER_MODES)[number];
export const WINTER_PHASES = ['none', 'notice', 'banner', 'lapse', 'report'] as const;
export type WinterPhase = (typeof WINTER_PHASES)[number];

export const ALATE_STATES = ['brood-sexual', 'callow-alate', 'waiting', 'assembling', 'flying'] as const;
export type AlateState = (typeof ALATE_STATES)[number];
export const FLIGHT_PHASES = ['ascend', 'lek', 'mate', 'descend', 'land'] as const;
export type FlightPhase = (typeof FLIGHT_PHASES)[number];
export const ALATE_POLICIES = ['auto-release', 'ask', 'hold'] as const;
export type AlatePolicy = (typeof ALATE_POLICIES)[number];

export const AUTO_SLOW_MODES = ['off', 'slow', 'pause'] as const;
export type AutoSlowMode = (typeof AUTO_SLOW_MODES)[number];

/** Values of the `setSpeed` command (x real time); 0 = pause (sets `env.time.paused`, keeps the speed). */
export const SPEED_LEVELS = [0, 1, 2, 4, 8] as const;
export type SpeedLevel = (typeof SPEED_LEVELS)[number];
/** Running speeds stored in `env.time.speed` (pause is the separate `paused` flag, GDD 06 §4). */
export const RUN_SPEEDS = [1, 2, 4, 8] as const;
export type RunSpeed = (typeof RUN_SPEEDS)[number];

/** True if `v` is a valid `setSpeed` value (commands may arrive as untyped JSON; rejects NaN, 3, -1 ...). */
export function isSpeedLevel(v: unknown): v is SpeedLevel {
  return typeof v === 'number' && (SPEED_LEVELS as readonly number[]).includes(v);
}

export const JOURNAL_KINDS = ['milestone', 'stage', 'season', 'weather', 'loss', 'event', 'winter-report', 'flight', 'aim'] as const;
export type JournalKind = (typeof JOURNAL_KINDS)[number];

/** Custom-rule value sets (GDD 06 §14, GDD 04 §15). */
export const WEATHER_SEVERITIES = ['none', 'mild', 'normal', 'severe'] as const;
export type WeatherSeverity = (typeof WEATHER_SEVERITIES)[number];
export const PREDATOR_SETTINGS = ['off', 'few', 'normal', 'many'] as const;
export type PredatorSetting = (typeof PREDATOR_SETTINGS)[number];
export const HUMAN_ACTIVITY_LEVELS = ['off', 'low', 'normal', 'high'] as const;
export type HumanActivityLevel = (typeof HUMAN_ACTIVITY_LEVELS)[number];
export const WINTER_RULES = ['timelapse', 'realtime'] as const;
export type WinterRule = (typeof WINTER_RULES)[number];
/** Custom rule `startSeason` (registry B6): `natural` = the species' founding day; never winter. */
export const START_SEASON_RULES = ['natural', 'spring', 'summer', 'autumn'] as const;
export type StartSeasonRule = (typeof START_SEASON_RULES)[number];
/** Custom rule `foundingLeniency` (registry B6). */
export const FOUNDING_LENIENCIES = ['lenient', 'normal', 'strict'] as const;
export type FoundingLeniency = (typeof FOUNDING_LENIENCIES)[number];

/** Reproduction gates (GDD 06 §11, registry B6). */
export const REPRO_GATES = ['gate-stage', 'gate-age', 'gate-queen', 'gate-stores', 'gate-season', 'gate-player'] as const;
export type ReproGate = (typeof REPRO_GATES)[number];

/** Diagnostic statuses (registry B8; UI words Good / Note / Strained / Failing). */
export const DIAGNOSTIC_STATUSES = ['ok', 'info', 'warn', 'bad'] as const;
export type DiagnosticStatus = (typeof DIAGNOSTIC_STATUSES)[number];

/** Diagnostic ids (registry B8: 62 ids, all with the `diag-` prefix), grouped by owner chapter. */
export const DIAGNOSTIC_IDS = [
  // GDD 01 possession
  'diag-possessed-movement', 'diag-possessed-action', 'diag-possession-availability', 'diag-released-ant',
  // GDD 02 colony
  'diag-food-intake-c', 'diag-food-intake-p', 'diag-stores', 'diag-brood-growth', 'diag-egg-laying',
  'diag-queen-condition', 'diag-workforce', 'diag-foraging-trails', 'diag-defence', 'diag-mortality', 'diag-hygiene',
  // GDD 03 nest
  'diag-dig-progress', 'diag-nest-space', 'diag-nest-climate', 'diag-nest-flood', 'diag-nest-stability',
  'diag-nest-traffic',
  // GDD 04 world
  'diag-site', 'diag-human-pressure', 'diag-access', 'diag-connections', 'diag-bait', 'diag-exposure',
  // GDD 05 ecology / rivals / combat
  'diag-carb-sources', 'diag-honeydew', 'diag-protein-sources', 'diag-threats', 'diag-rivals', 'diag-combat-losses',
  'diag-toxin',
  // GDD 06 environment / progression
  'diag-surface-activity', 'diag-heat-exposure', 'diag-overwinter-readiness', 'diag-founding-outcome',
  'diag-reproduction-readiness', 'diag-flight-day',
  // GDD 07 species
  'diag-herds', 'diag-ln-protein', 'diag-ln-recruitment', 'diag-ln-nursery-warmth', 'diag-cp-parent-moisture',
  'diag-cp-satellites', 'diag-cp-growth', 'diag-cp-frass', 'diag-wood', 'diag-granary', 'diag-mb-milling',
  'diag-mb-animal-protein', 'diag-mb-heat', 'diag-mb-patrol', 'diag-at-chain', 'diag-garden', 'diag-at-substrate',
  'diag-at-phorid',
  // GDD 08 system (published by the game layer)
  'diag-perf', 'diag-audio', 'diag-storage', 'diag-input',
] as const;
export type DiagnosticId = (typeof DIAGNOSTIC_IDS)[number];

/** Remedy ids (registry B3): `remedy.<kind>.<value>`, e.g. `remedy.slider.forage`; the UI maps them to controls. */
export type RemedyId = `remedy.${'slider' | 'diet' | 'marker' | 'dig' | 'possess' | 'stock'}.${string}` | `remedy.${string}`;

export const ALERT_LEVELS = ['info', 'notice', 'warning', 'critical'] as const;
export type AlertLevel = (typeof ALERT_LEVELS)[number];

export const ALERT_KINDS = [
  'queen-reserves-low', 'queen-in-danger', 'queen-died', 'food-c-low', 'food-p-low', 'brood-stalled', 'nest-crowded',
  'nest-flooding', 'dig-stalled', 'trail-lost', 'source-found', 'source-exhausted', 'nest-attacked', 'raid-seen',
  'predator-near', 'human-event-warning', 'weather-change', 'heat-danger', 'possessed-danger', 'possessed-died',
  'winter-coming', 'alates-ready', 'flight-weather', 'milestone', 'save-failed', 'storage-unavailable', 'audio-blocked',
  'colony-starving', 'stores-full', // GDD 02
  'nest-collapse-risk', 'entrance-breached', // GDD 03
  'entrance-closed', 'midden-blocked', // sim-fix-colony: entrance closed without a plug (GDD 03 §4.2); GDD 02 §10.8 flag
  'last-ants', // GDD 06 §13 (three or fewer ants left)
  'garden-failing', 'granary-spoiling', 'wood-drying', // GDD 07
  'founding-flooding', // weather-effects: water in a sealed founding chamber (GDD 06 §13.1 `drowning`, §5.11 `flood`)
] as const;
export type AlertKind = (typeof ALERT_KINDS)[number];

export const HINT_IDS = [
  'hint-move', 'hint-look', 'hint-antennate', 'hint-dig', 'hint-readiness', 'hint-seal', 'hint-lay', 'hint-timelapse',
  'hint-cycle', 'hint-observer', 'hint-pickup', 'hint-trail', 'hint-share', 'hint-colony-view', 'hint-marker',
  'hint-speed', 'hint-scent', 'hint-why', 'hint-directives',
  'hint-reserves', // GDD 06 opening (former p-reserves)
] as const;
export type HintId = (typeof HINT_IDS)[number];
export const HINT_STATES = ['pending', 'shown', 'learned', 'dismissed'] as const;
export type HintState = (typeof HINT_STATES)[number];

/** Aims (registry B6 union): GDD 08 opening aims, GDD 06 hand-over and continuing aims, T3 species aims. */
export const AIM_IDS = [
  'aim-find-site', 'aim-dig-chamber', 'aim-seal', 'aim-first-clutch', 'aim-first-workers',
  'aim-first-food', 'aim-second-chamber', 'aim-first-protein', 'aim-first-trail', 'aim-stores-winter', 'aim-midden',
  'aim-nest-open', 'aim-garden', 'aim-satellite', 'aim-trunk-trail',
  'aim-second-entrance', 'aim-cross-zone', 'aim-herd', 'aim-alates', 'aim-flight',
  'aim-find-wood', 'aim-plant-garden',
] as const;
export type AimId = (typeof AIM_IDS)[number];
export const AIM_STATES = ['open', 'done', 'dismissed'] as const;
export type AimState = (typeof AIM_STATES)[number];

export const MILESTONE_IDS = [
  'ms-first-alate', 'ms-first-aphid-herd', 'ms-first-daughter', 'ms-first-eggs', 'ms-first-fight', 'ms-first-flight',
  'ms-first-flood-rescue', 'ms-first-food', 'ms-first-footfall', 'ms-first-frost', 'ms-first-gallery',
  'ms-first-granary', 'ms-first-heat-wave', 'ms-first-honeydew', 'ms-first-larva', 'ms-first-leaf', 'ms-first-major',
  'ms-first-midden', 'ms-first-possession', 'ms-first-prey', 'ms-first-pupa', 'ms-first-rain',
  'ms-first-rival-defeated', 'ms-first-seed', 'ms-first-shaft', 'ms-first-storm', 'ms-first-trail',
  'ms-first-trophallaxis', 'ms-first-winter-survived', 'ms-first-worker', 'ms-flight-flown', 'ms-founding-chamber',
  'ms-fungus-planted', 'ms-garden-chamber', 'ms-micro-connection', 'ms-nest-reopened', 'ms-night-trail',
  'ms-nursery', 'ms-queen-lost', 'ms-satellite-nest', 'ms-sealed-in', 'ms-second-chamber', 'ms-second-entrance',
  'ms-stage-growing', 'ms-stage-mature', 'ms-trunk-trail', 'ms-winter-10', 'ms-winter-3', 'ms-workers-1000',
  'ms-workers-100', 'ms-workers-25', 'ms-workers-500', 'ms-year-1', 'ms-year-5', 'ms-zone-crossed',
  'ms-depth-50', 'ms-depth-100', 'ms-chambers-10', 'ms-volume-1000', // GDD 03 nest milestones
] as const;
export type MilestoneId = (typeof MILESTONE_IDS)[number];

/** Codex entries: the 57 `cx-*` ids of GDD 06 §10 plus the fixed additions of registry B6. */
export const CODEX_IDS = [
  'cx-ant-spiders', 'cx-antlion', 'cx-aphid-tending', 'cx-brood-stages', 'cx-brood-warmth', 'cx-callow',
  'cx-claustral-founding', 'cx-cofounding', 'cx-dealation', 'cx-dew', 'cx-egg-eating', 'cx-elaiosome',
  'cx-extrafloral-nectar', 'cx-footfall', 'cx-formic-acid', 'cx-formica', 'cx-frass', 'cx-frost', 'cx-fungal-threads',
  'cx-fungus-garden', 'cx-fungus-pellet', 'cx-garden-waste', 'cx-granary-chaff', 'cx-hibernation', 'cx-hitchhikers',
  'cx-home-range', 'cx-honeydew', 'cx-hot-surfaces', 'cx-hybridogenesis', 'cx-jumping-spider', 'cx-leaf-cutting',
  'cx-males', 'cx-mound-structure', 'cx-nanitics', 'cx-necrophoresis', 'cx-nestmate-recognition', 'cx-night-foraging',
  'cx-nuptial-flight', 'cx-overwinter-larvae', 'cx-pavement-wars', 'cx-paving-joints', 'cx-phorid-flies',
  'cx-polyethism', 'cx-protein-larvae', 'cx-queen-reserves', 'cx-raindrops', 'cx-route-memory', 'cx-satellite-nests',
  'cx-seed-classes', 'cx-stone-nests', 'cx-trail-pheromone', 'cx-trophallaxis', 'cx-trunk-trail', 'cx-wind',
  'cx-wolf-spider', 'cx-wood-moisture',
  'cx-interface-orders', // 57th GDD 06 §10 row (gap G2)
  'cx-antennation', 'cx-nursing', 'cx-springtail', 'cx-interface-why', 'cx-interface-markers', 'cx-interface-time',
] as const;
/**
 * Any codex id: a fixed entry or one of the parametrised families `cx-species-<speciesId>`, `cx-material-<material>`,
 * `cx-habitat-<zone>` (registry B6). `allCodexIds()` (ids.ts) lists every concrete id.
 */
export type CodexId = (typeof CODEX_IDS)[number] | `cx-species-${string}` | `cx-material-${string}` | `cx-habitat-${string}`;

/** Cue ids of the shared `cue` event (registry B2: GDD 08 §13.5 list plus GDD 03's additions). */
export const CUE_IDS = [
  'step', 'dig-bite', 'wood-chew', 'pellet-drop', 'frass-drop', 'pick-up', 'drop', 'bite', 'grapple', 'acid-spray',
  'trophallaxis', 'antennate', 'lay-egg', 'eclosion', 'alarm-burst', 'drum', 'stridulate', 'leaf-cut', 'seed-crack',
  'death', 'prey-struggle', 'creature-step', 'wing-buzz', 'bird-strike', 'antlion-flick', 'raindrop-hit', 'drip',
  'flood', 'collapse', 'cricket-call',
  'seal-tamp', 'collapse-rumble', 'water-trickle', 'mound-slump', 'garden-tend', // GDD 03
] as const;
/**
 * Any cue: a fixed id or a namespaced one: `dig-bite.<material>` (GDD 03), `giant.<human-event>` (GDD 04),
 * `ambient.<kind>` (GDD 06/07 ambience). `sfx.*` file names are audio data, not cue ids.
 */
export type CueId = (typeof CUE_IDS)[number] | `dig-bite.${string}` | `giant.${string}` | `ambient.${string}`;

/** Named RNG streams (forked from the game seed with rngFork(seed, name)). */
export const RNG_STREAMS = [
  'rng.colony', 'rng.brood', 'rng.alloc', 'rng.behaviour', 'rng.ecology', 'rng.creatures', 'rng.rivals', 'rng.combat',
  'rng.weather', 'rng.opening', 'rng.winter', 'rng.repro', 'rng.events',
  'rng.events.human', // sub-stream of rng.events (registry B5)
] as const;
export type RngStreamName = (typeof RNG_STREAMS)[number];

/** Save slots (registry B6): autosave ring, quick save, five manual slots, hidden opening checkpoint. */
export const SAVE_SLOT_IDS = ['auto', 'quick', 'slot-1', 'slot-2', 'slot-3', 'slot-4', 'slot-5', 'opening-start'] as const;
export type SaveSlotId = (typeof SAVE_SLOT_IDS)[number];
/** Labels of the generations of the `auto` slot (registry B6). */
export const AUTOSAVE_LABELS = [
  'interval', 'season', 'pre-timelapse', 'opening-sealed', 'opening-complete', 'pre-winter', 'post-winter',
  'pre-flight', 'final',
] as const;
export type AutosaveLabel = (typeof AUTOSAVE_LABELS)[number];

/**
 * History series ids (registry B6: GDD 02 §13.2 ∪ GDD 06 §9.2). Multi-valued series (`workers-by-caste`,
 * `workers-by-group`, `intake-by-kind`, `deaths-by-cause`) store one series per member as `<id>:<member>`.
 */
export const HISTORY_SERIES_IDS = [
  'workers', 'workers-by-caste', 'workers-by-group', 'queen-alive', 'eggs', 'larvae', 'pupae', 'alates', 'stores-c',
  'stores-p', 'intake-c', 'intake-p', 'intake-by-kind', 'use-c', 'use-p', 'eggs-laid', 'eclosions', 'deaths',
  'deaths-by-cause', 'brood-deaths', 'trips', 'trip-success', 'trip-time', 'nursery-temp', 'air-temp',
  'known-sources', 'trails', 'starvation-stage', 'nest-volume', 'nest-chambers', 'range-max', 'queen-reserves',
] as const;
export type HistorySeriesId = (typeof HISTORY_SERIES_IDS)[number];
