// Plain-words descriptions of saves for the slot cards and the Continue line (GDD 08 3.3, 7.6). Pure.
import type { SaveSlotInfo } from '../../api';
import { SPECIES_CARDS } from '../newgame/species';

export const SLOT_IDS = ['quick', 'slot-1', 'slot-2', 'slot-3', 'slot-4', 'slot-5'] as const;

export function slotTitle(slot: string): string {
  if (slot === 'quick') return 'Quick save';
  if (slot.startsWith('slot-')) return `Slot ${slot.slice(5)}`;
  if (slot.startsWith('auto')) return 'Autosave';
  return slot;
}

export function isAutoSlot(info: Pick<SaveSlotInfo, 'slot' | 'kind'>): boolean {
  return info.kind === 'auto' || info.slot.startsWith('auto');
}

/** "Saved 3 min ago" style text from seconds. */
export function agoText(agoS: number): string {
  if (agoS < 10) return 'just now';
  if (agoS < 60) return `${Math.round(agoS)} s ago`;
  const m = Math.round(agoS / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

export function playTimeText(s: number): string {
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}

export function speciesName(id: string | undefined): string {
  return SPECIES_CARDS.find((c) => c.id === id)?.binomial ?? id ?? '';
}

/** Date-time as the player's locale writes it; invalid input falls back to the raw string. */
export function savedAtText(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** The newest save by timestamp (the Continue target). */
export function newestSave(list: readonly SaveSlotInfo[]): SaveSlotInfo | null {
  let best: SaveSlotInfo | null = null;
  for (const s of list) if (!best || Date.parse(s.savedAt) > Date.parse(best.savedAt) || (Number.isNaN(Date.parse(best.savedAt)) && !Number.isNaN(Date.parse(s.savedAt)))) best = s;
  return best;
}

/** One line for the Continue item: species, date label, population, when it was saved. */
export function continueLine(s: SaveSlotInfo): string {
  const parts = [speciesName(s.species), s.dateLabel ?? `Day ${s.colonyDay}`, `${s.population ?? s.workers} workers`, savedAtText(s.savedAt)];
  return parts.filter(Boolean).join(' · ');
}
