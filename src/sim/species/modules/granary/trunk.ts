// Trunk trails of a harvester (GDD 07 §5.3.7 signals; signature moment "the worn road"). The recruitment trail of
// the species is short-lived (half-life 120 s); what persists is the trunk trail: the ground the seed carriers
// walk. Every TRUNK_MARK_TICKS each laden forager outside marks the pheromone cell under her; a marked cell stays
// at full strength while used within `unusedHalfLifeGd`, then halves every `unusedHalfLifeGd` of disuse, turns into
// a ghost (strength 0: cleared ground, no scent) after `ghostAfterGd` and is gone `ghostFadeGd` later. Every
// TRUNK_REFRESH_TICKS the live cells top the colony's `trail` channel up to TRUNK_KEEP_PH x strength, so foragers
// keep finding the road between the nest and its seed patches, and it moves when the patches do (cells no longer
// walked fade). The ground-clearing ribbon is the render's (it reads GranaryModule.trunk).

import type { Colony, GranaryModule, Sim, SpeciesDef, System, TrunkCell } from '@/sim/types';
import {
  TRUNK_CELLS_MAX, TRUNK_CELL_BU, TRUNK_KEEP_PH, TRUNK_MARK_TICKS, TRUNK_REFRESH_TICKS,
} from '@/sim/balance/species-harvester';
import { TICKS_PER_DAY } from '@/sim/time';
import { granaryColonies } from './economy';

type TrunkDef = SpeciesDef['signals']['trunkTrail'];

/** Strength 0..1 of a cell `ageGd` game days after its last use (0: ghost or gone). */
export function trunkStrength(t: TrunkDef, ageGd: number): number {
  if (ageGd <= t.unusedHalfLifeGd) return 1;
  if (ageGd >= t.ghostAfterGd) return 0;
  return Math.pow(0.5, (ageGd - t.unusedHalfLifeGd) / t.unusedHalfLifeGd);
}

/** Whether a cell is gone for good (past its ghost time). */
export function trunkGone(t: TrunkDef, ageGd: number): boolean {
  return ageGd >= t.ghostAfterGd + t.ghostFadeGd;
}

function trunkOf(mod: GranaryModule): TrunkCell[] {
  return mod.trunk ?? (mod.trunk = []);
}

/** Runtime index cell key -> cell, rebuilt when the list object changes (state holds only the list). */
const indexCache = new WeakMap<TrunkCell[], Map<number, TrunkCell>>();

function keyOf(ix: number, iz: number): number {
  return ix * 65536 + iz;
}

function indexOf(cells: TrunkCell[], cellMm: number): Map<number, TrunkCell> {
  let m = indexCache.get(cells);
  if (!m || m.size !== cells.length) {
    m = new Map();
    for (const c of cells) m.set(keyOf(Math.floor(c.x / cellMm), Math.floor(c.z / cellMm)), c);
    indexCache.set(cells, m);
  }
  return m;
}

/** Marks the cell under (x, z) as walked by a laden forager now. */
export function markTrunk(sim: Sim, mod: GranaryModule, x: number, z: number): void {
  const cells = trunkOf(mod);
  const cellMm = TRUNK_CELL_BU * sim.world.bu;
  const ix = Math.floor(x / cellMm), iz = Math.floor(z / cellMm);
  const idx = indexOf(cells, cellMm);
  const hit = idx.get(keyOf(ix, iz));
  if (hit) {
    hit.uses++;
    hit.lastTick = sim.state.tick;
    hit.strength = 1;
    return;
  }
  if (cells.length >= TRUNK_CELLS_MAX) return;
  const cx = (ix + 0.5) * cellMm, cz = (iz + 0.5) * cellMm;
  const c: TrunkCell = { x: cx, y: sim.field.height(cx, cz), z: cz, uses: 1, lastTick: sim.state.tick, strength: 1 };
  cells.push(c);
  idx.set(keyOf(ix, iz), c);
}

/** Laden seed carriers outside the nest mark the trunk trail. */
export function markLadenReturns(sim: Sim, col: Colony): number {
  const mod = col.granary!;
  let n = 0;
  for (const a of sim.stores.ants.list) {
    if (!a.alive || a.colony !== col.id || a.nestId >= 0 || a.carry.kind !== 'item') continue;
    const it = sim.stores.items.get(a.carry.id);
    if (!it || it.kind !== 'seed') continue;
    markTrunk(sim, mod, a.pos.x, a.pos.z);
    n++;
  }
  return n;
}

/** Ages every cell, drops the gone ones, and tops the trail scent up on the live ones. */
export function refreshTrunk(sim: Sim, col: Colony, t: TrunkDef): void {
  const mod = col.granary!;
  const cells = trunkOf(mod);
  const now = sim.state.tick;
  const keep: TrunkCell[] = [];
  const p = { x: 0, y: 0, z: 0 };
  for (const c of cells) {
    const ageGd = (now - c.lastTick) / TICKS_PER_DAY;
    if (trunkGone(t, ageGd)) continue;
    c.strength = trunkStrength(t, ageGd);
    keep.push(c);
    if (c.strength <= 0) continue;
    p.x = c.x; p.y = c.y; p.z = c.z;
    const want = TRUNK_KEEP_PH * c.strength;
    const have = sim.phero.sample(col.id, 'trail', p);
    if (have < want) sim.phero.deposit(col.id, 'trail', p, want - have);
  }
  if (keep.length !== cells.length) mod.trunk = keep;
}

/** Whether p lies on the trunk-trail ribbon (live or ghost cells: the cleared ground) within r mm of a cell centre. */
export function onTrunk(mod: GranaryModule, x: number, z: number, r: number): boolean {
  const r2 = r * r;
  for (const c of mod.trunk ?? []) if ((c.x - x) ** 2 + (c.z - z) ** 2 <= r2) return true;
  return false;
}

/** Live (non-ghost) trunk cells of a colony. */
export function liveTrunkCells(mod: GranaryModule): number {
  let n = 0;
  for (const c of mod.trunk ?? []) if (c.strength > 0) n++;
  return n;
}

export const trunkTrailSystem: System = {
  name: 'granary-trunk-trail', phase: 'pheromones', every: TRUNK_MARK_TICKS,
  run(sim) {
    const refresh = sim.state.tick % TRUNK_REFRESH_TICKS < TRUNK_MARK_TICKS;
    for (const { col } of granaryColonies(sim)) {
      const t = sim.getSpecies(col.species)?.signals.trunkTrail;
      if (!t?.enabled) continue;
      markLadenReturns(sim, col);
      if (refresh) refreshTrunk(sim, col, t);
    }
  },
};
