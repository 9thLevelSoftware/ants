// Words and icons of the sound-cue indicator pips (GDD 08 §12: tremor warning, alarm, drumming, nest crackle, rain onset).
import type { UiSoundCueKind } from '@/ui/api';

export const SOUND_CUE_WORD: Record<UiSoundCueKind, string> = {
  tremor: 'Tremor',
  alarm: 'Alarm',
  drum: 'Drumming',
  crackle: 'Creaking soil',
  rain: 'Rain',
};

/** Icon of each pip (src/ui/icons/paths.ts): the pip shows the icon with its word beside it. */
export const SOUND_CUE_ICON: Record<UiSoundCueKind, string> = {
  tremor: 'footfall',
  alarm: 'cue-alarm',
  drum: 'cue-drum',
  crackle: 'cue-crackle',
  rain: 'weather-rain',
};

