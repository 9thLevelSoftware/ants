// Test support for the outdoor behaviours (never imported by game code): a foraging scenario on the standard
// small test nest, event counters, a per-state duration tracker and a detector of world changes made outside
// action primitives.

import type { Vec3 } from '@/core/math/vec3';
import type { Ant, Colony, Entrance, FoodKind, FoodSource, FoodVariant, Sim, SimEvent, System } from '@/sim/types';
import { SYSTEMS } from '@/sim/systems';
import { ACTION_DEFS, actionSystem, ports } from '@/sim/ants/actions';
import { enteredTask } from '@/sim/ants/behaviourRunner';
import { withdrawFood } from '@/sim/colony';
import { makeTestSim } from '@/sim/testing';

export interface SourceSpec {
  kind: FoodKind;
  variant: FoodVariant;
  /** Distance from the entrance, BU, and bearing, degrees (0 = +x). */
  distBu: number;
  bearingDeg: number;
  units: number;
}

export interface ScenarioOptions {
  seed?: number;
  workers?: number;
  sizeBu?: number;
  stores?: { c: number; p: number };
  sources?: SourceSpec[];
  /**
   * Keep the scenario's sources from evaporating or rotting (harvesting still takes from them): the "static spill"
   * of GDD 02 §4 / GDD 05 §0 Tier 1 and "sources fixed in place" of GDD 02 App. E 25. A test fixture, not game code.
   */
  pinned?: boolean;
  /**
   * Keep the colony hungry: after each tick's economy, pool C / P above these levels are withdrawn (booked as larval
   * food), standing in for brood demand the test colony does not have. A test fixture (GDD 02 §5.5 inputs).
   */
  holdStores?: { c: number; p: number };
  /**
   * Set the colony's demand signals after each tick's economy (GDD 02 §5.5 needC, needP, desired protein share sP):
   * "a protein / carbohydrate deficit set in the colony". A test fixture.
   */
  holdNeeds?: { needC: number; needP: number; sP: number };
  /** Start hour of the game day (default 7). */
  startHour?: number;
}

export interface Scenario {
  sim: Sim;
  col: Colony;
  entrance: Entrance;
  sources: FoodSource[];
}

/** A test sim with the small nest, workers inside, starting stores and cheat-spawned sources around the entrance. */
export function forageScenario(o: ScenarioOptions = {}): Scenario {
  const pinned = new Map<number, number>();
  const systems = o.pinned || o.holdStores || o.holdNeeds
    ? fixtureSystems(o.pinned ? pinned : null, o.holdStores ?? null, o.holdNeeds ?? null) : undefined;
  // early summer, from the morning: a long run stays in the foraging season
  const config = { startSeason: 'summer' as const, startDayOfSeason: 1, startHour: o.startHour ?? MORNING_HOUR };
  const sim = makeTestSim({ sizeBu: o.sizeBu ?? 800, nest: 'small', workers: o.workers ?? 40, seed: o.seed ?? 1, systems, config });
  const col = sim.state.colonies[0];
  const nest = sim.stores.nests.get(col.nestIds[0])!;
  const entrance = nest.entrances[0];
  const bu = sim.world.bu;
  const stores = o.stores ?? { c: 3, p: 0.5 };
  sim.enqueue({ type: 'cheat.addFood', colonyId: col.id, c: stores.c, p: stores.p, toxin: 0 });
  const before = sim.state.sources.length;
  for (const s of o.sources ?? []) {
    const a = (s.bearingDeg * Math.PI) / 180;
    const x = entrance.pos.x + Math.cos(a) * s.distBu * bu, z = entrance.pos.z + Math.sin(a) * s.distBu * bu;
    sim.enqueue({ type: 'cheat.spawnFood', kind: s.kind, variant: s.variant, pos: { x, y: sim.field.height(x, z), z }, units: s.units, stage: null });
  }
  sim.applyPendingCommands();
  const sources = sim.state.sources.slice(before);
  if (o.pinned) for (const src of sources) pinned.set(src.id, -1);
  return { sim, col, entrance, sources };
}

/**
 * The game's systems (or `base`) plus two fixtures around the ecology phase that keep the given sources from
 * shrinking (harvesting by ants is undone each tick: "sources fixed in place", GDD 02 App. E 25). Fill `pinned` with
 * the source ids (value -1) after spawning them.
 */
export function pinnedSystems(pinned: Map<number, number>, base: readonly System[] = SYSTEMS): System[] {
  return fixtureSystems(pinned, null, null, base);
}

/**
 * The game's systems plus test fixtures: two around the ecology phase that undo the ecology update's decay of
 * pinned sources, and one after the colony economy that holds the stores down.
 */
function fixtureSystems(pinned: Map<number, number> | null, hold: { c: number; p: number } | null,
  needs: { needC: number; needP: number; sP: number } | null, base: readonly System[] = SYSTEMS): System[] {
  pinned ??= new Map();
  const drain: System = {
    name: 'test-hold-stores', phase: 'colony-economy',
    run(sim) {
      const col = sim.state.colonies[0];
      if (hold) {
        const dc = Math.max(0, col.stores.c - hold.c), dp = Math.max(0, col.stores.p - hold.p);
        if (dc + dp > 0) withdrawFood(sim, col.id, dc, dp, 'larvae');
      }
      if (needs) Object.assign(col.needs, needs);
    },
  };
  const before: System = {
    name: 'test-pin-before', phase: 'environment',
    run(sim) { for (const id of pinned.keys()) pinned.set(id, sim.stores.sources.get(id)?.units ?? -1); },
  };
  const after: System = {
    name: 'test-pin-after', phase: 'colony-allocation',
    run(sim) {
      for (const [id, u] of pinned) {
        const s = sim.stores.sources.get(id);
        if (!s) continue;
        if (u > s.units) s.units = u;
        s.spawnedTick = sim.state.tick; // never ages out (Tier 1 carrion is removed after 3 gd)
        s.stageClock = 0;
      }
    },
  };
  const out: System[] = [];
  for (const s of base) {
    if (s.phase === 'ecology' && !out.includes(before)) out.push(before);
    if (s.phase !== 'ecology' && out.includes(before) && !out.includes(after)) out.push(after);
    out.push(s);
  }
  if (hold || needs) out.push(drain);
  return out;
}

/** Tells the colony about a source as if a scout had reported it (entrance news, known sources). */
export function announce(sim: Sim, col: Colony, s: FoodSource): void {
  col.news.push({ sourceId: s.id, pos: { x: s.pos.x, y: s.pos.y, z: s.pos.z }, tick: sim.state.tick });
  if (!col.knownSourceIds.includes(s.id)) col.knownSourceIds.push(s.id);
}

/** Counts events by type (and keeps the ones asked for). */
export function countEvents(sim: Sim, keep: readonly string[] = []): { n: Record<string, number>; kept: SimEvent[] } {
  const out = { n: {} as Record<string, number>, kept: [] as SimEvent[] };
  const types = [
    'delivery', 'food-source-discovered', 'trail-established', 'trail-lost', 'recruit', 'forager-departed',
    'route-learned', 'marker-response', 'ant-died', 'action-failed', 'task-changed',
  ];
  for (const t of new Set([...types, ...keep])) {
    sim.events.on(t as never, ((e: SimEvent) => {
      out.n[t] = (out.n[t] ?? 0) + 1;
      if (keep.includes(t)) out.kept.push({ ...e, tick: sim.state.tick } as SimEvent);
    }) as never);
  }
  return out;
}

/** Default start hour of the scenarios (morning). */
const MORNING_HOUR = 7;

const OUTDOOR = new Set(['scout', 'forage', 'tend', 'flee']);

/**
 * Longest uninterrupted stay of any outdoor-task ant in each state, s (by ant.stateTick), and how long each
 * trip outside lasted (from leaving the nest to entering it again, or to death).
 */
export class StateTracker {
  readonly maxStateS: Record<string, number> = {};
  readonly trips: { antId: number; outTick: number; inTick: number; died: boolean }[] = [];
  private out = new Map<number, number>();

  constructor(private sim: Sim) {}

  sample(): void {
    const t = this.sim.state.tick;
    for (const a of this.sim.state.ants) {
      if (!a.alive) {
        const o = this.out.get(a.id);
        if (o !== undefined) { this.trips.push({ antId: a.id, outTick: o, inTick: t, died: true }); this.out.delete(a.id); }
        continue;
      }
      // count a state once the runner has entered the task's behaviour (an allocator switch shows the old state)
      if (OUTDOOR.has(a.task) && enteredTask(a) === a.task) {
        const s = (t - a.stateTick) / 10;
        if (s > (this.maxStateS[a.state] ?? 0)) this.maxStateS[a.state] = s;
      }
      const o = this.out.get(a.id);
      if (a.nestId < 0 && o === undefined) this.out.set(a.id, t);
      if (a.nestId >= 0 && o !== undefined) { this.trips.push({ antId: a.id, outTick: o, inTick: t, died: false }); this.out.delete(a.id); }
    }
  }

  /** Ants outside right now and since when. */
  outside(): { antId: number; outTick: number }[] {
    return [...this.out.entries()].map(([antId, outTick]) => ({ antId, outTick }));
  }
}

/**
 * Detects world changes made outside action primitives by code of the outdoor behaviours or perception: wraps
 * every primitive's hooks and the action system (inside = allowed), and the world mutators every primitive uses
 * (ports.*, sim.phero.deposit / scaleRegion). A mutator call outside a primitive whose stack passes through
 * behaviours/outdoor or ants/perception is recorded.
 */
export function watchDirectMutations(sim: Sim): { direct: string[]; insideCalls: number; restore: () => void } {
  let depth = 0;
  const result = { direct: [] as string[], insideCalls: 0, restore: () => {} };
  const undo: (() => void)[] = [];
  const wrapInside = <T extends object>(obj: T, key: keyof T) => {
    const f = obj[key] as unknown as ((...a: unknown[]) => unknown) | undefined;
    if (typeof f !== 'function') return;
    (obj as Record<string, unknown>)[key as string] = (...a: unknown[]) => { depth++; try { return f.apply(obj, a); } finally { depth--; } };
    undo.push(() => { (obj as Record<string, unknown>)[key as string] = f; });
  };
  for (const def of Object.values(ACTION_DEFS)) for (const k of ['check', 'effect', 'tick', 'onBegin', 'onEnd'] as const) wrapInside(def, k);
  wrapInside(actionSystem, 'run');
  const wrapMutator = (obj: object, key: string, label: string) => {
    const o = obj as Record<string, unknown>;
    const f = o[key] as ((...a: unknown[]) => unknown) | undefined;
    if (typeof f !== 'function') return;
    o[key] = (...a: unknown[]) => {
      if (depth > 0) result.insideCalls++;
      else {
        const stack = new Error().stack ?? '';
        if (/behaviours[\\/]outdoor|ants[\\/]perception/.test(stack)) result.direct.push(label);
      }
      return f.apply(obj, a);
    };
    undo.push(() => { o[key] = f; });
  };
  for (const k of ['takeFromSource', 'depositFood', 'withdrawFood', 'feedBrood', 'deposit', 'digBite', 'dumpPellet', 'layEgg', 'applyDamage', 'raiseAlarm']) {
    wrapMutator(ports, k, `ports.${k}`);
  }
  wrapMutator(sim.phero, 'deposit', 'phero.deposit');
  wrapMutator(sim.phero, 'scaleRegion', 'phero.scaleRegion');
  result.restore = () => { for (const u of undo.reverse()) u(); };
  return result;
}

export function distBu(sim: Sim, a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.z - b.z) / sim.world.bu;
}

export function isOutdoorAnt(a: Ant): boolean {
  return a.alive && OUTDOOR.has(a.task);
}

/** Runs n ticks calling fn every `every` ticks. */
export function run(sim: Sim, n: number, every = 0, fn?: () => void): void {
  for (let i = 0; i < n; i++) {
    sim.tick();
    if (fn && every > 0 && i % every === 0) fn();
  }
}
