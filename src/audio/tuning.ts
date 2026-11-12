// Every tunable number of the audio module (GDD 08 §13). Presentation-only: nothing here is read by the sim.
// Gains in dB unless the name says linear; distances in BU (body units, seed §3); times in real seconds.

export const BUS_IDS = ['master', 'ambience', 'effects', 'giants', 'ui', 'music'] as const;
export type BusId = (typeof BUS_IDS)[number];
/** Buses that carry the game world (faded while the game is paused); `ui` keeps playing in menus. */
export const WORLD_BUSES = ['ambience', 'effects', 'giants', 'music'] as const;

/** §13.2 default bus gains, dB (multiplied by the player's slider, amplitude = slider²). */
export const BUS_DEFAULT_DB: Record<BusId, number> = { master: 0, ambience: -10, effects: -4, giants: -3, ui: -14, music: -18 };

/** Master limiter (DynamicsCompressor used as a brick-wall limiter). */
export const LIMITER = { thresholdDb: -1, kneeDb: 0, ratio: 20, attackS: 0.002, releaseS: 0.12 };

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
  /** Zone crossfade width at borders. */
  zoneCrossfadeBu: 32,
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
  crackleGainDb: -18,
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
  carRepeatMinS: 9,
  carRepeatMaxS: 18,
  broomRepeatMinS: 2.6,
  broomRepeatMaxS: 4.2,
  sandThumpMinS: 1.5,
  sandThumpMaxS: 5,
  /** Distance assumed for a giant event whose position is unknown. */
  unknownDistanceBu: 400,
  thunderDelayMaxS: 6,
};

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
