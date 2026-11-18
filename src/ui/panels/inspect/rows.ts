// Wording of the inspect card's rows (GDD 01 10, GDD 08 10.2). The simulation gives each row a stable key, a word and
// the number behind it; this file adds the label and decides when the number shows. No game logic.
import type { UiInspectRow } from '../../api';
import { loads } from '../../hud/format';

const LABELS: Record<string, string> = {
  odour: 'Odour', caste: 'Caste', age: 'Age', health: 'Health', 'crop-c': 'Crop C', 'crop-p': 'Crop P', carrying: 'Carrying',
  task: 'Task', state: 'Doing', target: 'Target', reason: 'Because', possessed: 'Possessed',
  material: 'Material', diggability: 'Digging', moisture: 'Moisture', temperature: 'Temperature', 'temperature-deep': 'Deeper down',
  cover: 'Cover', trail: 'Trail scent', home: 'Home scent', alarm: 'Alarm scent',
  kind: 'Kind', taste: 'Taste', amount: 'Amount', carry: 'To carry', users: 'Ours using it', rivals: 'Rivals near', known: 'Known to us',
  stage: 'Stage', hunger: 'Hunger', humidity: 'Humidity', progress: 'Progress', eta: 'Ready in', destined: 'Will be',
  species: 'Species', size: 'Size', behaviour: 'Doing', colony: 'Colony', hostility: 'Mood',
  activity: 'Activity', danger: 'Danger',
  depth: 'Depth', crowding: 'Crowding', type: 'Type', volume: 'Volume', adults: 'Adults', brood: 'Brood', food: 'Food', entrances: 'Entrances', 'flood-risk': 'Flood risk',
  status: 'Opening', traffic: 'Traffic', mound: 'Mound', pellets: 'Pellets', chambers: 'Chambers',
  'site-overall': 'Site overall',
};

/** Rows whose value is a plain count worth showing although they carry no unit. */
const COUNT_KEYS = new Set(['users', 'rivals', 'entrances', 'pellets', 'chambers', 'traffic']);

export function rowLabel(key: string): string {
  if (LABELS[key]) return LABELS[key];
  if (key.startsWith('site-')) return `Site: ${key.slice(5).replace(/-/g, ' ')}`;
  const w = key.replace(/-/g, ' ');
  return w.charAt(0).toUpperCase() + w.slice(1);
}

function unitText(unit: string): string {
  if (unit === 'game days') return 'game days';
  return unit;
}

/**
 * Words that describe the number rather than classify it ("of stage", "left", "per game hour"): the number leads and the word
 * follows, "64 % of stage", "0.1 game days at current conditions". The other words classify it and keep the older order,
 * "damp (34 %)". A card must never read "Progress   of stage (64 %)".
 */
const TAIL_WORDS: ReadonlySet<string> = new Set([
  'of stage', 'at current conditions', 'left', 'surface', 'air', 'below ground', 'open', 'per game hour', 'in the mound', 'linked',
]);
const isTail = (word: string): boolean => TAIL_WORDS.has(word) || /^\d+ BU down$/.test(word);

/** Rows whose word only repeats the label or the unit: the number alone ("Adults   3 / 12", "Ours using it   2"). */
const NUMBER_ONLY = new Set(['users', 'rivals', 'entrances', 'adults', 'brood', 'food']);

function numberText(r: UiInspectRow & { value: number }): string {
  return r.unit === '%' ? String(Math.round(r.value)) : r.unit === 'game days' || r.unit === '°C' ? (Math.round(r.value * 10) / 10).toString() : loads(r.value);
}

/** "damp (34 %)", "sweet", "2 loads left", "64 % of stage": the number goes first when the word only describes it. */
export function rowValue(r: UiInspectRow): string {
  const word = r.word;
  // the label already says which nutrient: "Crop C   0.7 loads"
  if ((r.key === 'crop-c' || r.key === 'crop-p') && r.value !== null) return `${loads(r.value)} loads`;
  if (r.value === null) return word;
  const v = r as UiInspectRow & { value: number };
  if (!r.unit && !COUNT_KEYS.has(r.key)) return word;
  if (NUMBER_ONLY.has(r.key)) return r.unit ? `${Math.round(r.value)} ${r.unit}` : String(Math.round(r.value)); // occupancy counts: whole animals
  if (r.key === 'size' && r.unit === 'x L') return `${numberText(v)} \u00d7 our length`;
  const count = !r.unit;
  const n = count ? String(Math.round(r.value)) : numberText(v);
  const num = count ? n : `${n}${r.unit === '%' ? ' %' : ` ${unitText(r.unit)}`}`;
  if (isTail(word)) return /BU down$/.test(word) ? `${num}, ${word}` : `${num} ${word}`;
  return `${word} (${num})`;
}
