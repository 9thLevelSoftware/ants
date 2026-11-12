import { describe, expect, it } from 'vitest';
import * as T from '@/sim/types';

/** Every exported UPPER_CASE array of strings in the contracts is an identifier set. */
const SETS = Object.entries(T).filter(
  ([k, v]) => /^[A-Z][A-Z0-9_]+$/.test(k) && Array.isArray(v) && v.every((x) => typeof x === 'string'),
) as [string, readonly string[]][];

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Sets whose ids are not plain kebab-case, and the form they follow instead (registry B / contracts style).
 * Anything not listed here must be kebab-case.
 */
const EXCEPTIONS: Record<string, { why: string; re: RegExp }> = {
  BEHAVIOUR_STATES: { why: '<task>.<state> (registry B3)', re: /^[a-z-]+(\.[a-z-]+)?$/ },
  RNG_STREAMS: { why: 'dotted rng.<name> (registry B5)', re: /^rng(\.[a-z]+)+$/ },
  TASK_SUBTYPES: { why: '<task>:<subtype> (registry B3)', re: /^[a-z-]+:[a-z-]+$/ },
  SITE_FACTORS: { why: 'camelCase factor keys (registry B6)', re: /^[a-z][A-Za-z]*$/ },
  SUITABILITY_FACTORS: { why: 'camelCase f-factors (registry B5)', re: /^f[A-Z][a-z]+$/ },
  DIRECTIVE_EXTRAS: { why: 'directive keys are camelCase field names (registry B3)', re: /^[a-z][A-Za-z]*$/ },
  SEED_CLASSES: { why: 'S / M / L (registry B7)', re: /^[SML]$/ },
  SPECIES_TIERS: { why: 'T1 / T2 / T3', re: /^T[1-3]$/ },
  LARVA_FOODS: { why: 'GDD 07 A.0 values joined with +', re: /^[a-z-]+(\+[a-z-]+)*$/ },
  MIDDEN_STYLES: { why: 'GDD 07 A.0 values joined with +', re: /^[a-z-]+(\+[a-z-]+)*$/ },
  COMMAND_TYPES: { why: 'camelCase command types, cheat.<camelCase> (registry B9)', re: /^(cheat\.)?[a-z][A-Za-z]*$/ },
};

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
    expect(SETS.length).toBeGreaterThan(70);
    for (const [name, arr] of SETS) {
      expect(arr.length, name).toBeGreaterThan(0);
      expect(new Set(arr).size, name).toBe(arr.length);
    }
  });

  it('every id is kebab-case, or follows its documented exception', () => {
    const bad: string[] = [];
    for (const [name, arr] of SETS) {
      const rule = EXCEPTIONS[name]?.re ?? KEBAB;
      for (const id of arr) if (!rule.test(id)) bad.push(`${name}: ${id}`);
    }
    expect(bad).toEqual([]);
    for (const name of Object.keys(EXCEPTIONS)) expect(SETS.map(([k]) => k), name).toContain(name);
  });

  it('every concrete codex id is unique and carries cx-', () => {
    const all = T.allCodexIds();
    expect(new Set(all).size).toBe(all.length);
    for (const id of all) expect(id, id).toMatch(/^cx-[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('keeps the J canonical members and the registry counts', () => {
    expect(T.TASKS.slice(0, 17)).toEqual(['idle', 'rest', 'nurse', 'queen-care', 'scout', 'forage', 'tend', 'store',
      'dig', 'haul', 'guard', 'patrol', 'fight', 'flee', 'garden', 'cut', 'mill']);
    expect(T.TASK_COUNT).toBe(18);
    expect(T.MATERIALS).toContain('wood-decayed');
    expect(T.CREATURE_KINDS).toHaveLength(21);
    expect(T.DIAGNOSTIC_IDS).toHaveLength(62);
    expect(T.ALERT_KINDS).toHaveLength(35);
    expect(T.MILESTONE_IDS).toHaveLength(59);
    expect(T.CODEX_IDS.slice(0, 57)).toContain('cx-interface-orders');
    for (const id of T.DIAGNOSTIC_IDS) expect(id).toMatch(/^diag-/);
    for (const id of T.MILESTONE_IDS) expect(id).toMatch(/^ms-/);
    for (const id of T.AIM_IDS) expect(id).toMatch(/^aim-/);
    for (const id of T.HINT_IDS) expect(id).toMatch(/^hint-/);
  });

  it('uses only the final names of registry B (no aliases left behind)', () => {
    expect(T.DEATH_CAUSES).not.toContain('flood');
    expect(T.DEATH_CAUSES).not.toContain('lifespan');
    expect(T.DEATH_CAUSES).not.toContain('exposure');
    expect(T.DIAGNOSTIC_STATUSES).toEqual(['ok', 'info', 'warn', 'bad']);
    expect(T.REGIONS).toEqual(['temperate-eu', 'ne-america', 'mediterranean', 'southern-us']);
    expect(T.POSSESSION_END_REASONS).toEqual(['player', 'afk', 'colony-view', 'timelapse', 'switch', 'death']);
    expect(T.SEASON_LENGTHS).toEqual([5, 7, 10]);
  });

  it('lists every command type once', () => {
    expect(new Set(T.COMMAND_TYPES).size).toBe(T.COMMAND_TYPES.length);
  });
});
