// Every sound-cue pip has a word and an icon that exists in the icon set (GDD 08 §12: edge pips with an icon).
import { describe, expect, it } from 'vitest';
import { SOUND_CUE_ICON, SOUND_CUE_WORD } from '@/content/text/soundCues';
import { ICON_PATHS } from '../icons/paths';

describe('sound-cue pips', () => {
  it('each kind has a word and a drawn icon', () => {
    const kinds = Object.keys(SOUND_CUE_WORD);
    expect(kinds.sort()).toEqual(Object.keys(SOUND_CUE_ICON).sort());
    for (const k of kinds) {
      const icon = SOUND_CUE_ICON[k as keyof typeof SOUND_CUE_ICON];
      expect(ICON_PATHS[icon], `${k} -> ${icon}`).toBeTruthy();
      expect(SOUND_CUE_WORD[k as keyof typeof SOUND_CUE_WORD].length).toBeGreaterThan(0);
    }
  });
});
