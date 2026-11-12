// Per-tick derived caches of the in-nest behaviours: a value computed from the current state the first time it is
// asked for in a tick, and reused by every other ant in that tick. Never persisted; after a load the first ask in
// a tick computes it again from the same state, so runs stay deterministic.

import type { Sim } from '@/sim/types';

const caches = new WeakMap<Sim, Map<string, { tick: number; value: unknown }>>();

export function perTick<T>(sim: Sim, key: string, compute: () => T): T {
  let m = caches.get(sim);
  if (!m) { m = new Map(); caches.set(sim, m); }
  const hit = m.get(key);
  if (hit && hit.tick === sim.state.tick) return hit.value as T;
  const value = compute();
  m.set(key, { tick: sim.state.tick, value });
  return value;
}
