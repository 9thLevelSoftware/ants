// Every tunable number of the audio module (GDD 08 §13). Presentation-only: nothing here is read by the sim.
// Gains in dB unless the name says linear; distances in BU (body units, seed §3); times in real seconds.

export const BUS_IDS = ['master', 'ambience', 'effects', 'giants', 'ui', 'music'] as const;
export type BusId = (typeof BUS_IDS)[number];

/**
 * §13.2 default bus gains, dB (multiplied by the player's slider, amplitude = slider²), retuned by the loudness
 * ruling (design directions §K: a calm surface scene sits at about -27 LUFS). The §13.2 table's relations hold
 * (giants above effects above ambience in dynamic range, UI and music under the world); every bus is raised by
 * MASTER_TRIM_DB, ambience, effects, ui and music by a further 5 dB, because the table's -10 dB ambience left a
 * calm scene near -41 LUFS. Measured before / after: src/audio/README.md "Loudness".
 */
export const BUS_DEFAULT_DB: Record<BusId, number> = { master: 0, ambience: -5, effects: 1, giants: -6, ui: -9, music: -13 };

/** Gain after the master slider and before the limiter (dB). One number moves the whole mix. */
export const MASTER_TRIM_DB = 9.5;

/**
 * Per-layer trims of the ambience beds, dB, applied on top of the matrix gain. The beds were normalised to -24 LUFS
 * but differ by up to 6 LU as heard (a dense cricket bed is 4 LU louder than birdsong), and the synthesised beds
 * (leaf rustle, low wind, murmur) sit about 5 LU above the recorded ones; these bring the day, night, rain and
 * underground scenes to their targets (loudnessTargets.ts).
 */
export const LAYER_TRIM_DB: Partial<Record<string, number>> = { crickets: -6, 'low-wind': -5, 'leaf-rustle': -5, murmur: -4, rumble: 4 };

/** Gentle compressor on the giants bus: a footfall's peak is tamed there, so the master limiter does not pump the rest. */
export const GIANT_COMPRESSOR = { thresholdDb: -30, kneeDb: 12, ratio: 4, attackS: 0.004, releaseS: 0.25 };

/**
 * Master limiter (DynamicsCompressor used as a brick-wall limiter). A Web Audio compressor applies makeup gain so a
 * full-scale input stays near 0 dBFS at its output; `ceilingDb` is a fixed gain after it that keeps the true peak
 * of the loudest sound (a giant footfall) at or under -1 dBFS (measured, README "Loudness").
 */
export const LIMITER = { thresholdDb: -3, kneeDb: 0, ratio: 20, attackS: 0.002, releaseS: 0.12, ceilingDb: -1.5 };

/** §13.2 ducking. */
export const DUCK = {
  ambienceUnderGiantDb: -6,
  musicUnderGiantDb: -4,
  musicUnderCriticalDb: -8,
  attackS: 0.3,
  releaseS: 2,
};

/** §13.1 gesture rule and tab visibility. */
export const CONTEXT = {
  /** After resume(), the context must be running within this time or status becomes `blocked`. */
  runningTimeoutMs: 1000,
  /** Gestures after a failed start that retry automatically; then only an explicit enable() retries. */
  gestureRetries: 3,
  hideFadeS: 0.3,
  suspendAfterHiddenS: 5,
  /** Fade of the world buses when the game pauses / resumes. */
  pauseFadeS: 0.3,
};

/** §13.1 decoded ambience beds kept at once (LRU). */
export const AUDIO_BEDS_RESIDENT = 4;

/** §13.3 distance model (Web Audio `inverse` formula, evaluated by hand). */
export interface DistanceClass { refBu: number; maxBu: number; rolloff: number }
export const DISTANCE: Record<'foley' | 'creature' | 'giant', DistanceClass> = {
  foley: { refBu: 3, maxBu: 40, rolloff: 1.2 },
  creature: { refBu: 4, maxBu: 60, rolloff: 1.2 },
  giant: { refBu: 150, maxBu: 3000, rolloff: 0.8 },
};
/** Air absorption for giant sources: cutoff = max(minHz, maxHz·(refBu/d)^exp) beyond refBu ("low-passed by distance"). */
export const AIR = { refBu: 150, maxHz: 18000, minHz: 700, exp: 1.2 };
/** Warning phase of engine-like giant loops (mower: "low-passed 400 Hz at -18 dB", §13.6). */
export const GIANT_WARNING = { gainDb: -18, lowpassHz: 400 };
/** Weather impacts closer than this are non-positional (granular layer). */
export const WEATHER_NEAR_BU = 20;

/** §13.3 surface-to-underground occlusion: cutoff = max(minHz, maxHz·2^(-d/halfBu)), gain = max(minDb, dbPerBu·d). */
export const SURFACE_OCCLUSION = { maxHz: 6000, halfBu: 6, minHz: 250, dbPerBu: -1.5, minDb: -24 };
/** Cutoff used when nothing is occluded (above audible content). */
export const OPEN_CUTOFF_HZ = 20000;

/** §13.3 line-of-sight occlusion through solid. */
export const LOS_OCCLUSION = { cutoffHz: 1200, gainDb: -9, smoothS: 0.15, refreshS: 0.25, maxTracesPerFrame: 8, samples: 8 };

/** §13.3 voice limits and priorities. */
export const AUDIO_MAX_VOICES = 24;
export const DEFAULT_CUE_CAP = 4;
export const PRIORITY = { possessed: 4, giant: 3, creatureNear: 2, other: 1, ui: 5 };
/** A creature counts as "near the listener" within this distance. */
export const CREATURE_NEAR_BU = 12;
/** The possessed ant's own sounds: sources within this distance of the listener ant. */
export const POSSESSED_RADIUS_BU = 1.5;

/** Crowd texture: step cues beyond this rate (per real second) feed a granular patter instead of single voices. */
export const CROWD = { windowS: 0.5, singleVoiceMaxRate: 6, textureMaxRate: 80, textureGainDb: -30 };

/** §13.4 ambience. */
export const AMBIENCE = {
  /** Zone crossfade width at borders (side of the square the habitat groups are averaged over). */
  zoneCrossfadeBu: 32,
  /** At most this many zone samples per axis of that square (coarser than the zone raster beyond it). */
  zoneBlendMaxSamples: 16,
  /** Time-of-day segment crossfade, game hours. */
  todCrossfadeH: 1,
  /** Underground depth bands (BU below local ground) and the crossfade half-width at each band edge. */
  shallowBu: 4,
  deepBu: 16,
  bandBlendBu: 1,
  /** Smoothing time constant of layer gain changes. */
  smoothS: 0.8,
  /** Recompute the matrix this often. */
  refreshS: 0.25,
  /** Interior: weather beds are heard through walls at this factor (decision, not in the table). */
  interiorWeatherFactor: 0.3,
  humidDripAbove: 0.85,
  nestMurmurRadiusBu: 16,
  nestMurmurDenseAnts: 50,
  /** Granular rates, grains per real second. */
  dropletsMinPerS: 3,
  dropletsMaxPerS: 12,
  heatTicksPerS: 2.5,
  iceTicksPerS: 0.8,
  nestMurmurMaxPerS: 30,
  dripPerS: 0.35,
  woodCreakMinS: 20,
  woodCreakMaxS: 60,
  crackleMaxPerS: 6,
  /** Colony size at which the wood-nest crackle reaches its full rate. */
  crackleFullAnts: 500,
  crackleGainDb: -18,
  woodCreakGainDb: -12,
  /** Grain gains, dB (before the per-grain 0.4-1 random scale). */
  grainGainDb: { droplets: -20, heatTicks: -34, iceTicks: -30, nestTicks: -34, drips: -18 },
  /** A layer channel silent this long is released (its source stopped, its buffer may be evicted). */
  releaseAfterSilentS: 8,
  playgroundLowpassHz: 900,
  interiorStreetLowpassHz: 800,
};

/** Seamless loop player (crossfading at the Web Audio level hides the files' ~5 ms loop dropout). */
export const LOOP = { trimStartS: 0.03, trimEndS: 0.03, crossfadeS: 1.5, lookaheadS: 3, curvePoints: 64 };

/** §13.8 UI. */
export const UI_SOUND = { hoverMinIntervalS: 0.08, hoverRelDb: -10, criticalRepeatS: 4, milestoneQuietDb: -12 };

/** §6.3 alert sound throttles that affect sound (presentation side). */
export const ALERT_SOUND = { cooldownRealS: 20, rateMax: 4, rateWindowS: 30, cooldownGameH: { notice: 3, warning: 1, critical: 0 } };

/** §13.5 alarm-burst shimmer: the possessed ant is "within the plume" inside this radius. */
export const ALARM_PLUME_BU = 4;

/** §13.6 giant events. */
export const GIANT = {
  tremorMinS: 0.6,
  tremorMaxS: 8,
  loopFadeOutS: 1.5,
  /** Fade-out of a warning loop replaced by another source at the start (reel mower). */
  loopSwapFadeS: 0.8,
  carRepeatMinS: 9,
  carRepeatMaxS: 18,
  broomRepeatMinS: 2.6,
  broomRepeatMaxS: 4.2,
  sandThumpMinS: 1.5,
  sandThumpMaxS: 5,
  /** Distance assumed for a giant event whose position is unknown. */
  unknownDistanceBu: 400,
  thunderDelayMaxS: 6,
  /** Hose: splashes repeat every min-max s. */
  splashRepeatMinS: 0.6,
  splashRepeatMaxS: 1.8,
  splashGainDb: -6,
  /** First splash this long after the hose starts. */
  splashFirstS: 0.5,
  /** Base gains of the main giant loops: hose (watering) and engines (mower, vacuum). */
  hoseLoopDb: -6,
  engineLoopDb: -4,
  /** Car: the synth tyre roll under the pass, and the approach roll during the warning (dB, s). */
  tyreGainDb: -10,
  tyreUnderPassS: 6,
  tyreApproachMinS: 2,
};

/**
 * Rain beds follow the precipitation read-out (env.weather.precip, 0..1; drizzle peaks at 0.05, a shower 0.3, a
 * downpour 0.8, a storm 1): the light bed rises from `lightFloor` (the first drops) to the table's gain at
 * `lightFullAt`; from `heavyFrom` the heavy bed fades in, reaching `heavyGain` at `heavyFullAt`.
 */
export const RAIN_BED = { lightFloor: 0.15, lightFullAt: 0.3, heavyFrom: 0.4, heavyFullAt: 0.8, heavyGain: 0.5, stormFloor: 0.5, stormFullAt: 0.5 };

/** Rules of the event router (eventRouter.ts): de-duplication, rate limits and the sounds it derives from events. */
export const EVENT_ROUTER = {
  /**
   * Two sounds of one cue family in the same tick within this distance are one sound: the sim's cue and the event
   * that report the same act of one ant (an ant is at one place within a tick, give or take its own step). Two ants
   * are never this close, so neighbours' sounds stay separate.
   */
  samePlaceBu: 0.25,
  /** A removed bait station is quieter than a placed one, dB. */
  baitRemovedDb: -6,
  /** Extra gain of a missed bite, dB. */
  whiffDb: -9,
  /** Wind gust strength: (wind - calm) / span, at least min. */
  gustCalmMs: 3,
  gustSpanMs: 10,
  gustMinStrength: 0.2,
  /** Puddle formation trickle: at most one per this many ticks, quiet, dB. */
  puddleMinTicks: 20,
  puddleDb: -8,
  /** A raid at the nest entrance: this many scuffles, this loud, this far apart (real s). */
  raidScuffles: 3,
  raidScuffleStrength: 0.7,
  raidScuffleGapS: 0.35,
  /** A raided brood chamber: one pick-up per carried brood up to this many, this loud, this far apart (real s). */
  broodRaidMaxSounds: 3,
  broodRaidStrength: 0.8,
  broodRaidGapS: 0.3,
  /** The second, quieter antennation of a rival nest found: delay (real s) and strength. */
  discoverEchoDelayS: 0.25,
  discoverEchoStrength: 0.8,
  /** `flood-level` trickles at most once per this many ticks per nest; submerged ants gurgle at most this often overall. */
  floodLevelMinTicks: 30,
  submergedMinTicks: 20,
  /** First drops when rain sets in: how many, the first one's delay and the gap between them (real s). */
  onsetDrops: 6,
  onsetFirstS: 0.15,
  onsetGapS: 0.45,
  /** Strength of those drops by what the rain turns into. */
  onsetStorm: 1,
  onsetDownpour: 0.8,
  onsetShower: 0.4,
  onsetLight: 0.15,
};

/** Footsteps derived from gait phase (GDD 08 §13.5). */
export const FOOTSTEPS = {
  /** Ants: sampled within this many BU of the listener, at most this many per refresh, refreshed this often (real s). */
  antNearBu: 6,
  antSampleMax: 6,
  antSampleEveryS: 0.25,
  /** Creatures: sizeMm at or above this have footfalls worth hearing (spiders, beetles, centipedes, worms). */
  creatureMinMm: 6,
  creatureNearBu: 40,
  creatureSampleMax: 4,
  creatureSampleEveryS: 0.2,
  /** Creature step strength: base + size / divisor (mm), at most 1. */
  creatureStrengthBase: 0.3,
  creatureStrengthSizeDivMm: 40,
} as const;

/** A Settings test sound keeps the world buses open this long (real s), though the game is paused. */
export const TEST_HOLD_S = 3;

/** How loud the router plays the sound of each sim event (0..1 strength; an event type or `<type>-<variant>`). */
export const EVENT_STRENGTH = {
  'predator-telegraph': 0.7, 'predator-strike': 1, 'predator-strike-miss': 0.5, 'ant-seized': 0.8, 'antlion-grab': 1,
  'bird-approach': 0.6, 'bird-left': 0.4, 'creature-died': 0.3, 'phorid-strike': 0.4,
  'combat-lock': 0.7, 'combat-pin': 1, 'combat-spray': 1, 'rival-encounter': 1, 'rival-withdraw': 0.5, 'rival-discovered': 1,
  'flood-started': 1, 'flood-level': 0.7, 'ant-submerged': 0.4, 'world.cave-in': 1, 'founding-sealed': 1,
  'egg-laid': 1, 'queen.egg-eaten': 0, 'pellet-expelled': 1, 'pellet-dumped': 1, 'waste-dumped': 1, 'corpse-removed': 0.6,
  'frass-ejected': 1, 'drum': 1, 'seed-milled': 0.7, 'radicle-gnawed': 0.4, 'honeydew-relay': 1,
  'weather.puddle': 0.4, 'flight.launched': 0.9,
} as const;

/** §13.9 generative music. */
export const MUSIC = {
  gapMinS: 90,
  gapMaxS: 360,
  tempoMinBpm: 54,
  tempoMaxBpm: 66,
  phraseMinNotes: 3,
  phraseMaxNotes: 9,
  calmTriggerS: 120,
};

/** Debug cue log length (GDD 08 App. B `audio.cueLog()`: last 50). */
export const CUE_LOG_MAX = 50;
