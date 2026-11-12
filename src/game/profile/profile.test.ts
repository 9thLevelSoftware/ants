import { describe, expect, it } from 'vitest';
import type { DaughterRecord, FlightRecord, LineageColonyRecord } from '@/sim/types';
import { memoryKv } from '../save/localKv';
import { MemoryStorage } from '../save/memoryStorage';
import { PROFILE_STORAGE_KEY } from '../save/constants';
import { mergeProfiles, sanitizeProfile, trimLineage } from './merge';
import { emptyProfile, LIN_MAX_COLONIES, LIN_MAX_DAUGHTERS_PER_FLIGHT, PROFILE_KEY } from './model';
import { ProfileStore } from './profile';

const colony = (id: string, over: Partial<LineageColonyRecord> = {}): LineageColonyRecord => ({
  id, name: `Hollow Verge ${id}`, species: 'lasius-niger', worldSeed: 7, archetype: 'garden' as never, sizeId: 'standard', generation: 1,
  parentColonyId: '', parentFlightId: '', foundedDate: { tick: 0, doy: 10, year: 1 }, endedDate: null, endCause: '', peakWorkers: 10,
  gameYears: 1, winters: 0, alatesReared: 0, flights: 0, daughtersFounded: 0, rivalsDefeated: 0, milestones: ['ms-first-worker'], difficultyHistory: [],
  ...over,
});
const daughter = (id: string, flightId = 'f1', state: DaughterRecord['state'] = 'available'): DaughterRecord => ({
  id, motherColonyId: 'c1', flightId, species: 'lasius-niger', generation: 2, seed: 12345, archetypeHint: null, witnessed: false, landingZone: null, doy: 10, state,
});
const flight = (id: string): FlightRecord => ({
  id, tick: 1000, date: { tick: 1000, doy: 10, year: 2 }, weather: 'clear', nGynes: 20, nMales: 30, nLaunched: 50, nMated: 10, flightDeaths: 5, nLanded: 8, nFounded: 3,
  landingZones: [], possessed: false, daughterIds: [],
});

const noTimers = { setTimer: () => 1, clearTimer: () => {} };

describe('hints', () => {
  it('progress pending -> shown -> learned and never go backwards', () => {
    const p = new ProfileStore({ ...noTimers });
    p.markHintShown('hint-move');
    expect(p.hint('hint-move')).toEqual({ uses: 0, state: 'shown' });
    p.recordHintUse('hint-move', 2);
    expect(p.hint('hint-move')).toEqual({ uses: 1, state: 'shown' });
    p.recordHintUse('hint-move', 2);
    expect(p.hint('hint-move')).toEqual({ uses: 2, state: 'learned' });
    p.markHintShown('hint-move'); // too late: stays learned
    p.dismissHint('hint-move');
    expect(p.hint('hint-move')).toEqual({ uses: 2, state: 'learned' });
    p.dismissHint('hint-look');
    expect(p.hint('hint-look')?.state).toBe('dismissed');
  });

  it('resetHints sets every hint pending again and keeps codex and lineage', () => {
    const p = new ProfileStore({ ...noTimers });
    p.learnHint('hint-move');
    p.unlockCodex('cx-dew', { tick: 5, doy: 3, year: 1, species: 'lasius-niger' });
    p.upsertColony(colony('c1'));
    p.resetHints();
    expect(p.hint('hint-move')).toBeUndefined();
    expect(p.get().codex['cx-dew']).toBeDefined();
    expect(p.get().lineage.colonies).toHaveLength(1);
  });

  it('notifies subscribers per part', () => {
    const p = new ProfileStore({ ...noTimers });
    const parts: string[] = [];
    p.subscribe((_d, part) => parts.push(part));
    p.learnHint('hint-move');
    p.unlockCodex('cx-dew', { tick: 1, doy: 1, year: 1, species: 'lasius-niger' });
    p.upsertColony(colony('c1'));
    expect(parts).toEqual(['hints', 'codex', 'lineage']);
  });
});

describe('codex', () => {
  it('first unlock wins; repeats and malformed ids are ignored', () => {
    const p = new ProfileStore({ ...noTimers, nowIso: () => '2026-01-01T00:00:00.000Z' });
    expect(p.unlockCodex('cx-dew', { tick: 10, doy: 3, year: 1, species: 'lasius-niger' })).toBe(true);
    expect(p.unlockCodex('cx-dew', { tick: 99, doy: 9, year: 3, species: 'lasius-niger' })).toBe(false);
    expect(p.unlockCodex('not-a-codex-id', { tick: 1, doy: 1, year: 1, species: 'lasius-niger' })).toBe(false);
    expect(p.get().codex['cx-dew']).toEqual({ tick: 10, doy: 3, year: 1, species: 'lasius-niger', firstSeenIso: '2026-01-01T00:00:00.000Z' });
    expect(p.isCodexUnlocked('cx-dew')).toBe(true);
  });
});

describe('merge-safe updates', () => {
  it('merging two profiles loses nothing and is order-independent for ids, counters and states', () => {
    const a = emptyProfile();
    a.hints['hint-move'] = { uses: 3, state: 'learned' };
    a.hints['hint-look'] = { uses: 0, state: 'shown' };
    a.codex['cx-dew'] = { tick: 1, doy: 1, year: 1, species: 'lasius-niger', firstSeenIso: '2026-02-01T00:00:00Z' };
    a.lineage.colonies = [colony('c1', { peakWorkers: 50, milestones: ['ms-a'] })];
    const b = emptyProfile();
    b.hints['hint-move'] = { uses: 1, state: 'shown' };
    b.hints['hint-look'] = { uses: 2, state: 'learned' };
    b.codex['cx-dew'] = { tick: 9, doy: 9, year: 9, species: 'lasius-niger', firstSeenIso: '2026-01-01T00:00:00Z' }; // earlier
    b.codex['cx-wind'] = { tick: 2, doy: 2, year: 1, species: 'lasius-niger', firstSeenIso: '2026-03-01T00:00:00Z' };
    b.lineage.colonies = [colony('c1', { peakWorkers: 20, milestones: ['ms-b'], endedDate: { tick: 500, doy: 4, year: 2 }, endCause: 'starvation' }), colony('c2')];
    for (const [x, y] of [[a, b], [b, a]]) {
      const m = mergeProfiles(x, y);
      expect(m.hints['hint-move']).toEqual({ uses: 3, state: 'learned' });
      expect(m.hints['hint-look']).toEqual({ uses: 2, state: 'learned' });
      expect(Object.keys(m.codex).sort()).toEqual(['cx-dew', 'cx-wind']);
      expect(m.codex['cx-dew'].firstSeenIso).toBe('2026-01-01T00:00:00Z');
      const c1 = m.lineage.colonies.find((c) => c.id === 'c1')!;
      expect(c1.peakWorkers).toBe(50);
      expect(c1.milestones.sort()).toEqual(['ms-a', 'ms-b']);
      expect(c1.endedDate).toEqual({ tick: 500, doy: 4, year: 2 }); // ended wins
      expect(c1.endCause).toBe('starvation');
      expect(m.lineage.colonies).toHaveLength(2);
    }
  });

  it('a founded daughter never becomes available again', () => {
    const p = new ProfileStore({ ...noTimers });
    p.upsertDaughters([daughter('d1'), daughter('d2')]);
    p.setDaughterState('d1', 'founded');
    p.upsertDaughters([daughter('d1', 'f1', 'available')]); // a stale copy from another tab
    expect(p.get().lineage.daughters.find((d) => d.id === 'd1')!.state).toBe('founded');
    expect(p.get().lineage.daughters.find((d) => d.id === 'd2')!.state).toBe('available');
  });

  it('upserting the same colony twice is idempotent; an ended record stays ended', () => {
    const p = new ProfileStore({ ...noTimers });
    p.upsertColony(colony('c1'));
    p.upsertColony(colony('c1', { endedDate: { tick: 9, doy: 1, year: 2 }, endCause: 'queen-death' }));
    p.upsertColony(colony('c1')); // a late write of the living record
    const c = p.get().lineage.colonies;
    expect(c).toHaveLength(1);
    expect(c[0].endedDate).not.toBeNull();
  });

  it('write merges the stored profile first, so another tab\'s progress survives (IndexedDB path)', async () => {
    const storage = new MemoryStorage({ persistent: true });
    const a = new ProfileStore({ storage, ...noTimers });
    const b = new ProfileStore({ storage, ...noTimers });
    await a.load(); await b.load();
    a.learnHint('hint-move');
    b.learnHint('hint-look');
    await a.flush();
    await b.flush(); // b merges what a stored before writing
    const c = new ProfileStore({ storage, ...noTimers });
    await c.load();
    expect(c.hint('hint-move')?.state).toBe('learned');
    expect(c.hint('hint-look')?.state).toBe('learned');
  });

  it('reset replaces what is stored instead of merging it back', async () => {
    const storage = new MemoryStorage({ persistent: true });
    const a = new ProfileStore({ storage, ...noTimers });
    await a.load();
    a.learnHint('hint-move');
    a.unlockCodex('cx-dew', { tick: 1, doy: 1, year: 1, species: 'lasius-niger' });
    await a.flush();
    a.reset(['hints']);
    await a.flush();
    const b = new ProfileStore({ storage, ...noTimers });
    await b.load();
    expect(b.hint('hint-move')).toBeUndefined();
    expect(b.isCodexUnlocked('cx-dew')).toBe(true);
    a.reset();
    await a.flush();
    const c = new ProfileStore({ storage, ...noTimers });
    await c.load();
    expect(c.get()).toEqual(emptyProfile());
  });
});

describe('sanitising and caps', () => {
  it('drops malformed records and unknown ids, keeps valid ones', () => {
    const s = sanitizeProfile({
      hints: { 'hint-move': { uses: 2, state: 'learned' }, 'hint-bogus': { uses: 1, state: 'learned' }, 'hint-look': { uses: 'x', state: 'learned' }, 'hint-dig': { uses: -3, state: 'shown' } },
      codex: { 'cx-dew': { tick: 1, doy: 2, year: 3, species: 'lasius-niger', firstSeenIso: 'x' }, 'BAD ID': {}, 'cx-wind': 5 },
      lineage: { colonies: [colony('c1'), { name: 'no id' }, 7, null], flights: [flight('f1'), {}], daughters: [daughter('d1'), { id: '' }], settings: { sort: 'newest', n: 3, bad: {} } },
    });
    expect(Object.keys(s.hints).sort()).toEqual(['hint-dig', 'hint-move']);
    expect(s.hints['hint-dig']).toEqual({ uses: 0, state: 'shown' });
    expect(Object.keys(s.codex)).toEqual(['cx-dew']);
    expect(s.lineage.colonies.map((c) => c.id)).toEqual(['c1']);
    expect(s.lineage.flights.map((f) => f.id)).toEqual(['f1']);
    expect(s.lineage.daughters.map((d) => d.id)).toEqual(['d1']);
    expect(s.lineage.settings).toEqual({ sort: 'newest', n: 3 });
    for (const junk of [null, 1, 'x', [], undefined]) expect(sanitizeProfile(junk)).toEqual(emptyProfile());
  });

  it('caps daughters per flight, colonies overall (oldest ended first)', () => {
    const p = emptyProfile();
    p.lineage.daughters = Array.from({ length: 20 }, (_, i) => daughter(`d${i}`, 'f1', i < 3 ? 'founded' : 'available'));
    trimLineage(p);
    expect(p.lineage.daughters).toHaveLength(LIN_MAX_DAUGHTERS_PER_FLIGHT);
    expect(p.lineage.daughters.filter((d) => d.state === 'founded')).toHaveLength(0); // available ones are kept first

    const q = emptyProfile();
    q.lineage.colonies = Array.from({ length: LIN_MAX_COLONIES + 5 }, (_, i) => colony(`c${i}`, i % 2 === 0 ? { endedDate: { tick: 1, doy: 1, year: 1 } } : {}));
    trimLineage(q);
    expect(q.lineage.colonies).toHaveLength(LIN_MAX_COLONIES);
    expect(q.lineage.colonies.some((c) => c.id === 'c0')).toBe(false); // the oldest ended went first
    expect(q.lineage.colonies.some((c) => c.id === 'c1')).toBe(true); // living ones stay
  });
});

describe('persistence back ends', () => {
  it('falls back to localStorage when IndexedDB is unavailable, and to memory when both are', async () => {
    class Broken extends MemoryStorage {
      override async get() { return { ok: false as const, status: 'unavailable' as const, message: 'x' }; }
      override async write() { return { ok: false as const, status: 'unavailable' as const, message: 'x' }; }
    }
    const kv = memoryKv();
    const p = new ProfileStore({ storage: new Broken(), kv, ...noTimers });
    expect((await p.load()).backend).toBe('localstorage');
    p.learnHint('hint-move');
    await p.flush();
    expect(JSON.parse(kv.map.get(PROFILE_STORAGE_KEY)!).profile.hints['hint-move'].state).toBe('learned');
    const p2 = new ProfileStore({ storage: new Broken(), kv, ...noTimers });
    await p2.load();
    expect(p2.hint('hint-move')?.state).toBe('learned');

    const none = new ProfileStore({ storage: new Broken(), kv: memoryKv(false), ...noTimers });
    const st = await none.load();
    expect(st).toMatchObject({ backend: 'memory', persistent: false });
    none.learnHint('hint-move');
    await none.flush(); // must not throw
    expect(none.hint('hint-move')?.state).toBe('learned');
  });

  it('a volatile storage (the in-memory fallback) is not used for the profile: localStorage is', async () => {
    const kv = memoryKv();
    const p = new ProfileStore({ storage: new MemoryStorage(), kv, ...noTimers });
    expect(await p.load()).toMatchObject({ backend: 'localstorage', persistent: true });
    p.learnHint('hint-move');
    await p.flush();
    expect(kv.map.has(PROFILE_STORAGE_KEY)).toBe(true);
  });

  it('migrates a localStorage-only profile into IndexedDB on the first write', async () => {
    const kv = memoryKv();
    kv.map.set(PROFILE_STORAGE_KEY, JSON.stringify({ v: 1, profile: { hints: { 'hint-move': { uses: 3, state: 'learned' } } } }));
    const storage = new MemoryStorage({ persistent: true });
    const p = new ProfileStore({ storage, kv, ...noTimers });
    await p.load();
    expect(p.hint('hint-move')?.state).toBe('learned');
    p.learnHint('hint-look');
    await p.flush();
    const raw = (await storage.get('profile', PROFILE_KEY)) as { ok: true; value: { profile: { hints: Record<string, unknown> } } };
    expect(Object.keys(raw.value.profile.hints).sort()).toEqual(['hint-look', 'hint-move']);
  });

  it('a damaged stored profile is reported and does not break the game', async () => {
    const storage = new MemoryStorage({ persistent: true });
    await storage.write([{ op: 'put', store: 'profile', key: PROFILE_KEY, value: 'garbage' }]);
    const p = new ProfileStore({ storage, ...noTimers });
    expect((await p.load()).loaded).toBe('damaged');
    p.learnHint('hint-move');
    await p.flush();
    expect(p.hint('hint-move')?.state).toBe('learned');
  });

  it('exports the lineage as lineage.json text', () => {
    const p = new ProfileStore({ ...noTimers });
    p.upsertColony(colony('c1'));
    const j = JSON.parse(p.exportLineageJson());
    expect(j.format).toBe('foundress-lineage');
    expect(j.lineage.colonies[0].id).toBe('c1');
  });
});
