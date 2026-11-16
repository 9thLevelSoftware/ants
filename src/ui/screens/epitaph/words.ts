// Words of the lifecycle screens (winter report, flight, epitaph, lineage): the simulation hands over ids and
// numbers only. Calm naturalist voice, no score words.
import { DEATH_CAUSE_WORD } from '@/content/text/words';
import type { DeathCause } from '@/sim/types';

export const SPECIES_NAME: Record<string, string> = {
  'lasius-niger': 'Black garden ant', 'camponotus-pennsylvanicus': 'Black carpenter ant',
  'messor-barbarus': 'Harvester ant', 'atta-texana': 'Texas leafcutter ant',
};

export const ARCHETYPE_WORD: Record<string, string> = {
  'suburban-garden': 'a suburban garden', 'woodland-edge': 'a woodland edge', 'car-park-verge': 'a car-park verge',
  'kitchen-door': 'a kitchen doorstep', 'playground-park': 'a playground park',
};

/** A death cause id as a noun ("cold"); winter-report causes `outdoors` included. */
export function causeNoun(cause: string): string {
  if (cause === 'outdoors') return 'cold, caught outdoors';
  if (cause === 'retired') return 'the colony being retired';
  return DEATH_CAUSE_WORD[cause as DeathCause]?.noun ?? cause;
}

export function causePhrase(cause: string): string {
  if (cause === 'retired') return 'was retired';
  return DEATH_CAUSE_WORD[cause as DeathCause]?.phrase ?? `died (${cause})`;
}

export const WINTER_REMEDY: Record<string, string> = {
  'dig-deeper': 'Dig a deeper winter chamber.',
  'stock-before-winter': 'Build up carbohydrate stores in autumn.',
  'drier-chamber': 'Keep the winter chamber drier and the midden apart.',
  'raise-entrance': 'Raise the entrances or dig a drain chamber.',
  'recall-foragers': 'Bring the foragers home before the first cold night.',
  none: 'Workers grow old; a small loss is natural.',
};

export const BEAT_WORD: Record<string, string> = {
  frost: 'Frost on the surface', rain: 'Rain overhead', flood: 'Water in the chamber', disease: 'Fungus in the nest',
  starvation: 'Stores are gone',
};

export const FLIGHT_OUTCOME: Record<string, string> = {
  landed: 'She came down and shed her wings.', exhausted: 'Her strength gave out and she came down.',
  dispersed: 'She flew beyond the locality and was not seen again.', 'land-now': 'She came down early.',
  timeout: 'The flight ended.', died: 'She did not survive the flight.', watched: 'The swarm has gone.',
};

export const PHASE_WORD: Record<string, string> = {
  ascend: 'Climbing', lek: 'Seeking the swarm', mate: 'Among the males', descend: 'Coming down', land: 'Landing',
};

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
export const roman = (n: number): string => ROMAN[n] ?? String(n);

export const pct = (v: number): string => `${Math.round(v * 100)} %`;
export const loads = (v: number): string => (Math.round(v * 10) / 10).toFixed(1);

/** `n` with the singular or plural noun: count(1, 'flood') = '1 flood', count(3, 'colony', 'colonies'). */
export function count(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
