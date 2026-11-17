// Alert wording (GDD 08 §6.4 patterns, §6.5 catalogue). Title: `<Subject> <state>`, sentence case, present tense, no
// exclamation marks, no second person, at most 48 characters. Cause line: `<main cause> — <number with unit>` or
// `<where>`, at most 72 characters. Numbers always carry units. Templates use `{token}` placeholders (format.ts);
// `sample` holds example values so the length rules can be checked and the table read at a glance.
// Levels are the defaults of GDD 08 §6.5; the sim may raise a kind at another level and the UI shows what it is given.
import type { AlertKind, AlertLevel, HumanEventKind, WeatherState } from '@/sim/types';
import type { TextTokens } from './format';

export interface AlertText {
  level: AlertLevel;
  title: string;
  cause: string;
  sample: TextTokens;
}

export const ALERT_TEXT: Record<AlertKind, AlertText> = {
  'queen-reserves-low': { level: 'warning', title: 'Queen\'s reserves low', cause: '{pct} % left — founding chamber {temp} °C', sample: { pct: 38, temp: 21 } },
  'queen-in-danger': { level: 'critical', title: 'Queen under attack', cause: '{attacker}, {where}', sample: { attacker: 'wolf spider', where: 'royal chamber' } },
  'queen-died': { level: 'critical', title: 'The queen has died', cause: '{cause}; the colony is now orphaned', sample: { cause: 'old age' } },
  'food-c-low': { level: 'warning', title: 'Carbohydrate stores low', cause: '{c} C in store — about {days:game day|game days} left', sample: { c: '1.2', days: '0.5' } },
  'food-p-low': { level: 'warning', title: 'Protein short for the larvae', cause: '{larvae:larva|larvae}, {p} P stored', sample: { larvae: 18, p: '0.3' } },
  'brood-stalled': { level: 'warning', title: 'Brood growth slowed', cause: '{cause}; nursery {temp} °C', sample: { cause: 'protein short', temp: 16 } },
  'nest-crowded': { level: 'notice', title: 'Nest crowded', cause: '{chamber} chamber at {pct} % capacity', sample: { chamber: 'general', pct: 140 } },
  'nest-flooding': { level: 'critical', title: 'Nest flooding', cause: 'lower chambers taking water', sample: {} },
  'dig-stalled': { level: 'notice', title: 'Dig plan stalled', cause: '{reason}', sample: { reason: 'too close to another room' } },
  'trail-lost': { level: 'notice', title: 'Trail broken', cause: 'rain washed out the trail to the {target}', sample: { target: 'aphids' } },
  'source-found': { level: 'notice', title: 'New food found', cause: '{kind}, {dist} BU {dir}', sample: { kind: 'honeydew', dist: 140, dir: 'north-east' } },
  'source-exhausted': { level: 'info', title: 'Food source used up', cause: '{kind}', sample: { kind: 'honeydew' } },
  'nest-attacked': { level: 'critical', title: 'Nest under attack', cause: 'rival workers at the {dir} entrance', sample: { dir: 'east' } },
  'raid-seen': { level: 'warning', title: 'Rival scouts near the nest', cause: '{n:worker|workers}', sample: { n: 6 } },
  'predator-near': { level: 'warning', title: 'Predator near foragers', cause: '{kind}', sample: { kind: 'wolf spider' } },
  'human-event-warning': { level: 'warning', title: 'Ground is trembling', cause: 'footsteps approaching the {area}', sample: { area: 'lawn' } },
  'weather-change': { level: 'notice', title: 'Rain coming', cause: 'within {h:game hour|game hours}', sample: { h: 2 } },
  'heat-danger': { level: 'warning', title: 'Surface too hot to cross', cause: '{surface} {temp} °C', sample: { surface: 'asphalt', temp: 52 } },
  'possessed-danger': { level: 'critical', title: 'Overheating', cause: 'find shade — body {temp} °C', sample: { temp: 39 } },
  'possessed-died': { level: 'warning', title: '{ant} died', cause: '{cause}; the camera returns to the observer', sample: { ant: 'Worker 0412', cause: 'heat' } },
  'winter-coming': { level: 'notice', title: 'Winter approaches', cause: 'stores cover {x} of {winterDays:day|days}', sample: { x: 6, winterDays: 7 } },
  'alates-ready': { level: 'notice', title: 'Winged queens and males are ready', cause: '{n:winged ant|winged ants}', sample: { n: 64 } },
  'flight-weather': { level: 'notice', title: 'Flying weather', cause: 'warm, light wind', sample: {} },
  milestone: { level: 'info', title: '{title}', cause: '{date}', sample: { title: 'A trail', date: 'Spring · Day 5 · Year 1' } },
  'save-failed': { level: 'warning', title: 'Save failed', cause: 'storage refused; use Export', sample: {} },
  'storage-unavailable': { level: 'notice', title: 'Saving unavailable here', cause: 'export to keep this colony', sample: {} },
  'audio-blocked': { level: 'info', title: 'Sound is off', cause: 'click anywhere to enable', sample: {} },
  'colony-starving': { level: 'critical', title: 'The colony is starving', cause: 'stores empty; brood is being eaten', sample: {} },
  'stores-full': { level: 'notice', title: 'Stores are full', cause: 'foragers are resting with full crops', sample: {} },
  'nest-collapse-risk': { level: 'warning', title: 'Ceiling may collapse', cause: 'dry sand, wide room', sample: {} },
  'entrance-breached': { level: 'notice', title: 'A new opening', cause: 'a tunnel broke through to the surface', sample: {} },
  'last-ants': { level: 'critical', title: 'Only {n:ant remains|ants remain}', cause: '{cause}', sample: { n: 3, cause: 'cold' } },
  'garden-failing': { level: 'warning', title: 'Fungus garden failing', cause: '{state} — {cause}', sample: { state: 'shrinking', cause: 'too much protein in the leaves' } },
  'granary-spoiling': { level: 'warning', title: 'Seeds are sprouting or rotting', cause: 'humidity {pct} %', sample: { pct: 88 } },
  'wood-drying': { level: 'warning', title: 'The nest wood is drying', cause: 'moisture {pct} %', sample: { pct: 11 } },
  'entrance-closed': { level: 'warning', title: 'An entrance has closed', cause: '{cause}', sample: { cause: 'soil piled over the opening' } },
  'midden-blocked': { level: 'notice', title: 'Waste cannot leave the nest', cause: 'no open entrance — waste is dropped in a dead end', sample: {} },
  'founding-flooding': { level: 'critical', title: 'Founding chamber flooding', cause: 'water rising around the queen — {pct} % of the cell', sample: { pct: 40 } },
};

/** Weather alert titles by the weather the colony is told about (GDD 08 §6.5 `weather-change`; GDD 06 §3). */
export const WEATHER_CHANGE_TITLE: Record<WeatherState, string> = {
  clear: 'Sky clearing',
  overcast: 'Cloud coming',
  rain: 'Rain coming',
  storm: 'Storm coming',
  heat: 'Heat coming',
  frost: 'Frost coming',
};

/** `human-event-warning` pattern per human event kind: title and cause (GDD 08 §6.5, GDD 04 telegraphs). No people are named. */
export const HUMAN_EVENT_WARNING: Record<HumanEventKind, { title: string; cause: string }> = {
  footsteps: { title: 'Ground is trembling', cause: 'footsteps approaching the {area}' },
  mowing: { title: 'A low drone approaches', cause: 'a mower on the {area}' },
  sweeping: { title: 'Bristles are sweeping', cause: 'a broom crossing the {area}' },
  vacuum: { title: 'A rush of air', cause: 'a vacuum near the {area}' },
  'food-drop': { title: 'Something has fallen', cause: 'food landed on the {area}' },
  spill: { title: 'Liquid is spreading', cause: 'a spill on the {area}' },
  watering: { title: 'Rain from a clear sky', cause: 'a sprinkler over the {area}' },
  car: { title: 'Ground is rumbling', cause: 'a car arriving at the {area}' },
  children: { title: 'Many footfalls', cause: 'children playing on the {area}' },
  'bait-station': { title: 'A new object nearby', cause: 'a bait station on the {area}' },
};
