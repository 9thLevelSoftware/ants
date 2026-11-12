// Fixed-capacity ring buffer of numbers stored as plain data (JSON-safe), for statistics history in SimState.
// All helpers are pure functions over the record; index 0 is the OLDEST retained sample.

export interface TimeSeries {
  cap: number; // maximum number of samples kept
  len: number; // samples currently stored, 0..cap
  head: number; // slot the next push writes, 0..cap-1
  data: number[]; // length cap
}

export function tsCreate(cap: number): TimeSeries {
  if (!(cap >= 1) || !Number.isInteger(cap)) throw new RangeError(`tsCreate: capacity must be a positive integer, got ${cap}`);
  return { cap, len: 0, head: 0, data: new Array<number>(cap).fill(0) };
}

/** Appends a sample, overwriting the oldest once full. */
export function tsPush(ts: TimeSeries, v: number): void {
  ts.data[ts.head] = v;
  ts.head = ts.head + 1 === ts.cap ? 0 : ts.head + 1;
  if (ts.len < ts.cap) ts.len++;
}

/** Sample i: 0 = oldest, len-1 = newest; negative i counts from the newest (-1 = newest). Undefined if out of range. */
export function tsAt(ts: TimeSeries, i: number): number | undefined {
  const k = i < 0 ? ts.len + i : i;
  if (k < 0 || k >= ts.len) return undefined;
  return ts.data[(ts.head - ts.len + k + ts.cap) % ts.cap];
}

/** Newest sample, or `fallback` when empty. */
export function tsLast(ts: TimeSeries, fallback = 0): number {
  return ts.len === 0 ? fallback : ts.data[(ts.head - 1 + ts.cap) % ts.cap];
}

/** Samples oldest -> newest, written into `out` (cleared first) or a new array. */
export function tsToArray(ts: TimeSeries, out: number[] = []): number[] {
  out.length = 0;
  const start = (ts.head - ts.len + ts.cap) % ts.cap;
  for (let k = 0; k < ts.len; k++) out.push(ts.data[(start + k) % ts.cap]);
  return out;
}

/** Minimum of the stored samples, or `fallback` when empty. */
export function tsMin(ts: TimeSeries, fallback = 0): number {
  if (ts.len === 0) return fallback;
  let m = Infinity;
  for (let k = 0; k < ts.len; k++) {
    const v = tsAt(ts, k) as number;
    if (v < m) m = v;
  }
  return m;
}

/** Maximum of the stored samples, or `fallback` when empty. */
export function tsMax(ts: TimeSeries, fallback = 0): number {
  if (ts.len === 0) return fallback;
  let m = -Infinity;
  for (let k = 0; k < ts.len; k++) {
    const v = tsAt(ts, k) as number;
    if (v > m) m = v;
  }
  return m;
}

/** Mean of the stored samples, or `fallback` when empty. */
export function tsMean(ts: TimeSeries, fallback = 0): number {
  if (ts.len === 0) return fallback;
  let sum = 0;
  for (let k = 0; k < ts.len; k++) sum += tsAt(ts, k) as number;
  return sum / ts.len;
}

/** Removes all samples (capacity unchanged). */
export function tsClear(ts: TimeSeries): void {
  ts.len = 0;
  ts.head = 0;
  ts.data.fill(0);
}
