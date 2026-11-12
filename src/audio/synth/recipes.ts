// All one-shot recipes by id (the union of the foley, giant, UI and grain tables).
import { FOLEY } from './foley';
import { GIANTS, GRAINS, UI_TONES } from './giantsUi';
import type { SynthOneShot } from './ids';
import type { ShotRecipe } from './kit';

export const RECIPES = { ...FOLEY, ...GIANTS, ...UI_TONES, ...GRAINS } as Record<SynthOneShot, ShotRecipe>;
