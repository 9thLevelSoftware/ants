// Derived, never-persisted flood caches per Sim: the spill cache of each nest (spill.ts) and the carve listener that
// marks it stale. A cache is always fresh when used (rebuilt on demand if the carve grid touched its box, or the
// nest's entrances, chambers or mounds changed), so results depend on the persisted state alone.
//
// Rebuild throttle (GDD 03 §11.2, "throttled to 5 game s"): the flood model consumes a nest's geometry through
// `floodGeometry`, which answers null ("frozen") when the geometry may have changed since it was last captured and
// the last capture is less than FLOOD_REBUILD_TICKS old, or this flood step is not the nest's rebuild slot. Whether it may have changed is decided from persisted state
// only (WorldDelta.carveChangedTick against FloodState.spillTick, and a hash of the nest signature), never from this
// runtime, so a restored game freezes and captures on exactly the ticks the uninterrupted game does; a frozen step
// defers its work to the next capture instead of reading a stale cache. "Changed" is any carve in the world after
// the capture tick: the flood system runs in the last tick phase, so every carve of the capture tick came before
// the capture (carves applied between ticks carry the next tick).

import type { Nest, Sim } from '@/sim/types';
import { FLOOD_REBUILD_SLOTS, FLOOD_REBUILD_TICKS, FLOOD_STEP_TICKS } from '@/sim/balance/weather';
import type { CarveChange } from '../carve/grid';
import { moundById } from '../mounds';
import { buildSpill, nestSignature, type SpillCache } from './spill';

interface FloodRuntime {
  caches: Map<number, SpillCache>;
  stale: Set<number>;
  /** Some ant may carry a submersion counter (the per-second scan may be skipped only when false). */
  counters: boolean;
}

const RUNTIMES = new WeakMap<Sim, FloodRuntime>();
/** Samples of slack around a cache box when matching carve changes. */
const BOX_PAD = 2;

export function floodRuntime(sim: Sim): FloodRuntime {
  let rt = RUNTIMES.get(sim);
  if (rt) return rt;
  const made: FloodRuntime = { caches: new Map(), stale: new Set(), counters: true };
  sim.carve.addListener((c: CarveChange) => {
    for (const [id, cache] of made.caches) {
      const b = cache.box;
      if (c.box.i1 < b.i0 - BOX_PAD || c.box.i0 > b.i1 + BOX_PAD || c.box.j1 < b.j0 - BOX_PAD || c.box.j0 > b.j1 + BOX_PAD
        || c.box.k1 < b.k0 - BOX_PAD || c.box.k0 > b.k1 + BOX_PAD) continue;
      made.stale.add(id);
    }
  });
  RUNTIMES.set(sim, made);
  return made;
}

function fullSignature(sim: Sim, nest: Nest): string {
  let s = nestSignature(nest);
  for (const id of nest.moundIds) {
    const m = moundById(sim, id);
    if (m) s += `m${id}:${m.lastBatchTick}:${Math.round(m.volume * 1000)};`;
  }
  const d = sim.state.worldDelta;
  return `${s}d${d.dynPrims.length}:${d.heightDeltas.length}`;
}

/** FNV-1a hash of a string (32 bit, non-negative). */
function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** The nest's spill cache for the current geometry, rebuilt if anything it depends on changed (no throttle). */
export function spillFor(sim: Sim, nest: Nest): SpillCache {
  return currentSpill(sim, nest, fullSignature(sim, nest));
}

function currentSpill(sim: Sim, nest: Nest, sig: string): SpillCache {
  const rt = floodRuntime(sim);
  let c = rt.caches.get(nest.id);
  if (!c || rt.stale.has(nest.id) || c.sig !== sig) {
    c = buildSpill(sim, nest);
    c.sig = sig;
    rt.caches.set(nest.id, c);
    rt.stale.delete(nest.id);
  }
  return c;
}

/** This flood step is the nest's rebuild slot (balance FLOOD_REBUILD_SLOTS). */
function rebuildSlot(t: number, nest: Nest): boolean {
  return (Math.floor(t / FLOOD_STEP_TICKS) + nest.id) % FLOOD_REBUILD_SLOTS === 0;
}

/**
 * The geometry the flood model may use now, or null while it is frozen: the nest's geometry may have changed since
 * the last capture and that capture is less than `minAgeTicks` (FLOOD_REBUILD_TICKS) old, or (unless `anySlot`: the
 * reference-storm prediction, spread over its period by nest id already) this step is not the nest's rebuild slot.
 * A non-null answer is always the current geometry; when the nest had changed, it records a new capture (persisted).
 */
export function floodGeometry(sim: Sim, nest: Nest, anySlot = false, minAgeTicks = FLOOD_REBUILD_TICKS): SpillCache | null {
  const f = nest.flood, t = sim.state.tick;
  const sig = fullSignature(sim, nest), h = hash32(sig);
  const changedTick = sim.state.worldDelta.carveChangedTick ?? -Infinity;
  const dirty = f.spillTick === undefined || changedTick > f.spillTick || f.spillSig !== h;
  if (dirty && f.spillTick !== undefined && t >= f.spillTick && (t - f.spillTick < minAgeTicks || (!anySlot && !rebuildSlot(t, nest)))) return null;
  const c = currentSpill(sim, nest, sig);
  if (dirty) {
    f.spillTick = t;
    f.spillSig = h;
  }
  return c;
}

/** The cache as last built (renderers: no rebuild), or undefined. */
export function spillPeek(sim: Sim, nestId: number): SpillCache | undefined {
  return RUNTIMES.get(sim)?.caches.get(nestId);
}

/**
 * The cache the flood model last used for a wet nest, for readers between flood steps (locomotion's water speed,
 * submersion queries, the flee-water rule): the cache as last built, or, in a Sim that has not built one yet (a
 * restored game before its first flood step), the one for the current geometry. Without the second case a restored
 * game read "dry" where the uninterrupted one read water until its next flood step (nest-fix3: ants in water walked at
 * full speed for one tick after a load). Only for nests holding water.
 */
export function spillForReaders(sim: Sim, nest: Nest): SpillCache {
  return spillPeek(sim, nest.id) ?? spillFor(sim, nest);
}
