// Journal and report wording beyond the milestones (GDD 06 §9 timeline kinds, §6.5 Winter Report, §13.5 epitaph;
// GDD 08 §7.8, §7.10 time-lapse outcome cards). Templates with `{token}` placeholders (format.ts). Calm naturalist
// voice: statements of what happened, with units, and no praise or blame.
import type { HumanEventKind, JournalKind, StageId, ZoneType } from '@/sim/types';

/** Timeline tab filter labels per journal kind (GDD 08 §7.2, GDD 06 §9.1). */
export const JOURNAL_KIND_WORD: Record<JournalKind, string> = {
  milestone: 'Milestones',
  stage: 'Stages',
  season: 'Seasons',
  weather: 'Weather',
  loss: 'Losses',
  event: 'Events',
  'winter-report': 'Winter reports',
  flight: 'Flights',
  aim: 'Aims',
};

/** Journal entry on a stage change (kind `stage`). */
export const STAGE_ENTRY: Record<StageId, { title: string; text: string }> = {
  founding: { title: 'Founding', text: 'The queen is alone in a closed chamber, with only her own reserves.' },
  'first-workers': { title: 'First workers', text: 'The first workers have emerged and the nest is opening to the surface.' },
  growing: { title: 'A growing colony', text: 'The colony has passed its first fragile weeks. It now holds more brood than the queen could ever tend alone.' },
  mature: { title: 'A mature colony', text: 'The colony is large enough to spare labour for the next generation.' },
};

/** Season notes (kind `season`): tokens {workers} {brood} {c} {p} {weather}. */
export const SEASON_ENTRY: readonly { title: string; text: string }[] = [
  { title: 'Spring', text: 'Spring begins. {workers} workers and {brood} brood in the nest; stores hold {c} C and {p} P. The season was {weather}.' },
  { title: 'Summer', text: 'Summer begins. {workers} workers and {brood} brood in the nest; stores hold {c} C and {p} P. The season was {weather}.' },
  { title: 'Autumn', text: 'Autumn begins. {workers} workers and {brood} brood in the nest; stores hold {c} C and {p} P. The season was {weather}.' },
  { title: 'Winter', text: 'Winter begins. {workers} workers and {brood} brood in the nest; stores hold {c} C and {p} P. The season was {weather}.' },
];

/** Loss entry (kind `loss`): several deaths in a short time. Tokens {n} {cause} (a death cause noun) {where} (see LOSS_WHERE_WORD). */
export const LOSS_ENTRY = {
  title: 'Losses',
  text: '{n:ant died|ants died} within a quarter of a game day, most of them from {cause} {where}.',
} as const;

/** Winter Report (GDD 06 §6.5; GDD 08 §7.10 outcome card). Tokens {n} {cold} {starvation} {c} {p}. */
export const WINTER_REPORT = {
  title: 'Winter Report',
  survived: 'Winter survived. Lost {n:worker|workers} (cold {cold}, starvation {starvation}). Stores used: {c} C, {p} P.',
  /** No losses to report. */
  untouched: 'Winter survived. No workers were lost. Stores used: {c} C, {p} P.',
  /** Shown before the time-lapse, on the banner. */
  banner: 'The colony withdraws to the deep chambers for the winter.',
} as const;

/** Where a loss happened, as a phrase after the cause: `nest` (underground) or a zone type (progression `loss` token {where}). */
export const LOSS_WHERE_WORD: Record<'nest' | ZoneType, string> = {
  nest: 'in the nest',
  forest: 'on the forest floor',
  lawn: 'on the lawn',
  'garden-bed': 'in a garden bed',
  pavement: 'on the paving',
  asphalt: 'on the asphalt',
  sand: 'on the sand',
  rubber: 'on the rubber surfacing',
  interior: 'in the house',
};

/** The queen's death (kind `loss`, key `loss.queen`). Token {cause} is a death-cause clause (DEATH_CAUSE_WORD phrase). */
export const QUEEN_LOSS_ENTRY = {
  title: 'The queen has died',
  text: 'The queen {cause}.',
} as const;

/** Per-year summary that replaces old season and weather notes when the timeline is full (key `season-summary`). */
export const SEASON_SUMMARY_ENTRY = {
  title: 'Notes of year {year}',
  text: 'The {seasons:season note|season notes} and {weather:weather note|weather notes} of year {year} were folded into this line.',
} as const;

/** Notable events (kind `event`). Keys: `event.flood`, `event.raid` (token {n} = size of the raiding party). */
export const EVENT_ENTRY = {
  flood: { title: 'Flood', text: 'Water has entered the nest.' },
  raid: { title: 'Rival raid', text: 'A party of {n:rival worker|rival workers} has set out for the nest.' },
} as const;

/** Human events seen from the colony (kind `event`, keys `event.human.<kind>`). No people are named or shown. */
export const HUMAN_EVENT_ENTRY: Record<HumanEventKind, { title: string; text: string }> = {
  footsteps: { title: 'Footsteps', text: 'Heavy footsteps crossed the locality.' },
  mowing: { title: 'Mowing', text: 'A mower passed over the grass.' },
  sweeping: { title: 'Sweeping', text: 'A broom swept across the ground.' },
  vacuum: { title: 'A vacuum', text: 'A rush of air passed over the floor.' },
  'food-drop': { title: 'Fallen food', text: 'Food has fallen nearby.' },
  spill: { title: 'A spill', text: 'Liquid has spread across the ground.' },
  watering: { title: 'Watering', text: 'Water fell from above on a clear day.' },
  car: { title: 'A car', text: 'A car arrived and the ground trembled.' },
  children: { title: 'Children at play', text: 'Many small feet ran across the ground.' },
  'bait-station': { title: 'A bait station', text: 'A new object has been set down near the nest.' },
};

/** First-brood time-lapse outcome card (GDD 08 §7.10). Tokens {n} {pct}. */
export const FIRST_BROOD_REPORT = {
  title: 'First brood',
  outcome: 'First workers: {n}. Queen\'s reserves: {pct} %.',
} as const;

/** First time a weather state is seen in a season (kind `weather`). */
export const WEATHER_FIRST_ENTRY = {
  rain: { title: 'Rain', text: 'The first rain of the season has fallen.' },
  storm: { title: 'Storm', text: 'A thunderstorm has crossed the locality.' },
  heat: { title: 'Heat', text: 'A spell of heat has begun; the hottest surfaces are too hot to cross at midday.' },
  frost: { title: 'Frost', text: 'A frost has settled; ants stay below ground until it lifts.' },
} as const;

/** Nuptial flight record (kind `flight`). Tokens {launched} {mated} {daughters}. */
export const FLIGHT_ENTRY = {
  title: 'Nuptial flight',
  text: '{launched:winged ant|winged ants} left the nest. {mated:queen|queens} mated, and {daughters} began a nest of their own.',
} as const;

/** Epitaph (GDD 08 §7.8; the progression module builds the cause chain from these pieces). Tokens {from} {to} {seed}. */
export const EPITAPH = {
  lifeLine: 'Founded {from} — ended {to}',
  localityLine: '{archetype}, seed {seed}',
  howItEnded: 'How it ended',
  actions: { lineage: 'Lineage', newColony: 'New colony', title: 'Title', foundAgain: 'Found again in this locality' },
} as const;
