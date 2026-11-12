// What the demo auditions and the analysis script checks: every cue, a sample of namespaced cues, every giant
// event, UI sounds, thunder, music per season, and the ambience matrix (groups x times x weather x depth), each
// with the band its energy is expected in.
import { CUE_IDS } from '@/sim/types/ids/progression';
import { HUMAN_EVENT_KINDS, SEASONS, WEATHER_STATES } from '@/sim/types/ids';
import { UI_SOUND_IDS } from '@/audio/uiSounds';
import { HABITAT_GROUPS } from '@/audio/ambience/matrix';
import type { Analysis } from './analysis';
import type { AmbienceState, CueSpec } from './offline';

export type Expect = (a: Analysis) => string | null;

const need = (cond: boolean, why: string) => (cond ? null : why);
const bandsOf = (a: Analysis) => JSON.stringify(a.bands);
const lowShare = (a: Analysis) => a.bands.sub + a.bands.low;
const highShare = (a: Analysis) => a.bands.high + a.bands.air;
/** All of the checks must pass (first failure reported). */
const all = (...es: Expect[]): Expect => (a) => es.map((e) => e(a)).find((r) => r !== null) ?? null;
/** Energy mostly below 500 Hz (sub + low). */
export const lowHeavy: Expect = (a) => need(lowShare(a) >= 0.5, `expected low-frequency energy, got ${bandsOf(a)}`);
export const highHeavy: Expect = (a) => need(highShare(a) >= 0.4, `expected energy above 2 kHz, got ${bandsOf(a)}`);
export const midUp: Expect = (a) => need(a.centroidHz >= 700, `expected centroid >= 700 Hz, got ${a.centroidHz}`);
/** Non-silence and no clipping are checked for every entry; `any` adds no band check (each use says why). */
export const any: Expect = () => null;
/** Soft / bodied sounds: energy mostly below 2 kHz but not sub-only. */
export const lowMid: Expect = (a) => need(a.centroidHz >= 120 && a.centroidHz < 2000, `expected centroid 120-2000 Hz, got ${a.centroidHz}`);
/** Broadband machine noise (engines, vacuum): centroid 500-4000 Hz. */
const broadband: Expect = (a) => need(a.centroidHz >= 500 && a.centroidHz <= 4000, `expected centroid 500-4000 Hz, got ${a.centroidHz}`);

// Ambience bands (GDD 08 §13.4 table; thresholds sit well inside the rendered values, so a broken layer or filter
// shows). Birds, crickets and wind put real energy above 2 kHz; traffic, street and hum are low.
const atLeastHigh = (min: number): Expect => (a) => need(highShare(a) >= min, `expected >= ${min} of the energy above 2 kHz, got ${bandsOf(a)}`);
/** Birds / crickets / wind present. */
const bright = atLeastHigh(0.2);
/** Traffic / street / hum dominate. */
const lowBed: Expect = (a) => need(lowShare(a) >= 0.5, `expected >= 0.5 of the energy below 500 Hz, got ${bandsOf(a)}`);
/** Play ground by day: the voice-less murmur (band-limited 200-900 Hz) dominates. */
const murmur: Expect = (a) => need(a.bands.low + a.bands.mid >= 0.6 && a.centroidHz < 1500, `expected murmur 120-2000 Hz, got ${bandsOf(a)} centroid ${a.centroidHz}`);
/** Interior: fridge hum and the muffled street (low-passed 800 Hz); almost nothing above 2 kHz. */
const muffled: Expect = (a) => need(lowShare(a) >= 0.6 && highShare(a) <= 0.1, `expected a muffled interior (low >= 0.6, high <= 0.1), got ${bandsOf(a)}`);
/** Rain beds: broadband hiss in the mid and high bands. */
const rainy: Expect = (a) => need(a.bands.mid + a.bands.high >= 0.5, `expected rain hiss (mid + high >= 0.5), got ${bandsOf(a)}`);
/** E16 at 12 BU: surface low-passed to 1500 Hz at -18 dB under the underground bed: under 2 % above 2 kHz. */
const occluded: Expect = (a) => need(highShare(a) <= 0.02 && lowShare(a) >= 0.8, `expected an occluded surface (high <= 0.02, low >= 0.8), got ${bandsOf(a)}`);
/** Deep (> 16 BU): rumble only. */
const deep: Expect = (a) => need(highShare(a) <= 0.01 && lowShare(a) >= 0.9, `expected deep rumble (high <= 0.01, low >= 0.9), got ${bandsOf(a)}`);

/** Expected band per habitat group and hour (6 dawn, 13 day, 20 dusk, 2 night) in clear weather. */
const GROUP_EXPECT: Record<(typeof HABITAT_GROUPS)[number], Record<number, Expect>> = {
  'woodland': { 6: bright, 13: bright, 20: bright, 2: bright },
  'open-green': { 6: bright, 13: bright, 20: bright, 2: bright },
  'hard': { 6: lowBed, 13: lowBed, 20: lowBed, 2: all(lowBed, bright) }, // night: traffic with crickets
  'play': { 6: bright, 13: murmur, 20: lowBed, 2: bright },
  'interior': { 6: muffled, 13: muffled, 20: muffled, 2: muffled },
};
const WEATHER_EXPECT: Record<(typeof WEATHER_STATES)[number], Expect> = {
  clear: bright,
  overcast: atLeastHigh(0.1), // birds at 0.6
  rain: rainy,
  storm: rainy,
  heat: any, // birds thinned to 0.4; heat ticks are sparse 1.5 ms clicks that do not move the band shares
  frost: bright,
};

const HIGH = new Set(['step', 'pick-up', 'drop', 'acid-spray', 'antennate', 'pellet-drop', 'frass-drop', 'leaf-cut', 'antlion-flick', 'stridulate']);
const LOW = new Set(['collapse-rumble', 'drum']);
const LOW_MID = new Set(['lay-egg', 'eclosion', 'creature-step', 'bird-strike', 'flood', 'collapse', 'seal-tamp', 'mound-slump']);

const GIANT_EXPECT: Record<(typeof HUMAN_EVENT_KINDS)[number], Expect> = {
  'footsteps': lowHeavy, 'car': lowHeavy, 'children': lowHeavy, 'food-drop': lowHeavy, 'spill': lowHeavy,
  'mowing': broadband, 'vacuum': broadband, 'sweeping': highHeavy, 'watering': highHeavy, 'bait-station': midUp,
};

export const CUE_SPECS: { spec: CueSpec; expect: Expect }[] = [
  ...CUE_IDS.filter((id) => id !== 'death' && id !== 'alarm-burst').map((id) => ({
    spec: { kind: 'cue', id } as CueSpec,
    expect: HIGH.has(id) ? highHeavy : LOW.has(id) ? lowHeavy : LOW_MID.has(id) ? lowMid : midUp,
  })),
  { spec: { kind: 'cue', id: 'dig-bite.sand' }, expect: midUp },
  { spec: { kind: 'cue', id: 'dig-bite.wood-sound' }, expect: midUp },
  { spec: { kind: 'cue', id: 'step', material: 'gravel' }, expect: midUp },
  { spec: { kind: 'cue', id: 'wing-buzz', strength: 0.9 }, expect: any },
  { spec: { kind: 'cue', id: 'raindrop-hit', strength: 0 }, expect: midUp },
  ...HUMAN_EVENT_KINDS.map((id) => ({ spec: { kind: 'giant', id } as CueSpec, expect: GIANT_EXPECT[id] })),
  { spec: { kind: 'giant', id: 'mowing', variant: 'reel' } as CueSpec, expect: broadband }, // push-mower whirr, no engine
  { spec: { kind: 'thunder' }, expect: lowHeavy },
  // alert tones and the milestone motif are pitched tones (330-1000 Hz); everything else is a click / tick
  ...UI_SOUND_IDS.map((id) => ({ spec: { kind: 'ui', id } as CueSpec, expect: id.startsWith('alert-') || id === 'milestone' ? lowMid : midUp })),
  // sparse, soft, low-register phrases that stay under the ambience's bright layers (§13.9)
  ...SEASONS.map((season) => ({ spec: { kind: 'music', season } as CueSpec, expect: lowMid })),
];

export const SILENT_BY_DESIGN = ['death', 'alarm-burst (only inside the possessed ant\'s plume)'];

/** Every group at each time of day in clear weather, every weather at midday on open green, underground bands. */
export const AMBIENCE_STATES: { state: AmbienceState; expect: Expect }[] = [
  ...HABITAT_GROUPS.flatMap((group) => [6, 13, 20, 2].map((hour) => ({ state: { group, hour, weather: 'clear' as const }, expect: GROUP_EXPECT[group][hour] }))),
  ...WEATHER_STATES.map((weather) => ({ state: { group: 'open-green' as const, hour: 13, weather }, expect: WEATHER_EXPECT[weather] })),
  { state: { group: 'hard', hour: 13, weather: 'heat' }, expect: lowBed },
  { state: { group: 'woodland', hour: 13, weather: 'clear', depthBu: 2 }, expect: bright }, // shallow: surface, gently occluded
  { state: { group: 'woodland', hour: 13, weather: 'clear', depthBu: 12, nearAnts: 40, humidity: 0.9 }, expect: occluded },
  { state: { group: 'woodland', hour: 13, weather: 'clear', depthBu: 24, nearAnts: 60 }, expect: deep },
  { state: { group: 'woodland', hour: 13, weather: 'clear', depthBu: 10, nearAnts: 30, woodNest: true }, expect: occluded },
];
