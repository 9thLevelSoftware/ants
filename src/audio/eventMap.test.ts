// The coverage table: every event type in the simulation's event unions is mapped to a sound, covered by a cue the sim
// emits with it, or listed as deliberately silent with a reason. Reads the event files themselves, so an event the sim
// adds later fails this test (and the typecheck, see EVENT_MAP_IS_EXHAUSTIVE) until the audio decides what to do.
import { describe, expect, it } from 'vitest';
import { CUE_IDS } from '@/sim/types/ids/progression';
import { EVENT_DISPOSITION, EVENT_MAP_IS_EXHAUSTIVE } from './eventMap';
import { CUE_SOUNDS } from './cueTable';

/** The source text of src/sim/types/events*.ts (Vite's raw import: no node types in this project). */
const EVENT_SOURCES = import.meta.glob('../sim/types/events*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

/** Every `type: '<name>'` discriminant declared in those files. */
function simEventTypes(): string[] {
  const out = new Set<string>();
  for (const src of Object.values(EVENT_SOURCES)) for (const m of src.matchAll(/\btype: '([a-zA-Z0-9._-]+)'/g)) out.add(m[1]);
  return [...out].sort();
}

describe('event coverage table', () => {
  const types = simEventTypes();

  it('finds the event unions (a sanity floor so the scan cannot silently read nothing)', () => {
    expect(types.length).toBeGreaterThan(190);
    expect(types).toEqual(expect.arrayContaining(['cue', 'human.telegraph', 'weather.thunder', 'bird-landed', 'flood-started', 'rival-raid-started']));
  });

  it('is exhaustive at compile time', () => {
    expect(EVENT_MAP_IS_EXHAUSTIVE).toBe(true);
  });

  it('lists every simulation event type: none missing, none stale', () => {
    const listed = Object.keys(EVENT_DISPOSITION).sort();
    expect(types.filter((t) => !listed.includes(t))).toEqual([]);
    expect(listed.filter((t) => !types.includes(t))).toEqual([]);
  });

  it('gives every silent event a reason and every covered event the sound that covers it', () => {
    for (const [type, d] of Object.entries(EVENT_DISPOSITION)) {
      if (d.mode === 'silent') expect(d.why.length, type).toBeGreaterThan(8);
      if (d.mode === 'covered') expect(d.by.length, type).toBeGreaterThan(8);
      if (d.mode === 'sound') expect(d.note.length, type).toBeGreaterThan(8);
    }
  });

  it('maps the Stage 2 systems the task names', () => {
    const sounds = new Set(Object.entries(EVENT_DISPOSITION).filter(([, d]) => d.mode === 'sound').map(([t]) => t));
    for (const t of [
      'predator-telegraph', 'predator-strike', 'bird-approach', 'bird-left', 'antlion-grab', // creatures
      'combat-lock', 'combat-spray', 'ant-seized', // combat
      'rival-discovered', 'rival-raid-started', 'rival-encounter', // rivals
      'weather.changed', 'weather.gust', 'weather.thunder', 'weather.puddle', 'flood-started', 'world.cave-in', // weather and water
      'human.telegraph', 'human.start', 'human.impact', 'human.end', 'human.bait-placed', // human events
      'egg-laid', 'founding-sealed', 'opening.handover', 'milestone.reached', 'stage.changed', // founding and progression
    ]) expect(sounds.has(t), t).toBe(true);
  });

  it('every fixed cue id the sim can emit has an entry in the cue table (sound or deliberately silent)', () => {
    for (const id of CUE_IDS) {
      const s = CUE_SOUNDS[id];
      expect(s, id).toBeDefined();
      if (s.silent) expect(s.note, id).toBeTruthy();
    }
  });
});
