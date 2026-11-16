// Per-sim runtime of locomotion (derived, never persisted): parameters, diagnostic counters, the planner budget of
// the current tick, the LOD observer, carve changes since the last tick (walkers there re-attach and replan),
// shared nest point fields and per-tick caches (avoid discs, entrance flow signatures).

import type { Vec3 } from '@/core/math/vec3';
import type { Sim, Walker } from '@/sim/types';
import type { CostDisc } from './grid/search';
import { HashGrid3 } from '@/core/spatial/hashGrid';
import { isLocoNavGrid } from './grid/navGridImpl';
import { locoParams, type LocoParams } from './params';
import { homeEntranceStatus } from './nests';
import type { StallRecord } from './stallWatch';
import { NeighbourGrid } from './neighbours';

/** Counters exposed for diagnostics (locoStats). Monotone over the sim's lifetime. */
export interface LocoStats {
  requests: number;
  arrivals: number;
  failures: number;
  timeouts: number;
  plans: number;
  planDeferred: number;
  planFailed: number;
  stuckEpisodes: number;
  replans: number;
  sidesteps: number;
  backoffs: number;
  resnaps: number;
  relocations: number;
  stepped: number;
  lodSkipped: number;
  walkerFailed: number;
  surfaceChanged: number;
  edgeClamps: number;
  slips: number;
  rescues: number;
  /** Autonomous walkers that let go of a cavity ceiling above their goal. */
  drops: number;
  /** Steps of standing walkers skipped (no request, already on the level set). */
  standSkipped: number;
  /** Steps skipped by in-nest wanderers dozing in a crowd. */
  dozed: number;
  /** Stuck again where the walker was relocated: let-gos instead of a relocation, and walks failed 'stuck-repeat'. */
  relocRepeatDrops: number;
  relocRepeatFails: number;
}

interface FlowSig {
  tick: number;
  sig: string;
  seeds: Vec3[];
}

/**
 * Movement override for special media (Tier 2 hooks: alate flight, floating on water). Called before the normal
 * step of every walker that is due; returns true when it moved the walker itself (locomotion then skips the step).
 */
export type MovementOverride = (sim: Sim, w: Walker, dt: number) => boolean;

export interface LocoRuntime {
  P: LocoParams;
  stats: LocoStats;
  /** Planner calls made in `planTick`. */
  planTick: number;
  plans: number;
  /** Nav-grid A* expansions counted at the start of `planTick` (expansion budget). */
  planExpand0: number;
  /** LOD observer (camera focus); null = automatic (possessed ant, else the player's nest). */
  observer: Vec3 | null;
  /** Registered shared point fields, oldest first. */
  pointFields: string[];
  /** Per-tick caches. */
  discTick: number;
  discs: Map<number, CostDisc[]>;
  /** Signature (hash) of each colony's avoid discs this tick: a change makes walkers replan. */
  discSigs: Map<number, number>;
  /** Entrance flow seeds per nest (one flow field per nest: a trip into nest A must not end at nest B). */
  flowSigs: Map<number, FlowSig>;
  /** Scratch id buffer for neighbour queries. */
  ids: number[];
  /** The nav grid has the world field attached. */
  gridReady: boolean;
  overrides: MovementOverride[];
  /** Carve grid version seen by the last locomotion tick (-1 = none yet). */
  carveVersion: number;
  /**
   * Ant positions at the start of this tick's locomotion, in cells of the separation radius: the separation query
   * then visits a handful of ants, not the coarse entity-index cell (hundreds of ants in a crowded chamber).
   */
  sepGrid: HashGrid3 | null;
  /** Tick the separation grid was filled (it is filled on its first use in a tick, from the positions then). */
  sepTick: number;
  /**
   * Id of the possessed ant when a movement override (pin, seizure, dodge) moved it in the last locomotion pass,
   * else -1. Read by the per-frame predictor, which must not run the overrides itself (they write state).
   */
  possessedOverriddenId: number;
  /** Stall watch (stallWatch.ts): per ant id, where its current window started. Diagnostic only. */
  stalls: Map<number, StallRecord>;
  /** Tick a movement override last moved each ant (ants held by an override are not stalled). */
  overriddenTick: Map<number, number>;
  /** Nests holding flood water, cached for `floodTick` (weather.ts). */
  floodTick: number;
  flooded: Set<number>;
  /** Crowd grid of the ant positions at the start of this tick's locomotion (separation; neighbours.ts). */
  crowd: NeighbourGrid | null;
  /** Puddle store as last synced into the nav grid's overlay (puddles.ts); null before the first sync. */
  puddleSeen: Uint8Array | null;
}

const runtimes = new WeakMap<Sim, LocoRuntime>();

function zeroStats(): LocoStats {
  return {
    requests: 0, arrivals: 0, failures: 0, timeouts: 0, plans: 0, planDeferred: 0, planFailed: 0, stuckEpisodes: 0,
    replans: 0, sidesteps: 0, backoffs: 0, resnaps: 0, relocations: 0, stepped: 0, lodSkipped: 0, walkerFailed: 0,
    surfaceChanged: 0, edgeClamps: 0, slips: 0, rescues: 0, drops: 0, standSkipped: 0, dozed: 0, relocRepeatDrops: 0, relocRepeatFails: 0,
  };
}

export function rt(sim: Sim): LocoRuntime {
  let r = runtimes.get(sim);
  if (r) return r;
  const created: LocoRuntime = {
    P: locoParams(sim.world.bu), stats: zeroStats(), planTick: -1, plans: 0, planExpand0: 0, observer: null,
    pointFields: [], discTick: -1, discs: new Map(), discSigs: new Map(), flowSigs: new Map(), ids: [], gridReady: false, overrides: [], carveVersion: -1, sepGrid: null, sepTick: -1, possessedOverriddenId: -1,
    stalls: new Map(), overriddenTick: new Map(), floodTick: -1, flooded: new Set(), puddleSeen: null, crowd: null,
  };
  runtimes.set(sim, created);
  return created;
}

/** Attaches the world field to the nav grid once (tall-object cover, mound ground). */
export function ensureGrid(sim: Sim, r: LocoRuntime): void {
  if (r.gridReady) return;
  r.gridReady = true;
  const g = sim.navGrid;
  if (isLocoNavGrid(g) && !g.hasField) g.attachField(sim.field, [...sim.world.prims, ...sim.state.worldDelta.dynPrims]);
}

/** Takes one planner call from this tick's budget; false when exhausted (caller retries next tick). */
export function takePlanBudget(sim: Sim, r: LocoRuntime): boolean {
  const t = sim.state.tick;
  const g = sim.navGrid;
  const expanded = isLocoNavGrid(g) ? g.expandedTotal : 0;
  if (r.planTick !== t) { r.planTick = t; r.plans = 0; r.planExpand0 = expanded; }
  if (r.plans >= r.P.planBudget || (r.plans > 0 && expanded - r.planExpand0 >= r.P.planExpandBudget)) {
    r.stats.planDeferred++;
    return false;
  }
  r.plans++;
  r.stats.plans++;
  return true;
}

/** Avoid-marker discs of a colony (GDD 02 §12.2), cached per tick. */
export function avoidDiscs(sim: Sim, r: LocoRuntime, colony: number): CostDisc[] {
  const t = sim.state.tick;
  if (r.discTick !== t) { r.discTick = t; r.discs.clear(); r.discSigs.clear(); }
  let d = r.discs.get(colony);
  if (!d) {
    d = [];
    let sig = 0;
    for (const m of sim.state.markers) {
      if (!m.alive || m.kind !== 'avoid' || m.colony !== colony) continue;
      d.push({ x: m.pos.x, z: m.pos.z, r: m.radius, mult: r.P.avoidCost });
      sig = mixSig(mixSig(mixSig(mixSig(sig, m.id), m.pos.x), m.pos.z), m.radius);
    }
    r.discs.set(colony, d);
    r.discSigs.set(colony, sig);
  }
  return d;
}

/** Signature of a colony's avoid discs (0 = none); equal signatures mean the same discs. */
export function avoidSig(sim: Sim, r: LocoRuntime, colony: number): number {
  avoidDiscs(sim, r, colony);
  return r.discSigs.get(colony) ?? 0;
}

function mixSig(h: number, v: number): number {
  return (Math.imul(h ^ Math.round(v * 16), 0x9e3779b1) + 0x7f4a7c15) | 0;
}

/** Open entrances of one nest as flow seeds plus a signature that changes when they change (per tick). */
export function nestEntrances(sim: Sim, r: LocoRuntime, nestId: number): FlowSig {
  const t = sim.state.tick;
  let f = r.flowSigs.get(nestId);
  if (f && f.tick === t) return f;
  const seeds: Vec3[] = [];
  let sig = '';
  const n = sim.stores.nests.get(nestId);
  if (n && n.alive) {
    const usable = homeEntranceStatus(n);
    for (const e of n.entrances) {
      if (e.status !== usable) continue;
      seeds.push(e.pos);
      sig += `${e.id}:${Math.round(e.pos.x)},${Math.round(e.pos.z)};`;
    }
  }
  f = { tick: t, sig, seeds };
  r.flowSigs.set(nestId, f);
  return f;
}

/** Flow-field cache key of a nest's entrances. */
export function nestFlowKey(nestId: number): string {
  return `nest:${nestId}`;
}

/** Registers a movement override (flight, afloat drift: Tier 2). Returns an unregister function. */
export function registerMovementOverride(sim: Sim, f: MovementOverride): () => void {
  const list = rt(sim).overrides;
  list.push(f);
  return () => { const i = list.indexOf(f); if (i >= 0) list.splice(i, 1); };
}

/** Sets the LOD observer (the camera focus); null returns to automatic. */
export function setLocoObserver(sim: Sim, pos: Vec3 | null): void {
  rt(sim).observer = pos ? { x: pos.x, y: pos.y, z: pos.z } : null;
}

/** Diagnostic counters of locomotion (copy). */
export function locoStats(sim: Sim): LocoStats {
  return { ...rt(sim).stats };
}

/**
 * Fine grid of alive ant positions (cells of the separation radius, 1.1 BU), filled on its first use in a tick:
 * that is before locomotion moves anyone, so all users in a tick (perception, behaviours, separation) see the
 * positions of the end of the previous tick, and a loaded game fills it from the same positions.
 */
export function antGrid(sim: Sim, r: LocoRuntime = rt(sim)): HashGrid3 {
  const g = (r.sepGrid ??= new HashGrid3(r.P.sepR));
  if (r.sepTick === sim.state.tick) return g;
  r.sepTick = sim.state.tick;
  g.clear();
  const list = sim.stores.ants.list;
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (a.alive) g.insert(a.id, a.pos.x, a.pos.y, a.pos.z);
  }
  return g;
}

/** Fills the crowd grid from the alive ants' current positions, tagged by colony (the locomotion system, once per tick). */
export function fillCrowd(sim: Sim, r: LocoRuntime): NeighbourGrid {
  const g = (r.crowd ??= new NeighbourGrid(r.P.sepR));
  g.clear();
  const list = sim.stores.ants.list;
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (a.alive) g.insert(a.id, a.pos.x, a.pos.y, a.pos.z, a.colony);
  }
  return g;
}

/** Ids of ants within r (mm) of p, from the fine grid (contact-range queries; positions as of the tick start). */
export function queryAntsNear(sim: Sim, p: { x: number; y: number; z: number }, r: number, out: number[]): number {
  return antGrid(sim).queryRadius(p.x, p.y, p.z, r, out);
}
