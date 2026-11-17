// Words of the sound-cue indicator pips (GDD 08 §12: tremor warning, alarm, drumming, nest crackle, rain onset).
import type { UiSoundCueKind } from '@/ui/api';

export const SOUND_CUE_WORD: Record<UiSoundCueKind, string> = {
  tremor: 'Tremor',
  alarm: 'Alarm',
  drum: 'Drumming',
  crackle: 'Creaking soil',
  rain: 'Rain',
};
