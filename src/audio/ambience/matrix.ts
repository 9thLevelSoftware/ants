// The ambience matrix (GDD 08 §13.4) as a pure function: habitat group weights, time of day, weather and the
// listener's depth -> target gain of every layer, the surface occlusion filter and the granular grain rates.
import type { WeatherState, ZoneType } from '@/sim/types/ids';
import { TWILIGHT_HALF_H } from '@/sim/balance/environment';
import { surfaceOcclusion, type FilterGain } from '../mix';
import { AMBIENCE } from '../tuning';
import { zeroLayers, type LayerGains, type LayerId } from './layers';

export const HABITAT_GROUPS = ['woodland', 'open-green', 'hard', 'play', 'interior'] as const;
export type HabitatGroup = (typeof HABITAT_GROUPS)[number];

export const GROUP_OF_ZONE: Record<ZoneType, HabitatGroup> = {
  'forest': 'woodland', 'lawn': 'open-green', 'garden-bed': 'open-green', 'pavement': 'hard', 'asphalt': 'hard',
  'sand': 'play', 'rubber': 'play', 'interior': 'interior',
};

export const TOD_SEGMENTS = ['dawn', 'day', 'dusk', 'night'] as const;
export type TodSegment = (typeof TOD_SEGMENTS)[number];
export type TodWeights = Record<TodSegment, number>;
export type GroupWeights = Record<HabitatGroup, number>;

type Cell = Partial<Record<LayerId, number>>;
/** §13.4 table (linear layer gains). Play ground day: `murmur` is replaced by `playground-voices` when allowed. */
export const GROUP_MATRIX: Record<HabitatGroup, Record<TodSegment, Cell>> = {
  'woodland': {
    dawn: { 'birds': 0.8, 'leaf-rustle': 0.3 },
    day: { 'birds': 0.6, 'wind': 0.5, 'leaf-rustle': 0.3 },
    dusk: { 'birds': 0.3, 'crickets': 0.3 },
    night: { 'crickets': 0.7, 'low-wind': 0.3 },
  },
  'open-green': {
    dawn: { 'birds': 0.7 },
    day: { 'birds': 0.5, 'wind': 0.4, 'street': 0.2 },
    dusk: { 'crickets': 0.4, 'street': 0.2 },
    night: { 'crickets': 0.8 },
  },
  'hard': {
    dawn: { 'traffic': 0.4, 'birds': 0.3 },
    day: { 'street': 0.6, 'traffic': 0.5 },
    dusk: { 'traffic': 0.5 },
    night: { 'traffic': 0.3, 'crickets': 0.3 },
  },
  'play': {
    dawn: { 'birds': 0.5 },
    day: { 'murmur': 0.5, 'birds': 0.3, 'wind': 0.3 },
    dusk: { 'street': 0.3 },
    night: { 'crickets': 0.6 },
  },
  'interior': {
    dawn: { 'fridge': 0.6 },
    day: { 'fridge': 0.5, 'street-muffled': 0.2 },
    dusk: { 'fridge': 0.6 },
    night: { 'fridge': 0.7 },
  },
};

/** Fraction (0..1) past a boundary hour, crossfading linearly over `w` hours centred on it. */
function past(h: number, b: number, w: number): number {
  return Math.min(1, Math.max(0, (h - (b - w / 2)) / w));
}

/**
 * Weights of the four time-of-day segments at an hour (sum 1). Dawn spans sunrise ± twilight, dusk sunset ±
 * twilight; each boundary crossfades over `AMBIENCE.todCrossfadeH` game hours.
 */
export function todWeights(hour: number, sunrise: number, sunset: number, out?: TodWeights): TodWeights {
  const o = out ?? ({} as TodWeights);
  const w = AMBIENCE.todCrossfadeH, tw = TWILIGHT_HALF_H;
  const r1 = past(hour, sunrise - tw, w), r2 = past(hour, sunrise + tw, w);
  const r3 = past(hour, sunset - tw, w), r4 = past(hour, sunset + tw, w);
  o.night = 1 - r1 + r4;
  o.dawn = r1 - r2;
  o.day = r2 - r3;
  o.dusk = r3 - r4;
  return o;
}

/** Group weights from zone samples around the listener (each sample counted with its weight). */
export function groupWeights(zones: readonly ZoneType[], weights: readonly number[] | null, out?: GroupWeights): GroupWeights {
  const o = out ?? ({} as GroupWeights);
  for (const g of HABITAT_GROUPS) o[g] = 0;
  let sum = 0;
  for (let i = 0; i < zones.length; i++) {
    const w = weights ? weights[i] : 1;
    o[GROUP_OF_ZONE[zones[i]] ?? 'open-green'] += w;
    sum += w;
  }
  if (sum <= 0) { o['open-green'] = 1; return o; }
  for (const g of HABITAT_GROUPS) o[g] /= sum;
  return o;
}

export interface AmbienceInput {
  groups: GroupWeights;
  hour: number;
  sunrise: number;
  sunset: number;
  weather: WeatherState;
  /** Precipitation 0..1 (rain grain density). */
  precip: number;
  /** Listener in a cavity / below ground. */
  underground: boolean;
  /** BU below the local ground surface (0 at or above it). */
  depthBu: number;
  /** Ants within AMBIENCE.nestMurmurRadiusBu of the listener. */
  nearAnts: number;
  /** Relative humidity 0..1 of the listener's chamber, null unknown. */
  humidity: number | null;
  /** Listener inside a Camponotus wood nest. */
  woodNest: boolean;
  /** Colony size (wood nest crackle density). */
  colonyAnts: number;
  /** A `children` human event is running. */
  childrenActive: boolean;
  /** Distant voices setting on AND the file passed the intelligibility check. */
  voicesAllowed: boolean;
}

export interface GrainRates {
  droplets: number;
  heatTicks: number;
  iceTicks: number;
  nestTicks: number;
  drips: number;
  crackle: number;
  /** Mean seconds between wood creaks (0 = none). */
  woodCreakEveryS: number;
}

export interface AmbienceTarget {
  layers: LayerGains;
  surface: FilterGain;
  grains: GrainRates;
  /** Which source the Play ground day bed uses (E28). */
  playgroundSource: 'synth-murmur' | 'playground_distant' | null;
  tod: TodWeights;
}

export function newAmbienceTarget(): AmbienceTarget {
  return {
    layers: zeroLayers(), surface: { cutoffHz: 0, gainDb: 0 },
    grains: { droplets: 0, heatTicks: 0, iceTicks: 0, nestTicks: 0, drips: 0, crackle: 0, woodCreakEveryS: 0 },
    playgroundSource: null, tod: { dawn: 0, day: 0, dusk: 0, night: 1 },
  };
}

const BIRDS: LayerId[] = ['birds'];
const CRICKETS: LayerId[] = ['crickets'];
const WINDY: LayerId[] = ['wind', 'leaf-rustle', 'low-wind'];
const WEATHER_LAYERS: LayerId[] = ['rain-light', 'rain-heavy'];

function scale(l: LayerGains, ids: LayerId[], k: number): void {
  for (const id of ids) l[id] *= k;
}

function smooth(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** Computes the full target. `out` is reused when given. */
export function computeAmbience(inp: AmbienceInput, out: AmbienceTarget = newAmbienceTarget()): AmbienceTarget {
  const l = zeroLayers(out.layers);
  const tod = todWeights(inp.hour, inp.sunrise, inp.sunset, out.tod);
  let playgroundDay = 0;
  for (const g of Object.keys(inp.groups) as HabitatGroup[]) {
    const gw = inp.groups[g];
    if (gw <= 0) continue;
    for (const seg of Object.keys(tod) as TodSegment[]) {
      const w = gw * tod[seg];
      if (w <= 0) continue;
      const cell = GROUP_MATRIX[g][seg];
      for (const id of Object.keys(cell) as LayerId[]) l[id] += w * (cell[id] ?? 0);
    }
    if (g === 'play') playgroundDay = gw * tod.day;
  }
  // Play ground day bed: the voice-less synth murmur unless Distant voices is allowed during a children window
  let playgroundSource: AmbienceTarget['playgroundSource'] = null;
  if (playgroundDay > 0) {
    if (inp.voicesAllowed && inp.childrenActive) {
      l['playground-voices'] = l.murmur;
      l.murmur = 0;
      playgroundSource = 'playground_distant';
    } else playgroundSource = 'synth-murmur';
  }

  const g = out.grains;
  g.droplets = 0; g.heatTicks = 0; g.iceTicks = 0; g.nestTicks = 0; g.drips = 0; g.crackle = 0; g.woodCreakEveryS = 0;
  const hardW = inp.groups.hard;
  switch (inp.weather) {
    case 'overcast': scale(l, BIRDS, 0.6); break;
    case 'rain':
      l['rain-light'] += 0.8;
      scale(l, BIRDS, 0.2);
      scale(l, CRICKETS, 0.3);
      g.droplets = AMBIENCE.dropletsMinPerS + (AMBIENCE.dropletsMaxPerS - AMBIENCE.dropletsMinPerS) * Math.min(1, Math.max(0, inp.precip));
      break;
    case 'storm':
      l['rain-heavy'] += 1.0;
      scale(l, BIRDS, 0);
      scale(l, CRICKETS, 0);
      scale(l, WINDY, 1.5);
      g.droplets = AMBIENCE.dropletsMaxPerS;
      break;
    case 'heat':
      scale(l, BIRDS, 1 - 0.6 * tod.day);
      g.heatTicks = AMBIENCE.heatTicksPerS * hardW;
      break;
    case 'frost':
      for (const id of Object.keys(l) as LayerId[]) l[id] *= 0.6;
      scale(l, CRICKETS, 0);
      g.iceTicks = AMBIENCE.iceTicksPerS;
      break;
    default: break;
  }
  // weather is heard through the walls indoors (decision recorded in the report)
  const indoor = inp.groups.interior;
  if (indoor > 0) {
    const k = 1 - indoor * (1 - AMBIENCE.interiorWeatherFactor);
    scale(l, WEATHER_LAYERS, k);
    g.droplets *= k;
  }

  // underground bands (§13.4): 0-4 surface only (occluded), 4-16 + rumble 0.4 + nest murmur + drips, > 16 rumble 0.6
  const d = inp.underground ? Math.max(0, inp.depthBu) : 0;
  const b = AMBIENCE.bandBlendBu;
  const wMid = inp.underground ? smooth(AMBIENCE.shallowBu - b, AMBIENCE.shallowBu + b, d) : 0;
  const wDeep = inp.underground ? smooth(AMBIENCE.deepBu - b, AMBIENCE.deepBu + b, d) : 0;
  l.rumble = 0.4 * wMid * (1 - wDeep) + 0.6 * wDeep;
  if (wMid > 0) {
    // near-field rain impacts are a surface phenomenon: gone below the shallow band
    g.droplets *= 1 - wMid;
    g.heatTicks *= 1 - wMid;
    g.iceTicks *= 1 - wMid;
    const density = Math.min(1, Math.max(0, inp.nearAnts / AMBIENCE.nestMurmurDenseAnts));
    g.nestTicks = wMid * density * AMBIENCE.nestMurmurMaxPerS;
    g.drips = inp.humidity !== null && inp.humidity > AMBIENCE.humidDripAbove ? wMid * (1 - wDeep) * AMBIENCE.dripPerS : 0;
  }
  if (inp.woodNest && inp.underground) {
    g.woodCreakEveryS = (AMBIENCE.woodCreakMinS + AMBIENCE.woodCreakMaxS) / 2;
    g.crackle = AMBIENCE.crackleMaxPerS * Math.min(1, Math.max(0, inp.colonyAnts / AMBIENCE.crackleFullAnts));
  }
  surfaceOcclusion(d, inp.underground, out.surface);
  out.playgroundSource = playgroundSource;
  return out;
}
