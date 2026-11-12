// Per-tick derived counts (never persisted): chambers by id, the colony census, item counts per chamber.
// Each is computed lazily once per tick and cached per sim.

import { ti } from './taskIdx';
import type { Vec3 } from '@/core/math/vec3';
import type { Ant, Caste, Chamber, Colony, ColonyCoreState, Sim } from '@/sim/types';
import { AGE_MID_MAX_GD, AGE_YOUNG_MAX_GD, CORPSE_HAUL_RADIUS_BU } from '@/sim/balance';
import { AntFlag, BroodFlag, TASK_COUNT } from '@/sim/types';

// Imported bindings are accessor reads under Vite's SSR module runner (tests, headless tools); the hot per-entity
// steps below read these module-local copies instead.
const _ti = ti;
const _CORPSE_HAUL_RADIUS_BU = CORPSE_HAUL_RADIUS_BU;
const _AGE_YOUNG_MAX_GD = AGE_YOUNG_MAX_GD;
const _AGE_MID_MAX_GD = AGE_MID_MAX_GD;
const _AntFlag = AntFlag;
const _BroodFlag = BroodFlag;
const _TASK_COUNT = TASK_COUNT;

const WORKER_CASTES: ReadonlySet<Caste> = new Set<Caste>(['worker', 'minor', 'media', 'major']);

/** Worker-like castes (allocation, `N`). */
export function isWorkerCaste(c: Caste): boolean {
  return WORKER_CASTES.has(c);
}

export function isWorker(a: Ant): boolean {
  return a.alive && WORKER_CASTES.has(a.caste);
}

interface TickCache<T> { tick: number; value: T }

function cached<T>(map: WeakMap<Sim, TickCache<T>>, sim: Sim, build: () => T): T {
  const hit = map.get(sim);
  if (hit && hit.tick === sim.state.tick) return hit.value;
  const value = build();
  map.set(sim, { tick: sim.state.tick, value });
  return value;
}

// ---- chambers ----

const chamberCache = new WeakMap<Sim, TickCache<Map<number, { ch: Chamber; nestId: number; colony: number }>>>();

function buildChambers(sim: Sim): Map<number, { ch: Chamber; nestId: number; colony: number }> {
  const m = new Map<number, { ch: Chamber; nestId: number; colony: number }>();
  for (const n of sim.stores.nests.list) {
    if (!n.alive) continue;
    for (const ch of n.chambers) m.set(ch.id, { ch, nestId: n.id, colony: n.colony });
  }
  return m;
}

export function chamberEntry(sim: Sim, id: number): { ch: Chamber; nestId: number; colony: number } | undefined {
  if (id < 0) return undefined;
  let m = cached(chamberCache, sim, () => buildChambers(sim));
  let e = m.get(id);
  if (!e) {
    // A chamber created during this tick: rebuild once.
    m = buildChambers(sim);
    chamberCache.set(sim, { tick: sim.state.tick, value: m });
    e = m.get(id);
  }
  return e;
}

export function chamberById(sim: Sim, id: number): Chamber | undefined {
  return chamberEntry(sim, id)?.ch;
}

/** Chambers of every nest of a colony. */
export function colonyChambers(sim: Sim, col: Colony): Chamber[] {
  const out: Chamber[] = [];
  for (const nid of col.nestIds) {
    const n = sim.stores.nests.get(nid);
    if (n) for (const ch of n.chambers) out.push(ch);
  }
  return out;
}

// ---- colony census ----

export interface Census {
  /** Living adult workers N (nanitics and callows included). */
  workers: number;
  callows: number;
  /** Workers per task (TASKS order). */
  byTask: Int16Array;
  /** Workers available to allocation (GDD 02 §6.3 `A`), and those of them fit for outside work. */
  available: number;
  availableOutside: number;
  injured: number;
  resting: number;
  eggs: number;
  larvae: number;
  pupae: number;
  /** Worker-destined brood (fCap projection). */
  workerEggs: number;
  workerLarvae: number;
  workerPupae: number;
  diapause: number;
  readyPupae: number;
  /** Mean hunger 0..1 of feeding larvae (0 without larvae). */
  meanLarvalHunger: number;
  gynes: number;
  males: number;
  /** Workers by age band (GDD 02 §1.3; `callows` is the callow band), inside a nest / outside, flagged (§13.1). */
  young: number;
  mid: number;
  old: number;
  inside: number;
  outside: number;
  nanitics: number;
  minims: number;
  /** Possessed (player-controlled) workers. */
  controlled: number;
}

function emptyCensus(): Census {
  return {
    workers: 0, callows: 0, byTask: new Int16Array(_TASK_COUNT), available: 0, availableOutside: 0, injured: 0,
    resting: 0, eggs: 0, larvae: 0, pupae: 0, workerEggs: 0, workerLarvae: 0, workerPupae: 0, diapause: 0,
    readyPupae: 0, meanLarvalHunger: 0, gynes: 0, males: 0, young: 0, mid: 0, old: 0, inside: 0,
    outside: 0, nanitics: 0, minims: 0, controlled: 0,
  };
}

const FIGHT = _ti('fight');
const FLEE = _ti('flee');

/** True if the allocator may count this worker as available (`A`). */
export function isAvailable(a: Ant): boolean {
  if ((a.flags & (_AntFlag.POSSESSED | _AntFlag.DORMANT)) !== 0) return false;
  const t = _ti(a.task);
  return t !== FIGHT && t !== FLEE;
}

const censusCache = new WeakMap<Sim, TickCache<Map<number, Census>>>();

function buildCensus(sim: Sim): Map<number, Census> {
  const m = new Map<number, Census>();
  const get = (id: number): Census => {
    let c = m.get(id);
    if (!c) { c = emptyCensus(); m.set(id, c); }
    return c;
  };
  const ants = sim.stores.ants.list;
  for (let i = 0; i < ants.length; i++) {
    const a = ants[i];
    if (!a.alive) continue;
    if (a.caste === 'gyne') { get(a.colony).gynes++; continue; }
    if (a.caste === 'male') { get(a.colony).males++; continue; }
    if (!WORKER_CASTES.has(a.caste)) continue;
    const c = get(a.colony);
    c.workers++;
    const f = a.flags;
    if (f & _AntFlag.CALLOW) c.callows++; else if (a.physioAgeGd < _AGE_YOUNG_MAX_GD) c.young++;
    else if (a.physioAgeGd < _AGE_MID_MAX_GD) c.mid++;
    else c.old++;
    if (a.nestId !== -1) c.inside++;
    else c.outside++;
    if (f & _AntFlag.NANITIC) c.nanitics++;
    if (f & _AntFlag.MINIM) c.minims++;
    if (f & _AntFlag.POSSESSED) c.controlled++;
    c.byTask[_ti(a.task)]++;
    if (a.task === 'rest' || a.state === 'rest') c.resting++;
    if (a.flags & _AntFlag.INJURED) c.injured++;
    if (isAvailable(a)) {
      c.available++;
      if ((a.flags & (_AntFlag.INJURED | _AntFlag.CALLOW)) === 0) c.availableOutside++;
    }
  }
  const hungerSum = new Map<number, number>();
  const brood = sim.stores.brood.list;
  for (let i = 0; i < brood.length; i++) {
    const b = brood[i];
    if (!b.alive) continue;
    const c = get(b.colony);
    const w = b.destined !== 'gyne' && b.destined !== 'male';
    if (b.stage === 'egg') { c.eggs++; if (w) c.workerEggs++; } else if (b.stage === 'larva') {
      c.larvae++;
      if (w) c.workerLarvae++;
      if (b.flags & _BroodFlag.DIAPAUSE) c.diapause++;
      else hungerSum.set(b.colony, (hungerSum.get(b.colony) ?? 0) + b.hunger);
    } else {
      c.pupae++;
      if (w) c.workerPupae++;
      if (b.flags & _BroodFlag.READY) c.readyPupae++;
    }
  }
  for (const [id, c] of m) {
    const feeding = c.larvae - c.diapause;
    c.meanLarvalHunger = feeding > 0 ? (hungerSum.get(id) ?? 0) / feeding : 0;
  }
  return m;
}

const EMPTY = emptyCensus();

/** Census of a colony for the current tick (shared object: do not mutate). */
export function censusOf(sim: Sim, colonyId: number): Census {
  return cached(censusCache, sim, () => buildCensus(sim)).get(colonyId) ?? EMPTY;
}

/** Drops this tick's census (after mass spawns or deaths inside one tick, e.g. cheats and tests). */
export function invalidateCensus(sim: Sim): void {
  censusCache.delete(sim);
}

// ---- items per chamber / colony ----

export interface ItemCounts {
  /** Waste items per chamber id. */
  wasteByChamber: Map<number, number>;
  /** Per colony: waste in its nests, loose soil pellets, nestmate corpses near home, spoiled-food items. */
  byColony: Map<number, { waste: number; pellets: number; corpses: number; spoiled: number }>;
}

/** Within _CORPSE_HAUL_RADIUS_BU of one of the colony's entrances (GDD 02 §10.8). */
function nearHome(sim: Sim, colonyId: number, p: Vec3): boolean {
  const col = sim.stores.colonies.get(colonyId);
  if (!col) return false;
  const r = _CORPSE_HAUL_RADIUS_BU * sim.world.bu;
  for (const nid of col.nestIds) {
    const n = sim.stores.nests.get(nid);
    if (!n) continue;
    for (const e of n.entrances) if (vDist(e.pos, p) <= r) return true;
    if (n.entrances.length === 0 && vDist(n.origin, p) <= r) return true;
  }
  return false;
}

function vDist(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

const itemCache = new WeakMap<Sim, TickCache<ItemCounts>>();

export function itemCounts(sim: Sim): ItemCounts {
  return cached(itemCache, sim, () => {
    const wasteByChamber = new Map<number, number>();
    const byColony = new Map<number, { waste: number; pellets: number; corpses: number; spoiled: number }>();
    const nestColony = new Map<number, number>();
    for (const n of sim.stores.nests.list) if (n.alive) nestColony.set(n.id, n.colony);
    const row = (id: number) => {
      let r = byColony.get(id);
      if (!r) { r = { waste: 0, pellets: 0, corpses: 0, spoiled: 0 }; byColony.set(id, r); }
      return r;
    };
    for (const it of sim.stores.items.list) {
      if (!it.alive || it.carrierIds.length > 0) continue;
      const owner = it.nestId >= 0 ? nestColony.get(it.nestId) : undefined;
      if (it.kind === 'waste') {
        if (it.chamberId >= 0) wasteByChamber.set(it.chamberId, (wasteByChamber.get(it.chamberId) ?? 0) + 1);
        if (owner !== undefined) {
          const r = row(owner);
          r.waste++;
          if (it.wasteKind === 'spoiled-food') r.spoiled++;
        }
      } else if (it.kind === 'soil-pellet') {
        if (owner !== undefined) row(owner).pellets++;
      } else if (it.kind === 'corpse' && it.colony >= 0 && (owner !== undefined || nearHome(sim, it.colony, it.pos))) {
        row(it.colony).corpses++;
      }
    }
    return { wasteByChamber, byColony };
  });
}

// ---- cycle snapshot (persisted in Colony.core.acc so readers between cycles stay deterministic on reload) ----

/** The census fields the queen and brood read between colony cycles. */
export interface CensusSnapshot {
  workers: number;
  larvae: number;
  diapause: number;
  workerEggs: number;
  workerLarvae: number;
  workerPupae: number;
  nurses: number;
  meanLarvalHunger: number;
}

const NURSE_I = ti('nurse');

/** Stores the census and the waste per chamber of this colony cycle in core.acc. */
export function storeCycleSnapshot(sim: Sim, col: Colony, core: ColonyCoreState): void {
  const c = censusOf(sim, col.id);
  const a = core.acc;
  a['cen.valid'] = 1;
  a['cen.workers'] = c.workers;
  a['cen.larvae'] = c.larvae;
  a['cen.diapause'] = c.diapause;
  a['cen.wEggs'] = c.workerEggs;
  a['cen.wLarvae'] = c.workerLarvae;
  a['cen.wPupae'] = c.workerPupae;
  a['cen.nurses'] = c.byTask[NURSE_I];
  a['cen.hunger'] = c.meanLarvalHunger;
  const waste = itemCounts(sim).wasteByChamber;
  for (const ch of colonyChambers(sim, col)) {
    const n = waste.get(ch.id) ?? 0;
    if (n > 0 || a[`waste.${ch.id}`] !== undefined) a[`waste.${ch.id}`] = n;
  }
}

/** The last cycle snapshot, or a fresh census before the first cycle. */
export function cycleCensus(sim: Sim, col: Colony): CensusSnapshot {
  const a = col.core?.acc;
  if (a && a['cen.valid'] === 1) {
    return {
      workers: a['cen.workers'], larvae: a['cen.larvae'], diapause: a['cen.diapause'], workerEggs: a['cen.wEggs'],
      workerLarvae: a['cen.wLarvae'], workerPupae: a['cen.wPupae'], nurses: a['cen.nurses'], meanLarvalHunger: a['cen.hunger'],
    };
  }
  const c = censusOf(sim, col.id);
  return {
    workers: c.workers, larvae: c.larvae, diapause: c.diapause, workerEggs: c.workerEggs, workerLarvae: c.workerLarvae,
    workerPupae: c.workerPupae, nurses: c.byTask[NURSE_I], meanLarvalHunger: c.meanLarvalHunger,
  };
}

/** Waste items in a chamber at the last colony cycle. */
export function cycleWaste(col: Colony, chamberId: number): number {
  return col.core?.acc[`waste.${chamberId}`] ?? 0;
}
