import { describe, expect, it } from 'vitest';
import * as T from '@/sim/types';

/** Every exported UPPER_CASE array of strings in the contracts is an identifier set. */
const SETS = Object.entries(T).filter(([k, v]) => /^[A-Z][A-Z0-9_]+$/.test(k) && Array.isArray(v)) as [string, readonly unknown[]][];

describe('canonical identifier sets', () => {
  it('exports the directions §J sets', () => {
    const names = SETS.map(([k]) => k);
    for (const n of ['SPECIES_IDS', 'CASTES', 'BROOD_STAGES', 'TASKS', 'CHAMBER_TYPES', 'ZONE_TYPES', 'MATERIALS',
      'FOOD_KINDS', 'CREATURE_KINDS', 'WEATHER_STATES', 'SEASONS', 'MARKER_KINDS', 'PHERO_CHANNELS',
      'HUMAN_EVENT_KINDS', 'DIFFICULTY_IDS']) {
      expect(names, n).toContain(n);
    }
  });

  it('every set is non-empty and has no duplicates', () => {
    expect(SETS.length).toBeGreaterThan(60);
    for (const [name, arr] of SETS) {
      expect(arr.length, name).toBeGreaterThan(0);
      expect(new Set(arr).size, name).toBe(arr.length);
    }
  });

  it('keeps the J canonical members', () => {
    expect(T.TASKS.slice(0, 17)).toEqual(['idle', 'rest', 'nurse', 'queen-care', 'scout', 'forage', 'tend', 'store',
      'dig', 'haul', 'guard', 'patrol', 'fight', 'flee', 'garden', 'cut', 'mill']);
    expect(T.MATERIALS).toContain('wood-decayed');
    expect(T.CREATURE_KINDS).toHaveLength(21);
  });

  it('lists every command type once', () => {
    expect(new Set(T.COMMAND_TYPES).size).toBe(T.COMMAND_TYPES.length);
  });
});
