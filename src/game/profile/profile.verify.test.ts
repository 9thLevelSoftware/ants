// Independent review tests for the profile store (task save). Comments marked BUG describe defects found, since fixed.
import { describe, expect, it } from 'vitest';
import { memoryKv } from '../save/localKv';
import { MemoryStorage } from '../save/memoryStorage';
import { mergeProfiles, sanitizeProfile } from './merge';
import { emptyProfile } from './model';
import { ProfileStore } from './profile';

const noTimers = { setTimer: () => 1, clearTimer: () => {} };

describe('review: profile reset and merge-safe writes', () => {
  // BUG: writeOnce() checks `resetting` BEFORE awaiting the stored copy. A "Reset hints" clicked while a write is in
  // flight is merged away: the in-flight write reads the stored (old) hints, merges them back into memory and writes
  // them; the reset's own write then merges them again. The player's reset silently does nothing.
  it('resetHints during an in-flight write still resets the hints', async () => {
    const storage = new MemoryStorage({ persistent: true });
    const p = new ProfileStore({ storage, ...noTimers });
    await p.load();
    p.learnHint('hint-move');
    await p.flush(); // stored: hint-move learned
    p.learnHint('hint-look');
    const inFlight = p.flush(); // started, awaiting the stored copy
    p.resetHints(); // the player clicks "Reset hints" now
    await inFlight;
    await p.flush();
    expect(p.hints()).toEqual({}); // actual: hint-move (stored before the reset) is back
    const q = new ProfileStore({ storage, ...noTimers });
    await q.load();
    expect(q.hints()).toEqual({});
  });

  it('a reset whose write failed is undone by the next write (it merges the old stored hints back)', async () => {
    const storage = new MemoryStorage({ persistent: true });
    const p = new ProfileStore({ storage, kv: memoryKv(false), ...noTimers });
    await p.load();
    p.learnHint('hint-move');
    await p.flush();
    p.resetHints();
    storage.failNextWrites = 1;
    await p.flush(); // the write fails
    p.learnHint('hint-look');
    await p.flush();
    expect(p.hint('hint-move')).toBeUndefined();
  });

  it('merge is commutative for hints, codex and lineage ids', () => {
    const a = sanitizeProfile({ hints: { 'hint-move': { uses: 3, state: 'learned' } }, codex: { 'cx-dew': { tick: 5, doy: 1, year: 1, species: 'lasius-niger', firstSeenIso: '2026-01-02T00:00:00.000Z' } } });
    const b = sanitizeProfile({ hints: { 'hint-move': { uses: 1, state: 'shown' }, 'hint-look': { uses: 0, state: 'dismissed' } }, codex: { 'cx-dew': { tick: 9, doy: 2, year: 1, species: 'lasius-niger', firstSeenIso: '2026-01-01T00:00:00.000Z' } } });
    const ab = mergeProfiles(a, b), ba = mergeProfiles(b, a);
    expect(ab.hints).toEqual(ba.hints);
    expect(ab.codex).toEqual(ba.codex);
    expect(ab.codex['cx-dew'].firstSeenIso).toBe('2026-01-01T00:00:00.000Z');
  });

  it('sanitising hostile input never pollutes prototypes and drops unknown hint ids', () => {
    const raw = JSON.parse('{"hints":{"__proto__":{"uses":1,"state":"learned"},"hint-nope":{"uses":1,"state":"learned"}},"codex":{"__proto__":{"tick":1}},"lineage":{"settings":{"__proto__":{"x":1}}}}');
    const p = sanitizeProfile(raw);
    expect(Object.keys(p.hints)).toEqual([]);
    expect(({} as Record<string, unknown>).x).toBeUndefined();
    expect(({} as Record<string, unknown>).uses).toBeUndefined();
    expect(p.lineage).toEqual(emptyProfile().lineage);
  });
});
