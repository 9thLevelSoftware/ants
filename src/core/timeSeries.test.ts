import { describe, expect, it } from 'vitest';
import { tsAt, tsClear, tsCreate, tsLast, tsMax, tsMean, tsMin, tsPush, tsToArray } from './timeSeries';

describe('timeSeries', () => {
  it('is plain JSON-safe data', () => {
    const ts = tsCreate(4);
    tsPush(ts, 1.5);
    const copy = JSON.parse(JSON.stringify(ts));
    expect(copy).toEqual(ts);
    tsPush(copy, 2);
    expect(tsToArray(copy)).toEqual([1.5, 2]);
    expect(() => tsCreate(0)).toThrow(RangeError);
    expect(() => tsCreate(2.5)).toThrow(RangeError);
  });

  it('push / at / toArray before and after wrap-around (oldest first)', () => {
    const ts = tsCreate(3);
    tsPush(ts, 1);
    tsPush(ts, 2);
    expect(tsToArray(ts)).toEqual([1, 2]);
    expect(tsAt(ts, 0)).toBe(1);
    expect(tsAt(ts, 2)).toBeUndefined();
    tsPush(ts, 3);
    tsPush(ts, 4);
    tsPush(ts, 5);
    expect(ts.len).toBe(3);
    expect(tsToArray(ts)).toEqual([3, 4, 5]);
    expect(tsAt(ts, 0)).toBe(3);
    expect(tsAt(ts, -1)).toBe(5);
    expect(tsAt(ts, -3)).toBe(3);
    expect(tsAt(ts, -4)).toBeUndefined();
    expect(tsLast(ts)).toBe(5);
  });

  it('min / max / mean over retained samples only, with a fallback when empty', () => {
    const ts = tsCreate(3);
    expect(tsMin(ts)).toBe(0);
    expect(tsMax(ts, -1)).toBe(-1);
    expect(tsMean(ts, 7)).toBe(7);
    expect(tsLast(ts, 3)).toBe(3);
    for (const v of [100, -5, 2, 8]) tsPush(ts, v); // 100 drops out
    expect(tsMin(ts)).toBe(-5);
    expect(tsMax(ts)).toBe(8);
    expect(tsMean(ts)).toBeCloseTo(5 / 3, 12);
  });

  it('toArray reuses an out array; clear resets', () => {
    const ts = tsCreate(5);
    for (let i = 0; i < 7; i++) tsPush(ts, i);
    const out = [99, 99, 99, 99, 99, 99, 99, 99];
    expect(tsToArray(ts, out)).toBe(out);
    expect(out).toEqual([2, 3, 4, 5, 6]);
    tsClear(ts);
    expect(ts.len).toBe(0);
    expect(tsToArray(ts)).toEqual([]);
    tsPush(ts, 9);
    expect(tsToArray(ts)).toEqual([9]);
  });
});
