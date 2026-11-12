// The slot scheme (00-index B6, E-84): an `auto` ring of 3 labelled generations, `quick`, `slot-1`..`slot-5`, and the
// hidden `opening-start` checkpoint. Pure helpers: no storage, no clock.
import { SAVE_SLOT_IDS } from '@/sim/types/ids/progression';
import { AUTO_RING_SIZE, MANUAL_SLOT_COUNT } from './constants';
import type { SaveMeta, SlotId } from './types';

export const AUTO_KEYS: readonly string[] = Array.from({ length: AUTO_RING_SIZE }, (_, i) => `auto-${i + 1}`);
export const MANUAL_KEYS: readonly string[] = Array.from({ length: MANUAL_SLOT_COUNT }, (_, i) => `slot-${i + 1}`);
/** Every physical key a save can live under. */
export const ALL_KEYS: readonly string[] = [...AUTO_KEYS, 'quick', ...MANUAL_KEYS, 'opening-start'];

export function isSlotId(s: unknown): s is SlotId {
  return typeof s === 'string' && (SAVE_SLOT_IDS as readonly string[]).includes(s);
}

export function isKey(s: unknown): s is string {
  return typeof s === 'string' && ALL_KEYS.includes(s);
}

/** Logical slot of a physical key (`auto-2` -> `auto`), null for an unknown key. */
export function slotOfKey(key: string): SlotId | null {
  if (AUTO_KEYS.includes(key)) return 'auto';
  return isSlotId(key) && key !== 'auto' ? key : null;
}

export function isAutoKey(key: string): boolean {
  return AUTO_KEYS.includes(key);
}

/** "Auto-save", "Quick save", "Slot 3", "Opening checkpoint". */
export function titleOfKey(key: string): string {
  if (isAutoKey(key)) return 'Auto-save';
  if (key === 'quick') return 'Quick save';
  if (key === 'opening-start') return 'Opening checkpoint';
  const m = /^slot-(\d+)$/.exec(key);
  return m ? `Slot ${m[1]}` : key;
}

/** Slots a player may write by hand. Autosave, `opening-start` and ring cells are written by the game only. */
export function isManualTarget(slot: string): boolean {
  return slot === 'quick' || MANUAL_KEYS.includes(slot);
}

/**
 * Where the next autosave goes: an empty cell first; else the oldest generation that is not pinned (the `final`
 * save stays until a new game starts). All cells pinned (not reachable in play) overwrite the oldest.
 */
export function chooseAutoKey(metas: ReadonlyMap<string, SaveMeta>): string {
  for (const k of AUTO_KEYS) if (!metas.has(k)) return k;
  const cells = AUTO_KEYS.map((k) => metas.get(k) as SaveMeta);
  const free = cells.filter((m) => !m.pinned);
  const pool = free.length > 0 ? free : cells;
  return pool.reduce((a, b) => (b.generation < a.generation ? b : a)).key;
}

/** Generations of the ring, newest first. */
export function autoGenerations(metas: ReadonlyMap<string, SaveMeta>): SaveMeta[] {
  return AUTO_KEYS.map((k) => metas.get(k)).filter((m): m is SaveMeta => !!m).sort((a, b) => b.generation - a.generation);
}

export function nextGeneration(metas: ReadonlyMap<string, SaveMeta>): number {
  let g = 0;
  for (const k of AUTO_KEYS) g = Math.max(g, metas.get(k)?.generation ?? 0);
  return g + 1;
}

/** The oldest ring generation that is not `except` and not pinned (quota relief), or null. */
export function oldestDroppable(metas: ReadonlyMap<string, SaveMeta>, except: string | null): SaveMeta | null {
  const list = autoGenerations(metas).filter((m) => !m.pinned && m.key !== except);
  return list.length > 0 ? list[list.length - 1] : null;
}
