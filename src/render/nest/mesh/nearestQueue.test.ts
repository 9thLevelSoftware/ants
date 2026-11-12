import { describe, expect, it } from 'vitest';
import { NearestQueue } from './nearestQueue';

describe('NearestQueue', () => {
  it('pops nearest first to within one bucket, skips deleted keys, and re-buckets only after the camera moved', () => {
    const q = new NearestQueue(10, 20);
    for (let i = 0; i < 100; i++) q.add(i, i * 10 + 5, 0, 0); // key i at x = 10 i + 5
    q.delete(0);
    expect(q.pop(0, 0, 0)).toBe(1);
    expect(q.pop(0, 0, 0)).toBe(2);
    expect(q.reorders).toBe(1);
    q.add(500, 3, 0, 0); // added after ordering: goes straight into its bucket
    expect(q.pop(0, 0, 0)).toBe(500);
    // the camera moves far: the order follows it
    expect(q.pop(1000, 0, 0)).toBe(99);
    expect(q.reorders).toBe(2);
    expect(q.size).toBe(96);
    const rest: number[] = [];
    for (let k = q.pop(1000, 0, 0); k !== undefined; k = q.pop(1000, 0, 0)) rest.push(k);
    expect(rest.length).toBe(96);
    for (let i = 1; i < rest.length; i++) expect(rest[i]).toBeLessThan(rest[i - 1] + 1.5); // descending x, bucket slack
    expect(q.pop(0, 0, 0)).toBeUndefined();
  });

  it('a key deleted and added again is returned once', () => {
    const q = new NearestQueue(10, 1000);
    q.add(1, 0, 0, 0); q.add(2, 50, 0, 0);
    expect(q.pop(0, 0, 0)).toBe(1);
    q.add(1, 100, 0, 0); q.delete(1); q.add(1, 100, 0, 0);
    expect([q.pop(0, 0, 0), q.pop(0, 0, 0), q.pop(0, 0, 0)]).toEqual([2, 1, undefined]);
  });
});
