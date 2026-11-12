// Codex: human activity at ant scale (GDD 06 §10; no human characters appear in the game, GDD 08 §11.8).
import type { CodexEntry } from '../types';

export const HUMAN_ENTRIES: readonly CodexEntry[] = [
  {
    id: 'cx-footfall',
    title: 'A shoe',
    category: 'human',
    species: ['ALL'],
    body:
      'A shoe print measures roughly 200 by 80 mm, an estimate. For a black garden ant, which is about 4 mm long, that is ' +
      'fifty body lengths. Footfalls are frequent near paths and play areas, perhaps five to twenty in a day, and each ' +
      'one crushes what lies beneath it and wipes away trail. The ground carries a tremor before the shoe falls, which ' +
      'gives an ant a moment to freeze or scatter. Mowing, watering, sweeping and vacuuming act at the same scale: ' +
      'each one is a weather event as far as an ant is concerned.',
    inGame:
      'People are never shown, only shoe soles, wheels, a mower, a broom and water. A tremor, a shadow and a ' +
      'sound come first, then the event. Surviving a footfall within about 60 body lengths is a milestone.',
    related: ['cx-habitat-lawn', 'cx-habitat-pavement'],
  },
];
