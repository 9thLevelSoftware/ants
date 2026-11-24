// Display words for the HUD (GDD 08 2.2: sentence case, plain nouns; numbers carry units). Presentation only.

export const WEATHER_WORDS: Record<string, string> = {
  clear: 'Clear', overcast: 'Overcast', rain: 'Rain', storm: 'Storm', heat: 'Heat', frost: 'Frost',
};

/** Behaviour state ('<task>.<state>') as a short phrase; unknown states fall back to the state part itself. */
const STATE_WORDS: Record<string, string> = {
  'scout.depart': 'leaving to scout', 'scout.explore': 'scouting', 'scout.investigate': 'checking a find', 'scout.assess': 'assessing food',
  'scout.collect': 'tasting food', 'scout.return': 'returning home', 'scout.report': 'reporting',
  'forage.wait': 'waiting to leave', 'forage.outbound': 'heading out', 'forage.search': 'searching', 'forage.queue': 'queuing at food',
  'forage.collect': 'collecting', 'forage.return': 'returning home', 'forage.deliver': 'delivering food',
  'tend.outbound': 'heading to aphids', 'tend.solicit': 'stroking aphids', 'tend.guard-herd': 'guarding aphids', 'tend.return': 'returning home',
  'tend.deliver': 'delivering honeydew', 'tend.wait': 'waiting',
  'nurse.select': 'choosing brood', 'nurse.load': 'loading food', 'nurse.feed': 'feeding larvae', 'nurse.tend': 'tending brood',
  'nurse.carry': 'carrying brood', 'nurse.assist': 'helping a pupa out', 'nurse.cannibalise': 'eating brood', 'nurse.groom': 'grooming brood',
  'queen-care.attend': 'attending the queen', 'queen-care.load': 'loading food', 'queen-care.feed': 'feeding the queen',
  'queen-care.collect-eggs': 'collecting eggs', 'queen-care.escort': 'escorting the queen',
  'store.post': 'waiting at the stores', 'store.receive': 'receiving food', 'store.disperse': 'sharing food', 'store.shift': 'moving stores', 'store.clean': 'cleaning stores',
  'dig.claim': 'choosing a dig site', 'dig.travel': 'going to dig', 'dig.bite': 'digging', 'dig.stow': 'stowing a pellet',
  'haul.claim': 'choosing a load', 'haul.travel': 'going to a load', 'haul.pick': 'picking up', 'haul.carry': 'carrying out', 'haul.return': 'returning to the nest',
  'guard.post': 'on guard', 'guard.alarm-raise': 'raising the alarm', 'patrol.loop': 'patrolling',
  'queen.found-care': 'tending the first brood', 'queen.reside': 'resting in the chamber', 'queen.relocate': 'moving chambers',
};

export function stateWord(state: string, task: string): string {
  const hit = STATE_WORDS[state];
  if (hit) return hit;
  const dot = state.indexOf('.');
  const part = dot >= 0 ? state.slice(dot + 1) : '';
  if (!part) return task === 'idle' ? 'idle' : task === 'rest' ? 'resting' : task.replace(/-/g, ' ');
  return part.replace(/-/g, ' ');
}

/** Task word as the roster and panels show it (canonical task id, sentence case). */
export function taskWord(task: string): string {
  const w = task.replace(/-/g, ' ');
  return w.charAt(0).toUpperCase() + w.slice(1);
}

/** Where an ant in a chamber is (the roster's Where column): the chamber's kind in words, never its record number (look pass 6: "Royal 5740"). */
export const CHAMBER_WORDS: Record<string, string> = {
  founding: 'Founding cell', royal: 'Royal chamber', nursery: 'Nursery', food: 'Food store', granary: 'Granary', fungus: 'Fungus garden',
  midden: 'Midden', rest: 'Rest chamber', general: 'Chamber',
};

export const ZONE_WORDS: Record<string, string> = {
  forest: 'Forest floor', lawn: 'Lawn', 'garden-bed': 'Garden bed', pavement: 'Pavement', asphalt: 'Asphalt', sand: 'Sand',
  rubber: 'Rubber surface', interior: 'Indoors',
};

const CASTE_WORDS: Record<string, string> = {
  queen: 'Queen', gyne: 'Gyne', male: 'Male', worker: 'Worker', minor: 'Minor', media: 'Media', major: 'Major',
};

export function casteWord(caste: string): string {
  return CASTE_WORDS[caste] ?? caste;
}

/** "Worker 0412" (GDD 08 4.5: id zero-padded to 4). */
export function antName(caste: string, id: number): string {
  return `${casteWord(caste)} ${String(id).padStart(4, '0')}`;
}

/** The reason a prompt line gives for an action that cannot be done at this moment (the sim's word for `blocked`, GDD 01 9.3): "Lay egg — busy". */
export const PROMPT_BUSY = 'busy';
