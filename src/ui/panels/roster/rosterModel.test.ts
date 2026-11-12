import { describe, expect, it } from 'vitest';
import { comparator, defaultQuery, matchesQuery, nextSort, orderIsStale, queryOrderKey, roleOfTask, type RosterAnt } from './rosterModel';

const ant = (id: number, o: Partial<RosterAnt> = {}): RosterAnt => ({
  id, caste: 'worker', task: 'forage', physioAgeGd: 5, hp: 10, maxHp: 10, cropC: 0, cropP: 0, chamberId: -1, nestId: -1, carry: { kind: 'none' }, ...o,
});

describe('matchesQuery', () => {
  const q = defaultQuery();
  it('passes everything by default', () => {
    expect(matchesQuery(ant(1), q, 'forage')).toBe(true);
  });
  it('filters by caste: worker covers the polymorphic worker castes', () => {
    expect(matchesQuery(ant(1, { caste: 'major' }), { ...q, caste: 'worker' }, 'forage')).toBe(true);
    expect(matchesQuery(ant(1, { caste: 'queen' }), { ...q, caste: 'worker' }, 'idle')).toBe(false);
    expect(matchesQuery(ant(1, { caste: 'queen' }), { ...q, caste: 'queen' }, 'idle')).toBe(true);
  });
  it('filters by task group and by location', () => {
    expect(matchesQuery(ant(1), { ...q, group: 'nurse' }, 'forage')).toBe(false);
    expect(matchesQuery(ant(1), { ...q, group: 'forage' }, 'forage')).toBe(true);
    expect(matchesQuery(ant(1, { nestId: 2, chamberId: 5 }), { ...q, where: 'nest' }, 'forage')).toBe(true);
    expect(matchesQuery(ant(1, { nestId: 2 }), { ...q, where: 'outside' }, 'forage')).toBe(false);
    expect(matchesQuery(ant(1), { ...q, where: 'outside' }, 'forage')).toBe(true);
  });
  it('searches the id with or without zero padding and a leading #', () => {
    expect(matchesQuery(ant(412), { ...q, search: '412' }, 'idle')).toBe(true);
    expect(matchesQuery(ant(412), { ...q, search: '0412' }, 'idle')).toBe(true);
    expect(matchesQuery(ant(412), { ...q, search: '#41' }, 'idle')).toBe(true);
    expect(matchesQuery(ant(412), { ...q, search: '99' }, 'idle')).toBe(false);
  });
});

describe('sorting', () => {
  it('sorts by a column with id as the tie-break, both directions', () => {
    const rows = [ant(3, { physioAgeGd: 2 }), ant(1, { physioAgeGd: 9 }), ant(2, { physioAgeGd: 2 })];
    expect([...rows].sort(comparator('age', 'asc')).map((a) => a.id)).toEqual([2, 3, 1]);
    expect([...rows].sort(comparator('age', 'desc')).map((a) => a.id)).toEqual([1, 2, 3]);
  });
  it('sorts text columns', () => {
    const rows = [ant(1, { task: 'nurse' }), ant(2, { task: 'dig' }), ant(3, { task: 'forage' })];
    expect([...rows].sort(comparator('task', 'asc')).map((a) => a.task)).toEqual(['dig', 'forage', 'nurse']);
  });
  it('a header click flips the direction on the same key and starts ascending (descending for numbers) on a new one', () => {
    const q = defaultQuery();
    expect(nextSort(q, 'id')).toEqual({ sort: 'id', dir: 'desc' });
    expect(nextSort(q, 'task')).toEqual({ sort: 'task', dir: 'asc' });
    expect(nextSort(q, 'health')).toEqual({ sort: 'health', dir: 'desc' });
  });
  it('detects a stale order', () => {
    const fresh = [ant(1, { hp: 9 }), ant(2, { hp: 5 })];
    expect(orderIsStale(fresh, 'health', 'desc')).toBe(false);
    expect(orderIsStale([ant(1, { hp: 3 }), ant(2, { hp: 5 })], 'health', 'desc')).toBe(true);
    expect(orderIsStale([ant(2), ant(1)], 'id', 'asc')).toBe(false); // by id the list is never stale
  });
});

describe('query keys and roles', () => {
  it('the order key ignores the scroll window but not the filters or the re-sort token', () => {
    const q = defaultQuery();
    expect(queryOrderKey({ ...q, offset: 40 })).toBe(queryOrderKey(q));
    expect(queryOrderKey({ ...q, group: 'dig' })).not.toBe(queryOrderKey(q));
    expect(queryOrderKey({ ...q, resort: 1 })).not.toBe(queryOrderKey(q));
  });
  it('maps tasks to the quick-possess roles', () => {
    expect(roleOfTask('scout')).toBe('forager');
    expect(roleOfTask('haul')).toBe('digger');
    expect(roleOfTask('queen-care')).toBe('nurse');
    expect(roleOfTask('idle')).toBeNull();
  });
});
