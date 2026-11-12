// Ambience layers (GDD 08 §13.4): each layer is a bed file (with a synthesised fallback bed) or a pure synth bed,
// optionally low-passed, and either a surface layer (occluded underground) or an underground one.
import { BED_FILES, type BedFileId } from '../assetIds';
import type { SynthBed } from '../synth/ids';
import { AMBIENCE } from '../tuning';

export const LAYER_IDS = [
  'birds', 'crickets', 'rain-light', 'rain-heavy', 'wind', 'street', 'street-muffled', 'traffic', 'playground-voices',
  'murmur', 'fridge', 'leaf-rustle', 'low-wind', 'rumble',
] as const;
export type LayerId = (typeof LAYER_IDS)[number];

export interface LayerDef {
  file: BedFileId | null;
  /** Synth bed: the layer itself (file null) or the fallback when the file is missing. */
  synth: SynthBed;
  /** Fixed low-pass of the layer, Hz (0 = none). */
  lowpassHz: number;
  /** Surface layers get the underground occlusion; underground layers do not. */
  surface: boolean;
}

export const LAYERS: Record<LayerId, LayerDef> = {
  'birds': { file: BED_FILES.birdsong_day, synth: 'bed-birds', lowpassHz: 0, surface: true },
  'crickets': { file: BED_FILES.crickets_night, synth: 'bed-crickets', lowpassHz: 0, surface: true },
  'rain-light': { file: BED_FILES.rain_light, synth: 'bed-rain-light', lowpassHz: 0, surface: true },
  'rain-heavy': { file: BED_FILES.rain_heavy, synth: 'bed-rain-heavy', lowpassHz: 0, surface: true },
  'wind': { file: BED_FILES.wind_leaves, synth: 'bed-wind', lowpassHz: 0, surface: true },
  'street': { file: BED_FILES.street_suburban, synth: 'bed-street', lowpassHz: 0, surface: true },
  'street-muffled': { file: BED_FILES.street_suburban, synth: 'bed-street', lowpassHz: AMBIENCE.interiorStreetLowpassHz, surface: true },
  'traffic': { file: BED_FILES.traffic_distant, synth: 'bed-traffic', lowpassHz: 0, surface: true },
  // only with Distant voices on and a file that passed the intelligibility check (13.7); otherwise `murmur` plays
  'playground-voices': { file: BED_FILES.playground_distant, synth: 'distant-murmur', lowpassHz: AMBIENCE.playgroundLowpassHz, surface: true },
  'murmur': { file: null, synth: 'distant-murmur', lowpassHz: 0, surface: true },
  'fridge': { file: BED_FILES.room_fridge_hum, synth: 'bed-hum', lowpassHz: 0, surface: true },
  'leaf-rustle': { file: null, synth: 'leaf-rustle', lowpassHz: 0, surface: true },
  'low-wind': { file: null, synth: 'low-wind', lowpassHz: 0, surface: true },
  'rumble': { file: BED_FILES.underground_rumble, synth: 'underground-tone', lowpassHz: 0, surface: false },
};

export type LayerGains = Record<LayerId, number>;

export function zeroLayers(out?: LayerGains): LayerGains {
  const o = out ?? ({} as LayerGains);
  for (const id of LAYER_IDS) o[id] = 0;
  return o;
}
