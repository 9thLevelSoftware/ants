// Per-sim runtime of locomotion (derived, never persisted): parameters, diagnostic counters, the planner budget of
// the current tick, the LOD observer, carve changes since the last tick (walkers there re-attach and replan),
// shared nest point fields and per-tick caches (avoid discs, entrance flow signatures).

import type { Vec3 } from '@/core/math/vec3';
import type { Sim } from '@/sim/types';
import type { CarveChange } from '@/sim/nest/carve';
import type { CostDisc } from './grid/search';
import { isLocoNavGrid } from './grid/navGridImpl';
import { locoParams, type LocoParams } from './params';

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
}

export interface DirtyBox {
  x0: number; y0: number; z0: number; x1: number; y1: number; z1: number;
}

interface FlowSig {
  tick: number;
  sig: string;
  seeds: Vec3[];
}

export interface LocoRuntime {
  P: LocoParams;
  stats: LocoStats;
  /** Planner calls made in `planTick`. */
  planTick: number;
  plans: number;
  /** LOD observer (camera focus); null = automatic (possessed ant, else the player's nest). */
  observer: Vec3 | null;
  /** Carve changes since the last locomotion tick, mm. */
  dirty: DirtyBox[];
  /** Registered shared point fields, oldest first. */
  pointFields: string[];
  /** Per-tick caches. */
  discTick: number;
  discs: Map<number, CostDisc[]>;
  flowSigs: Map<number, FlowSig>;
  /** Scratch id buffer for neighbour queries. */
  ids: number[];
  /** The nav grid has the world field attached. */
  gridReady: boolean;
}

const runtimes = new WeakMap<Sim, LocoRuntime>();

function zeroStats(): LocoStats {
  return {
    requests: 0, arrivals: 0, failures: 0, timeouts: 0, plans: 0, planDeferred: 0, planFailed: 0, stuckEpisodes: 0,
    replans: 0, sidesteps: 0, backoffs: 0, resnaps: 0, relocations: 0, stepped: 0, lodSkipped: 0, walkerFailed: 0,
    surfaceChanged: 0, edgeClamps: 0, slips: 0, rescues: 0,
  };
}

export function rt(sim: Sim): LocoRuntime {
  let r = runtimes.get(sim);
  if (r) return r;
  const created: LocoRuntime = {
    P: locoParams(sim.world.bu), stats: zeroStats(), planTick: -1, plans: 0, observer: null, dirty: [],
    pointFields: [], discTick: -1, discs: new Map(), flowSigs: new Map(), ids: [], gridReady: false,
  };
  const voxel = sim.carve.voxel;
  sim.carve.addListener((c: CarveChange) => {
    const b = c.box;
    created.dirty.push({ x0: b.i0 * voxel, y0: b.j0 * voxel, z0: b.k0 * voxel, x1: b.i1 * voxel, y1: b.j1 * voxel, z1: b.k1 * voxel });
  });
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
  if (r.planTick !== t) { r.planTick = t; r.plans = 0; }
  if (r.plans >= r.P.planBudget) { r.stats.planDeferred++; return false; }
  r.plans++;
  r.stats.plans++;
  return true;
}

/** Avoid-marker discs of a colony (GDD 02 §12.2), cached per tick. */
export function avoidDiscs(sim: Sim, r: LocoRuntime, colony: number): CostDisc[] {
  const t = sim.state.tick;
  if (r.discTick !== t) { r.discTick = t; r.discs.clear(); }
  let d = r.discs.get(colony);
  if (!d) {
    d = [];
    for (const m of sim.state.markers) {
      if (m.alive && m.kind === 'avoid' && m.colony === colony) d.push({ x: m.pos.x, z: m.pos.z, r: m.radius, mult: r.P.avoidCost });
    }
    r.discs.set(colony, d);
  }
  return d;
}

/** Open entrances of a colony's nests as flow seeds plus a signature that changes when they change (per tick). */
export function colonyEntrances(sim: Sim, r: LocoRuntime, colony: number): FlowSig {
  const t = sim.state.tick;
  let f = r.flowSigs.get(colony);
  if (f && f.tick === t) return f;
  const seeds: Vec3[] = [];
  let sig = '';
  for (const n of sim.state.nests) {
    if (!n.alive || n.colony !== colony) continue;
    for (const e of n.entrances) {
      if (e.status !== 'open') continue;
      seeds.push(e.pos);
      sig += `${e.id}:${Math.round(e.pos.x)},${Math.round(e.pos.z)};`;
    }
  }
  f = { tick: t, sig, seeds };
  r.flowSigs.set(colony, f);
  return f;
}

/** Sets the LOD observer (the camera focus); null returns to automatic. */
export function setLocoObserver(sim: Sim, pos: Vec3 | null): void {
  rt(sim).observer = pos ? { x: pos.x, y: pos.y, z: pos.z } : null;
}

/** Diagnostic counters of locomotion (copy). */
export function locoStats(sim: Sim): LocoStats {
  return { ...rt(sim).stats };
}
