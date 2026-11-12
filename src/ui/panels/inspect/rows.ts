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

/** "damp (34 %)", "sweet", "2 loads left": the word, then the number in brackets when it carries a unit. */
export function rowValue(r: UiInspectRow): string {
  const word = r.word;
  // the label already says which nutrient: "Crop C   0.7 loads"
  if ((r.key === 'crop-c' || r.key === 'crop-p') && r.value !== null) return `${loads(r.value)} loads`;
  if (r.value === null || (!r.unit && !COUNT_KEYS.has(r.key))) return word;
  if (COUNT_KEYS.has(r.key) && !r.unit) return `${word} (${Math.round(r.value)})`;
  const n = r.unit === '%' ? String(Math.round(r.value)) : r.unit === 'game days' || r.unit === '°C' ? (Math.round(r.value * 10) / 10).toString() : loads(r.value);
  return `${word} (${n}${r.unit === '%' ? ' %' : ` ${unitText(r.unit)}`})`;
}
