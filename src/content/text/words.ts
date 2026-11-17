// Display words for ids that the sim and the UI show to the player: rival relation states (GDD 08 §6.4 conflict
// wording), rally modes, diagnostic statuses, death causes, weather, seasons, colony stages, zones. Ids never change;
// only these words do. Contests between colonies are ecological contests, never human institutions (GDD 08 §6.4):
// never "war", "battle", "enemy", "defeated", "conquered", "truce", "soldier" (except the caste term "major").
import type {
  DeathCause, DiagnosticStatus, FoundingFailCause, RallyMode, RelationState, SiteFactor, SiteWord, StageId, WeatherState,
  ZoneType,
} from '@/sim/types';

/** Rival relation states as displayed (GDD 08 §6.4). */
export const RELATION_WORD: Record<RelationState, string> = {
  peace: 'Neutral',
  tension: 'Wary',
  skirmish: 'Clashing',
  war: 'Territorial dispute',
  truce: 'Lull',
};

/** One short line explaining each relation state, for the tooltip on the Colony orders panel. */
export const RELATION_NOTE: Record<RelationState, string> = {
  peace: 'The colonies ignore each other.',
  tension: 'Workers meet at the boundary and keep their distance.',
  skirmish: 'Workers of the two colonies are fighting at the boundary.',
  war: 'Both colonies hold the ground at their boundary and contest it.',
  truce: 'The contest has paused; the workers have drawn back.',
};

/** Rally marker modes (GDD 08 §4.3). */
export const RALLY_MODE_WORD: Record<RallyMode, string> = { defend: 'Defend', attack: 'Attack' };

/** Diagnostic status words (GDD 08 §4.4: ok Good, info Note, warn Strained, bad Failing). */
export const STATUS_WORD: Record<DiagnosticStatus, string> = { ok: 'Good', info: 'Note', warn: 'Strained', bad: 'Failing' };

/**
 * Death causes in plain words. `noun` follows "of" or "from" ("died of {noun}"); `phrase` is a full clause for the
 * epitaph chain ("The last workers died of cold in winter" is built by the progression module from these).
 */
export const DEATH_CAUSE_WORD: Record<DeathCause, { noun: string; phrase: string }> = {
  'old-age': { noun: 'old age', phrase: 'died of old age' },
  starvation: { noun: 'hunger', phrase: 'starved' },
  desiccation: { noun: 'drying out', phrase: 'dried out' },
  heat: { noun: 'heat', phrase: 'died of heat' },
  cold: { noun: 'cold', phrase: 'died of cold' },
  drowning: { noun: 'drowning', phrase: 'drowned' },
  crushed: { noun: 'being crushed', phrase: 'was crushed' },
  predation: { noun: 'a predator', phrase: 'was taken by a predator' },
  bird: { noun: 'a bird', phrase: 'was taken by a bird' },
  antlion: { noun: 'an antlion', phrase: 'was taken by an antlion' },
  parasitoid: { noun: 'a parasitic fly', phrase: 'was killed by a parasitic fly' },
  combat: { noun: 'a contest with rival workers', phrase: 'died in a contest with rival workers' },
  disease: { noun: 'disease', phrase: 'died of disease' },
  poison: { noun: 'poison', phrase: 'was poisoned' },
  fell: { noun: 'a fall', phrase: 'died in a fall' },
  exhaustion: { noun: 'spent reserves', phrase: 'spent the last of her reserves' },
  lost: { noun: 'exposure after being lost', phrase: 'was lost and died of exposure' },
  dispersed: { noun: 'leaving the map', phrase: 'left the locality and was lost' },
  unknown: { noun: 'an unknown cause', phrase: 'died of an unknown cause' },
};

/** Weather states as the time cluster words them (GDD 06 §3.1). */
export const WEATHER_WORD: Record<WeatherState, string> = {
  clear: 'Clear', overcast: 'Overcast', rain: 'Rain', storm: 'Storm', heat: 'Heat', frost: 'Frost',
};

/** Seasons in the order of the calendar (GDD 06 §1.2). */
export const SEASON_WORD: readonly string[] = ['Spring', 'Summer', 'Autumn', 'Winter'];

/** Colony stages: descriptive, never gating (GDD 06 §7). */
export const STAGE_WORD: Record<StageId, { title: string; note: string }> = {
  founding: { title: 'Founding', note: 'The queen is alone, in a closed chamber.' },
  'first-workers': { title: 'First workers', note: 'The first workers have emerged; the nest is opening.' },
  growing: { title: 'Growing', note: 'The colony holds more brood than the queen could tend alone.' },
  mature: { title: 'Mature', note: 'The colony is large enough to spare labour for the next generation.' },
};

/** Zone types in plain words, for `{zone}` tokens of journal lines (GDD 04 §2). */
export const ZONE_WORD: Record<ZoneType, string> = {
  forest: 'the forest floor',
  lawn: 'the lawn',
  'garden-bed': 'a garden bed',
  pavement: 'the paving',
  asphalt: 'the asphalt',
  sand: 'the sand',
  rubber: 'the rubber surfacing',
  interior: 'the house',
};

/** Plain words for the factor causes the colony systems publish (Diagnostic.factors[].cause; GDD 08 §4.4). */
export const FACTOR_CAUSE_WORD: Readonly<Record<string, string>> = {
  'adult-crowding': 'Too many adults for the chambers',
  'architect-off': 'The nest architect is off',
  bird: 'A bird took ants',
  boredom: 'Too little to do',
  'brood-space': 'No room for brood',
  callows: 'Many callow workers',
  cap: 'The colony has reached its size limit',
  capacity: 'Store capacity',
  carbohydrate: 'Carbohydrate',
  caste: 'The wrong caste for the work',
  'colony-size': 'Colony size',
  combat: 'Fighting',
  crowding: 'Crowded brood chambers',
  diet: 'Diet emphasis',
  distance: 'Distance to the food',
  drowning: 'Water in the nest',
  eclosed: 'New adults',
  fatigue: 'Workers resting',
  flooding: 'Flooding',
  'food-space': 'No room for food',
  foragers: 'Foragers out',
  'gut-C': 'Carbohydrate in the queen\'s gut',
  'gut-P': 'Protein in the queen\'s gut',
  haulers: 'Waste haulers',
  heat: 'Heat',
  humidity: 'Dry brood chambers',
  hygiene: 'Waste in the brood chambers',
  ignorers: 'Foragers ignoring trails',
  injured: 'Injured workers',
  injury: 'Injury',
  lost: 'Ants lost',
  'manual-conflict': 'Slider shares leave a need short',
  'midden-blocked': 'No way out to the midden',
  'no-diggers': 'No diggers',
  nurses: 'Nurses',
  'old-age': 'Old age',
  orphaned: 'The colony has no queen',
  predation: 'Predators',
  protein: 'Protein',
  'protein-supply': 'Protein supply',
  'queen-care': 'Attendants for the queen',
  'queen-health': 'The queen\'s health',
  reserve: 'The queen\'s fat reserve',
  retinue: 'Attendants for the queen',
  season: 'Laying season',
  sources: 'Known food sources',
  spoilage: 'Spoilage',
  success: 'Successful trips',
  temperature: 'Temperature',
  'too-few-adults': 'Too few adults',
  'trail-lost': 'Trails lost',
  unknown: 'Unknown',
  unloading: 'Waiting to unload',
  upkeep: 'Daily upkeep',
  washed: 'Rain on the trails',
  weather: 'Weather',
  'winter-reserve': 'Food kept for the winter',
  // granary (Messor, GDD 07 §6.3.10, §5.3.10)
  'granary-damp': 'Granary too damp',
  'care-short': 'Too few granary workers',
  'seed-rot': 'Seed rotting',
  'majors-few': 'Too few majors to crack seed',
  'millers-few': 'Too few millers',
  'seeds-hard': 'Seeds too hard for media',
  'animal-protein': 'Little animal protein for the larvae',
  'trail-heat': 'Trails too hot',
  'summer-lull': 'Summer lull',
  'patrol-out': 'Morning patrol not back',
  'patrol-lost': 'Patroller lost or alarm at the entrance',
  // wood nesting (Camponotus, GDD 07 §6.2.10, §5.2.10)
  mould: 'Wood too wet: mould',
  windows: 'Too many openings dry the wood',
  sun: 'Sun on the nest wood',
  'leak-repaired': 'Dry building timber',
  'wood-drying': 'Nest wood drying',
  'carved-out': 'Nest wood carved out',
  moisture: 'Wood moisture',
  'no-satellite': 'No satellite nest',
  isolated: 'Satellite cut off',
  'shuttle-short': 'Late brood waiting for transport',
  castes: 'All worker sizes unlocked',
  'age-locked': 'Larger workers come with colony age',
  'interior-windows': 'Frass piling up indoors',
  'late-brood-share': 'Late brood in satellites',
  'orphan-satellite': 'Satellite cut off for a week',
  'wood-crumbling': 'Nest wood crumbling',
};

/** Remedy ids in plain words (Diagnostic.remedies; each opens the control concerned and changes nothing itself). */
export const REMEDY_WORD: Readonly<Record<string, string>> = {
  'remedy.architect.auto': 'Turn the nest architect on',
  'remedy.diet.protein': 'Shift the diet toward protein',
  'remedy.slider.mill': 'Raise the Mill share (inside Nurse)',
  'remedy.slider.store': 'Raise the granary-care share (inside Nurse)',
  'remedy.caste-emphasis': 'Raise caste emphasis toward large workers',
  'remedy.granary.hygiene': 'Raise granary hygiene',
  'remedy.dig.granary': 'Plan a drier granary higher up',
  'remedy.guard.entrance': 'Guard the entrance',
  'remedy.toggle.hideFrass': 'Keep frass inside (fewer openings)',
  'remedy.marker.satellite': 'Mark wood for a satellite nest',
  'remedy.dig.drain-chamber': 'Dig a drain chamber below the nest',
  'remedy.dig.food': 'Plan a food chamber',
  'remedy.dig.general': 'Plan more chambers',
  'remedy.dig.nursery': 'Plan a nursery',
  'remedy.dig.rest': 'Plan a resting chamber',
  'remedy.marker.avoid': 'Mark an area to avoid',
  'remedy.marker.entrance': 'Mark a new entrance',
  'remedy.marker.forage': 'Mark a place to forage',
  'remedy.marker.move-brood': 'Move the brood',
  'remedy.marker.move-queen': 'Move the queen',
  'remedy.marker.rally': 'Place a rally marker',
  'remedy.possess.forage': 'Take control of a forager',
  'remedy.possess.tend': 'Take control of a worker tending the herd',
  'remedy.possessed.find-soil': 'Find soil to dig in',
  'remedy.possessed.move-closer': 'Move closer',
  'remedy.possessed.put-down': 'Put the load down',
  'remedy.possessed.share-food': 'Share food with a nestmate',
  'remedy.slider.dig': 'Raise the Dig share',
  'remedy.slider.forage': 'Raise the Forage share',
  'remedy.slider.nurse': 'Raise the Nurse share',
  'remedy.slider.tend': 'Raise the Forage share (it holds the tenders)',
  'remedy.stance.cautious': 'Set the stance to cautious',
  'remedy.stock.low': 'Lower the stock target',
};

/**
 * How a diagnostic's main value reads in Colony health (GDD 08 §4.4 "value with unit"). The sim publishes a different
 * quantity per diagnostic, so each id names its own unit; an id not listed shows its number with no unit rather than
 * a wrong one. kind: ratio = a plain factor ("0.6 of normal"), percent = value x 100 ("63 % full"), count = a tally of
 * things, none = the value carries no meaning for the player (it is not shown).
 */
export interface DiagValueSpec {
  kind: 'ratio' | 'percent' | 'count' | 'none';
  unit: string;
}
export const DIAG_VALUE_WORD: Readonly<Record<string, DiagValueSpec>> = {
  'diag-food-intake-c': { kind: 'ratio', unit: 'of need' },
  'diag-food-intake-p': { kind: 'ratio', unit: 'of need' },
  'diag-stores': { kind: 'percent', unit: 'of the stock target' },
  'diag-brood-growth': { kind: 'ratio', unit: 'of normal' },
  'diag-egg-laying': { kind: 'ratio', unit: 'of normal' },
  'diag-queen-condition': { kind: 'percent', unit: 'condition' },
  'diag-workforce': { kind: 'percent', unit: 'of the need staffed' },
  'diag-foraging-trails': { kind: 'percent', unit: 'working' },
  'diag-mortality': { kind: 'percent', unit: 'of ants lost per game day' },
  'diag-hygiene': { kind: 'percent', unit: 'clean' },
  'diag-nest-space': { kind: 'percent', unit: 'full' },
  'diag-dig-progress': { kind: 'percent', unit: 'of full speed' },
  'diag-nest-climate': { kind: 'percent', unit: 'of ideal' },
  'diag-rivals': { kind: 'count', unit: 'raid risks' },
  'diag-combat-losses': { kind: 'count', unit: 'workers lost today' },
  'diag-herds': { kind: 'count', unit: 'honeydew yield today' },
  'diag-granary': { kind: 'count', unit: 'days of seed in store' },
  'diag-mb-milling': { kind: 'count', unit: 'days of paste' },
  'diag-mb-animal-protein': { kind: 'percent', unit: 'animal protein in larval food' },
  'diag-mb-heat': { kind: 'percent', unit: 'of the full foraging range' },
  'diag-mb-patrol': { kind: 'none', unit: '' },
  'diag-wood': { kind: 'count', unit: '% wood moisture' },
  'diag-cp-parent-moisture': { kind: 'count', unit: '% wood moisture' },
  'diag-cp-satellites': { kind: 'count', unit: 'satellite nests' },
  'diag-cp-growth': { kind: 'count', unit: 'years old' },
  'diag-cp-frass': { kind: 'count', unit: 'frass visibility' },
  'diag-released-ant': { kind: 'none', unit: '' },
  'diag-possessed-action': { kind: 'none', unit: '' },
  'diag-possessed-movement': { kind: 'none', unit: '' },
  'diag-possession-availability': { kind: 'none', unit: '' },
};

/** Why a founding failed, as the failure card words it (GDD 06 §5.14). Plain statements; no personification of the cold or the ground. */
export const FOUNDING_FAIL_TEXT: Record<FoundingFailCause, string> = {
  desiccation: 'She dried out in the open before she was sealed in.',
  predation: 'She was taken before the first workers emerged.',
  crushed: 'She was crushed.',
  heat: 'The ground was too hot for her.',
  cold: 'She died of cold.',
  drowning: 'Water filled the burrow.',
  exhaustion: 'Her reserves ran out.',
  'brood-lost': 'The brood was lost.',
  'no-workers': 'The brood was lost, and she had nothing left to raise another.',
  'garden-lost': 'The fungus garden died, and the brood had nothing to eat.',
  starvation: 'She and the brood ran out of food.',
  retired: 'This attempt was ended.',
};

/** Rows of the site assessment card (GDD 06 §5.7, GDD 08 §9.3). */
export const SITE_FACTOR_WORD: Record<SiteFactor, string> = {
  diggability: 'Diggability', moisture: 'Moisture', warmth: 'Warmth', cover: 'Cover', floodSafety: 'Flood safety',
  rivalScent: 'Rival scent', exposure: 'Exposure',
};

/** Overall site words (GDD 08 §9.3). */
export const SITE_QUALITY_WORD: Record<SiteWord, string> = { poor: 'Poor', fair: 'Fair', good: 'Good', excellent: 'Excellent' };
